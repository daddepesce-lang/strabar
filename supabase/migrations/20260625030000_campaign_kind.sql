-- Distingue le campagne di notifica per natura legale:
--   'commercial' = marketing/offerte (terzi, partner) → solo chi ha marketing_consent = true
--   'service'    = comunicazioni di servizio/transazionali (manutenzione, sicurezza,
--                  novità funzionali, avvisi account) → a tutti, NON è marketing.
-- Default 'commercial': scelta prudente, così le campagne esistenti restano filtrate.
ALTER TABLE public.notification_campaigns
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'commercial';
