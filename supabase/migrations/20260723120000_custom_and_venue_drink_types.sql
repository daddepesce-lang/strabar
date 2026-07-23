-- DRINK PERSONALIZZATI (per-utente) + CATEGORIA sui drink dei BAR.
-- -----------------------------------------------------------------------------
-- Obiettivo i18n: un drink deve poter apparire nella lingua di CHI guarda il feed.
-- Per i drink liberi (custom utente / carta del bar) il nome scritto a mano non è
-- traducibile, quindi li definiamo per CATEGORIA (`type_key`: beer, wine_red, cocktail…)
-- + volume + gradazione; in display si compone "categoria tradotta + taglia".
--
-- EGRESS: i custom stanno in una colonna jsonb del PROFILO (già letto dall'app con
-- select('*') in getCurrentUser) → nessuna query/tabella extra, nessun egress aggiuntivo.

-- 1) Drink personalizzati dell'utente. Array di oggetti:
--    { id, typeKey, volumeMl, abv, units, note }  (note = testo libero opzionale)
alter table public.profiles
  add column if not exists custom_drinks jsonb not null default '[]'::jsonb;

-- 2) Categoria traducibile per i drink del locale. NULL sui drink storici → il display
--    ricade sul nome salvato (nessuna regressione). I nuovi drink bar avranno type_key.
alter table public.venue_drinks
  add column if not exists type_key text;
