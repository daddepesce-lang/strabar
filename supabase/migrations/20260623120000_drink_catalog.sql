-- Catalogo drink gestibile da admin, salvato come JSON nella config singleton.
-- Forma: { "quick": [...], "extra": [...], "beerFamilies": [...] } — stessa struttura
-- di src/lib/drinks.js. Se NULL, l'app usa il catalogo statico di default (fallback).
-- Lettura pubblica (eredita la policy SELECT di app_config); scrittura solo service role.
-- Idempotente.
ALTER TABLE public.app_config ADD COLUMN IF NOT EXISTS drink_catalog JSONB;
