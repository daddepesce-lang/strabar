-- Permette agli utenti di MODIFICARE i propri commenti (la cancellazione era già consentita).
DROP POLICY IF EXISTS "Gli utenti possono modificare i propri commenti" ON public.comments;
CREATE POLICY "Gli utenti possono modificare i propri commenti"
ON public.comments FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
