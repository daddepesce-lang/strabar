-- Aggiunge lat/lng alla classifica pubblica del locale. Servono alla LOCANDINA A4 con QR
-- (area gestione locale): il QR punta a /log?venue=&lat=&lng= così una scansione sul posto
-- avvia una sessione GEOLOCALIZZATA in quel locale, che conta per le classifiche.
-- Le coordinate sono quelle della posizione più ricorrente tra i check-in del locale.
-- Nessun egress extra: l'API resta in cache sul CDN.

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
  v_lat text;
  v_lng text;
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

  -- Coordinate della posizione più ricorrente tra i check-in verificati del locale.
  select location->>'lat', location->>'lng'
    into v_lat, v_lng
  from (
    select s.location, count(*) as n
    from sessions s
    where lower(regexp_replace(btrim(s.location->>'name'), '\s+', ' ', 'g')) = p_key
      and (s.location->>'lat') is not null
      and (s.location->>'lng') is not null
      and coalesce((s.location->>'freeform')::boolean, false) = false
    group by s.location->>'lat', s.location->>'lng', s.location
    order by n desc
    limit 1
  ) t;

  return jsonb_build_object(
    'key', p_key,
    'name', coalesce(v_name, ''),
    'lat', v_lat,
    'lng', v_lng,
    'period', p_period,
    'sessionsCount', coalesce(v_count, 0),
    'board', coalesce(v_board, '[]'::jsonb)
  );
end;
$$;

grant execute on function get_venue_public_board(text, text) to anon, authenticated;
