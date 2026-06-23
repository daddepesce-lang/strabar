-- Backfill della copertina per le sessioni GIÀ esistenti: prende la prima foto (URL http)
-- presente nei media. Le immagini base64 (data:) vengono ignorate di proposito, per non
-- appesantire la colonna leggera usata dal feed.
UPDATE public.sessions s
SET cover_url = sub.url
FROM (
  SELECT s2.id, (
    SELECT elem->>'url'
    FROM jsonb_array_elements(s2.media) elem
    WHERE elem->>'type' = 'image' AND elem->>'url' LIKE 'http%'
    LIMIT 1
  ) AS url
  FROM public.sessions s2
  WHERE s2.media IS NOT NULL AND jsonb_typeof(s2.media) = 'array'
) sub
WHERE s.id = sub.id
  AND sub.url IS NOT NULL
  AND s.cover_url IS NULL;
