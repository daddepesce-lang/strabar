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
