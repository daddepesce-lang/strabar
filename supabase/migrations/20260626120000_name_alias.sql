-- Nome di fantasia (alias) come terza identità pubblica oltre a nome reale e @username.
--   name_mode: 'name' (display_name reale) | 'username' (@username) | 'alias' (nome di fantasia)
--   alias:     il nome di fantasia scelto dall'utente
-- Backfill: i profili esistenti ereditano la scelta da use_username (mantenuto per compat).
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS alias TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS name_mode TEXT;

UPDATE public.profiles
SET name_mode = CASE WHEN use_username THEN 'username' ELSE 'name' END
WHERE name_mode IS NULL;

-- La classifica "Top atleti" passa dalla RPC: deve restituire anche alias + name_mode
-- così il client (publicName) può mostrare il nome di fantasia.
DROP FUNCTION IF EXISTS public.get_top_drinkers(integer);
CREATE OR REPLACE FUNCTION public.get_top_drinkers(lim integer DEFAULT 5)
RETURNS TABLE (
  user_id uuid,
  username text,
  display_name text,
  alias text,
  name_mode text,
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
    p.alias,
    COALESCE(p.name_mode, CASE WHEN p.use_username THEN 'username' ELSE 'name' END) AS name_mode,
    COALESCE(p.use_username, false) AS use_username,
    p.is_premium,
    COALESCE(p.public_leaderboard, true) AS public_leaderboard,
    COALESCE(SUM(s.total_units), 0)::numeric AS total_units
  FROM public.sessions s
  JOIN public.profiles p ON p.id = s.user_id
  GROUP BY s.user_id, p.username, p.display_name, p.alias, p.name_mode, p.use_username, p.is_premium, p.public_leaderboard
  ORDER BY total_units DESC
  LIMIT GREATEST(lim, 1);
$$;

GRANT EXECUTE ON FUNCTION public.get_top_drinkers(integer) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
