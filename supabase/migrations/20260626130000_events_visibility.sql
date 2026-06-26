-- Eventi: visibilità per-evento (public | friends | private) + privacy anche via LINK.
-- Allinea gli eventi agli itinerari (routes), che hanno già la visibilità.
-- Gli eventi esistenti restano PUBBLICI (default 'public'), ma l'organizzatore può
-- cambiarne la privacy in qualsiasi momento. Idempotente.

-- 1) Colonna visibilità (default public = come prima, niente rotture sugli eventi esistenti).
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'public';

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

-- 2) Rimuovi OGNI policy SELECT preesistente sugli eventi (qualunque nome abbia): se ne
--    restasse una permissiva "tutti vedono tutto", andrebbe in OR con la nuova e vanificherebbe
--    la privacy. Le ricreiamo noi sotto, una sola, corretta.
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'events' AND cmd = 'SELECT'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.events', pol.policyname);
  END LOOP;
END $$;

-- 3) SELECT rispetta la privacy:
--    • l'host vede sempre i propri eventi;
--    • gli INVITATI vedono sempre (anche se l'evento è privato — è il senso dell'invito);
--    • 'public' è visibile a tutti (incluso chi apre il link di condivisione);
--    • 'friends' è visibile a chi è collegato all'host da un follow (in una delle due direzioni).
--    Il predicato sugli invitati si adatta al tipo reale della colonna `invited`
--    (uuid[] / text[] / jsonb), così la policy è corretta a prescindere dallo schema.
DO $$
DECLARE
  invited_udt text;
  invited_pred text;
BEGIN
  SELECT udt_name INTO invited_udt
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'invited';

  IF invited_udt = 'jsonb' THEN
    invited_pred := '(events.invited IS NOT NULL AND events.invited ? auth.uid()::text)';
  ELSIF invited_udt = '_uuid' THEN
    invited_pred := '(events.invited IS NOT NULL AND auth.uid() = ANY(events.invited))';
  ELSIF invited_udt IN ('_text', '_varchar') THEN
    invited_pred := '(events.invited IS NOT NULL AND auth.uid()::text = ANY(events.invited))';
  ELSE
    invited_pred := 'false';
  END IF;

  EXECUTE format($f$
    CREATE POLICY "Eventi: visibili secondo privacy"
    ON public.events FOR SELECT USING (
      auth.uid() = host_id
      OR COALESCE(visibility, 'public') = 'public'
      OR %s
      OR (
        visibility = 'friends' AND EXISTS (
          SELECT 1 FROM public.follows f
          WHERE (f.follower_id = auth.uid() AND f.following_id = events.host_id)
             OR (f.follower_id = events.host_id AND f.following_id = auth.uid())
        )
      )
    )
  $f$, invited_pred);
END $$;

-- 4) UPDATE/DELETE: solo l'organizzatore (così può anche cambiare la visibilità).
DROP POLICY IF EXISTS "Eventi: modifica host" ON public.events;
CREATE POLICY "Eventi: modifica host"
ON public.events FOR UPDATE USING (auth.uid() = host_id) WITH CHECK (auth.uid() = host_id);

DROP POLICY IF EXISTS "Eventi: cancella host" ON public.events;
CREATE POLICY "Eventi: cancella host"
ON public.events FOR DELETE USING (auth.uid() = host_id);
