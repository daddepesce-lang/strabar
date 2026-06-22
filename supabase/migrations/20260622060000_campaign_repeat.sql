-- Ricorrenza delle campagne: 'none' (una volta sola) o 'weekly' (ogni settimana). Idempotente.
ALTER TABLE public.notification_campaigns ADD COLUMN IF NOT EXISTS repeat TEXT NOT NULL DEFAULT 'none';
