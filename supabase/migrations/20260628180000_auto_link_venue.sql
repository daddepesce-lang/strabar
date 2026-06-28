-- Collegamento AUTOMATICO account↔locale quando ci si registra con l'email della richiesta:
-- se esiste un claim APPROVATO non ancora collegato con quell'email, lo collega e rende
-- l'account di tipo "locale". (Se il locale si registra con un'email DIVERSA da quella della
-- richiesta, il match non scatta → si collega a mano da /admin.)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, username, display_name, is_premium, consent_version, tos_accepted_at, account_type)
    VALUES (
        new.id,
        COALESCE(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
        COALESCE(new.raw_user_meta_data->>'display_name', new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
        FALSE,
        new.raw_user_meta_data->>'consent_version',
        CASE WHEN new.raw_user_meta_data->>'consent_version' IS NOT NULL THEN NOW() ELSE NULL END,
        COALESCE(new.raw_user_meta_data->>'account_type', 'user')
    )
    ON CONFLICT (id) DO NOTHING;

    -- Auto-collegamento a un locale approvato con la stessa email
    UPDATE public.venue_claims
       SET user_id = new.id
     WHERE user_id IS NULL AND status = 'approved'
       AND lower(details->>'email') = lower(new.email);
    IF FOUND THEN
        UPDATE public.profiles SET account_type = 'venue' WHERE id = new.id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
