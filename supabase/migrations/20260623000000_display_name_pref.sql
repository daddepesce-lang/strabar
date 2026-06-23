-- Preferenza di visibilità del nome pubblico: l'utente sceglie se comparire
-- nel feed/classifiche/profilo col nome reale (default) o con @username.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS use_username BOOLEAN DEFAULT FALSE;

-- La classifica generale deve rispettare la stessa preferenza: facciamo restituire
-- anche use_username dalla RPC così il client può risolvere il nome corretto.
-- DROP necessario: aggiungere una colonna al tipo di ritorno cambia la firma OUT.
DROP FUNCTION IF EXISTS public.get_top_drinkers(integer);
CREATE OR REPLACE FUNCTION public.get_top_drinkers(lim integer DEFAULT 5)
RETURNS TABLE (
  user_id uuid,
  username text,
  display_name text,
  use_username boolean,
  is_premium boolean,
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
    COALESCE(SUM(s.total_units), 0)::numeric AS total_units
  FROM public.sessions s
  JOIN public.profiles p ON p.id = s.user_id
  GROUP BY s.user_id, p.username, p.display_name, p.use_username, p.is_premium
  ORDER BY total_units DESC
  LIMIT GREATEST(lim, 1);
$$;

GRANT EXECUTE ON FUNCTION public.get_top_drinkers(integer) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
