-- Directory pubblica dei locali + recensioni su DB + CRM contatti locali.
--
-- CONTESTO EGRESS (vincolo fisso del progetto): finora db.getPlaces() scaricava TUTTE
-- le sessioni sul client e aggregava in JS → costo di egress crescente all'infinito.
-- Qui l'aggregazione passa nel DB (RPC SECURITY DEFINER) e le API la mettono in cache
-- sul CDN: la pagina locali/directory pesa ora un JSON compatto e cacheabile, NON più
-- l'intera tabella sessions. Stessa filosofia di get_venue_public_board.
--
-- Contenuto:
--   1) place_reviews: gate "solo chi c'è stato" (check-in verificato), 1 recensione/utente/locale
--   2) get_venue_directory()  → tutti i locali attivi con statistiche + rating (per /locali e /places)
--   3) get_venue_reviews(key) → recensioni aggregate di un locale (media, conteggio, elenco)
--   4) can_review_venue(key)  → l'utente corrente può recensire questo locale?
--   5) get_venue_public_board  → RICREATA aggiungendo totale drink, drink top, U.A., verificato, rating
--   6) venue_contacts          → CRM contatti locali per l'outreach (gestito solo da admin)

-- ============================================================
-- 1. RECENSIONI: gate "solo chi ha un check-in verificato nel locale"
-- ============================================================

