-- ============================================================
-- COMUNITÀ INTORNO AL LOCALE
-- ============================================================
-- Oggi un locale ha classifica e recensioni, ma nessun motivo per tornarci. Questa
-- migrazione aggiunge i pezzi che lo trasformano in un posto vivo:
--
--   1. SEGUI IL LOCALE    — follow gratuito. È anche il prerequisito del prodotto a
--                           pagamento del gestore: senza follower, le notifiche che
--                           vorremmo vendergli non raggiungono nessuno.
--   2. RE DELLA SETTIMANA — la classifica settimanale esiste già; qui aggiungiamo il re
--                           corrente nel payload e la funzione che il cron usa il lunedì
--                           per avvisare chi segue il locale ("vai a detronizzarlo").
--   3. MURO DELLE FOTO    — le foto delle sessioni pubbliche fatte lì. Stanno su R2, dove
--                           il traffico è gratuito: è la feature "social" che non costa.
--   4. TASSO MEDIO        — quanto si arriva a bere in quel locale (media dei picchi
--                           stimati). È il numero più "Strabar" che ci sia, ed è anche
--                           un dato di realtà: un locale dove si arriva a 1,2 g/l è un
--                           locale da cui si torna a piedi.
--   5. SFIDA ALL'APERITIVO— un evento con classifica viva tra gli invitati.
--
-- EGRESS: nessuna nuova query per visita. Tutto entra negli RPC già aggregati e già in
-- cache sul CDN (get_venue_public_board), tranne il follow, che è un'azione dell'utente.

-- ============================================================
-- 1. SEGUI IL LOCALE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.venue_follows (
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    venue_key TEXT NOT NULL,
    venue_name TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    PRIMARY KEY (user_id, venue_key)
);
ALTER TABLE public.venue_follows ENABLE ROW LEVEL SECURITY;

-- Chi segue cosa è un dato personale: ognuno vede e gestisce solo le proprie righe.
-- I CONTEGGI pubblici passano dagli RPC security definer qui sotto, che restituiscono
-- numeri aggregati e mai la lista di chi segue.
DROP POLICY IF EXISTS "Vedo solo i locali che seguo" ON public.venue_follows;
CREATE POLICY "Vedo solo i locali che seguo"
ON public.venue_follows FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Gestisco solo i miei follow" ON public.venue_follows;
CREATE POLICY "Gestisco solo i miei follow"
ON public.venue_follows FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_venue_follows_key ON public.venue_follows (venue_key);

