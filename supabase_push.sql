-- ============================================================
-- STRABAR — NOTIFICHE PUSH (Web Push) — TABELLA SUBSCRIPTION
-- Salva le "push subscription" dei browser/PWA per inviare notifiche anche ad app chiusa.
-- Esegui nello SQL Editor di Supabase. Idempotente.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  endpoint text NOT NULL UNIQUE,           -- identifica univocamente il dispositivo/browser
  subscription jsonb NOT NULL,             -- l'oggetto PushSubscription completo
  created_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Ognuno gestisce SOLO le proprie subscription.
DROP POLICY IF EXISTS "push: leggo le mie" ON public.push_subscriptions;
CREATE POLICY "push: leggo le mie" ON public.push_subscriptions
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "push: registro le mie" ON public.push_subscriptions;
CREATE POLICY "push: registro le mie" ON public.push_subscriptions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "push: aggiorno le mie" ON public.push_subscriptions;
CREATE POLICY "push: aggiorno le mie" ON public.push_subscriptions
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "push: cancello le mie" ON public.push_subscriptions;
CREATE POLICY "push: cancello le mie" ON public.push_subscriptions
  FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_push_subs_user ON public.push_subscriptions (user_id);

NOTIFY pgrst, 'reload schema';
