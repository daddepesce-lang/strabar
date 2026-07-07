-- Traccia QUALE admin ha approvato/rifiutato/collegato/scollegato un claim di locale.
-- Prima non era registrato: impossibile sapere chi aveva approvato (vedi caso "gens").
alter table public.venue_claims
  add column if not exists resolved_by uuid references public.profiles(id) on delete set null;

comment on column public.venue_claims.resolved_by is 'Admin che ha risolto il claim (approve/reject/link/unlink).';
