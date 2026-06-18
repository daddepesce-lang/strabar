-- ============================================================
-- STRABAR — EVENTI CONDIVISI (pubblicazione su Supabase)
-- Gli eventi prima vivevano solo in localStorage (per-dispositivo). Questo li rende
-- reali e condivisi tra tutti gli utenti. Idempotente. Esegui nello SQL Editor.
-- ============================================================

-- Colonne aggiunte rispetto allo schema iniziale:
--  - location: { name, lat, lng } del locale/indirizzo scelto (con coordinate)
--  - route_name: nome dell'itinerario collegato (denormalizzato per comodità)
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS location JSONB DEFAULT NULL;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS route_name TEXT;

-- MANCAVA la policy di UPDATE: senza, l'organizzatore non può modificare l'evento
-- né aggiornare la lista degli invitati. La aggiungiamo (solo l'host).
DROP POLICY IF EXISTS "Gli host possono modificare i propri eventi" ON public.events;
CREATE POLICY "Gli host possono modificare i propri eventi"
ON public.events FOR UPDATE USING (auth.uid() = host_id);

-- Indici per le liste eventi
CREATE INDEX IF NOT EXISTS idx_events_date ON public.events (date);
CREATE INDEX IF NOT EXISTS idx_events_host ON public.events (host_id);

-- Ricarica la cache schema di PostgREST così le nuove colonne sono subito visibili
NOTIFY pgrst, 'reload schema';
