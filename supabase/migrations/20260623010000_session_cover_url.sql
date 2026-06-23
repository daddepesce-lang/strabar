-- Copertina leggera per l'anteprima nel feed: URL della prima foto della sessione.
-- Evita di scaricare l'intera colonna `media` (che può contenere base64 pesante) solo
-- per mostrare una thumbnail. Le altre foto si caricano on-demand all'apertura.
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS cover_url TEXT;

NOTIFY pgrst, 'reload schema';
