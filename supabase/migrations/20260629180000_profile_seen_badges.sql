-- Badge "già visti/celebrati" salvati sul profilo (non più solo in localStorage per
-- dispositivo): così la celebrazione di un badge appena sbloccato avviene UNA volta sola,
-- anche se apri l'app da telefono e da PC. Backfill per-utente al primo caricamento lato app
-- (niente festa retroattiva). Idempotente.

alter table public.profiles
  add column if not exists seen_badges jsonb not null default '[]'::jsonb;
