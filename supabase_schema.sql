-- SCHEMA DI DATABASE PER STRABAR 🍻
-- Copia e incolla questo script nell'editor SQL di Supabase per configurare le tabelle.

-- 1. Tabella PROFILES (estensione di auth.users)
CREATE TABLE public.profiles (
    id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    avatar_url TEXT,
    is_premium BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Abilita Row Level Security (RLS) su profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Criteri di accesso per profiles
CREATE POLICY "Profili pubblici visibili a tutti" 
ON public.profiles FOR SELECT 
USING (true);

CREATE POLICY "Gli utenti possono modificare il proprio profilo" 
ON public.profiles FOR UPDATE 
USING (auth.uid() = id);

CREATE POLICY "Users can create their own profile" 
ON public.profiles FOR INSERT 
WITH CHECK (auth.uid() = id);

-- Trigger automatico per creare un profilo alla registrazione dell'utente su Supabase Auth
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, username, display_name, is_premium)
    VALUES (
        new.id,
        COALESCE(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
        COALESCE(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
        FALSE
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- 2. Tabella SESSIONS (Attività / Bevute)
CREATE TABLE public.sessions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    drinks JSONB NOT NULL DEFAULT '[]'::jsonb,
    total_units NUMERIC(4,2) DEFAULT 0.00 NOT NULL,
    duration INTEGER DEFAULT 60 NOT NULL, -- in minuti
    drank_with JSONB NOT NULL DEFAULT '[]'::jsonb,
    feeling TEXT NOT NULL,
    location JSONB DEFAULT NULL, -- es. { name: "Cantina Do Mori", lat: 45.4382, lng: 12.3353 }
    bac_level NUMERIC(3,2) DEFAULT 0.00 NOT NULL, -- tasso alcolico stimato nel sangue (g/l)
    media JSONB DEFAULT NULL, -- array di oggetti { type: 'image' | 'video' | 'audio', url: string }
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Abilita RLS su sessions
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

-- Criteri di accesso per sessions
CREATE POLICY "Le sessioni sono pubbliche" 
ON public.sessions FOR SELECT 
USING (true);

CREATE POLICY "Gli utenti possono registrare nuove sessioni" 
ON public.sessions FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Gli utenti possono eliminare le proprie sessioni" 
ON public.sessions FOR DELETE 
USING (auth.uid() = user_id);


-- 3. Tabella CHEERS (Kudos per le sessioni)
CREATE TABLE public.cheers (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    session_id UUID REFERENCES public.sessions(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    UNIQUE(session_id, user_id) -- Un utente può dare un solo Cheers per sessione
);

-- Abilita RLS su cheers
ALTER TABLE public.cheers ENABLE ROW LEVEL SECURITY;

-- Criteri di accesso per cheers
CREATE POLICY "I cheers sono pubblici" 
ON public.cheers FOR SELECT 
USING (true);

CREATE POLICY "Gli utenti autenticati possono mettere Cheers" 
ON public.cheers FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Gli utenti autenticati possono togliere il Cheers" 
ON public.cheers FOR DELETE 
USING (auth.uid() = user_id);


-- 4. Tabella ROUTES (Itinerari / Bacaro Tour)
CREATE TABLE public.routes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    waypoints JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_premium BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Abilita RLS su routes
ALTER TABLE public.routes ENABLE ROW LEVEL SECURITY;

-- Criteri di accesso per routes
CREATE POLICY "I percorsi sono pubblici" 
ON public.routes FOR SELECT 
USING (true);

CREATE POLICY "Gli utenti premium possono salvare percorsi" 
ON public.routes FOR INSERT 
WITH CHECK (
    auth.uid() = user_id AND 
    EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() AND is_premium = true
    )
);

CREATE POLICY "Gli utenti possono cancellare i propri percorsi" 
ON public.routes FOR DELETE 
USING (auth.uid() = user_id);


-- 5. Tabella FOLLOWS (Seguaci / Seguiti)
CREATE TABLE public.follows (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    follower_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    following_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    UNIQUE(follower_id, following_id),
    CONSTRAINT no_self_follow CHECK (follower_id <> following_id)
);

-- Abilita RLS su follows
ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;

-- Criteri di accesso per follows
CREATE POLICY "I collegamenti follow sono pubblici" 
ON public.follows FOR SELECT 
USING (true);

CREATE POLICY "Gli utenti possono seguire altri utenti" 
ON public.follows FOR INSERT 
WITH CHECK (auth.uid() = follower_id);

CREATE POLICY "Gli utenti possono smettere di seguire altri utenti"
ON public.follows FOR DELETE
USING (auth.uid() = follower_id);


-- 6. Tabella COMMENTS (Commenti alle sessioni) — usata da db.addComment()
CREATE TABLE public.comments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    session_id UUID REFERENCES public.sessions(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    text TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "I commenti sono pubblici" ON public.comments FOR SELECT USING (true);
CREATE POLICY "Gli utenti autenticati possono commentare" ON public.comments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Gli utenti possono eliminare i propri commenti" ON public.comments FOR DELETE USING (auth.uid() = user_id);


-- ============================================================================
-- NUOVE FUNZIONALITÀ (Eventi, Recensioni Locali, Notifiche)
-- Attualmente l'app le gestisce lato client (localStorage) per il prototipo.
-- Esegui questo blocco quando vuoi migrarle su Supabase per la sincronizzazione
-- multi-utente reale, poi adatta src/lib/db.js per usare queste tabelle.
-- ============================================================================

-- 7. Tabella PLACE_REVIEWS (Recensioni dei luoghi del bere)
CREATE TABLE public.place_reviews (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    place_key TEXT NOT NULL,            -- nome locale normalizzato (lowercase)
    place_name TEXT NOT NULL,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    text TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);
ALTER TABLE public.place_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Le recensioni sono pubbliche" ON public.place_reviews FOR SELECT USING (true);
CREATE POLICY "Gli utenti autenticati possono recensire" ON public.place_reviews FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 8. Tabella EVENTS (Eventi / Date sociali)
CREATE TABLE public.events (
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
CREATE POLICY "Gli eventi sono pubblici" ON public.events FOR SELECT USING (true);
CREATE POLICY "Gli utenti possono creare eventi" ON public.events FOR INSERT WITH CHECK (auth.uid() = host_id);
CREATE POLICY "Gli host possono eliminare i propri eventi" ON public.events FOR DELETE USING (auth.uid() = host_id);

-- 9. Tabella EVENT_RESPONSES (RSVP)
CREATE TABLE public.event_responses (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    event_id UUID REFERENCES public.events(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('going','maybe','no')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    UNIQUE(event_id, user_id)
);
ALTER TABLE public.event_responses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Le risposte sono pubbliche" ON public.event_responses FOR SELECT USING (true);
CREATE POLICY "Gli utenti gestiscono la propria risposta" ON public.event_responses FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 10. Tabella NOTIFICATIONS
CREATE TABLE public.notifications (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,  -- destinatario
    actor_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    message TEXT NOT NULL,
    link TEXT,
    read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Vedo solo le mie notifiche" ON public.notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Aggiorno solo le mie notifiche" ON public.notifications FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Chiunque autenticato può creare notifiche" ON public.notifications FOR INSERT WITH CHECK (auth.uid() = actor_id);
