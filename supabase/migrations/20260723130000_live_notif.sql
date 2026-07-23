-- =============================================================================
-- NOTIFICA LIVE "stile Sofascore" (solo Android) — notifica che si AGGIORNA in place
-- durante la sessione live, con U.A. · BAC · minuti in (quasi) tempo reale.
-- -----------------------------------------------------------------------------
-- Come funziona (EGRESS ~0, tutto interno a Supabase come l'alert guida):
--   1) l'utente attiva l'opt-in (profiles.live_notif) e ha una subscription push;
--   2) una pg_cron gira ogni 2 minuti, trova le sessioni ATTIVE degli utenti opted-in
--      e chiama la Edge Function send-push con un `tag` STABILE (live-<sessionId>) →
--      su Android/PWA installata la notifica si SOSTITUISCE (renotify:false = niente
--      re-suono/vibrazione) invece di accumularsi = "attività live" che si aggiorna.
--
-- iOS: escluso di proposito. Le PWA iOS non supportano una live activity aggiornabile;
-- filtriamo per `platform = 'android'` sulle subscription (vedi send-push).
-- =============================================================================

-- 1) Opt-in utente + piattaforma della subscription (per targetizzare solo Android) ---
alter table public.profiles           add column if not exists live_notif boolean not null default false;
alter table public.push_subscriptions add column if not exists platform text;

-- Estensioni (idempotenti; già presenti con l'alert guida).
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Indice leggero per la scansione del cron (poche sessioni attive).
create index if not exists idx_sessions_active_user
  on public.sessions (user_id) where is_active = true;

-- 2) BAC "live" server-side — replica FEDELE del modello dell'app (_netGramsAtTime):
--    net = residuo + Σ(grammi_drink · frazione_assorbita) − β·peso·r·ore_dal_primo_drink
--    bac = net / (peso · r).  1 U.A. = 8 g. r/β/τ dipendono dal sesso e dallo stomaco.
create or replace function public.session_live_bac(
  p_drinks jsonb,
  p_created_at timestamptz,
  p_residual numeric,
  p_weight numeric,
  p_sex text,
  p_full boolean,
  p_ref timestamptz
) returns numeric
language plpgsql
immutable
as $$
declare
  is_female boolean := lower(coalesce(p_sex, '')) in ('f', 'female', 'donna');
  w numeric := case when coalesce(p_weight, 0) > 0 then p_weight else 70 end;
  r numeric;
  beta numeric;
  d jsonb;
  grams numeric;
  drink_ts timestamptz;
  dt_h numeric;
  is_full boolean;
  tau numeric;
  net numeric := coalesce(p_residual, 0);
  first_ms timestamptz := null;
  hours numeric;
begin
  r := case when is_female then 0.55 else 0.68 end;
  beta := case when is_female then 0.14 else 0.15 end;

  if jsonb_typeof(p_drinks) = 'array' then
    for d in select * from jsonb_array_elements(p_drinks) loop
      drink_ts := coalesce((d->>'added_at')::timestamptz, p_created_at, p_ref);
      if first_ms is null or drink_ts < first_ms then first_ms := drink_ts; end if;
      grams := coalesce(nullif(d->>'units','')::numeric, 1.3) * coalesce(nullif(d->>'qty','')::numeric, 1) * 8;
      dt_h := greatest(0, extract(epoch from (p_ref - drink_ts)) / 3600.0);
      is_full := coalesce(nullif(d->>'full','')::boolean, p_full, false);
      tau := case when is_full then (case when is_female then 0.26 else 0.30 end)
                  else (case when is_female then 0.10 else 0.12 end) end;
      net := net + grams * (1 - exp(-dt_h / tau));
    end loop;
  end if;

  if first_ms is null then
    -- Nessun drink: decadimento del solo residuo dal created_at.
    if coalesce(p_residual, 0) <= 0 then return 0; end if;
    hours := greatest(0, extract(epoch from (p_ref - coalesce(p_created_at, p_ref))) / 3600.0);
    net := coalesce(p_residual, 0) - beta * w * r * hours;
  else
    hours := greatest(0, extract(epoch from (p_ref - first_ms)) / 3600.0);
    net := net - beta * w * r * hours;
  end if;

  if net < 0 then net := 0; end if;
  return round(net / (w * r), 2);
