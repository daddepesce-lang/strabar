-- Aggiunta diretta di un membro da parte di owner/admin (utile per i gruppi privati,
-- dove non c'è self-join: l'admin aggiunge chi vuole oltre all'invito via link).
create or replace function public.add_group_member(p_group uuid, p_user uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if public.group_role(p_group) not in ('owner', 'admin') then
    raise exception 'Solo gli amministratori possono aggiungere membri.';
  end if;
  insert into public.group_members (group_id, user_id, role)
  values (p_group, p_user, 'member')
  on conflict (group_id, user_id) do nothing;
  return true;
end $$;

grant execute on function public.add_group_member(uuid, uuid) to authenticated;
