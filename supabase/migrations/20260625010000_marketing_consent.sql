-- Consenso esplicito per comunicazioni commerciali (promozioni locali partner).
-- Separato dal consenso ToS/Privacy (consent_version) perché GDPR richiede
-- granularità: il consenso marketing deve essere libero e revocabile.
-- NULL = utente non ancora interrogato (mostrerà lo step in OnboardingGate).
-- TRUE = ha accettato. FALSE = ha rifiutato.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS marketing_consent     BOOLEAN     DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS marketing_consent_at  TIMESTAMPTZ DEFAULT NULL;