end;
$$;

-- 3) Dispatcher: per ogni sessione attiva di un utente opted-in, invia/aggiorna la
--    notifica live via send-push (tag stabile → aggiornamento in place, solo Android).
create or replace function public.dispatch_live_notifs()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
  proj_url text;
  svc_key  text;
  ua numeric;
  bac numeric;
  mins integer;
  lang text;
  title text;
  body text;
begin
  select decrypted_secret into proj_url from vault.decrypted_secrets where name = 'project_url'     limit 1;
  select decrypted_secret into svc_key  from vault.decrypted_secrets where name = 'service_role_key' limit 1;
  if proj_url is null or svc_key is null then
    raise notice 'dispatch_live_notifs: secret Vault mancanti — salto';
    return;
  end if;

  for rec in
    select s.id, s.user_id, s.drinks, s.total_units, s.created_at, s.residual_grams, s.full_stomach,
           p.weight, p.sex, coalesce(p.lang, 'it') as lang
    from public.sessions s
    join public.profiles p on p.id = s.user_id
    where s.is_active = true
      and p.live_notif = true
    limit 200
  loop
    ua   := round(coalesce(rec.total_units, 0)::numeric, 1);
    bac  := public.session_live_bac(rec.drinks, rec.created_at, rec.residual_grams, rec.weight, rec.sex, rec.full_stomach, now());
    mins := greatest(0, floor(extract(epoch from (now() - rec.created_at)) / 60.0))::int;
    lang := rec.lang;

    title := case lang
               when 'en' then '🔴 You are live'
               when 'fr' then '🔴 Tu es en live'
               when 'es' then '🔴 Estás en directo'
               else '🔴 Sei in live'
             end;
    -- Corpo = liveNotifBody: "🍺 {ua} U.A. · 🥴 {bac} g/L · ⏱️ {min} min" (U.A./A.U. per lingua).
    body := '🍺 ' || trim(to_char(ua, 'FM990.0')) || ' ' || (case when lang = 'en' then 'A.U.' else 'U.A.' end)
            || '  ·  🥴 ' || trim(to_char(bac, 'FM990.00')) || ' g/L'
            || '  ·  ⏱️ ' || mins || ' min';

    perform net.http_post(
      url     := proj_url || '/functions/v1/send-push',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || svc_key,
        'apikey', svc_key
      ),
      body    := jsonb_build_object(
        'user_ids',  jsonb_build_array(rec.user_id),
        'title',     title,
        'body',      body,
        'url',       '/',
        'tag',       'live-' || rec.id,   -- tag STABILE → aggiornamento in place
        'renotify',  false,               -- niente re-suono/vibrazione a ogni update
        'platforms', jsonb_build_array('android')  -- solo Android (iOS non supporta live activity da PWA)
      )
    );
  end loop;
end;
$$;

revoke all on function public.dispatch_live_notifs() from public, anon, authenticated;

-- 4) pg_cron ogni 2 minuti (idempotente).
do $$
begin
  perform cron.unschedule('live-notifs-dispatch');
exception when others then null;
end $$;
select cron.schedule('live-notifs-dispatch', '*/2 * * * *', $$select public.dispatch_live_notifs();$$);

-- -----------------------------------------------------------------------------
-- SETUP UNA-TANTUM (già fatto per l'alert guida — i secret Vault sono condivisi):
--   select vault.create_secret('https://<PROJECT_REF>.supabase.co', 'project_url');
--   select vault.create_secret('<SERVICE_ROLE_KEY>', 'service_role_key');
-- La Edge Function send-push deve supportare tag/renotify/platforms (vedi index.ts).
-- -----------------------------------------------------------------------------
