-- =============================================================================
-- PUSH IN BACKGROUND per il superamento del limite di guida (0,5 g/L)
-- -----------------------------------------------------------------------------
-- Problema: l'avviso "hai superato 0,5" era SOLO client-side (arrivava solo ad app
-- aperta). Il BAC continua a salire per assorbimento anche dopo l'ultimo drink, quindi
-- si può superare il limite ad app CHIUSA e non ricevere nulla.
--
-- Soluzione a EGRESS ~ZERO (tutto interno a Supabase, zero Fast Origin Transfer Vercel):
--  1) il client, quando aggiunge un drink, calcola QUANDO la curva supererà 0,5 e salva
--     l'istante in `sessions.driving_alert_at` (+ testo già localizzato) nella stessa
--     updateActivity → nessuna richiesta extra;
--  2) una pg_cron gira ogni minuto DENTRO Supabase, trova le righe scadute (query su
--     indice parziale → di norma 0 righe) e chiama la Edge Function `send-push` via pg_net.
--
-- Idempotenza: `driving_alert_sent` evita doppi invii; il client la rispetta per non
-- rimostrare l'avviso locale se il push è già partito in background.
-- =============================================================================

-- 1) Colonne di stato sulla sessione ------------------------------------------------
alter table public.sessions add column if not exists driving_alert_at    timestamptz;
alter table public.sessions add column if not exists driving_alert_sent  boolean not null default false;
alter table public.sessions add column if not exists driving_alert_title text;
alter table public.sessions add column if not exists driving_alert_body  text;

-- 2) Indice PARZIALE: la cron legge solo le poche righe davvero "in scadenza".
--    Mantiene la query del cron leggerissima (di solito 0 righe → egress trascurabile).
create index if not exists idx_sessions_driving_alert_due
  on public.sessions (driving_alert_at)
  where is_active = true and driving_alert_sent = false and driving_alert_at is not null;

-- 3) Estensioni per lo scheduling interno + chiamate HTTP dal DB ----------------------
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 4) Dispatcher: invia i push scaduti chiamando la Edge Function send-push -----------
--    SECURITY DEFINER → può leggere/aggiornare sessions bypassando RLS.
--    Legge project_url + service_role_key da Vault (vedi setup una-tantum in fondo).
create or replace function public.dispatch_driving_alerts()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
  proj_url text;
  svc_key  text;
begin
  select decrypted_secret into proj_url from vault.decrypted_secrets where name = 'project_url'       limit 1;
  select decrypted_secret into svc_key  from vault.decrypted_secrets where name = 'service_role_key'   limit 1;
  if proj_url is null or svc_key is null then
    raise notice 'dispatch_driving_alerts: secret Vault project_url/service_role_key mancanti — salto';
    return;
  end if;

  for rec in
    select id, user_id,
           coalesce(driving_alert_title, '⚠️ Limite di guida superato') as title,
           coalesce(driving_alert_body,  'Hai superato 0,5 g/L: NON metterti alla guida. 🚕') as body
    from public.sessions
    where is_active = true
      and driving_alert_sent = false
      and driving_alert_at is not null
      and driving_alert_at <= now()
    order by driving_alert_at
    limit 200
  loop
    -- Marca PRIMA (l'invio è async/accodato da pg_net): evita doppioni se la funzione
    -- viene rieseguita mentre le richieste sono ancora in coda.
    update public.sessions
      set driving_alert_sent = true, driving_alert_at = null
      where id = rec.id;

    perform net.http_post(
      url     := proj_url || '/functions/v1/send-push',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || svc_key,
        'apikey', svc_key
      ),
      body    := jsonb_build_object(
        'user_ids', jsonb_build_array(rec.user_id),
        'title',    rec.title,
        'body',     rec.body,
        'url',      '/'
      )
    );
  end loop;
end;
$$;

-- 5) Schedulazione ogni minuto (idempotente: rimuove un eventuale job omonimo prima) ---
do $$
begin
  perform cron.unschedule('driving-alerts-dispatch')
  where exists (select 1 from cron.job where jobname = 'driving-alerts-dispatch');
end $$;

select cron.schedule('driving-alerts-dispatch', '* * * * *', $$select public.dispatch_driving_alerts();$$);

-- =============================================================================
-- SETUP UNA-TANTUM (esegui a mano nel SQL editor di Supabase, NON committare i valori):
--
--   select vault.create_secret('https://<PROJECT_REF>.supabase.co', 'project_url');
--   select vault.create_secret('<SERVICE_ROLE_KEY>',                  'service_role_key');
--
-- Verifica che l'Edge Function send-push sia deployata e abbia i secret VAPID:
--   supabase functions deploy send-push
--   supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:...
--
-- Test manuale del dispatcher:  select public.dispatch_driving_alerts();
-- =============================================================================
