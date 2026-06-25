-- Visibilità del nome nelle classifiche pubbliche (globale + evento).
-- Di DEFAULT l'utente compare col proprio nome; può fare opt-out per restare
-- coperto ("Atleta riservato") verso gli estranei. Chi vi segue / seguite vede
-- comunque il nome (vedi _revealIdsFor lato client).
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS public_leaderboard BOOLEAN DEFAULT TRUE;

-- La classifica "Top atleti" (podio in home) passa dalla RPC: deve restituire anche
-- public_leaderboard così il client può coprire il nome di chi ha fatto opt-out.
-- DROP necessario: aggiungere una colonna al tipo di ritorno cambia la firma OUT.
DROP FUNCTION IF EXISTS public.get_top_drinkers(integer);
CREATE OR REPLACE FUNCTION public.get_top_drinkers(lim integer DEFAULT 5)
RETURNS TABLE (
  user_id uuid,
  username text,
  display_name text,
  use_username boolean,
  is_premium boolean,
  public_leaderboard boolean,
  total_units numeric
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    s.user_id,
    p.username,
    p.display_name,
    COALESCE(p.use_username, false) AS use_username,
    p.is_premium,
    COALESCE(p.public_leaderboard, true) AS public_leaderboard,
    COALESCE(SUM(s.total_units), 0)::numeric AS total_units
  FROM public.sessions s
  JOIN public.profiles p ON p.id = s.user_id
  GROUP BY s.user_id, p.username, p.display_name, p.use_username, p.is_premium, p.public_leaderboard
  ORDER BY total_units DESC
  LIMIT GREATEST(lim, 1);
$$;

GRANT EXECUTE ON FUNCTION public.get_top_drinkers(integer) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
