-- Registra la CHIUSURA di una sessione (allenamento).
-- Prima la "durata" dipendeva solo da quando veniva aggiunto l'ultimo drink:
-- una live mai terminata restava is_active=true per sempre e il tempo mostrato
-- "crollava" al valore congelato. Ora c'è un timestamp esplicito di fine.

ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS ended_at TIMESTAMP WITH TIME ZONE;

-- Chiudi le sessioni "zombie": ancora attive oltre la finestra live (5h) ma mai
-- terminate. Registra la chiusura all'ultima attività nota (ricavata dalla durata,
-- che per queste sessioni coincide con inizio→ultimo drink).
UPDATE public.sessions
SET is_active = false,
    ended_at = created_at + make_interval(mins => GREATEST(duration, 1))
WHERE is_active = true
  AND created_at < now() - interval '5 hours'
  AND ended_at IS NULL;

-- Backfill storico: per le sessioni già chiuse senza ended_at, ricavalo dalla durata.
UPDATE public.sessions
SET ended_at = created_at + make_interval(mins => GREATEST(duration, 1))
WHERE is_active = false AND ended_at IS NULL;
