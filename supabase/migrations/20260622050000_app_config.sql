-- Configurazione globale dell'app (riga singola), modificabile da admin.
-- Usata per i promemoria "attiva le notifiche": ogni quante aperture mostrarli.
-- Lettura pubblica (il client la legge e la mette in cache); scrittura solo service role.
CREATE TABLE IF NOT EXISTS public.app_config (
  id TEXT PRIMARY KEY DEFAULT 'singleton',
  push_reminder_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  push_reminder_every INTEGER NOT NULL DEFAULT 3,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Config leggibile da tutti" ON public.app_config;
CREATE POLICY "Config leggibile da tutti" ON public.app_config FOR SELECT USING (TRUE);
-- INSERT/UPDATE: nessuna policy → solo service role (API admin).

INSERT INTO public.app_config (id) VALUES ('singleton') ON CONFLICT (id) DO NOTHING;