-- Una sola recensione per utente per locale (consente l'upsert / modifica).
-- Prima deduplica eventuali doppioni storici, tenendo la più recente.
delete from public.place_reviews a
using public.place_reviews b
where a.place_key = b.place_key
  and a.user_id = b.user_id
  and a.created_at < b.created_at;

create unique index if not exists place_reviews_user_place_uidx
  on public.place_reviews (place_key, user_id);

alter table public.place_reviews add column if not exists updated_at timestamptz;

-- Insert: consentito SOLO se l'utente ha almeno un check-in VERIFICATO in quel locale
-- (stessa regola di classifiche/mappa: no freeform, no unverified, con coordinate).
drop policy if exists "Gli utenti autenticati possono recensire" on public.place_reviews;
drop policy if exists "Recensione solo dopo visita verificata" on public.place_reviews;
create policy "Recensione solo dopo visita verificata"
on public.place_reviews for insert with check (
  auth.uid() = user_id
  and exists (
    select 1 from public.sessions s
    where s.user_id = auth.uid()
      and lower(regexp_replace(btrim(s.location->>'name'), '\s+', ' ', 'g')) = place_key
      and coalesce((s.location->>'freeform')::boolean, false) = false
      and coalesce((s.location->>'unverified')::boolean, false) = false
      and (s.location->>'lat') is not null
      and (s.location->>'lng') is not null
  )
);

-- Modifica / eliminazione: solo la PROPRIA recensione.
drop policy if exists "Modifica la tua recensione" on public.place_reviews;
create policy "Modifica la tua recensione"
on public.place_reviews for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Elimina la tua recensione" on public.place_reviews;
create policy "Elimina la tua recensione"
on public.place_reviews for delete using (auth.uid() = user_id);

-- L'utente corrente può recensire questo locale? (per mostrare/nascondere il form)
create or replace function public.can_review_venue(p_key text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.sessions s
    where s.user_id = auth.uid()
      and lower(regexp_replace(btrim(s.location->>'name'), '\s+', ' ', 'g')) = p_key
      and coalesce((s.location->>'freeform')::boolean, false) = false
      and coalesce((s.location->>'unverified')::boolean, false) = false
      and (s.location->>'lat') is not null
      and (s.location->>'lng') is not null
  );
$$;
grant execute on function public.can_review_venue(text) to authenticated;

-- ============================================================
-- 2. DIRECTORY PUBBLICA DEI LOCALI
-- ============================================================
-- Tutti i locali con check-in verificati e pubblici, con: presenze, atleti unici, U.A.,
-- TOTALE DRINK, DRINK PIÙ CONSUMATO, badge verificato, media/conteggio recensioni.
-- Aggregazione interamente in SQL → l'API mette il risultato in cache sul CDN.
create or replace function public.get_venue_directory()
returns jsonb
language sql
security definer
set search_path = public
as $$
  with vs as (
    select
      lower(regexp_replace(btrim(s.location->>'name'), '\s+', ' ', 'g')) as key,
      s.location->>'name' as name,
      s.location->>'address' as address,
      (s.location->>'lat')::float8 as lat,
      (s.location->>'lng')::float8 as lng,
      s.user_id,
      coalesce(s.total_units, 0) as units,
      s.drinks,
      s.created_at
    from public.sessions s
    where s.location->>'name' is not null
      and coalesce((s.location->>'freeform')::boolean, false) = false
      and coalesce((s.location->>'unverified')::boolean, false) = false
      and (s.location->>'lat') is not null
      and (s.location->>'lng') is not null
      and coalesce(s.location->>'share', '') <> 'private'
  ),
  drink_rows as (
    select vs.key, d->>'name' as drink, coalesce((d->>'qty')::numeric, 1) as qty
    from vs, lateral jsonb_array_elements(coalesce(vs.drinks, '[]'::jsonb)) d
    where d->>'name' is not null
  ),
  drink_tot as (
    select key, sum(qty) as total_drinks from drink_rows group by key
  ),
  drink_by_name as (
    select key, drink, sum(qty) as qty from drink_rows group by key, drink
  ),
  top_drink as (
    select distinct on (key) key, drink from drink_by_name order by key, qty desc
  ),
  rev as (
    select place_key as key, round(avg(rating)::numeric, 1) as avg_rating, count(*) as reviews_count
    from public.place_reviews group by place_key
  ),
  base as (
    select
      key,
      mode() within group (order by name) as name,
      mode() within group (order by address) filter (where address is not null and address <> '') as address,
      max(lat) as lat,
      max(lng) as lng,
      count(*) as sessions,
      count(distinct user_id) as athletes,
      round(sum(units)::numeric, 1) as units,
      max(created_at) as last_seen
    from vs group by key
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'key', b.key,
    'name', b.name,
    'address', coalesce(b.address, ''),
    'lat', b.lat,
    'lng', b.lng,
    'sessionsCount', b.sessions,
    'uniqueDrinkers', b.athletes,
    'totalUnits', b.units,
    'totalDrinks', round(coalesce(dt.total_drinks, 0)),
    'topDrink', td.drink,
    'verified', coalesce(rg.verified, false),
    'avgRating', coalesce(rev.avg_rating, 0),
    'reviewsCount', coalesce(rev.reviews_count, 0),
    'lastSeen', b.last_seen
  ) order by b.sessions desc, b.units desc), '[]'::jsonb)
  from base b
  left join drink_tot dt on dt.key = b.key
  left join top_drink td on td.key = b.key
  left join rev on rev.key = b.key
  left join public.venues rg on rg.key = b.key;
$$;
grant execute on function public.get_venue_directory() to anon, authenticated;

-- ============================================================
-- 3. RECENSIONI DI UN LOCALE (media + conteggio + elenco con nome pubblico)
-- ============================================================
create or replace function public.get_venue_reviews(p_key text)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'key', p_key,
    'avgRating', coalesce((select round(avg(rating)::numeric, 1) from public.place_reviews where place_key = p_key), 0),
    'count', (select count(*) from public.place_reviews where place_key = p_key),
    'reviews', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', case
          when coalesce(p.name_mode, case when p.use_username then 'username' else 'name' end) = 'username' and p.username is not null then '@' || p.username
          when coalesce(p.name_mode, '') = 'alias' and p.alias is not null then p.alias
          else coalesce(p.display_name, case when p.username is not null then '@' || p.username else 'Atleta Strabar' end)
        end,
        'rating', pr.rating,
        'text', pr.text,
        'createdAt', pr.created_at
      ) order by pr.created_at desc)
      from public.place_reviews pr
      left join public.profiles p on p.id = pr.user_id
      where pr.place_key = p_key
    ), '[]'::jsonb)
  );
