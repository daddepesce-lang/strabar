-- ============================================================
-- STRABAR — INDICI PER LA SCALABILITÀ (centinaia di utenti)
-- Idempotente: sicuro da rieseguire. Incolla nello SQL Editor di Supabase e Run.
-- Gli indici accelerano le query più frequenti (feed, radar, classifiche, notifiche)
-- riducendo i full-scan della tabella man mano che i dati crescono.
-- ============================================================

-- SESSIONS ---------------------------------------------------
-- Feed ordinato per data (paginazione): ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON public.sessions (created_at DESC);

-- Sessioni live (radar, badge "live ora"): WHERE is_active = true ORDER BY created_at
-- Indice PARZIALE: indicizza solo le poche righe attive → piccolissimo e velocissimo.
CREATE INDEX IF NOT EXISTS idx_sessions_active
  ON public.sessions (created_at DESC)
  WHERE is_active = true;

-- Sessioni di un singolo utente (profilo, statistiche)
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON public.sessions (user_id, created_at DESC);

-- CHEERS / COMMENTS (join nel feed) --------------------------
CREATE INDEX IF NOT EXISTS idx_cheers_session_id ON public.cheers (session_id);
CREATE INDEX IF NOT EXISTS idx_comments_session_id ON public.comments (session_id);

-- FOLLOWS (filtro "Amici", radar) ----------------------------
CREATE INDEX IF NOT EXISTS idx_follows_follower ON public.follows (follower_id);
CREATE INDEX IF NOT EXISTS idx_follows_following ON public.follows (following_id);

-- NOTIFICATIONS (badge non lette) ----------------------------
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON public.notifications (user_id, created_at DESC)
  WHERE read = false;

-- RECENSIONI / EVENTI ----------------------------------------
CREATE INDEX IF NOT EXISTS idx_place_reviews_key ON public.place_reviews (place_key);
CREATE INDEX IF NOT EXISTS idx_event_responses_event ON public.event_responses (event_id);

ANALYZE public.sessions;
