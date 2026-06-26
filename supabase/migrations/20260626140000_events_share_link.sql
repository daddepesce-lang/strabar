-- Eventi: condivisione "per link" (chi ha il link è invitato, anche senza account) +
-- itinerario del proprietario mostrato INLINE dentro l'evento (con la privacy dell'evento),
-- senza comparire nella lista pubblica dei tour. Idempotente.

-- 1) Token di condivisione: capability segreta nel link. Default su tutte le righe (anche
--    esistenti), così ogni evento è già condivisibile via link senza interventi app.
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS share_token TEXT NOT NULL DEFAULT replace(gen_random_uuid()::text, '-', '');

-- 2) Funzioni SECURITY DEFINER che bypassano la RLS SOLO per il singolo evento richiesto,
--    applicando un controllo d'accesso esplicito. Il predicato sugli invitati si adatta al
--    tipo reale della colonna `invited` (uuid[] / text[] / jsonb).
DO $$
DECLARE
  invited_udt text;
  invited_pred text;   -- predicato "sono tra gli invitati" sull'alias ev
  access_pred text;    -- predicato d'accesso completo (token OR host OR public OR invitato OR amici)
BEGIN
  SELECT udt_name INTO invited_udt
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'invited';

  IF invited_udt = 'jsonb' THEN
    invited_pred := '(ev.invited IS NOT NULL AND ev.invited ? auth.uid()::text)';
  ELSIF invited_udt = '_uuid' THEN
    invited_pred := '(ev.invited IS NOT NULL AND auth.uid() = ANY(ev.invited))';
  ELSIF invited_udt IN ('_text', '_varchar') THEN
    invited_pred := '(ev.invited IS NOT NULL AND auth.uid()::text = ANY(ev.invited))';
  ELSE
    invited_pred := 'false';
  END IF;

  access_pred := format($p$(
    (p_token IS NOT NULL AND ev.share_token IS NOT NULL AND p_token = ev.share_token)
    OR auth.uid() = ev.host_id
    OR COALESCE(ev.visibility, 'public') = 'public'
    OR %s
    OR (ev.visibility = 'friends' AND auth.uid() IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.follows f
          WHERE (f.follower_id = auth.uid() AND f.following_id = ev.host_id)
             OR (f.follower_id = ev.host_id AND f.following_id = auth.uid())))
  )$p$, invited_pred);

  -- 2a) Lettura completa dell'evento (per il link e per il dettaglio):
  --     evento + responses + itinerario INLINE (solo se l'itinerario è del proprietario
  --     dell'evento, così un tour privato del proprietario è visibile DENTRO l'evento,
  --     con la privacy dell'evento, senza finire nella lista pubblica dei tour).
  EXECUTE format($f$
    CREATE OR REPLACE FUNCTION public.get_event_full(p_id uuid, p_token text DEFAULT NULL)
    RETURNS jsonb
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $body$
    DECLARE
      ev public.events%%rowtype;
      route_json jsonb := NULL;
    BEGIN
      SELECT * INTO ev FROM public.events WHERE id = p_id;
      IF ev.id IS NULL THEN RETURN NULL; END IF;
      IF NOT %s THEN RETURN NULL; END IF;

      IF ev.route_id IS NOT NULL THEN
        SELECT to_jsonb(r) INTO route_json
        FROM public.routes r
        WHERE r.id = ev.route_id AND r.user_id = ev.host_id;
      END IF;

      RETURN to_jsonb(ev) || jsonb_build_object(
        'route', route_json,
        'responses', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'user_id', er.user_id, 'status', er.status, 'created_at', er.created_at))
          FROM public.event_responses er WHERE er.event_id = ev.id), '[]'::jsonb)
      );
    END;
    $body$;
  $f$, access_pred);

  -- 2b) RSVP "via link": chi apre con un token valido (ed è loggato) può partecipare,
  --     perché per l'organizzatore "chi ha il link è un invitato".
  EXECUTE format($f$
    CREATE OR REPLACE FUNCTION public.rsvp_shared_event(p_id uuid, p_token text, p_status text)
    RETURNS boolean
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $body$
    DECLARE
      ev public.events%%rowtype;
    BEGIN
      IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Devi accedere per partecipare.'; END IF;
      IF p_status NOT IN ('going', 'maybe', 'no') THEN RAISE EXCEPTION 'Stato non valido.'; END IF;
      SELECT * INTO ev FROM public.events WHERE id = p_id;
      IF ev.id IS NULL THEN RETURN false; END IF;
      IF NOT %s THEN RAISE EXCEPTION 'Non hai accesso a questo evento.'; END IF;

      INSERT INTO public.event_responses (event_id, user_id, status)
      VALUES (p_id, auth.uid(), p_status)
      ON CONFLICT (event_id, user_id) DO UPDATE SET status = EXCLUDED.status;
      RETURN true;
    END;
    $body$;
  $f$, access_pred);
END $$;

GRANT EXECUTE ON FUNCTION public.get_event_full(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rsvp_shared_event(uuid, text, text) TO authenticated;