-- Segui / smetti di seguire, in una chiamata sola. Ritorna lo stato aggiornato così la
-- UI non deve fare una seconda lettura per sapere quanti follower ci sono adesso.
CREATE OR REPLACE FUNCTION public.toggle_venue_follow(p_key text, p_name text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  v_uid uuid := auth.uid();
  v_key text := lower(regexp_replace(btrim(p_key), '\s+', ' ', 'g'));
  v_following boolean;
begin
  if v_uid is null then
    raise exception 'Devi accedere per seguire un locale';
  end if;
  if v_key = '' or v_key is null then
    raise exception 'Locale non valido';
  end if;

  if exists (select 1 from public.venue_follows where user_id = v_uid and venue_key = v_key) then
    delete from public.venue_follows where user_id = v_uid and venue_key = v_key;
    v_following := false;
  else
    insert into public.venue_follows (user_id, venue_key, venue_name)
    values (v_uid, v_key, nullif(btrim(coalesce(p_name, '')), ''))
    on conflict do nothing;
    v_following := true;
  end if;

  return jsonb_build_object(
    'following', v_following,
    'followers', (select count(*) from public.venue_follows where venue_key = v_key)
  );
end;
$$;
GRANT EXECUTE ON FUNCTION public.toggle_venue_follow(text, text) TO authenticated;

-- Stato del follow per l'utente corrente (per anon: solo il conteggio).
CREATE OR REPLACE FUNCTION public.get_venue_follow(p_key text)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  select jsonb_build_object(
    'following', exists (
      select 1 from public.venue_follows
      where venue_key = lower(regexp_replace(btrim(p_key), '\s+', ' ', 'g'))
        and user_id = auth.uid()
    ),
    'followers', (
      select count(*) from public.venue_follows
      where venue_key = lower(regexp_replace(btrim(p_key), '\s+', ' ', 'g'))
    )
  );
$$;
GRANT EXECUTE ON FUNCTION public.get_venue_follow(text) TO anon, authenticated;

-- ============================================================
-- 2. CLASSIFICA PUBBLICA DEL LOCALE — v3
-- ============================================================
-- Aggiunge al payload: followersCount, avgBac, peakBac, weekKing, photos.
-- Retro-compatibile: tutti i campi precedenti restano al loro posto.
CREATE OR REPLACE FUNCTION public.get_venue_public_board(p_key text, p_period text DEFAULT 'all')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  v_followers int;
  v_avg_bac numeric;
  v_peak_bac numeric;
  v_week_king jsonb;
  v_photos jsonb;
begin
  if p_period = 'week' then
    v_from := date_trunc('week', now()); -- lunedì 00:00
  else
    v_from := '-infinity'::timestamptz;
  end if;

  -- Classifica atleti (invariata)
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

  -- Statistiche bevute + TASSO STIMATO del locale.
  -- Il tasso è la media dei picchi stimati a fine sessione: dice "qui si arriva a…",
  -- non "qui sono tutti ubriachi adesso". Contano solo le sessioni con un picco > 0.
  with vs2 as (
    select s.total_units, s.drinks, s.bac_level
    from public.sessions s
    where s.location->>'name' is not null
      and coalesce((s.location->>'freeform')::boolean, false) = false
      and coalesce((s.location->>'unverified')::boolean, false) = false
      and (s.location->>'lat') is not null
      and (s.location->>'lng') is not null
      and coalesce(s.location->>'share', 'public') <> 'private'
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
    coalesce((select sum(total_units) from vs2), 0),
    (select round(avg(bac_level)::numeric, 2) from vs2 where coalesce(bac_level, 0) > 0),
    (select round(max(bac_level)::numeric, 2) from vs2 where coalesce(bac_level, 0) > 0)
  into v_total_drinks, v_top_drink, v_total_units, v_avg_bac, v_peak_bac;

  select verified into v_verified from public.venues where key = p_key;
  select round(avg(rating)::numeric, 1), count(*) into v_avg, v_reviews
  from public.place_reviews where place_key = p_key;
  select count(*) into v_followers from public.venue_follows where venue_key = p_key;

  -- RE DELLA SETTIMANA: chi guida la classifica da lunedì. Sempre calcolato sulla
  -- settimana corrente, anche quando si sta guardando la classifica "di sempre":
  -- è l'informazione che fa tornare la gente ("sei a due birre dal primo").
  with wk as (
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
      and s.created_at >= date_trunc('week', now())
  ),
  wk_user as (
    select
      user_id,
      sum(coalesce(total_units, 0)) as units,
      count(*) as visits,
      bool_or(coalesce(location->>'share', '') <> 'private') as has_public,
      bool_and(coalesce(public_leaderboard, true)) as lb_ok,
      max(name_mode) as name_mode, max(alias) as alias, max(username) as username,
      max(display_name) as display_name, bool_or(coalesce(use_username, false)) as use_username
    from wk group by user_id
  )
  select jsonb_build_object(
    'name', case
      when not lb_ok or not has_public then 'Atleta riservato'
      when coalesce(name_mode, case when use_username then 'username' else 'name' end) = 'username' and username is not null then '@' || username
      when coalesce(name_mode, '') = 'alias' and alias is not null then alias
      else coalesce(display_name, case when username is not null then '@' || username else 'Atleta Strabar' end)
    end,
    'units', round(units::numeric, 1),
    'visits', visits
  )
  into v_week_king
  from wk_user order by units desc, visits desc limit 1;

  -- MURO DELLE FOTO: solo da sessioni PUBBLICHE (mai 'friends', mai 'private') fatte qui.
  -- Sono le stesse immagini già visibili nel feed pubblico, e stanno su R2: mostrarle
  -- non consuma egress Supabase né transfer Vercel.
  select coalesce(jsonb_agg(ph order by ph->>'at' desc), '[]'::jsonb)
  into v_photos
  from (
    select jsonb_build_object(
             'url', m->>'url',
             'thumb', coalesce(m->>'thumb', m->>'url'),
             'at', s.created_at
           ) as ph
    from public.sessions s, lateral jsonb_array_elements(coalesce(s.media, '[]'::jsonb)) m
    where lower(regexp_replace(btrim(s.location->>'name'), '\s+', ' ', 'g')) = p_key
      and coalesce((s.location->>'freeform')::boolean, false) = false
      and coalesce(s.location->>'share', 'public') = 'public'
      and coalesce(m->>'type', 'image') = 'image'
      and m->>'url' is not null
    order by s.created_at desc
    limit 12
  ) t;

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
    'reviewsCount', coalesce(v_reviews, 0),
    'followersCount', coalesce(v_followers, 0),
    'avgBac', v_avg_bac,
    'peakBac', v_peak_bac,
    'weekKing', v_week_king,
    'photos', coalesce(v_photos, '[]'::jsonb)
  );
end;
$$;
GRANT EXECUTE ON FUNCTION public.get_venue_public_board(text, text) TO anon, authenticated;

-- ============================================================
-- 3. RE DELLA SETTIMANA SCORSA — per il cron del lunedì
-- ============================================================
-- Ritorna, per ogni locale con abbastanza vita la settimana scorsa, il re e la lista di
-- chi segue quel locale. Il cron (service role) trasforma tutto in notifiche.
-- Non tocca le notifiche qui dentro: una funzione che LEGGE è più facile da provare.
CREATE OR REPLACE FUNCTION public.venue_week_kings(p_min_sessions int DEFAULT 2)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  v_from timestamptz := date_trunc('week', now()) - interval '7 days';
  v_to timestamptz := date_trunc('week', now());
  v_out jsonb;
begin
  with vs as (
    select
      lower(regexp_replace(btrim(s.location->>'name'), '\s+', ' ', 'g')) as key,
      s.location->>'name' as name,
      s.user_id,
      coalesce(s.total_units, 0) as units,
      coalesce(s.location->>'share', 'public') as share,
      p.name_mode, p.alias, p.username, p.display_name, p.use_username, p.public_leaderboard
    from public.sessions s
    left join public.profiles p on p.id = s.user_id
    where s.location->>'name' is not null
      and coalesce((s.location->>'freeform')::boolean, false) = false
      and coalesce((s.location->>'unverified')::boolean, false) = false
      and (s.location->>'lat') is not null
      and (s.location->>'lng') is not null
      and s.created_at >= v_from and s.created_at < v_to
  ),
  per_venue as (
    select key, max(name) as name, count(*) as sessions from vs group by key
  ),
  per_user as (
    select
      key, user_id,
      sum(units) as units,
      bool_or(share <> 'private') as has_public,
      bool_and(coalesce(public_leaderboard, true)) as lb_ok,
      max(name_mode) as name_mode, max(alias) as alias, max(username) as username,
      max(display_name) as display_name, bool_or(coalesce(use_username, false)) as use_username
    from vs group by key, user_id
  ),
  kings as (
    select distinct on (key)
      key, user_id, units,
      case
        when not lb_ok or not has_public then 'Atleta riservato'
        when coalesce(name_mode, case when use_username then 'username' else 'name' end) = 'username' and username is not null then '@' || username
        when coalesce(name_mode, '') = 'alias' and alias is not null then alias
        else coalesce(display_name, case when username is not null then '@' || username else 'Atleta Strabar' end)
      end as king_name
    from per_user
    order by key, units desc
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'key', k.key,
    'name', pv.name,
    'kingUserId', k.user_id,
    'kingName', k.king_name,
    'units', round(k.units::numeric, 1),
    'followers', coalesce((
      select jsonb_agg(f.user_id) from public.venue_follows f where f.venue_key = k.key
    ), '[]'::jsonb)
  )), '[]'::jsonb)
  into v_out
  from kings k
  join per_venue pv on pv.key = k.key
  where pv.sessions >= p_min_sessions;

  return v_out;
