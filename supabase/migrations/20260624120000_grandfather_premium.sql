-- Grandfathering premium: tutti gli utenti ESISTENTI diventano premium (decisione di lancio).
-- I NUOVI iscritti restano non-premium di default (così premium resta un differenziatore
-- monetizzabile in futuro). Idempotente.
UPDATE public.profiles SET is_premium = TRUE WHERE is_premium IS DISTINCT FROM TRUE;
