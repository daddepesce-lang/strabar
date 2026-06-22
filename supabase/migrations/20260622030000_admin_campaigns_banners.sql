-- Gestione admin: campagne notifiche programmate + banner pubblicitari/partner.
-- Idempotente. Scrittura SOLO via service role (API admin); lettura banner attivi pubblica.

-- 1) Campagne di notifica (broadcast / programmate)
CREATE TABLE IF NOT EXISTS public.notification_campaigns (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT,
  message TEXT NOT NULL,
  link TEXT,
  target TEXT NOT NULL DEFAULT 'all',      -- all | active7d | premium
  scheduled_at TIMESTAMPTZ,                 -- NULL = invio manuale
  sent_at TIMESTAMPTZ,                       -- valorizzato dopo l'invio
  recipients INTEGER NOT NULL DEFAULT 0,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.notification_campaigns ENABLE ROW LEVEL SECURITY;
-- Nessuna policy: tabella accessibile SOLO alla service role (API admin lato server).

-- 2) Banner pubblicitari / partner
CREATE TABLE IF NOT EXISTS public.ad_banners (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT,
  image_url TEXT,
  link_url TEXT,
  cta TEXT DEFAULT 'Scopri',
  partner TEXT,
  category TEXT DEFAULT 'altro',           -- locale | taxi | ncc | altro
  active BOOLEAN NOT NULL DEFAULT TRUE,
  priority INTEGER NOT NULL DEFAULT 0,      -- più alto = mostrato prima
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.ad_banners ENABLE ROW LEVEL SECURITY;

-- Lettura pubblica dei SOLI banner attivi e nella finestra temporale (per il feed).
DROP POLICY IF EXISTS "Banner attivi pubblici" ON public.ad_banners;
CREATE POLICY "Banner attivi pubblici" ON public.ad_banners FOR SELECT USING (
  active = TRUE
  AND (starts_at IS NULL OR starts_at <= NOW())
  AND (ends_at IS NULL OR ends_at >= NOW())
);
-- Scrittura (INSERT/UPDATE/DELETE): nessuna policy → solo service role (API admin).

-- Preferenza notifiche promozionali (broadcast) — gestita lato client nel JSONB notif_prefs,
-- nessuna colonna nuova necessaria. Default: ON (l'utente può disattivarla dalle Impostazioni).
