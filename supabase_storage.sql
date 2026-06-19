-- ============================================================
-- STRABAR — POLICY STORAGE per il bucket 'media'
-- Un bucket "public" permette la LETTURA, ma l'UPLOAD (INSERT) richiede una policy:
-- è per questo che il caricamento foto dà errore anche se il bucket esiste.
-- Esegui nello SQL Editor di Supabase. Idempotente.
-- (Assicurati che il bucket si chiami esattamente 'media' e sia Public.)
-- ============================================================

-- Lettura pubblica dei file del bucket
DROP POLICY IF EXISTS "media: lettura pubblica" ON storage.objects;
CREATE POLICY "media: lettura pubblica" ON storage.objects
  FOR SELECT TO public USING (bucket_id = 'media');

-- Upload consentito agli utenti autenticati
DROP POLICY IF EXISTS "media: upload autenticati" ON storage.objects;
CREATE POLICY "media: upload autenticati" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'media');

-- Aggiornare/eliminare solo i propri file
DROP POLICY IF EXISTS "media: modifica propri" ON storage.objects;
CREATE POLICY "media: modifica propri" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'media' AND owner = auth.uid());

DROP POLICY IF EXISTS "media: elimina propri" ON storage.objects;
CREATE POLICY "media: elimina propri" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'media' AND owner = auth.uid());
