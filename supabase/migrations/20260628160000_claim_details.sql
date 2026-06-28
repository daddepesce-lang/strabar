-- Più dati nella richiesta di gestione locale: referente, contatti, dati attività.
-- Tutto in un jsonb `details` (flessibile; mostrato in /admin per valutare la richiesta).
alter table public.venue_claims add column if not exists details jsonb;
