-- Una sola sessione LIVE (is_active = true) per utente.
-- Problema: createActivity inseriva una nuova sessione attiva senza chiudere quella
-- eventualmente già in corso → un utente poteva avere più live contemporanee
-- (visibili nel feed/radar come due sessioni attive insieme).
--
-- 1) BONIFICA dati esistenti: per ogni utente tieni attiva SOLO la live più recente
--    (per created_at) e chiudi le altre. Reversibile: rimette solo is_active = false.
-- 2) GARANZIA: indice unico parziale → il DB rifiuta una seconda live per lo stesso
--    utente. L'app (createActivity) chiude le live residue prima di inserire, quindi
--    in condizioni normali questo indice non scatta mai; è una rete di sicurezza.
-- Idempotente.

UPDATE public.sessions s
SET is_active = false
WHERE s.is_active = true
  AND s.id <> (
    SELECT s2.id
    FROM public.sessions s2
    WHERE s2.user_id = s.user_id AND s2.is_active = true
    ORDER BY s2.created_at DESC, s2.id DESC
    LIMIT 1
  );

CREATE UNIQUE INDEX IF NOT EXISTS one_active_session_per_user
  ON public.sessions (user_id)
  WHERE is_active;
