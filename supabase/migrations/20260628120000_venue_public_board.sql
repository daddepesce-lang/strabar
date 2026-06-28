-- Classifica PUBBLICA del locale, calcolata interamente in SQL (SECURITY DEFINER) e
-- restituita come JSON compatto. Serve la pagina pubblica /locale/[key] (QR nei bar):
-- l'aggregazione avviene nel DB e l'API la mette in cache sul CDN, così le scansioni
-- del QR NON aumentano l'egress (niente più lettura dell'intera tabella sessions lato
-- client come faceva getVenueBoard).
--
-- Regole identiche a _countsForVenue/getVenueBoard:
--  • conta i check-in con locale reale, geolocalizzati e VERIFICATI (no freeform, no unverified)
--  • le sessioni private CONCORRONO ai totali ma con nome coperto ("Atleta riservato")
--  • nome coperto anche per chi ha public_leaderboard = false
--  • il nome pubblico rispetta name_mode/alias/username (come la funzione JS publicName)

create or replace function get_venue_public_board(p_key text, p_period text default 'all')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from timestamptz;
  v_name text;
  v_count int;
  v_board jsonb;
begin
  if p_period = 'week' then
    v_from := date_trunc('week', now()); -- lunedì 00:00
  else
    v_from := '-infinity'::timestamptz;
  end if;

  with vs as (
    select
      s.user_id,
      s.total_units,
      s.location,
      p.name_mode, p.alias, p.username, p.display_name, p.use_username, p.public_leaderboard
    from sessions s
    left join profiles p on p.id = s.user_id
    where s.location->>'name' is not null
      and coalesce((s.location->>'freeform')::boolean, false) = false
      and coalesce((s.location->>'unverified')::boolean, false) = false
      and (s.location->>'lat') is not null
      and (s.location->>'lng') is not null
      and lower(regexp_replace(btrim(s.location->>'name'), '\s+', ' ', 'g')) = p_key
      and s.created_at >= v_from
  ),
  per_user as (
    select
      user_id,
      count(*) as visits,
      sum(coalesce(total_units, 0)) as units,
      bool_or(coalesce(location->>'share', '') <> 'private') as has_public,
      bool_and(coalesce(public_leaderboard, true)) as lb_ok,
      max(name_mode) as name_mode,
      max(alias) as alias,
      max(username) as username,
      max(display_name) as display_name,
      bool_or(coalesce(use_username, false)) as use_username
    from vs
    group by user_id
  ),
  ranked as (
    select * from per_user order by units desc, visits desc limit 100
  )
  select
    (select location->>'name' from vs group by location->>'name' order by count(*) desc limit 1),
    (select count(*) from vs),
    coalesce(jsonb_agg(
      jsonb_build_object(
        'name', case
          when not lb_ok or not has_public then 'Atleta riservato'
          when coalesce(name_mode, case when use_username then 'username' else 'name' end) = 'username' and username is not null then '@' || username
          when coalesce(name_mode, '') = 'alias' and alias is not null then alias
          else coalesce(display_name, case when username is not null then '@' || username else 'Atleta Strabar' end)
        end,
        'visits', visits,
        'units', round(units::numeric, 1)
      ) order by units desc, visits desc
    ), '[]'::jsonb)
  into v_name, v_count, v_board
  from ranked;

  return jsonb_build_object(
    'key', p_key,
    'name', coalesce(v_name, ''),
    'period', p_period,
    'sessionsCount', coalesce(v_count, 0),
    'board', coalesce(v_board, '[]'::jsonb)
  );
end;
$$;

grant execute on function get_venue_public_board(text, text) to anon, authenticated;
