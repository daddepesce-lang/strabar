-- Percorsi (tour): visibilità per-percorso + modifica/cancellazione del proprietario.
-- Idempotente.

-- 1) Colonna visibilità: public | friends | private (default public, come prima)
ALTER TABLE public.routes ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'public';

-- 2) SELECT rispetta la visibilità (come per le sessioni):
--    proprietario sempre; 'public' a tutti; 'friends' a chi è collegato da un follow.
DROP POLICY IF EXISTS "I percorsi sono pubblici" ON public.routes;
DROP POLICY IF EXISTS "Percorsi: visibili secondo privacy" ON public.routes;
CREATE POLICY "Percorsi: visibili secondo privacy"
ON public.routes FOR SELECT USING (
  auth.uid() = user_id
  OR COALESCE(visibility, 'public') = 'public'
  OR (
    visibility = 'friends'
    AND EXISTS (
      SELECT 1 FROM public.follows f
      WHERE (f.follower_id = auth.uid() AND f.following_id = routes.user_id)
         OR (f.follower_id = routes.user_id AND f.following_id = auth.uid())
    )
  )
);

-- 3) UPDATE: solo il proprietario può modificare il proprio percorso
DROP POLICY IF EXISTS "Gli utenti possono modificare i propri percorsi" ON public.routes;
CREATE POLICY "Gli utenti possono modificare i propri percorsi"
ON public.routes FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
