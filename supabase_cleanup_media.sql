-- ============================================================
-- STRABAR — PULIZIA FOTO BASE64 NEL DATABASE
-- Le foto salvate come base64 (data:image/...) nella colonna `media` delle sessioni
-- (e negli avatar dei profili) appesantiscono enormemente le query → feed/profilo/classifiche
-- lentissimi. Questo script le individua e le rimuove, lasciando intatti gli URL veri.
--
-- Esegui nello SQL Editor di Supabase. Procedi in 2 fasi: prima la DIAGNOSTICA,
-- guarda i numeri, poi esegui la PULIZIA. È idempotente (sicuro da rieseguire).
-- ============================================================


-- ============================================================
-- FASE 1 — DIAGNOSTICA (sola lettura, non modifica niente)
-- ============================================================

-- 1a. Quante sessioni hanno almeno una foto base64 e quanto pesano in totale (MB)
SELECT
  COUNT(*) AS sessioni_con_base64,
  ROUND(SUM(length(media::text)) / 1048576.0, 2) AS peso_totale_mb
FROM public.sessions
WHERE media IS NOT NULL
  AND jsonb_typeof(media) = 'array'
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(media) e
    WHERE COALESCE(e->>'url', '') LIKE 'data:%'
  );

-- 1b. Le righe più pesanti (per capire quali post sono il problema)
SELECT
  id,
  title,
  created_at,
  ROUND(length(media::text) / 1048576.0, 2) AS media_mb
FROM public.sessions
WHERE media IS NOT NULL
ORDER BY length(media::text) DESC
LIMIT 20;

-- 1c. Avatar profilo salvati come base64
SELECT COUNT(*) AS avatar_base64
FROM public.profiles
WHERE avatar_url LIKE 'data:%';


-- ============================================================
-- FASE 2 — PULIZIA (modifica i dati)
-- ============================================================

-- 2a. Rimuove SOLO le voci base64 dall'array `media`, mantenendo eventuali URL veri.
UPDATE public.sessions
SET media = (
  SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
  FROM jsonb_array_elements(media) AS elem
  WHERE COALESCE(elem->>'url', '') NOT LIKE 'data:%'
)
WHERE media IS NOT NULL
  AND jsonb_typeof(media) = 'array'
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(media) AS e
    WHERE COALESCE(e->>'url', '') LIKE 'data:%'
  );

-- 2b. Normalizza a NULL gli array rimasti vuoti dopo la pulizia.
UPDATE public.sessions
SET media = NULL
WHERE media = '[]'::jsonb;

-- 2c. Azzera gli avatar base64 (verranno ricaricati come URL al prossimo upload,
--     dopo aver creato il bucket Storage).
UPDATE public.profiles
SET avatar_url = NULL
WHERE avatar_url LIKE 'data:%';

-- Aggiorna le statistiche del pianificatore query.
ANALYZE public.sessions;
ANALYZE public.profiles;


-- ============================================================
-- FASE 3 — VERIFICA (sola lettura): deve dare 0
-- ============================================================
SELECT COUNT(*) AS sessioni_base64_rimaste
FROM public.sessions
WHERE media IS NOT NULL
  AND jsonb_typeof(media) = 'array'
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(media) e
    WHERE COALESCE(e->>'url', '') LIKE 'data:%'
  );
