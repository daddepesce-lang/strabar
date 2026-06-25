-- Trigger registrazione aggiornato: oltre al consenso ToS, salva anche il
-- consenso marketing dai metadati signup (facoltativo, opt-in).
-- Assente nei metadati (es. login Google) → marketing_consent = NULL → il gate
-- post-login lo chiede. Presente ('true'/'false') → scritto subito, niente banner.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, username, display_name, is_premium, consent_version, tos_accepted_at, marketing_consent, marketing_consent_at)
    VALUES (
        new.id,
        COALESCE(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
        COALESCE(new.raw_user_meta_data->>'display_name', new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
        FALSE,
        new.raw_user_meta_data->>'consent_version',
        CASE WHEN new.raw_user_meta_data->>'consent_version' IS NOT NULL THEN NOW() ELSE NULL END,
        (new.raw_user_meta_data->>'marketing_consent')::boolean,
        CASE WHEN new.raw_user_meta_data->>'marketing_consent' IS NOT NULL THEN NOW() ELSE NULL END
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
