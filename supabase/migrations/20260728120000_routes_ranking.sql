-- Percorsi: RANKING ("i più fatti / i migliori").
--
-- Idea: i percorsi non hanno voti, ma hanno un segnale molto più onesto — quante
-- PERSONE li hanno effettivamente fatti e quante li hanno portati a termine.
-- Teniamo due contatori denormalizzati sulla riga del percorso (starts_count,
-- completions_count): la lista li legge con la SELECT che già fa (select '*'),
-- quindi il ranking costa ZERO egress in più. Nessuna aggregazione a runtime.
--
-- I contatori contano PERSONE DIVERSE, non avvii: ripartire 10 volte lo stesso
-- giro non gonfia la classifica. La deduplica sta in route_runs, che il client
-- non legge MAI (solo le funzioni qui sotto la scrivono).
--
-- Idempotente.

alter table public.routes add column if not exists starts_count integer not null default 0;
alter table public.routes add column if not exists completions_count integer not null default 0;
alter table public.routes add column if not exists last_started_at timestamptz;

create index if not exists routes_starts_idx on public.routes(starts_count desc);

-- Chi ha fatto quale percorso (una riga per coppia utente/percorso).
create table if not exists public.route_runs (
  route_id uuid not null references public.routes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  first_started_at timestamptz not null default now(),
  runs integer not null default 0,
  completions integer not null default 0,
  primary key (route_id, user_id)
);

alter table public.route_runs enable row level security;
-- Nessuna policy: la tabella è scritta SOLO dalle funzioni SECURITY DEFINER qui sotto.

-- Avvio di un tour su un percorso. Il contatore pubblico sale solo la prima volta
-- che quell'utente fa quel percorso; last_started_at si aggiorna sempre (serve al
-- piccolo bonus "attualità" nel punteggio lato client).
create or replace function public.bump_route_start(p_route uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_first boolean;
begin
  if auth.uid() is null or p_route is null then return; end if;
  if not exists (select 1 from public.routes where id = p_route) then return; end if;

  insert into public.route_runs (route_id, user_id, runs)
  values (p_route, auth.uid(), 1)
  on conflict (route_id, user_id) do update set runs = route_runs.runs + 1
  returning (runs = 1) into v_first;

  update public.routes
     set starts_count = starts_count + (case when v_first then 1 else 0 end),
         last_started_at = now()
   where id = p_route;
end;
$$;

-- Tour completato (tutte le tappe visitate) alla chiusura della sessione.
-- Anche qui: una persona conta una volta sola.
create or replace function public.bump_route_completion(p_route uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_first boolean;
begin
  if auth.uid() is null or p_route is null then return; end if;
  if not exists (select 1 from public.routes where id = p_route) then return; end if;

  insert into public.route_runs (route_id, user_id, runs, completions)
  values (p_route, auth.uid(), 1, 1)
  on conflict (route_id, user_id) do update set completions = route_runs.completions + 1
  returning (completions = 1) into v_first;

  update public.routes
     set completions_count = completions_count + (case when v_first then 1 else 0 end)
   where id = p_route;
end;
$$;

grant execute on function public.bump_route_start(uuid) to authenticated;
grant execute on function public.bump_route_completion(uuid) to authenticated;
