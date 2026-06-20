-- SCHEMA DI DATABASE PER STRABAR
-- Script idempotente: sicuro da eseguire più volte (usa IF NOT EXISTS e DROP POLICY IF EXISTS).
-- Incolla nell'editor SQL di Supabase e clicca Run.

-- ============================================================
-- 1. PROFILES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    avatar_url TEXT,
    is_premium BOOLEAN DEFAULT FALSE NOT NULL,
    weight SMALLINT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Profili pubblici visibili a tutti" ON public.profiles;
CREATE POLICY "Profili pubblici visibili a tutti"
ON public.profiles FOR SELECT USING (true);

DROP POLICY IF EXISTS "Gli utenti possono modificare il proprio profilo" ON public.profiles;
CREATE POLICY "Gli utenti possono modificare il proprio profilo"
ON public.profiles FOR UPDATE USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can create their own profile" ON public.profiles;
CREATE POLICY "Users can create their own profile"
ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, username, display_name, is_premium)
    VALUES (
        new.id,
        COALESCE(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
        COALESCE(new.raw_user_meta_data->>'display_name', new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
        FALSE
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ============================================================
-- 2. SESSIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.sessions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    drinks JSONB NOT NULL DEFAULT '[]'::jsonb,
    total_units NUMERIC(4,2) DEFAULT 0.00 NOT NULL,
    duration INTEGER DEFAULT 60 NOT NULL,
    drank_with JSONB NOT NULL DEFAULT '[]'::jsonb,
    feeling TEXT NOT NULL,
    location JSONB DEFAULT NULL,
    bac_level NUMERIC(3,2) DEFAULT 0.00 NOT NULL,
    media JSONB DEFAULT NULL,
    is_active BOOLEAN DEFAULT TRUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Le sessioni sono pubbliche" ON public.sessions;
CREATE POLICY "Le sessioni sono pubbliche" ON public.sessions FOR SELECT USING (true);

DROP POLICY IF EXISTS "Gli utenti possono registrare nuove sessioni" ON public.sessions;
CREATE POLICY "Gli utenti possono registrare nuove sessioni"
ON public.sessions FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Gli utenti possono eliminare le proprie sessioni" ON public.sessions;
CREATE POLICY "Gli utenti possono eliminare le proprie sessioni"
ON public.sessions FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Gli utenti possono modificare le proprie sessioni" ON public.sessions;
CREATE POLICY "Gli utenti possono modificare le proprie sessioni"
ON public.sessions FOR UPDATE USING (auth.uid() = user_id);


-- ============================================================
-- 3. CHEERS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.cheers (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    session_id UUID REFERENCES public.sessions(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    UNIQUE(session_id, user_id)
);
ALTER TABLE public.cheers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "I cheers sono pubblici" ON public.cheers;
CREATE POLICY "I cheers sono pubblici" ON public.cheers FOR SELECT USING (true);

DROP POLICY IF EXISTS "Gli utenti autenticati possono mettere Cheers" ON public.cheers;
CREATE POLICY "Gli utenti autenticati possono mettere Cheers"
ON public.cheers FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Gli utenti autenticati possono togliere il Cheers" ON public.cheers;
CREATE POLICY "Gli utenti autenticati possono togliere il Cheers"
ON public.cheers FOR DELETE USING (auth.uid() = user_id);


-- ============================================================
-- 4. ROUTES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.routes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    waypoints JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_premium BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);
ALTER TABLE public.routes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "I percorsi sono pubblici" ON public.routes;
CREATE POLICY "I percorsi sono pubblici" ON public.routes FOR SELECT USING (true);

-- Salvataggio percorsi: basta essere autenticati e proprietari del record.
-- NB: il "premium" è una prova gratuita di 90 giorni calcolata lato client (vedi db.getCurrentUser),
-- NON un flag nel DB (profiles.is_premium resta FALSE), quindi NON va richiesto qui:
-- altrimenti l'INSERT fallisce con 403 / "violates row-level security policy".
DROP POLICY IF EXISTS "Gli utenti premium possono salvare percorsi" ON public.routes;
DROP POLICY IF EXISTS "Gli utenti possono salvare percorsi" ON public.routes;
CREATE POLICY "Gli utenti possono salvare percorsi"
ON public.routes FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Gli utenti possono cancellare i propri percorsi" ON public.routes;
CREATE POLICY "Gli utenti possono cancellare i propri percorsi"
ON public.routes FOR DELETE USING (auth.uid() = user_id);


-- ============================================================
-- 5. FOLLOWS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.follows (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    follower_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    following_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    UNIQUE(follower_id, following_id),
    CONSTRAINT no_self_follow CHECK (follower_id <> following_id)
);
ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "I collegamenti follow sono pubblici" ON public.follows;
CREATE POLICY "I collegamenti follow sono pubblici" ON public.follows FOR SELECT USING (true);

DROP POLICY IF EXISTS "Gli utenti possono seguire altri utenti" ON public.follows;
CREATE POLICY "Gli utenti possono seguire altri utenti"
ON public.follows FOR INSERT WITH CHECK (auth.uid() = follower_id);

DROP POLICY IF EXISTS "Gli utenti possono smettere di seguire altri utenti" ON public.follows;
CREATE POLICY "Gli utenti possono smettere di seguire altri utenti"
ON public.follows FOR DELETE USING (auth.uid() = follower_id);


-- ============================================================
-- 6. COMMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.comments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    session_id UUID REFERENCES public.sessions(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    text TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "I commenti sono pubblici" ON public.comments;
CREATE POLICY "I commenti sono pubblici" ON public.comments FOR SELECT USING (true);

DROP POLICY IF EXISTS "Gli utenti autenticati possono commentare" ON public.comments;
CREATE POLICY "Gli utenti autenticati possono commentare"
ON public.comments FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Gli utenti possono eliminare i propri commenti" ON public.comments;
CREATE POLICY "Gli utenti possono eliminare i propri commenti"
ON public.comments FOR DELETE USING (auth.uid() = user_id);


-- ============================================================
-- 7. PLACE_REVIEWS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.place_reviews (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    place_key TEXT NOT NULL,
    place_name TEXT NOT NULL,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    text TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);
ALTER TABLE public.place_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Le recensioni sono pubbliche" ON public.place_reviews;
CREATE POLICY "Le recensioni sono pubbliche" ON public.place_reviews FOR SELECT USING (true);

DROP POLICY IF EXISTS "Gli utenti autenticati possono recensire" ON public.place_reviews;
CREATE POLICY "Gli utenti autenticati possono recensire"
ON public.place_reviews FOR INSERT WITH CHECK (auth.uid() = user_id);


-- ============================================================
-- 8. EVENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.events (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    host_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    date TIMESTAMP WITH TIME ZONE NOT NULL,
    location_name TEXT,
    route_id UUID REFERENCES public.routes(id) ON DELETE SET NULL,
    invited JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Gli eventi sono pubblici" ON public.events;
CREATE POLICY "Gli eventi sono pubblici" ON public.events FOR SELECT USING (true);

DROP POLICY IF EXISTS "Gli utenti possono creare eventi" ON public.events;
CREATE POLICY "Gli utenti possono creare eventi"
ON public.events FOR INSERT WITH CHECK (auth.uid() = host_id);

DROP POLICY IF EXISTS "Gli host possono eliminare i propri eventi" ON public.events;
CREATE POLICY "Gli host possono eliminare i propri eventi"
ON public.events FOR DELETE USING (auth.uid() = host_id);


-- ============================================================
-- 9. EVENT_RESPONSES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.event_responses (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    event_id UUID REFERENCES public.events(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('going','maybe','no')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    UNIQUE(event_id, user_id)
);
ALTER TABLE public.event_responses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Le risposte sono pubbliche" ON public.event_responses;
CREATE POLICY "Le risposte sono pubbliche" ON public.event_responses FOR SELECT USING (true);

DROP POLICY IF EXISTS "Gli utenti gestiscono la propria risposta" ON public.event_responses;
CREATE POLICY "Gli utenti gestiscono la propria risposta"
ON public.event_responses FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);


-- ============================================================
-- 10. NOTIFICATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    actor_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    actor_name TEXT,
    type TEXT NOT NULL,
    message TEXT NOT NULL,
    link TEXT,
    read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Vedo solo le mie notifiche" ON public.notifications;
CREATE POLICY "Vedo solo le mie notifiche"
ON public.notifications FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Aggiorno solo le mie notifiche" ON public.notifications;
CREATE POLICY "Aggiorno solo le mie notifiche"
ON public.notifications FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Chiunque autenticato può creare notifiche" ON public.notifications;
CREATE POLICY "Chiunque autenticato può creare notifiche"
ON public.notifications FOR INSERT WITH CHECK (auth.uid() = actor_id);


-- ============================================================
-- MIGRAZIONE: colonne mancanti su SESSIONS
-- Esegui se ottieni "Could not find the 'bac_level' column of 'sessions'".
-- Aggiunge le colonne se la tabella è stata creata con una versione precedente.
-- ============================================================
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS bac_level NUMERIC(3,2) DEFAULT 0.00 NOT NULL;
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS media JSONB DEFAULT NULL;
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS location JSONB DEFAULT NULL;
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS drank_with JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE NOT NULL;
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS full_stomach BOOLEAN DEFAULT NULL;

-- MIGRAZIONE: nome dell'attore nelle notifiche (per chi ha creato la tabella prima)
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS actor_name TEXT;

-- MIGRAZIONE: peso corporeo nel profilo (per BAC/curva precisi)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS weight SMALLINT;

-- MIGRAZIONE: sesso biologico nel profilo (coefficiente di Widmark per BAC/curva)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS sex TEXT;

-- MIGRAZIONE: preferenze notifiche (quali tipi ricevere)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS notif_prefs JSONB;

-- MIGRAZIONE: mostrare il proprio tasso alcolico attuale sul profilo pubblico
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS show_bac_public BOOLEAN DEFAULT FALSE;

-- Ricarica la cache dello schema di PostgREST (Supabase) così le nuove colonne sono subito visibili
NOTIFY pgrst, 'reload schema';
