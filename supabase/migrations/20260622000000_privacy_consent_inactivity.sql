-- Migrazione idempotente: privacy sessioni (RLS reale), consenso GDPR, preavviso inattività.
-- Tutte le istruzioni sono ri-eseguibili in sicurezza (IF NOT EXISTS / DROP IF EXISTS / OR REPLACE).

-- 1) Colonne consenso GDPR sul profilo
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS consent_version TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS tos_accepted_at TIMESTAMPTZ;

-- 2) Colonne sessione: residuo BAC congelato + timestamp preavviso inattività
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS residual_grams NUMERIC(5,1) DEFAULT NULL;
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS inactivity_warned_at TIMESTAMPTZ DEFAULT NULL;

-- 3) Trigger registrazione: salva consenso (versione + data lato server) dai metadati signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, username, display_name, is_premium, consent_version, tos_accepted_at)
    VALUES (
        new.id,
        COALESCE(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
        COALESCE(new.raw_user_meta_data->>'display_name', new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
        FALSE,
        new.raw_user_meta_data->>'consent_version',
        CASE WHEN new.raw_user_meta_data->>'consent_version' IS NOT NULL THEN NOW() ELSE NULL END
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 4) PRIVACY REALE delle sessioni applicata dal DB (non solo lato UI)
DROP POLICY IF EXISTS "Le sessioni sono pubbliche" ON public.sessions;
DROP POLICY IF EXISTS "Sessioni: visibili secondo privacy" ON public.sessions;
CREATE POLICY "Sessioni: visibili secondo privacy"
ON public.sessions FOR SELECT USING (
  auth.uid() = user_id
  OR COALESCE(location->>'share', 'public') = 'public'
  OR (
    location->>'share' = 'friends'
    AND EXISTS (
      SELECT 1 FROM public.follows f
      WHERE (f.follower_id = auth.uid() AND f.following_id = sessions.user_id)
         OR (f.follower_id = sessions.user_id AND f.following_id = auth.uid())
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_follows_following_id ON public.follows (following_id);