$$;
grant execute on function public.get_venue_reviews(text) to anon, authenticated;

-- ============================================================
-- 4. CLASSIFICA PUBBLICA DEL LOCALE — ricreata con statistiche
-- ============================================================
-- Aggiunge al payload esistente: totalDrinks, topDrink, totalUnits, verified, avgRating,
-- reviewsCount. Retro-compatibile (i campi vecchi restano: key, name, period, sessionsCount, board).
create or replace function public.get_venue_public_board(p_key text, p_period text default 'all')
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
  v_total_drinks numeric;
  v_top_drink text;
  v_total_units numeric;
  v_verified boolean;
  v_avg numeric;
  v_reviews int;
begin
  if p_period = 'week' then
    v_from := date_trunc('week', now()); -- lunedì 00:00
  else
    v_from := '-infinity'::timestamptz;
  end if;

  -- Classifica atleti (identica a prima)
  with vs as (
    select
      s.user_id,
      s.total_units,
      s.location,
      p.name_mode, p.alias, p.username, p.display_name, p.use_username, p.public_leaderboard
    from public.sessions s
    left join public.profiles p on p.id = s.user_id
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

  -- Statistiche bevute del locale (stesso filtro, stesso periodo)
  with vs2 as (
    select s.total_units, s.drinks
    from public.sessions s
    where s.location->>'name' is not null
      and coalesce((s.location->>'freeform')::boolean, false) = false
      and coalesce((s.location->>'unverified')::boolean, false) = false
      and (s.location->>'lat') is not null
      and (s.location->>'lng') is not null
      and lower(regexp_replace(btrim(s.location->>'name'), '\s+', ' ', 'g')) = p_key
      and s.created_at >= v_from
  ),
  dr as (
    select d->>'name' as drink, coalesce((d->>'qty')::numeric, 1) as qty
    from vs2, lateral jsonb_array_elements(coalesce(vs2.drinks, '[]'::jsonb)) d
    where d->>'name' is not null
  )
  select
    coalesce((select sum(qty) from dr), 0),
    (select drink from dr group by drink order by sum(qty) desc limit 1),
    coalesce((select sum(total_units) from vs2), 0)
  into v_total_drinks, v_top_drink, v_total_units;

  select verified into v_verified from public.venues where key = p_key;
  select round(avg(rating)::numeric, 1), count(*) into v_avg, v_reviews
  from public.place_reviews where place_key = p_key;

  return jsonb_build_object(
    'key', p_key,
    'name', coalesce(v_name, ''),
    'period', p_period,
    'sessionsCount', coalesce(v_count, 0),
    'board', coalesce(v_board, '[]'::jsonb),
    'totalDrinks', round(coalesce(v_total_drinks, 0)),
    'topDrink', v_top_drink,
    'totalUnits', round(coalesce(v_total_units, 0)::numeric, 1),
    'verified', coalesce(v_verified, false),
    'avgRating', coalesce(v_avg, 0),
    'reviewsCount', coalesce(v_reviews, 0)
  );
end;
$$;
grant execute on function public.get_venue_public_board(text, text) to anon, authenticated;

-- ============================================================
-- 5. CRM CONTATTI LOCALI (outreach: tester, locandine, passaparola)
-- ============================================================
-- Gestito ESCLUSIVAMENTE dall'area admin via service role (nessun accesso anon/auth).
create table if not exists public.venue_contacts (
  key text primary key,                 -- normalizePlaceKey(name): stessa chiave dei locali
  name text not null,
  email text,
  phone text,
  instagram text,
  website text,
  address text,
  lat double precision,
  lng double precision,
  status text not null default 'da_contattare',  -- da_contattare | contattato | interessato | tester | rifiutato
  notes text,
  last_contacted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.venue_contacts enable row level security;
-- Nessuna policy → nessun accesso da client; solo il service role (API admin) legge/scrive.
create index if not exists venue_contacts_status_idx on public.venue_contacts(status);
