-- Imposta l'insieme ESATTO degli amministratori su utenti ESISTENTI.
-- 1) azzera eventuali admin precedenti (es. l'account fondatore impostato prima);
-- 2) concede admin a: daddepesce@gmail.com (email) + Matteo Zavattiero + Isacco Pesce (per nome).
-- Idempotente.

UPDATE public.profiles SET is_admin = FALSE WHERE is_admin = TRUE;

-- daddepesce@gmail.com (per email, solo se l'utente esiste)
UPDATE public.profiles p
SET is_admin = TRUE
FROM auth.users u
WHERE u.id = p.id AND lower(u.email) = 'daddepesce@gmail.com';

-- Matteo Zavattiero e Isacco Pesce (utenti esistenti, match su frammenti distintivi del nome)
UPDATE public.profiles
SET is_admin = TRUE
WHERE display_name ILIKE '%zavattiero%'
   OR display_name ILIKE '%isacco%';