end;
$$;
REVOKE ALL ON FUNCTION public.venue_week_kings(int) FROM anon, authenticated;

-- ============================================================
-- 4. SFIDA ALL'APERITIVO
-- ============================================================
-- Una sfida è un evento con una classifica viva: si sceglie il locale e l'ora, si
-- invitano gli amici, e per tutta la serata si vede chi è avanti. Riusiamo `events`
-- invece di creare un sistema parallelo: inviti, risposte e notifiche esistono già.
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS challenge BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS venue_key TEXT;

-- Classifica di una sfida: somma delle unità dei partecipanti nella finestra della
-- serata (dall'ora dell'evento per 8 ore). Se la sfida ha un locale, contano solo le
-- sessioni fatte LÌ: altrimenti si vincerebbe bevendo sul divano di casa.
CREATE OR REPLACE FUNCTION public.get_challenge_board(p_event_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  v_ev record;
  v_from timestamptz;
  v_to timestamptz;
  v_board jsonb;
begin
  select id, host_id, date, venue_key, challenge into v_ev
  from public.events where id = p_event_id;
  if v_ev.id is null then
    return jsonb_build_object('board', '[]'::jsonb);
  end if;

  -- Finestra della serata: da un'ora PRIMA (chi arriva in anticipo e registra subito il
  -- primo giro non deve restare fuori dalla sfida) fino a otto ore dopo.
  v_from := v_ev.date - interval '1 hour';
  v_to := v_ev.date + interval '8 hours';

  with players as (
    select v_ev.host_id as user_id
    union
    select r.user_id from public.event_responses r
    where r.event_id = p_event_id and r.status = 'going'
  ),
  sess as (
    select
      s.user_id,
      coalesce(s.total_units, 0) as units,
      coalesce(s.bac_level, 0) as bac,
      s.drinks
    from public.sessions s
    join players pl on pl.user_id = s.user_id
    where s.created_at >= v_from and s.created_at < v_to
      and coalesce(s.location->>'share', 'public') <> 'private'
      and (
        v_ev.venue_key is null
        or lower(regexp_replace(btrim(s.location->>'name'), '\s+', ' ', 'g')) = v_ev.venue_key
      )
  ),
  per_user as (
    select
      se.user_id,
      sum(se.units) as units,
      max(se.bac) as peak,
      sum((select coalesce(sum(coalesce((d->>'qty')::numeric, 1)), 0)
           from jsonb_array_elements(coalesce(se.drinks, '[]'::jsonb)) d)) as drinks
    from sess se group by se.user_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'name', case
      when coalesce(p.name_mode, case when p.use_username then 'username' else 'name' end) = 'username' and p.username is not null then '@' || p.username
      when coalesce(p.name_mode, '') = 'alias' and p.alias is not null then p.alias
      else coalesce(p.display_name, case when p.username is not null then '@' || p.username else 'Atleta Strabar' end)
    end,
    'avatar', p.avatar_url,
    'units', round(pu.units::numeric, 1),
    'drinks', round(coalesce(pu.drinks, 0)),
    'peak', round(pu.peak::numeric, 2)
  ) order by pu.units desc), '[]'::jsonb)
  into v_board
  from per_user pu
  join public.profiles p on p.id = pu.user_id;

  return jsonb_build_object(
    'from', v_from,
    'to', v_to,
    'live', now() >= v_from and now() < v_to,
    'board', coalesce(v_board, '[]'::jsonb)
  );
end;
$$;
GRANT EXECUTE ON FUNCTION public.get_challenge_board(uuid) TO anon, authenticated;
