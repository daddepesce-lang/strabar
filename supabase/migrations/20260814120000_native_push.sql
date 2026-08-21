-- =============================================================================
-- PUSH NATIVE (app Android/iOS dagli store) accanto al Web Push della PWA
-- -----------------------------------------------------------------------------
-- Nelle WebView di Capacitor la Push API non esiste: l'app nativa registra un token
-- FCM (Android) o APNs (iOS). Invece di una tabella nuova, riusiamo `push_subscriptions`:
--
--   kind      'webpush' (PWA, com'era) | 'fcm' (Android nativo) | 'apns' (iOS nativo)
--   token     il token del dispositivo (solo per fcm/apns)
--   endpoint  per il web resta l'endpoint del browser; per il nativo vale "<kind>:<token>"
--             → il vincolo di unicità su endpoint continua a deduplicare i dispositivi e
--               la cancellazione dei token morti resta identica a prima
--   subscription  resta la subscription Web Push; sui token nativi è NULL
--
-- Così send-push, l'alert guida (pg_cron) e la notifica live non cambiano interfaccia:
-- selezionano per user_id/platform e la Edge Function sceglie il trasporto in base a `kind`.
-- =============================================================================

alter table public.push_subscriptions
  add column if not exists kind  text not null default 'webpush',
  add column if not exists token text;

-- I token nativi non hanno una subscription Web Push: la colonna deve poter essere NULL.
alter table public.push_subscriptions
  alter column subscription drop not null;

-- Valori ammessi per kind (idempotente: ricreiamo il vincolo solo se manca).
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.push_subscriptions'::regclass
      and conname = 'push_subscriptions_kind_check'
  ) then
    alter table public.push_subscriptions
      add constraint push_subscriptions_kind_check
      check (kind in ('webpush', 'fcm', 'apns'));
  end if;
end $$;

-- Le righe storiche sono tutte Web Push e il default 'webpush' le copre già.
-- Righe Web Push senza subscription sarebbero inutilizzabili (nessun endpoint a cui
-- inviare) e farebbero fallire il vincolo qui sotto: le rimuoviamo.
delete from public.push_subscriptions where kind = 'webpush' and subscription is null;

-- Coerenza: le righe native devono avere un token, quelle web una subscription.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.push_subscriptions'::regclass
      and conname = 'push_subscriptions_transport_check'
  ) then
    alter table public.push_subscriptions
      add constraint push_subscriptions_transport_check
      check (
        (kind = 'webpush' and subscription is not null)
        or (kind in ('fcm', 'apns') and token is not null)
      );
  end if;
end $$;

-- send-push seleziona per utente (+ eventuale filtro piattaforma) e poi raggruppa per
-- trasporto: l'indice tiene la scansione su una sola riga per dispositivo.
create index if not exists idx_push_subscriptions_user_kind
  on public.push_subscriptions (user_id, kind);
