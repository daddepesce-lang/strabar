-- Le sessioni possono competere in PIÙ leghe insieme: location.league_ids = ["uuid", ...].
-- La classifica della lega conta una sessione se la lega è nell'array league_ids
-- (oppure, retrocompatibile, nel vecchio campo singolo group_id).
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
    where ((s.location ->> 'group_id') = p_group::text
           or (jsonb_typeof(s.location -> 'league_ids') = 'array' and (s.location -> 'league_ids') ? p_group::text))
      and (p_from is null or s.created_at >= p_from)
      and (p_to is null or s.created_at < p_to)
    group by s.user_id, p.id
  ) r;
  return result;
end $$;

grant execute on function public.get_group_board(uuid, timestamptz, timestamptz) to authenticated;
