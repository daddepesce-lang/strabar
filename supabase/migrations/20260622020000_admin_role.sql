-- Ruolo amministratore: flag sul profilo. La pagina /admin e le API admin verificano
-- questo flag. I dati aggregati vengono letti SOLO lato server con la service role.
-- Idempotente.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE;

-- Imposta come admin l'account fondatore (per email).
UPDATE public.profiles p
SET is_admin = TRUE
FROM auth.users u
WHERE u.id = p.id AND lower(u.email) = 'davide.pesce@urbanasmart.com';
