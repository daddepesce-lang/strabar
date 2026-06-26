-- Eventi: separa nettamente due concetti distinti.
--   • visibility  → CHI vede l'evento nella LISTA eventi (public/friends/private)
--   • link_sharing→ se il LINK DI INVITO funziona: chi ha il link può vedere e partecipare
--                   a prescindere dalla visibilità (per non-amici o gente senza account).
-- Qui aggiungo l'interruttore link_sharing (default ON) e lego l'accesso-via-token ad esso.
-- Idempotente.

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS link_sharing BOOLEAN NOT NULL DEFAULT true;

DO $$
DECLARE
  invited_udt text;
  invited_pred text;
  access_pred text;
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

  -- Il ramo "token" ora vale solo se link_sharing è attivo.
  access_pred := format($p$(
    (p_token IS NOT NULL AND ev.share_token IS NOT NULL AND p_token = ev.share_token AND COALESCE(ev.link_sharing, true))
    OR auth.uid() = ev.host_id
    OR COALESCE(ev.visibility, 'public') = 'public'
    OR %s
    OR (ev.visibility = 'friends' AND auth.uid() IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.follows f
          WHERE (f.follower_id = auth.uid() AND f.following_id = ev.host_id)
             OR (f.follower_id = ev.host_id AND f.following_id = auth.uid())))
  )$p$, invited_pred);

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
