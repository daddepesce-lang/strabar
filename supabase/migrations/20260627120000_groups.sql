-- GRUPPI ("Crew"): radunano amici, con ruoli, classifiche ed eventi propri.
-- Modello deciso:
--   • Le sessioni si "avviano dal gruppo" → attribuite via location->>'group_id'.
--     Attribuire = condividere con quel gruppo (la classifica di gruppo conta SOLO quelle,
--     senza esporre le sessioni private/amici globali del membro).
--   • Visibilità del gruppo: 'private' (default, solo membri/invito) o 'public' (scopribile).
--   • Ruoli: owner | admin | member. Owner e admin possono nominare altri admin.
-- Le letture passano da RLS; le operazioni sensibili (crea/unisciti/ruoli/rimuovi) e la
-- classifica passano da RPC SECURITY DEFINER (evita ricorsione RLS ed enforce regole).
-- Idempotente.

create extension if not exists pgcrypto;

create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text default '',
  avatar_url text,
  created_by uuid not null references public.profiles(id) on delete cascade,
  visibility text not null default 'private',
  share_token text not null default replace(gen_random_uuid()::text, '-', ''),
  created_at timestamptz not null default now()
);

create table if not exists public.group_members (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index if not exists group_members_user_idx on public.group_members(user_id);

-- Gli eventi possono appartenere a un gruppo.
alter table public.events add column if not exists group_id uuid references public.groups(id) on delete set null;

-- Helper SECURITY DEFINER: evitano la ricorsione RLS su group_members.
create or replace function public.is_group_member(p_group uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists(select 1 from public.group_members m where m.group_id = p_group and m.user_id = auth.uid());
$$;

create or replace function public.group_role(p_group uuid)
returns text language sql security definer set search_path = public stable as $$
  select role from public.group_members m where m.group_id = p_group and m.user_id = auth.uid();
$$;

alter table public.groups enable row level security;
alter table public.group_members enable row level security;

-- groups: visibile se pubblico o se sei membro.
drop policy if exists groups_select on public.groups;
create policy groups_select on public.groups for select
  using (visibility = 'public' or public.is_group_member(id));

drop policy if exists groups_insert on public.groups;
create policy groups_insert on public.groups for insert
  with check (created_by = auth.uid());

drop policy if exists groups_update on public.groups;
create policy groups_update on public.groups for update
  using (public.group_role(id) in ('owner', 'admin'));

drop policy if exists groups_delete on public.groups;
create policy groups_delete on public.groups for delete
  using (public.group_role(id) = 'owner');

-- group_members: visibili se sei membro o se il gruppo è pubblico.
drop policy if exists gm_select on public.group_members;
create policy gm_select on public.group_members for select
  using (public.is_group_member(group_id)
         or exists(select 1 from public.groups g where g.id = group_id and g.visibility = 'public'));

-- insert diretto consentito SOLO come self-join a gruppi pubblici; i join privati (token)
-- e l'inserimento dell'owner passano dalle RPC SECURITY DEFINER.
drop policy if exists gm_insert on public.group_members;
create policy gm_insert on public.group_members for insert
  with check (user_id = auth.uid()
              and exists(select 1 from public.groups g where g.id = group_id and g.visibility = 'public'));

drop policy if exists gm_update on public.group_members;
create policy gm_update on public.group_members for update
  using (public.group_role(group_id) in ('owner', 'admin'));

drop policy if exists gm_delete on public.group_members;
create policy gm_delete on public.group_members for delete
  using (user_id = auth.uid() or public.group_role(group_id) in ('owner', 'admin'));

-- ───────────────────────── RPC ─────────────────────────

-- Crea gruppo + iscrive il creatore come owner.
create or replace function public.create_group(p_name text, p_description text, p_visibility text)
returns public.groups language plpgsql security definer set search_path = public as $$
declare g public.groups;
begin
  if auth.uid() is null then raise exception 'Devi accedere.'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Serve un nome.'; end if;
  insert into public.groups (name, description, created_by, visibility)
  values (trim(p_name), coalesce(p_description, ''), auth.uid(),
          case when p_visibility = 'public' then 'public' else 'private' end)
  returning * into g;
  insert into public.group_members (group_id, user_id, role) values (g.id, auth.uid(), 'owner');
  return g;
end $$;

-- Unisciti: gruppo pubblico (libero) o privato con token valido.
create or replace function public.join_group(p_group uuid, p_token text default null)
returns text language plpgsql security definer set search_path = public as $$
declare g public.groups;
begin
  if auth.uid() is null then raise exception 'Devi accedere per unirti.'; end if;
  select * into g from public.groups where id = p_group;
  if g.id is null then raise exception 'Gruppo inesistente.'; end if;
  if g.visibility <> 'public' and (p_token is null or p_token <> g.share_token) then
    raise exception 'Serve un invito per unirti a questo gruppo.';
  end if;
  insert into public.group_members (group_id, user_id, role)
  values (p_group, auth.uid(), 'member')
  on conflict (group_id, user_id) do nothing;
  return public.group_role(p_group);
end $$;

-- Lascia il gruppo (l'owner deve prima passare la proprietà o eliminare il gruppo).
create or replace function public.leave_group(p_group uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if public.group_role(p_group) = 'owner' then
    raise exception 'Sei il proprietario: trasferisci la proprietà o elimina il gruppo.';
  end if;
  delete from public.group_members where group_id = p_group and user_id = auth.uid();
  return true;
end $$;

-- Cambia ruolo: owner può tutto (anche trasferire la proprietà); admin può solo
-- promuovere/retrocedere membri↔admin, mai toccare l'owner.
create or replace function public.set_group_role(p_group uuid, p_user uuid, p_role text)
returns boolean language plpgsql security definer set search_path = public as $$
declare me text; target text;
begin
  me := public.group_role(p_group);
  if me is null then raise exception 'Non sei nel gruppo.'; end if;
  if p_role not in ('owner', 'admin', 'member') then raise exception 'Ruolo non valido.'; end if;
  select role into target from public.group_members where group_id = p_group and user_id = p_user;
  if target is null then raise exception 'Utente non nel gruppo.'; end if;

  if me = 'owner' then
    if p_role = 'owner' then
      -- trasferimento proprietà: il nuovo owner sale, il vecchio diventa admin
      update public.group_members set role = 'admin' where group_id = p_group and user_id = auth.uid();
      update public.group_members set role = 'owner' where group_id = p_group and user_id = p_user;
    else
      if target = 'owner' then raise exception 'Non puoi retrocedere te stesso owner così.'; end if;
      update public.group_members set role = p_role where group_id = p_group and user_id = p_user;
    end if;
  elsif me = 'admin' then
    if target = 'owner' or p_role = 'owner' then raise exception 'Solo l''owner può gestire la proprietà.'; end if;
    update public.group_members set role = p_role where group_id = p_group and user_id = p_user;
  else
    raise exception 'Non hai i permessi.';
  end if;
  return true;
end $$;

-- Rimuovi un membro: owner rimuove chiunque (tranne sé); admin rimuove solo membri semplici.
create or replace function public.remove_group_member(p_group uuid, p_user uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare me text; target text;
begin
  me := public.group_role(p_group);
  select role into target from public.group_members where group_id = p_group and user_id = p_user;
  if me is null or target is null then raise exception 'Operazione non valida.'; end if;
  if p_user = auth.uid() then raise exception 'Per uscire usa "Lascia il gruppo".'; end if;
  if me = 'owner' then
    delete from public.group_members where group_id = p_group and user_id = p_user;
  elsif me = 'admin' and target = 'member' then
    delete from public.group_members where group_id = p_group and user_id = p_user;
  else
    raise exception 'Non hai i permessi per rimuovere questo membro.';
  end if;
  return true;
end $$;

-- Classifica del gruppo: somma U.A. e sessioni dei membri, solo sessioni attribuite al
-- gruppo (location->>'group_id') nel periodo. SECURITY DEFINER: vede le sessioni dei membri
-- (attribuirle al gruppo = condividerle), ma solo se chi chiama è membro.
create or replace function public.get_group_board(p_group uuid, p_from timestamptz default null, p_to timestamptz default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare result jsonb;
begin
  if not public.is_group_member(p_group) then return null; end if;
  select coalesce(jsonb_agg(r order by r.units desc, r.sessions desc), '[]'::jsonb) into result
  from (
    select s.user_id,
           (case
              when p.name_mode = 'username' and p.username is not null then '@' || p.username
              when p.name_mode = 'alias' and coalesce(p.alias, '') <> '' then p.alias
              else coalesce(p.display_name, '@' || p.username, 'Atleta Strabar')
            end) as name,
           coalesce(p.is_premium, false) as is_premium,
           round(sum(coalesce(s.total_units, 0))::numeric, 1) as units,
           count(*) as sessions
    from public.sessions s
    join public.profiles p on p.id = s.user_id
    where (s.location ->> 'group_id') = p_group::text
      and (p_from is null or s.created_at >= p_from)
      and (p_to is null or s.created_at < p_to)
    group by s.user_id, p.id
  ) r;
  return result;
end $$;

-- Eventi del gruppo (solo membri).
create or replace function public.get_group_events(p_group uuid)
returns setof public.events language plpgsql security definer set search_path = public as $$
begin
  if not public.is_group_member(p_group) then return; end if;
  return query select * from public.events e where e.group_id = p_group order by e.date asc nulls last;
end $$;

grant execute on function public.is_group_member(uuid) to authenticated;
grant execute on function public.group_role(uuid) to authenticated;
grant execute on function public.create_group(text, text, text) to authenticated;
grant execute on function public.join_group(uuid, text) to authenticated;
grant execute on function public.leave_group(uuid) to authenticated;
grant execute on function public.set_group_role(uuid, uuid, text) to authenticated;
grant execute on function public.remove_group_member(uuid, uuid) to authenticated;
grant execute on function public.get_group_board(uuid, timestamptz, timestamptz) to authenticated;
grant execute on function public.get_group_events(uuid) to authenticated;
