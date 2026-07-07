-- Lingua preferita dell'utente (it/en/fr/es), per inviare le EMAIL transazionali nella
-- sua lingua. Salvata quando l'utente sceglie la lingua o si registra.
alter table public.profiles add column if not exists lang text;
