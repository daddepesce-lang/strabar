import { createClient as createBrowserClient } from '@/utils/supabase/client';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = !!(supabaseUrl && supabaseAnonKey);

export const supabase = isSupabaseConfigured
  ? createBrowserClient()
  : null;

// --- MOCK DATABASE (localStorage based) ---
const INITIAL_PROFILES = [
  {
    id: 'user-1',
    username: 'il_rossi',
    display_name: 'Marco Rossi',
    avatar_url: '',
    is_premium: true,
    created_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'user-2',
    username: 'fra_verdi',
    display_name: 'Francesca Verdi',
    avatar_url: '',
    is_premium: false,
    created_at: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'user-3',
    username: 'luca_b',
    display_name: 'Luca Bianchi',
    avatar_url: '',
    is_premium: false,
    created_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
  }
];

const INITIAL_ACTIVITIES = [
  {
    id: 'act-1',
    user_id: 'user-1',
    title: 'Aperitivo Ignorante al Lido 🍹',
    description: 'Spritz infiniti con vista mare. Abbiamo provato anche i cicchetti, ma il Campari ha preso il sopravvento.',
    drinks: [
      { name: 'Spritz Campari', qty: 4, abv: 11, units: 1.3 },
      { name: 'Negroni', qty: 1, abv: 26, units: 2.5 }
    ],
    total_units: 7.7,
    duration: 180, // 3 ore
    drank_with: ['Luca Bianchi', 'Francesca Verdi'],
    feeling: 'Brillo Felice',
    location: { name: 'Chiosco Al Faro', address: 'Via Interna Faro, Lido di Venezia, VE, Italia', lat: 45.4265, lng: 12.3789 },
    bac_level: 1.62,
    media: [
      { type: 'image', name: 'spritz_vista_mare.jpg', url: 'https://images.unsplash.com/photo-1574085733277-851d9d856a3a?w=400&q=80' }
    ],
    created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 ore fa
    cheers: ['user-2', 'user-3'],
    comments: [
      { id: 'c-1', user_id: 'user-2', user_name: 'Francesca Verdi', text: 'Che serata! La prossima volta paghi tu però 😂', created_at: new Date(Date.now() - 1.5 * 60 * 60 * 1000).toISOString() }
    ]
  },
  {
    id: 'act-2',
    user_id: 'user-2',
    title: 'Birre post-calcetto (terzo tempo vero) ⚽️🍻',
    description: 'Il calcetto è solo una scusa per bere la birra gelata alla spina del bar del campo.',
    drinks: [
      { name: 'Birra Bionda Media', qty: 3, abv: 4.8, units: 1.6 }
    ],
    total_units: 4.8,
    duration: 120,
    drank_with: ['Marco Rossi'],
    feeling: 'Assetato / Soddisfatto',
    location: { name: 'Bar Sportivo', address: 'Campo Calcetto San Marco, Venezia, VE, Italia', lat: 45.4350, lng: 12.3320 },
    bac_level: 1.01,
    media: [],
    created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // ieri
    cheers: ['user-1'],
    comments: []
  },
  {
    id: 'act-3',
    user_id: 'user-3',
    title: 'Degustazione Vini Rossi in Cantina 🍷',
    description: 'Serata degustazione guidata. Ottimo Amarone e Barolo. Esperienza premium.',
    drinks: [
      { name: 'Calice Vino Rosso', qty: 5, abv: 14, units: 1.3 }
    ],
    total_units: 6.5,
    duration: 240,
    drank_with: [],
    feeling: 'Inteditore',
    location: { name: 'Cantina Do Mori', address: 'Sestiere San Polo 429, Rialto, Venezia, VE, Italia', lat: 45.4382, lng: 12.3353 },
    bac_level: 1.37,
    media: [
      { type: 'image', name: 'bicchieri_cantina.jpg', url: 'https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?w=400&q=80' }
    ],
    created_at: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
    cheers: ['user-1', 'user-2'],
    comments: [
      { id: 'c-2', user_id: 'user-1', user_name: 'Marco Rossi', text: 'Spettacolo! Mi inviti la prossima volta?', created_at: new Date(Date.now() - 3.5 * 24 * 60 * 60 * 1000).toISOString() }
    ]
  }
];

const INITIAL_ROUTES = [
  {
    id: 'route-1',
    user_id: 'user-1',
    name: 'Giro dei Bacari Storico a Venezia 🛶',
    description: 'Il classico tour veneziano che parte da Rialto e arriva a Cannaregio. 4 tappe fondamentali con cicchetti e spritz al select.',
    waypoints: [
      { name: 'Cantina Do Mori', lat: 45.4382, lng: 12.3353, note: 'Il più antico, imperdibile il francobollo con cicheto.' },
      { name: 'All\'Arco', lat: 45.4384, lng: 12.3355, note: 'Famoso per i cicheti caldi.' },
      { name: 'Osteria Al Mercà', lat: 45.4386, lng: 12.3360, note: 'Spritz al volo in piedi davanti al mercato.' },
      { name: 'Cantina Aziende Agricole', lat: 45.4430, lng: 12.3300, note: 'Ottimo vino della casa e polpettine.' }
    ],
    is_premium: false,
    created_at: new Date().toISOString()
  },
  {
    id: 'route-2',
    user_id: 'user-1',
    name: 'Tour delle Birrerie di Trastevere a Roma 🏛️🍻',
    description: 'Passeggiata tra i vicoli storici di Trastevere alla ricerca delle migliori birre artigianali e dei cocktail bar più rinomati della capitale.',
    waypoints: [
      { name: 'Freni e Frizioni', lat: 41.8911, lng: 12.4705, note: 'Storico bar per aperitivi in un ex garage, famoso per i cocktail.' },
      { name: 'Ma Che Siete Venuti a Fà', lat: 41.8902, lng: 12.4700, note: 'Il tempio indiscusso della birra artigianale a Roma.' },
      { name: 'Birreria Trilussa', lat: 41.8906, lng: 12.4712, note: 'Ampia selezione di spine e ottimi stuzzichini romani.' }
    ],
    is_premium: false,
    created_at: new Date().toISOString()
  },
  {
    id: 'route-3',
    user_id: 'user-2',
    name: 'Milano Navigli Mixology Run 🍸🇮🇹',
    description: 'Il tour definitivo per gli amanti della mixology lungo i Navigli milanesi. Dai classici cocktail milanesi ai twist d\'avanguardia.',
    waypoints: [
      { name: 'Rita & Cocktails', lat: 45.4518, lng: 9.1732, note: 'Pioniere indiscusso dei cocktail bar di qualità sui Navigli.' },
      { name: 'Mag Café', lat: 45.4526, lng: 9.1755, note: 'Atmosfera retrò chic e cocktail ricchi di inventiva.' },
      { name: 'Backdoor 43', lat: 45.4523, lng: 9.1748, note: 'Il bar più piccolo del mondo: si entra uno alla volta solo su prenotazione!' },
      { name: 'Pinch Spirits & Kitchen', lat: 45.4528, lng: 9.1762, note: 'Atmosfera anni \'30, ottimi distillati e cucina di livello.' }
    ],
    is_premium: true,
    created_at: new Date().toISOString()
  },
  {
    id: 'route-4',
    user_id: 'user-2',
    name: 'London Soho Pub Crawl (Tradotto) 🇬🇧',
    description: 'Un classico tour dei pub londinesi attraverso vicoli stretti e locali storici. Si parte con una pinta e si finisce a ritmo di blues.',
    waypoints: [
      { name: 'The French House', lat: 51.5133, lng: -0.1318, note: 'Leggendario pub di Soho che serve solo mezze pinte.' },
      { name: 'The Dog and Duck', lat: 51.5138, lng: -0.1314, note: 'Un piccolo gioiello di epoca vittoriana con ottime ale.' },
      { name: 'Ain\'t Nothin But Blues Bar', lat: 51.5140, lng: -0.1375, note: 'Blues dal vivo tutte le sere, ingresso gratuito e ottima birra.' }
    ],
    is_premium: false,
    created_at: new Date().toISOString()
  },
  {
    id: 'route-5',
    user_id: 'user-3',
    name: 'Tokyo Golden Gai Izakaya Trail (Tradotto) 🇯🇵',
    description: 'Un viaggio sensoriale tra i piccolissimi bar di Golden Gai a Shinjuku (6 posti ciascuno). Sake, shochu e yakitori tradizionali.',
    waypoints: [
      { name: 'Bar Albatross', lat: 35.6938, lng: 139.7036, note: 'Locale su tre piani piccolissimo con lampadari di cristallo e ottimi highball.' },
      { name: 'Deathmatch in Hell', lat: 35.6941, lng: 139.7033, note: 'Bar a tema horror metal. Molto accogliente, prova l\'assenzio.' },
      { name: 'Bar Araku', lat: 35.6935, lng: 139.7039, note: 'Ottimo per chi vuole assaggiare diverse varietà di sake.' }
    ],
    is_premium: true,
    created_at: new Date().toISOString()
  }
];

// Inizializza localStorage se non impostato
const initMockDB = () => {
  if (typeof window === 'undefined') return;
  
  if (!localStorage.getItem('sb_profiles')) {
    localStorage.setItem('sb_profiles', JSON.stringify(INITIAL_PROFILES));
  }
  if (!localStorage.getItem('sb_activities')) {
    localStorage.setItem('sb_activities', JSON.stringify(INITIAL_ACTIVITIES));
  }
  if (!localStorage.getItem('sb_routes')) {
    localStorage.setItem('sb_routes', JSON.stringify(INITIAL_ROUTES));
  }
};

// Funzione helper per caricare dati
const getStored = (key) => {
  if (typeof window === 'undefined') return [];
  initMockDB();
  return JSON.parse(localStorage.getItem(key) || '[]');
};

// Funzione helper per salvare dati
const setStored = (key, data) => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(key, JSON.stringify(data));
};

// API di Database unificata
export const db = {
  // --- UPLOAD STORAGE ---
  async uploadFileToStorage(file) {
    if (!isSupabaseConfigured) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    }

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random().toString(36).substring(2)}-${Date.now()}.${fileExt}`;
      const filePath = `activity-media/${fileName}`;

      // Proviamo ad effettuare l'upload nel bucket 'media'
      const { data, error } = await supabase.storage
        .from('media')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (error) {
        console.warn("Errore durante l'upload sul bucket 'media', provo con 'activities':", error);
        // Fallback sul bucket 'activities'
        const { data: fallbackData, error: fallbackError } = await supabase.storage
          .from('activities')
          .upload(filePath, file, {
            cacheControl: '3600',
            upsert: false
          });

        if (fallbackError) {
          throw new Error("Impossibile caricare il file. Assicurati che esista un bucket pubblico 'media' o 'activities' in Supabase.");
        }

        const { data: publicUrlData } = supabase.storage
          .from('activities')
          .getPublicUrl(filePath);

        return publicUrlData.publicUrl;
      }

      const { data: publicUrlData } = supabase.storage
        .from('media')
        .getPublicUrl(filePath);

      return publicUrlData.publicUrl;
    } catch (err) {
      console.error("Errore di caricamento su Supabase Storage:", err);
      // Se fallisce per qualsiasi motivo, facciamo fallback sul Base64
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(file);
      });
    }
  },

  // --- AUTH UTILS ---
  async getCurrentUser() {
    if (isSupabaseConfigured) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      
      // Get profile
      let { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();
        
      if (error) {
        console.error("Errore nel recupero del profilo:", error);
      }
      
      // Se il profilo ha un display_name provvisorio (pari al prefisso email) ma nei metadati social abbiamo il nome completo reale, lo aggiorniamo nel DB
      if (profile && user.user_metadata) {
        const metaName = user.user_metadata.full_name || user.user_metadata.name || user.user_metadata.display_name;
        const emailPrefix = user.email ? user.email.split('@')[0] : '';
        if (metaName && metaName !== emailPrefix && profile.display_name === emailPrefix) {
          try {
            await supabase
              .from('profiles')
              .update({ display_name: metaName })
              .eq('id', user.id);
            profile.display_name = metaName;
          } catch (updateErr) {
            console.error("Errore aggiornamento automatico display_name da metadata:", updateErr);
          }
        }
      }

      const profileData = profile || { 
        username: user.user_metadata?.username || (user.email ? user.email.split('@')[0] : 'utente'), 
        display_name: user.user_metadata?.full_name || user.user_metadata?.name || user.user_metadata?.display_name || (user.email ? user.email.split('@')[0] : 'Utente Strabar'),
        is_premium: true,
        created_at: user.created_at || new Date().toISOString()
      };
      
      const createdAt = profileData.created_at || user.created_at || new Date().toISOString();
      const createdDate = new Date(createdAt);
      const now = new Date();
      const diffDays = Math.floor((now - createdDate) / (1000 * 60 * 60 * 24));
      const remainingDays = Math.max(0, 90 - diffDays);
      
      return { 
        ...user, 
        ...profileData, 
        is_premium: remainingDays > 0,
        premium_remaining_days: remainingDays,
        created_at: createdAt
      };
    } else {
      if (typeof window === 'undefined') return null;
      const current = localStorage.getItem('sb_current_user');
      if (!current) return null;
      
      const user = JSON.parse(current);
      const profiles = getStored('sb_profiles');
      let profile = profiles.find(p => p.id === user.id);
      if (!profile) profile = user;
      
      const createdAt = profile.created_at || new Date().toISOString();
      const createdDate = new Date(createdAt);
      const now = new Date();
      const diffDays = Math.floor((now - createdDate) / (1000 * 60 * 60 * 24));
      const remainingDays = Math.max(0, 90 - diffDays);
      
      return {
        ...profile,
        is_premium: remainingDays > 0,
        premium_remaining_days: remainingDays,
        created_at: createdAt
      };
    }
  },

  async login(email, password) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      return data.user;
    } else {
      const profiles = getStored('sb_profiles');
      let profile = profiles.find(p => p.username === email.split('@')[0]);
      
      if (!profile) {
        profile = {
          id: 'user-' + Math.random().toString(36).substr(2, 9),
          username: email.split('@')[0] || 'utente_strabar',
          display_name: email.split('@')[0].toUpperCase() || 'Utente Strabar',
          avatar_url: '',
          is_premium: true,
          created_at: new Date().toISOString()
        };
        profiles.push(profile);
        setStored('sb_profiles', profiles);
      }
      
      localStorage.setItem('sb_current_user', JSON.stringify(profile));
      return profile;
    }
  },

  async loginWithGoogle() {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          // Reindirizza al route handler che scambia il code per una sessione (flusso PKCE)
          redirectTo: typeof window !== 'undefined' ? `${window.location.origin}/auth/callback` : ''
        }
      });
      if (error) throw error;
      return data;
    } else {
      const mockGoogleProfile = {
        id: 'user-google-' + Math.random().toString(36).substr(2, 9),
        username: 'google_user',
        display_name: 'Gara Google Demo',
        avatar_url: '',
        is_premium: true,
        created_at: new Date().toISOString()
      };
      
      const profiles = getStored('sb_profiles');
      let profile = profiles.find(p => p.username === mockGoogleProfile.username);
      if (!profile) {
        profile = mockGoogleProfile;
        profiles.push(profile);
        setStored('sb_profiles', profiles);
      }
      
      localStorage.setItem('sb_current_user', JSON.stringify(profile));
      return profile;
    }
  },

  async signup(email, password, displayName, username) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase.auth.signUp({ 
        email, 
        password,
        options: {
          data: {
            username: username,
            display_name: displayName
          }
        }
      });
      if (error) throw error;

      // Se non c'è sessione, Supabase richiede la conferma via email prima dell'accesso.
      return { user: data.user, session: data.session, needsEmailConfirmation: !data.session };
    } else {
      const profiles = getStored('sb_profiles');
      const existing = profiles.find(p => p.username === username);
      if (existing) throw new Error("Questo username è già registrato!");

      const newProfile = {
        id: 'user-' + Math.random().toString(36).substr(2, 9),
        username,
        display_name: displayName,
        avatar_url: '',
        is_premium: true,
        created_at: new Date().toISOString()
      };

      profiles.push(newProfile);
      setStored('sb_profiles', profiles);
      localStorage.setItem('sb_current_user', JSON.stringify(newProfile));
      return { user: newProfile, session: { mock: true }, needsEmailConfirmation: false };
    }
  },

  async logout() {
    if (isSupabaseConfigured) {
      await supabase.auth.signOut();
    } else {
      localStorage.removeItem('sb_current_user');
    }
  },

  // --- ACTIVITIES (BEVUTE) ---
  async getActivities() {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('sessions')
        .select(`
          *,
          profiles(username, display_name, avatar_url),
          cheers(user_id),
          comments(id, text, created_at, user_id, profiles(username, display_name, avatar_url))
        `)
        .order('created_at', { ascending: false });
      if (error) throw error;
      
      return data.map(act => ({
        ...act,
        cheers: act.cheers ? act.cheers.map(c => c.user_id) : [],
        comments: act.comments ? act.comments.map(c => ({
          id: c.id,
          user_id: c.user_id,
          user_name: c.profiles?.display_name || c.profiles?.username || 'Utente Sconosciuto',
          text: c.text,
          created_at: c.created_at
        })) : []
      }));
    } else {
      const activities = getStored('sb_activities');
      const profiles = getStored('sb_profiles');
      
      // Associa profilo
      const populated = activities.map(act => {
        const profile = profiles.find(p => p.id === act.user_id) || {
          username: 'utente_sconosciuto',
          display_name: 'Utente Sconosciuto'
        };
        return {
          ...act,
          profiles: profile
        };
      });
      
      // Ordina per data decrescente
      return populated.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }
  },

  async getActivity(activityId) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('sessions')
        .select(`
          *,
          profiles(username, display_name, avatar_url),
          cheers(user_id),
          comments(id, text, created_at, user_id, profiles(username, display_name, avatar_url))
        `)
        .eq('id', activityId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        ...data,
        cheers: data.cheers ? data.cheers.map(c => c.user_id) : [],
        comments: data.comments ? data.comments.map(c => ({
          id: c.id,
          user_id: c.user_id,
          user_name: c.profiles?.display_name || c.profiles?.username || 'Utente Sconosciuto',
          text: c.text,
          created_at: c.created_at
        })) : []
      };
    } else {
      if (typeof window === 'undefined') return null;
      const activities = getStored('sb_activities');
      let found = activities.find(a => a.id === activityId);
      
      // Fallback a INITIAL_ACTIVITIES per i test locali e condivisioni mock
      if (!found) {
        found = INITIAL_ACTIVITIES.find(a => a.id === activityId);
      }
      
      if (!found) return null;
      
      const profiles = getStored('sb_profiles');
      const profile = profiles.find(p => p.id === found.user_id) || {
        username: 'utente_sconosciuto',
        display_name: 'Utente Sconosciuto'
      };
      
      return {
        ...found,
        profiles: profile
      };
    }
  },

  async createActivity(activityData) {
    const user = await this.getCurrentUser();
    if (!user) throw new Error("Devi essere loggato per registrarare una sessione!");

    const newActivity = {
      title: activityData.title || 'Nuova Bevuta',
      description: activityData.description || '',
      drinks: activityData.drinks || [],
      total_units: parseFloat(activityData.total_units || 0),
      duration: parseInt(activityData.duration || 60),
      drank_with: activityData.drank_with || [],
      feeling: activityData.feeling || 'Normale',
      location: activityData.location || null,
      bac_level: parseFloat(activityData.bac_level || 0),
      media: activityData.media || null,
      is_active: activityData.is_active !== undefined ? activityData.is_active : false,
      // Usa created_at personalizzato per sessioni a posteriori, altrimenti adesso
      created_at: activityData.created_at || new Date().toISOString()
    };

    if (isSupabaseConfigured) {
      let { data, error } = await supabase
        .from('sessions')
        .insert({ ...newActivity, user_id: user.id })
        .select()
        .single();

      // Fallback: se lo schema del DB non ha ancora alcune colonne opzionali
      // (es. errore "Could not find the 'bac_level' column" o column doesn't exist), riprova senza di esse.
      // Esegui comunque la MIGRAZIONE in supabase_schema.sql per non perdere questi dati.
      if (error && (error.code === 'PGRST204' || error.code === '42703' || /Could not find the '(\w+)' column|column .* does not exist/i.test(error.message || ''))) {
        const { bac_level, media, location, drank_with, description, is_active, ...essential } = newActivity;
        console.warn('Colonne mancanti nello schema sessions, salvo i campi essenziali. Esegui la migrazione SQL.', error.message);
        ({ data, error } = await supabase
          .from('sessions')
          .insert({ ...essential, user_id: user.id })
          .select()
          .single());
        
        // Se la creazione della sessione live è riuscita ma la colonna is_active non esiste nel DB,
        // salviamo comunque l'ID in localStorage come fallback locale!
        if (!error && data && newActivity.is_active) {
          if (typeof window !== 'undefined') {
            localStorage.setItem('sb_active_session_id', data.id);
          }
        }
      }

      if (!error && data && newActivity.is_active) {
        if (typeof window !== 'undefined') {
          localStorage.setItem('sb_active_session_id', data.id);
        }
      }

      if (error) throw error;
      return data;
    } else {
      const activities = getStored('sb_activities');
      const savedActivity = {
        ...newActivity,
        id: 'act-' + Math.random().toString(36).substr(2, 9),
        user_id: user.id,
        cheers: [],
        comments: []
      };
      
      activities.push(savedActivity);
      setStored('sb_activities', activities);
      return savedActivity;
    }
  },

  async toggleCheers(activityId) {
    const user = await this.getCurrentUser();
    if (!user) throw new Error("Devi essere loggato per mettere Cheers!");

    if (isSupabaseConfigured) {
      // Controlla se ha già Cheers
      const { data: existing, error: checkError } = await supabase
        .from('cheers')
        .select('*')
        .eq('session_id', activityId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (checkError) {
        console.error("Errore nel controllo del Cheers:", checkError);
      }

      if (existing) {
        const { error: deleteError } = await supabase
          .from('cheers')
          .delete()
          .eq('session_id', activityId)
          .eq('user_id', user.id);
        if (deleteError) throw deleteError;
        return false;
      } else {
        const { error: insertError } = await supabase
          .from('cheers')
          .insert({ session_id: activityId, user_id: user.id });
        if (insertError) throw insertError;
        // Notifica il proprietario della sessione
        try {
          const { data: sess } = await supabase
            .from('sessions')
            .select('user_id, title')
            .eq('id', activityId)
            .maybeSingle();
          if (sess && sess.user_id !== user.id) {
            this.pushNotification(sess.user_id, {
              type: 'cheers',
              actor_id: user.id,
              actor_name: user.display_name || user.username,
              message: `${user.display_name || user.username} ha messo Cheers alla tua sessione "${sess.title}"`,
              link: '/',
            });
          }
        } catch (notifyErr) {
          console.warn('Notifica cheers non inviata:', notifyErr.message || notifyErr);
        }
        return true;
      }
    } else {
      const activities = getStored('sb_activities');
      const idx = activities.findIndex(a => a.id === activityId);
      if (idx === -1) throw new Error("Attività non trovata!");
      
      const activity = activities[idx];
      if (!activity.cheers) activity.cheers = [];
      
      const cheerIdx = activity.cheers.indexOf(user.id);
      let liked = false;
      if (cheerIdx > -1) {
        activity.cheers.splice(cheerIdx, 1);
      } else {
        activity.cheers.push(user.id);
        liked = true;
      }

      activities[idx] = activity;
      setStored('sb_activities', activities);
      if (liked && activity.user_id !== user.id) {
        this.pushNotification(activity.user_id, {
          type: 'cheers',
          actor_id: user.id,
          actor_name: user.display_name || user.username,
          message: `${user.display_name || user.username} ha messo Cheers alla tua sessione "${activity.title}"`,
          link: '/',
        });
      }
      return liked;
    }
  },

  async addComment(activityId, commentText) {
    const user = await this.getCurrentUser();
    if (!user) throw new Error("Devi essere loggato per commentare!");

    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('comments')
        .insert({
          session_id: activityId,
          user_id: user.id,
          text: commentText
        })
        .select()
        .single();
      if (error) throw error;
      // Notifica il proprietario della sessione
      try {
        const { data: sess } = await supabase
          .from('sessions')
          .select('user_id, title')
          .eq('id', activityId)
          .maybeSingle();
        if (sess && sess.user_id !== user.id) {
          this.pushNotification(sess.user_id, {
            type: 'comment',
            actor_id: user.id,
            actor_name: user.display_name || user.username,
            message: `${user.display_name || user.username} ha commentato la tua sessione "${sess.title}"`,
            link: '/',
          });
        }
      } catch (notifyErr) {
        console.warn('Notifica commento non inviata:', notifyErr.message || notifyErr);
      }
      return data;
    } else {
      const activities = getStored('sb_activities');
      const idx = activities.findIndex(a => a.id === activityId);
      if (idx === -1) throw new Error("Attività non trovata!");
      
      const activity = activities[idx];
      if (!activity.comments) activity.comments = [];
      
      const newComment = {
        id: 'c-' + Math.random().toString(36).substr(2, 9),
        user_id: user.id,
        user_name: user.display_name,
        text: commentText,
        created_at: new Date().toISOString()
      };
      
      activity.comments.push(newComment);
      activities[idx] = activity;
      setStored('sb_activities', activities);
      if (activity.user_id !== user.id) {
        this.pushNotification(activity.user_id, {
          type: 'comment',
          actor_id: user.id,
          actor_name: user.display_name || user.username,
          message: `${user.display_name || user.username} ha commentato la tua sessione "${activity.title}"`,
          link: '/',
        });
      }
      return newComment;
    }
  },

  // --- ROUTES (PUB CRAWLS) ---
  async getRoutes() {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('routes')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    } else {
      return getStored('sb_routes');
    }
  },

  async createRoute(routeData) {
    const user = await this.getCurrentUser();
    if (!user) throw new Error("Devi essere loggato per salvare un percorso!");

    const newRoute = {
      name: routeData.name || 'Nuovo Tour',
      description: routeData.description || '',
      waypoints: routeData.waypoints || [],
      is_premium: !!routeData.is_premium,
      created_at: new Date().toISOString()
    };

    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('routes')
        .insert({
          ...newRoute,
          user_id: user.id
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    } else {
      const routes = getStored('sb_routes');
      const savedRoute = {
        ...newRoute,
        id: 'route-' + Math.random().toString(36).substr(2, 9),
        user_id: user.id
      };
      
      routes.push(savedRoute);
      setStored('sb_routes', routes);
      return savedRoute;
    }
  },

  // --- PREMIUM UPGRADE ---
  async upgradeToPremium() {
    const user = await this.getCurrentUser();
    if (!user) throw new Error("Devi essere loggato per passare a Premium!");

    if (isSupabaseConfigured) {
      const { error } = await supabase
        .from('profiles')
        .update({ is_premium: true })
        .eq('id', user.id);
      if (error) throw error;
      return true;
    } else {
      const profiles = getStored('sb_profiles');
      const idx = profiles.findIndex(p => p.id === user.id);
      if (idx > -1) {
        profiles[idx].is_premium = true;
        setStored('sb_profiles', profiles);
        
        // Aggiorna anche utente corrente in sessione
        const currentUser = JSON.parse(localStorage.getItem('sb_current_user') || '{}');
        currentUser.is_premium = true;
        localStorage.setItem('sb_current_user', JSON.stringify(currentUser));
        return true;
      }
      return false;
    }
  },

  async updateProfile(userId, profileData) {
    if (isSupabaseConfigured) {
      const { error } = await supabase
        .from('profiles')
        .update(profileData)
        .eq('id', userId);
      if (error) throw error;
      return true;
    } else {
      const profiles = getStored('sb_profiles');
      const idx = profiles.findIndex(p => p.id === userId);
      if (idx > -1) {
        profiles[idx] = { ...profiles[idx], ...profileData };
        setStored('sb_profiles', profiles);
        
        // Aggiorna anche utente corrente in sessione
        const currentUser = JSON.parse(localStorage.getItem('sb_current_user') || '{}');
        if (currentUser.id === userId) {
          localStorage.setItem('sb_current_user', JSON.stringify({ ...currentUser, ...profileData }));
        }
        return true;
      }
      return false;
    }
  },

  // --- CUSTOM DRINKS FOR WIDMARK CALCULATOR ---
  async getCustomDrinks() {
    if (isSupabaseConfigured) {
      // Se supabase è configurato, leggiamo da una tabella custom 'drinks'
      const { data, error } = await supabase
        .from('drinks')
        .select('*')
        .order('name', { ascending: true });
      
      // Fallback a vuoto se tabella non configurata
      if (error) return [];
      return data;
    } else {
      if (typeof window === 'undefined') return [];
      const custom = localStorage.getItem('sb_custom_drinks');
      return custom ? JSON.parse(custom) : [];
    }
  },

  async addCustomDrink(drinkData) {
    const newDrink = {
      id: 'drink-' + Math.random().toString(36).substr(2, 9),
      name: drinkData.name,
      abv: parseFloat(drinkData.abv),
      volumeMl: parseInt(drinkData.volumeMl),
      category: drinkData.category || 'Custom',
      units: parseFloat((((parseInt(drinkData.volumeMl) / 1000) * parseFloat(drinkData.abv) * 0.8 * 10) / 8).toFixed(2)) // formula esatta U.A.
    };

    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('drinks')
        .insert(newDrink)
        .select()
        .single();
      if (error) throw error;
      return data;
    } else {
      if (typeof window === 'undefined') return newDrink;
      const current = localStorage.getItem('sb_custom_drinks');
      const list = current ? JSON.parse(current) : [];
      list.push(newDrink);
      localStorage.setItem('sb_custom_drinks', JSON.stringify(list));
      return newDrink;
    }
  },

  calculateBAC(totalUnits, durationMinutes) {
    const totalU = parseFloat(totalUnits || 0);
    if (totalU === 0) return 0;
    // 1 Unit = 8g of alcohol (UK/Strabar standard: volumeMl * abv / 1000)
    const grams = totalU * 8;
    const weight = 70; // Peso medio in kg
    const r = 0.68; // Coefficiente medio di distribuzione
    const rawBac = grams / (weight * r);
    const hours = (durationMinutes || 0) / 60;
    const elimination = 0.15 * hours; // Smaltimento medio del fegato all'ora
    const finalBac = Math.max(0, rawBac - elimination);
    return parseFloat(finalBac.toFixed(2));
  },

  async updateActivity(activityId, updatedData) {
    if (isSupabaseConfigured) {
      let { data, error } = await supabase
        .from('sessions')
        .update(updatedData)
        .eq('id', activityId)
        .select()
        .single();
      if (error) {
        // Fallback: se la colonna is_active non esiste nel DB e stiamo provando a modificarla, rimuoviamola e riproviamo
        if (error.code === '42703' || /column .* does not exist/i.test(error.message || '')) {
          const { is_active, ...rest } = updatedData;
          if (Object.keys(rest).length > 0) {
            const { data: retryData, error: retryError } = await supabase
              .from('sessions')
              .update(rest)
              .eq('id', activityId)
              .select()
              .single();
            if (retryError) throw retryError;
            return retryData;
          }
          return null;
        }
        throw error;
      }
      return data;
    } else {
      const activities = getStored('sb_activities');
      const idx = activities.findIndex(a => a.id === activityId);
      if (idx === -1) throw new Error("Attività non trovata!");
      
      activities[idx] = {
        ...activities[idx],
        ...updatedData
      };
      setStored('sb_activities', activities);
      return activities[idx];
    }
  },

  async deleteActivity(activityId) {
    if (typeof window !== 'undefined') {
      const localActiveId = localStorage.getItem('sb_active_session_id');
      if (localActiveId === activityId) {
        localStorage.removeItem('sb_active_session_id');
      }
    }
    if (isSupabaseConfigured) {
      const { error } = await supabase
        .from('sessions')
        .delete()
        .eq('id', activityId);
      if (error) throw error;
    } else {
      const activities = getStored('sb_activities');
      const filtered = activities.filter(a => a.id !== activityId);
      setStored('sb_activities', filtered);
    }
  },

  async getActiveSession(userId) {
    if (isSupabaseConfigured) {
      let data = null;
      let dbError = null;
      
      try {
        const { data: dbData, error } = await supabase
          .from('sessions')
          .select(`
            *,
            profiles(username, display_name, avatar_url),
            cheers(user_id),
            comments(id, text, created_at, user_id, profiles(username, display_name, avatar_url))
          `)
          .eq('user_id', userId)
          .eq('is_active', true)
          .maybeSingle();
        data = dbData;
        dbError = error;
      } catch (err) {
        dbError = err;
      }

      if (dbError) {
        console.warn("La sessione attiva non può essere recuperata dal DB (potrebbe mancare la colonna 'is_active'):", dbError.message || dbError);
      }

      // Fallback a localStorage se la query DB non ha restituito dati
      if (!data && typeof window !== 'undefined') {
        const localActiveId = localStorage.getItem('sb_active_session_id');
        if (localActiveId) {
          try {
            const activeSessionData = await this.getActivity(localActiveId);
            if (activeSessionData && activeSessionData.user_id === userId) {
              data = activeSessionData;
            } else {
              localStorage.removeItem('sb_active_session_id');
            }
          } catch (err) {
            console.error("Errore recupero sessione attiva da localStorage:", err);
          }
        }
      }

      if (!data) return null;

      // Auto-expire se è più vecchia di 6 ore
      const createdTime = new Date(data.created_at).getTime();
      const elapsedHours = (Date.now() - createdTime) / (1000 * 60 * 60);
      if (elapsedHours > 6) {
        await this.closeSession(data.id, {
          feeling: data.feeling || 'Sobrio',
          description: data.description || 'Chiusa automaticamente dal sistema dopo 6 ore.',
          duration: Math.max(1, Math.round((Date.now() - createdTime) / (60 * 1000)))
        });
        return null;
      }

      return {
        ...data,
        cheers: data.cheers ? data.cheers.map(c => c.user_id) : [],
        comments: data.comments ? data.comments.map(c => ({
          id: c.id,
          user_id: c.user_id,
          user_name: c.profiles?.display_name || c.profiles?.username || 'Utente Sconosciuto',
          text: c.text,
          created_at: c.created_at
        })) : []
      };
    } else {
      if (typeof window === 'undefined') return null;
      const activities = getStored('sb_activities');
      const found = activities.find(a => a.user_id === userId && a.is_active === true);
      if (!found) return null;

      // Auto-expire se è più vecchia di 6 ore
      const createdTime = new Date(found.created_at).getTime();
      const elapsedHours = (Date.now() - createdTime) / (1000 * 60 * 60);
      if (elapsedHours > 6) {
        await this.closeSession(found.id, {
          feeling: found.feeling || 'Sobrio',
          description: found.description || 'Chiusa automaticamente dal sistema dopo 6 ore.',
          duration: Math.max(1, Math.round((Date.now() - createdTime) / (60 * 1000)))
        });
        return null;
      }

      const profiles = getStored('sb_profiles');
      const profile = profiles.find(p => p.id === userId) || { username: 'utente_sconosciuto', display_name: 'Utente Sconosciuto' };
      return {
        ...found,
        profiles: profile
      };
    }
  },

  async closeSession(sessionId, finalData) {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('sb_active_session_id');
    }
    const updatedData = {
      is_active: false,
      ...finalData
    };
    return this.updateActivity(sessionId, updatedData);
  },

  checkGeofencing(placeLat, placeLng, userLat, userLng, maxDistance = 200) {
    if (!placeLat || !placeLng || !userLat || !userLng) return { inside: true, distance: 0 };
    
    const R = 6371e3; // Raggio della terra in metri
    const φ1 = (placeLat * Math.PI) / 180;
    const φ2 = (userLat * Math.PI) / 180;
    const Δφ = ((userLat - placeLat) * Math.PI) / 180;
    const Δλ = ((userLng - placeLng) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    const distance = R * c; // In metri
    return {
      inside: distance <= maxDistance,
      distance: Math.round(distance)
    };
  },

  getDrinksWithTimestamps(drinks, created_at, durationMinutes) {
    if (!drinks) return [];
    const endTime = new Date(created_at || Date.now());
    const startTime = new Date(endTime.getTime() - (durationMinutes || 120) * 60 * 1000);
    
    return drinks.map((d, index) => {
      if (d.added_at) return { ...d };
      
      // Spazia i drink senza timestamp uniformemente
      const numDrinks = drinks.length;
      const offsetMs = numDrinks > 1 
        ? ((durationMinutes || 120) * 60 * 1000 * index) / (numDrinks - 1)
        : 0;
      return {
        ...d,
        qty: d.qty || 1,
        added_at: new Date(startTime.getTime() + offsetMs).toISOString()
      };
    });
  },

  calculateBACTimeline(drinks, created_at, durationMinutes) {
    const parsedDrinks = this.getDrinksWithTimestamps(drinks, created_at, durationMinutes);
    if (parsedDrinks.length === 0) return [];

    const timestamps = parsedDrinks.map(d => new Date(d.added_at).getTime());
    const startTime = new Date(Math.min(...timestamps));
    const maxDrinkTime = Math.max(...timestamps);
    const createdAtTime = new Date(created_at || Date.now()).getTime();
    
    // L'end time è la fine della sessione o il momento dell'ultimo drink, più 2 ore per vedere lo smaltimento
    const endTime = new Date(Math.max(maxDrinkTime, createdAtTime) + 2 * 60 * 60 * 1000);
    
    const totalDurationMs = endTime.getTime() - startTime.getTime();
    const numSteps = 5;
    const timepoints = [];

    for (let i = 0; i < numSteps; i++) {
      const T = new Date(startTime.getTime() + (totalDurationMs * i) / (numSteps - 1));
      
      let totalAbsorbedGrams = 0;
      parsedDrinks.forEach(d => {
        const drinkTime = new Date(d.added_at).getTime();
        const dtHours = (T.getTime() - drinkTime) / (1000 * 60 * 60);
        
        // Se dtHours è leggermente negativo (drift temporale), lo trattiamo come 0 (assorbimento istantaneo al 50%)
        const effectiveDtHours = Math.max(0, dtHours);
        const absorbedFraction = Math.max(0.5, Math.min(1, effectiveDtHours / 0.25));
        const drinkUnits = (d.units || 1.3) * (d.qty || 1);
        totalAbsorbedGrams += drinkUnits * 8 * absorbedFraction;
      });

      const hoursSinceStart = (T.getTime() - startTime.getTime()) / (1000 * 60 * 60);
      const totalEliminatedGrams = 7.14 * hoursSinceStart; // 0.15 g/l * 70kg * 0.68 r = 7.14g all'ora
      
      const netGramsInBlood = Math.max(0, totalAbsorbedGrams - totalEliminatedGrams);
      const bac = netGramsInBlood / (70 * 0.68); // peso 70 kg, r = 0.68

      timepoints.push({
        time: T,
        label: T.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        val: Math.max(0, parseFloat(bac.toFixed(2)))
      });
    }

    return timepoints;
  },

  calculateCurrentBAC(drinks, created_at, durationMinutes, referenceTime) {
    const parsedDrinks = this.getDrinksWithTimestamps(drinks, created_at, durationMinutes);
    if (parsedDrinks.length === 0) return 0;

    const timestamps = parsedDrinks.map(d => new Date(d.added_at).getTime());
    const startTime = new Date(Math.min(...timestamps));

    // referenceTime: se non passato usa "adesso" (sessione live).
    // Per sessioni storiche, passa la fine stimata della sessione (created_at + duration)
    // in modo da mostrare il BAC al picco della sessione, non 0 dopo giorni.
    const refMs = referenceTime ? new Date(referenceTime).getTime() : Date.now();
    
    let totalAbsorbedGrams = 0;
    parsedDrinks.forEach(d => {
      const drinkTime = new Date(d.added_at).getTime();
      const dtHours = (refMs - drinkTime) / (1000 * 60 * 60);
      
      // Se dtHours è leggermente negativo (drift temporale), lo trattiamo come 0 (assorbimento istantaneo al 50%)
      const effectiveDtHours = Math.max(0, dtHours);
      const absorbedFraction = Math.max(0.5, Math.min(1, effectiveDtHours / 0.25));
      const drinkUnits = (d.units || 1.3) * (d.qty || 1);
      totalAbsorbedGrams += drinkUnits * 8 * absorbedFraction;
    });

    const hoursSinceStart = (refMs - startTime.getTime()) / (1000 * 60 * 60);
    const totalEliminatedGrams = 7.14 * hoursSinceStart;
    
    const netGramsInBlood = Math.max(0, totalAbsorbedGrams - totalEliminatedGrams);
    const bac = netGramsInBlood / (70 * 0.68);
    
    return parseFloat(bac.toFixed(2));
  },

  // --- SOCIAL (FOLLOWERS / FOLLOWING) ---
  async getAllProfiles() {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('username', { ascending: true });
      if (error) throw error;
      return data;
    } else {
      if (typeof window === 'undefined') return [];
      return getStored('sb_profiles');
    }
  },

  async searchProfiles(queryText) {
    if (!queryText.trim()) return [];
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .or(`username.ilike.%${queryText}%,display_name.ilike.%${queryText}%`)
        .limit(20);
      if (error) throw error;
      return data;
    } else {
      if (typeof window === 'undefined') return [];
      const profiles = getStored('sb_profiles');
      const q = queryText.toLowerCase();
      return profiles.filter(p => 
        p.username.toLowerCase().includes(q) || 
        p.display_name.toLowerCase().includes(q)
      );
    }
  },

  async followUser(followingId) {
    const user = await this.getCurrentUser();
    if (!user) throw new Error("Devi essere autenticato per seguire qualcuno!");
    if (user.id === followingId) throw new Error("Non puoi seguire te stesso!");

    if (isSupabaseConfigured) {
      const { error } = await supabase
        .from('follows')
        .insert({ follower_id: user.id, following_id: followingId });
      if (error) throw error;
      this.pushNotification(followingId, {
        type: 'follow',
        actor_id: user.id,
        actor_name: user.display_name || user.username,
        message: `${user.display_name || user.username} ha iniziato a seguirti`,
        link: `/u/${user.id}`,
      });
      return true;
    } else {
      if (typeof window === 'undefined') return false;
      const follows = getStored('sb_follows');
      const alreadyFollowing = follows.some(f => f.follower_id === user.id && f.following_id === followingId);
      if (alreadyFollowing) return true;

      follows.push({
        id: 'follow-' + Math.random().toString(36).substr(2, 9),
        follower_id: user.id,
        following_id: followingId,
        created_at: new Date().toISOString()
      });
      setStored('sb_follows', follows);
      this.pushNotification(followingId, {
        type: 'follow',
        actor_id: user.id,
        actor_name: user.display_name || user.username,
        message: `${user.display_name || user.username} ha iniziato a seguirti`,
        link: `/u/${user.id}`,
      });
      return true;
    }
  },

  async unfollowUser(followingId) {
    const user = await this.getCurrentUser();
    if (!user) throw new Error("Devi essere autenticato!");

    if (isSupabaseConfigured) {
      const { error } = await supabase
        .from('follows')
        .delete()
        .eq('follower_id', user.id)
        .eq('following_id', followingId);
      if (error) throw error;
      return true;
    } else {
      if (typeof window === 'undefined') return false;
      let follows = getStored('sb_follows');
      follows = follows.filter(f => !(f.follower_id === user.id && f.following_id === followingId));
      setStored('sb_follows', follows);
      return true;
    }
  },

  async getFollowing(userId) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('follows')
        .select(`
          following_id,
          profiles:following_id (*)
        `)
        .eq('follower_id', userId);
      if (error) throw error;
      return (data || []).map(item => item.profiles).filter(Boolean);
    } else {
      if (typeof window === 'undefined') return [];
      const follows = getStored('sb_follows');
      const profiles = getStored('sb_profiles');
      
      const followingIds = follows
        .filter(f => f.follower_id === userId)
        .map(f => f.following_id);
        
      return profiles.filter(p => followingIds.includes(p.id));
    }
  },

  async getFollowers(userId) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('follows')
        .select(`
          follower_id,
          profiles:follower_id (*)
        `)
        .eq('following_id', userId);
      if (error) throw error;
      return (data || []).map(item => item.profiles).filter(Boolean);
    } else {
      if (typeof window === 'undefined') return [];
      const follows = getStored('sb_follows');
      const profiles = getStored('sb_profiles');
      
      const followerIds = follows
        .filter(f => f.following_id === userId)
        .map(f => f.follower_id);
        
      return profiles.filter(p => followerIds.includes(p.id));
    }
  },

  async getUserProfile(userId) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();
      if (error) throw error;
      return data;
    } else {
      if (typeof window === 'undefined') return null;
      const profiles = getStored('sb_profiles');
      return profiles.find(p => p.id === userId) || null;
    }
  },

  // Ritorna le attività di un singolo utente (per la pagina profilo amico)
  async getUserActivities(userId) {
    const all = await this.getActivities();
    return all.filter(a => a.user_id === userId);
  },

  // Attività in cui l'utente è stato TAGGATO (drank_with contiene "@username"),
  // escluse quelle che ha creato lui stesso. Usato per mostrarle sul suo profilo.
  async getTaggedActivities(username, excludeUserId = null) {
    if (!username) return [];
    const needle = `(@${username})`.toLowerCase();
    const all = await this.getActivities();
    return all.filter((a) => {
      if (excludeUserId && a.user_id === excludeUserId) return false;
      return (a.drank_with || []).some((d) => String(d).toLowerCase().includes(needle));
    });
  },

  // --- FRIENDS HELPERS ---
  async isFollowing(targetId) {
    const user = await this.getCurrentUser();
    if (!user) return false;
    const following = await this.getFollowing(user.id);
    return following.some(f => f.id === targetId);
  },

  // Amici = follow reciproco (segui e ti segue)
  async getFriends(userId) {
    const [following, followers] = await Promise.all([
      this.getFollowing(userId),
      this.getFollowers(userId)
    ]);
    const followerIds = new Set(followers.map(f => f.id));
    return following.filter(f => followerIds.has(f.id));
  },

  // --- PLACES / LUOGHI DEL BERE (aggregati dalle sessioni reali) ---
  normalizePlaceKey(name) {
    return (name || '').trim().toLowerCase().replace(/\s+/g, ' ');
  },

  async getPlaces() {
    const activities = await this.getActivities();
    const map = {};
    activities.forEach((act) => {
      const loc = act.location;
      if (!loc || !loc.name) return;
      const key = this.normalizePlaceKey(loc.name);
      if (!map[key]) {
        map[key] = {
          key,
          name: loc.name,
          address: loc.address || '',
          lat: loc.lat || null,
          lng: loc.lng || null,
          sessionsCount: 0,
          totalUnits: 0,
          drinkers: {},
        };
      }
      const p = map[key];
      p.sessionsCount += 1;
      p.totalUnits += parseFloat(act.total_units || 0);
      if (!p.address && loc.address) p.address = loc.address;
      if (!p.lat && loc.lat) { p.lat = loc.lat; p.lng = loc.lng; }
      const uid = act.user_id;
      const uname = act.profiles?.display_name || act.profiles?.username || 'Atleta Strabar';
      if (!p.drinkers[uid]) p.drinkers[uid] = { name: uname, count: 0, units: 0 };
      p.drinkers[uid].count += 1;
      p.drinkers[uid].units += parseFloat(act.total_units || 0);
    });

    const reviews = this.getReviewsRaw();

    return Object.values(map)
      .map((p) => {
        const drinkers = Object.values(p.drinkers);
        let legend = { name: 'Nessuno', count: 0 };
        drinkers.forEach((d) => { if (d.count > legend.count) legend = d; });
        const placeReviews = reviews.filter((r) => r.place_key === p.key);
        const avgRating = placeReviews.length
          ? placeReviews.reduce((a, r) => a + r.rating, 0) / placeReviews.length
          : 0;
        return {
          key: p.key,
          name: p.name,
          address: p.address,
          lat: p.lat,
          lng: p.lng,
          sessionsCount: p.sessionsCount,
          totalUnits: parseFloat(p.totalUnits.toFixed(1)),
          uniqueDrinkers: drinkers.length,
          localLegend: legend,
          reviewsCount: placeReviews.length,
          avgRating: parseFloat(avgRating.toFixed(1)),
        };
      });
  },

  // --- RICERCA LOCALI REALI (OpenStreetMap) ---
  // Normalizza un risultato OSM (Nominatim o Overpass) nella forma usata dai selettori.
  _normalizeOsmVenue(raw) {
    const tags = raw.tags || {};
    const name =
      raw.name ||
      tags.name ||
      (raw.display_name ? raw.display_name.split(',')[0] : null);
    if (!name) return null;

    const lat = parseFloat(raw.lat ?? raw.center?.lat);
    const lng = parseFloat(raw.lon ?? raw.center?.lon);
    if (Number.isNaN(lat) || Number.isNaN(lng)) return null;

    // Costruisci un indirizzo leggibile
    let address = raw.display_name || '';
    if (!address && (tags['addr:street'] || tags['addr:city'])) {
      address = [
        [tags['addr:street'], tags['addr:housenumber']].filter(Boolean).join(' '),
        tags['addr:city'],
      ]
        .filter(Boolean)
        .join(', ');
    }
    const amenity = tags.amenity || raw.type || raw.category || '';

    return {
      key: this.normalizePlaceKey(name) + '|' + lat.toFixed(4) + ',' + lng.toFixed(4),
      name,
      address,
      lat,
      lng,
      amenity,
      source: 'osm',
      avgRating: 0,
      reviewsCount: 0,
      uniqueDrinkers: 0,
      sessionsCount: 0,
    };
  },

  // Deduplica una lista di locali per nome+coordinate ravvicinate
  _dedupeVenues(list) {
    const seen = new Map();
    list.forEach((v) => {
      if (!v) return;
      const k = this.normalizePlaceKey(v.name);
      const existing = seen.get(k);
      if (!existing) {
        seen.set(k, v);
      } else if ((v.sessionsCount || 0) > (existing.sessionsCount || 0)) {
        // Preferisci la versione con più dati community
        seen.set(k, { ...v, ...existing, ...v });
      }
    });
    return Array.from(seen.values());
  },

  // Cerca locali per nome/indirizzo su OpenStreetMap (Nominatim).
  // `near` opzionale: { lat, lng } per dare priorità ai risultati vicini.
  async searchVenues(query, near = null) {
    const q = (query || '').trim();
    if (q.length < 2) return [];
    try {
      const params = new URLSearchParams({
        q,
        format: 'jsonv2',
        limit: '20',
        addressdetails: '1',
        'accept-language': 'it',
      });
      if (near && near.lat && near.lng) {
        const d = 0.15; // ~15km di bias attorno alla posizione
        params.set(
          'viewbox',
          `${near.lng - d},${near.lat - d},${near.lng + d},${near.lat + d}`
        );
      }
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?${params.toString()}`,
        { headers: { Accept: 'application/json' } }
      );
      if (!res.ok) throw new Error('Nominatim ' + res.status);
      const data = await res.json();
      return this._dedupeVenues(
        (data || []).map((r) => this._normalizeOsmVenue(r)).filter(Boolean)
      );
    } catch (err) {
      console.warn('Ricerca locali OSM fallita:', err.message || err);
      return [];
    }
  },

  // Trova bar/pub/locali reali vicini a una posizione GPS (Overpass API).
  async getNearbyVenues(lat, lng, radius = 200) {
    if (!lat || !lng) return [];
    const filters = [
      'amenity~"^(bar|pub|biergarten|nightclub|cafe|restaurant|fast_food|ice_cream)$"',
      'shop~"^(wine|beverages|alcohol)$"',
    ];
    const body =
      `[out:json][timeout:20];(` +
      filters
        .map(
          (f) =>
            `node[${f}](around:${radius},${lat},${lng});way[${f}](around:${radius},${lat},${lng});`
        )
        .join('') +
      `);out center 60;`;
    try {
      const res = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(body),
      });
      if (!res.ok) throw new Error('Overpass ' + res.status);
      const data = await res.json();
      const venues = (data.elements || [])
        .map((el) => this._normalizeOsmVenue(el))
        .filter(Boolean)
        .map((v) => ({
          ...v,
          distance: this.checkGeofencing(v.lat, v.lng, lat, lng, Infinity).distance,
        }))
        .sort((a, b) => (a.distance || 0) - (b.distance || 0));
      return this._dedupeVenues(venues);
    } catch (err) {
      console.warn('Ricerca locali vicini (Overpass) fallita:', err.message || err);
      return [];
    }
  },

  // Locali reali entro un raggio dalla posizione GPS (default 200m, come da geofencing),
  // combinati con i locali community (dalle sessioni) che cadono nello stesso raggio.
  // Ritorna { venues, radius, widened } così la UI può informare l'utente se ha allargato il raggio.
  async getCombinedNearbyPlaces(lat, lng, radius = 200) {
    // Senza GPS non possiamo limitare al raggio: restituiamo solo i locali community.
    if (!lat || !lng) {
      const community = await this.getPlaces().catch(() => []);
      return {
        venues: community.map((p) => ({ ...p, source: 'community', distance: null })),
        radius: null,
        widened: false,
      };
    }

    const withDistance = (list, src) =>
      list
        .map((p) => ({
          ...p,
          source: p.source || src,
          distance:
            p.lat && p.lng
              ? this.checkGeofencing(p.lat, p.lng, lat, lng, Infinity).distance
              : null,
        }));

    const community = withDistance(await this.getPlaces().catch(() => []), 'community');

    // Cerca i locali reali entro il raggio richiesto; se nessuno, allarga progressivamente.
    let osm = await this.getNearbyVenues(lat, lng, radius);
    let usedRadius = radius;
    let widened = false;
    const widenSteps = [500, 1000];
    for (const r of widenSteps) {
      if (osm.length > 0) break;
      osm = await this.getNearbyVenues(lat, lng, r);
      usedRadius = r;
      widened = true;
    }

    // Includi i locali community che cadono entro il raggio effettivamente usato.
    const nearbyCommunity = community.filter(
      (p) => p.distance != null && p.distance <= usedRadius
    );

    const merged = this._dedupeVenues([...nearbyCommunity, ...osm]).filter(
      (v) => v.distance == null || v.distance <= usedRadius
    );

    merged.sort((a, b) => {
      if (a.distance != null && b.distance != null) return a.distance - b.distance;
      if (a.distance != null) return -1;
      if (b.distance != null) return 1;
      return (b.sessionsCount || 0) - (a.sessionsCount || 0);
    });

    return { venues: merged, radius: usedRadius, widened };
  },

  // Classifica atleti per un singolo locale (visite + unità alcoliche)
  async getPlaceLeaderboard(placeKey) {
    const activities = await this.getActivities();
    const sessions = activities.filter(
      (a) => a.location && this.normalizePlaceKey(a.location.name) === placeKey
    );
    const byUser = {};
    sessions.forEach((s) => {
      const uid = s.user_id;
      const name = s.profiles?.display_name || s.profiles?.username || 'Atleta Strabar';
      if (!byUser[uid]) byUser[uid] = { user_id: uid, name, visits: 0, units: 0 };
      byUser[uid].visits += 1;
      byUser[uid].units += parseFloat(s.total_units || 0);
    });
    return Object.values(byUser).map((u) => ({ ...u, units: parseFloat(u.units.toFixed(1)) }));
  },

  // Classifica globale degli atleti Strabar (per U.A. totali, sessioni, drink, locali)
  async getUserLeaderboard() {
    const activities = await this.getActivities();
    const byUser = {};
    activities.forEach((a) => {
      const uid = a.user_id;
      if (!uid) return;
      if (!byUser[uid]) {
        byUser[uid] = {
          user_id: uid,
          name: a.profiles?.display_name || a.profiles?.username || 'Atleta Strabar',
          username: a.profiles?.username || 'atleta',
          is_premium: a.profiles?.is_premium || false,
          sessions: 0,
          units: 0,
          drinks: 0,
          places: new Set(),
        };
      }
      const u = byUser[uid];
      u.sessions += 1;
      u.units += parseFloat(a.total_units || 0);
      u.drinks += (a.drinks || []).reduce((s, d) => s + (d.qty || 0), 0);
      if (a.location?.name) u.places.add(this.normalizePlaceKey(a.location.name));
    });
    return Object.values(byUser)
      .map((u) => ({
        user_id: u.user_id,
        name: u.name,
        username: u.username,
        is_premium: u.is_premium,
        sessions: u.sessions,
        units: parseFloat(u.units.toFixed(1)),
        drinks: u.drinks,
        placesCount: u.places.size,
      }))
      .sort((a, b) => b.units - a.units || b.sessions - a.sessions);
  },

  // --- RECENSIONI LOCALI ---
  getReviewsRaw() {
    if (typeof window === 'undefined') return [];
    return JSON.parse(localStorage.getItem('sb_reviews') || '[]');
  },

  async getPlaceReviews(placeKey) {
    return this.getReviewsRaw()
      .filter((r) => r.place_key === placeKey)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  },

  async addReview(placeKey, placeName, rating, text) {
    const user = await this.getCurrentUser();
    if (!user) throw new Error('Devi essere loggato per recensire un locale!');
    const reviews = this.getReviewsRaw();
    const review = {
      id: 'rev-' + Math.random().toString(36).substr(2, 9),
      place_key: placeKey,
      place_name: placeName,
      user_id: user.id,
      user_name: user.display_name || user.username,
      rating: Math.max(1, Math.min(5, parseInt(rating || 5))),
      text: text || '',
      created_at: new Date().toISOString(),
    };
    reviews.push(review);
    if (typeof window !== 'undefined') localStorage.setItem('sb_reviews', JSON.stringify(reviews));
    return review;
  },

  // --- EVENTI / DATE (gestione itinerari sociali) ---
  getEventsRaw() {
    if (typeof window === 'undefined') return [];
    return JSON.parse(localStorage.getItem('sb_events') || '[]');
  },
  setEventsRaw(list) {
    if (typeof window !== 'undefined') localStorage.setItem('sb_events', JSON.stringify(list));
  },

  async getEvents() {
    const user = await this.getCurrentUser();
    const events = this.getEventsRaw();
    const profiles = await this.getAllProfiles();
    return events
      .map((e) => {
        const host = profiles.find((p) => p.id === e.host_id) || { display_name: e.host_name, username: 'host' };
        const goingCount = (e.responses || []).filter((r) => r.status === 'going').length;
        const myResponse = user ? ((e.responses || []).find((r) => r.user_id === user.id)?.status || null) : null;
        const isInvited = user ? (e.host_id === user.id || (e.invited || []).includes(user.id)) : false;
        return { ...e, host, goingCount, myResponse, isInvited };
      })
      .sort((a, b) => new Date(a.date) - new Date(b.date));
  },

  async getEvent(eventId) {
    const events = await this.getEvents();
    const ev = events.find((e) => e.id === eventId);
    if (!ev) return null;
    const profiles = await this.getAllProfiles();
    const responses = (ev.responses || []).map((r) => ({
      ...r,
      profile: profiles.find((p) => p.id === r.user_id) || { display_name: r.user_name, username: 'utente' },
    }));
    return { ...ev, responses };
  },

  async createEvent(data) {
    const user = await this.getCurrentUser();
    if (!user) throw new Error('Devi essere loggato per creare un evento!');
    const events = this.getEventsRaw();
    const newEvent = {
      id: 'evt-' + Math.random().toString(36).substr(2, 9),
      host_id: user.id,
      host_name: user.display_name || user.username,
      title: data.title || 'Nuovo Evento',
      description: data.description || '',
      date: data.date,
      location_name: data.location_name || '',
      route_id: data.route_id || null,
      route_name: data.route_name || null,
      invited: data.invited || [],
      responses: [
        { user_id: user.id, user_name: user.display_name || user.username, status: 'going', created_at: new Date().toISOString() },
      ],
      created_at: new Date().toISOString(),
    };
    events.push(newEvent);
    this.setEventsRaw(events);
    (data.invited || []).forEach((uid) => {
      this.pushNotification(uid, {
        type: 'event_invite',
        actor_id: user.id,
        actor_name: user.display_name || user.username,
        message: `${user.display_name || user.username} ti ha invitato a "${newEvent.title}"`,
        link: `/events/${newEvent.id}`,
      });
    });
    return newEvent;
  },

  async respondToEvent(eventId, status) {
    const user = await this.getCurrentUser();
    if (!user) throw new Error('Devi essere loggato per rispondere a un evento!');
    const events = this.getEventsRaw();
    const idx = events.findIndex((e) => e.id === eventId);
    if (idx === -1) throw new Error('Evento non trovato!');
    const ev = events[idx];
    ev.responses = ev.responses || [];
    const entry = { user_id: user.id, user_name: user.display_name || user.username, status, created_at: new Date().toISOString() };
    const rIdx = ev.responses.findIndex((r) => r.user_id === user.id);
    if (rIdx > -1) ev.responses[rIdx] = entry; else ev.responses.push(entry);
    events[idx] = ev;
    this.setEventsRaw(events);
    if (ev.host_id !== user.id) {
      const label = status === 'going' ? 'Partecipo' : status === 'maybe' ? 'Forse' : 'Non posso';
      this.pushNotification(ev.host_id, {
        type: 'event_rsvp',
        actor_id: user.id,
        actor_name: user.display_name || user.username,
        message: `${user.display_name || user.username} ha risposto "${label}" a "${ev.title}"`,
        link: `/events/${ev.id}`,
      });
    }
    return ev;
  },

  async inviteToEvent(eventId, userIds) {
    const user = await this.getCurrentUser();
    if (!user) throw new Error('Devi essere loggato!');
    const events = this.getEventsRaw();
    const idx = events.findIndex((e) => e.id === eventId);
    if (idx === -1) throw new Error('Evento non trovato!');
    const ev = events[idx];
    const newInvites = (userIds || []).filter((uid) => !(ev.invited || []).includes(uid));
    ev.invited = [...(ev.invited || []), ...newInvites];
    events[idx] = ev;
    this.setEventsRaw(events);
    newInvites.forEach((uid) => {
      this.pushNotification(uid, {
        type: 'event_invite',
        actor_id: user.id,
        actor_name: user.display_name || user.username,
        message: `${user.display_name || user.username} ti ha invitato a "${ev.title}"`,
        link: `/events/${ev.id}`,
      });
    });
    return ev;
  },

  async deleteEvent(eventId) {
    const user = await this.getCurrentUser();
    if (!user) throw new Error('Devi essere loggato!');
    const events = this.getEventsRaw().filter((e) => !(e.id === eventId && e.host_id === user.id));
    this.setEventsRaw(events);
    return true;
  },

  // --- NOTIFICHE ---
  // Su Supabase le notifiche vivono nella tabella `notifications` (cross-device):
  // così quando qualcuno ti segue / mette Cheers / commenta, lo vedi davvero anche
  // da un altro dispositivo. In assenza di Supabase si usa localStorage.
  getNotificationsRaw() {
    if (typeof window === 'undefined') return [];
    return JSON.parse(localStorage.getItem('sb_notifications') || '[]');
  },

  async pushNotification(recipientId, payload) {
    if (!recipientId) return;

    if (isSupabaseConfigured) {
      try {
        const { error } = await supabase.from('notifications').insert({
          user_id: recipientId,
          actor_id: payload.actor_id || null,
          actor_name: payload.actor_name || null,
          type: payload.type || 'info',
          message: payload.message || '',
          link: payload.link || null,
        });
        if (error) console.warn('Notifica non salvata su Supabase:', error.message);
      } catch (err) {
        console.warn('Errore invio notifica:', err.message || err);
      }
      if (typeof window !== 'undefined') window.dispatchEvent(new Event('notifications-change'));
      return;
    }

    if (typeof window === 'undefined') return;
    const notifs = this.getNotificationsRaw();
    notifs.push({
      id: 'ntf-' + Math.random().toString(36).substr(2, 9),
      user_id: recipientId,
      read: false,
      created_at: new Date().toISOString(),
      ...payload,
    });
    localStorage.setItem('sb_notifications', JSON.stringify(notifs));
    window.dispatchEvent(new Event('notifications-change'));
  },

  async getNotifications() {
    const user = await this.getCurrentUser();
    if (!user) return [];

    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) {
        console.warn('Errore recupero notifiche:', error.message);
        return [];
      }
      return data || [];
    }

    return this.getNotificationsRaw()
      .filter((n) => n.user_id === user.id)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  },

  async getUnreadCount() {
    const user = await this.getCurrentUser();
    if (!user) return 0;

    if (isSupabaseConfigured) {
      const { count, error } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('read', false);
      if (error) return 0;
      return count || 0;
    }

    return this.getNotificationsRaw().filter((n) => n.user_id === user.id && !n.read).length;
  },

  async markNotificationsRead() {
    const user = await this.getCurrentUser();
    if (!user) return;

    if (isSupabaseConfigured) {
      const { error } = await supabase
        .from('notifications')
        .update({ read: true })
        .eq('user_id', user.id)
        .eq('read', false);
      if (error) console.warn('Errore aggiornamento notifiche:', error.message);
      if (typeof window !== 'undefined') window.dispatchEvent(new Event('notifications-change'));
      return;
    }

    const notifs = this.getNotificationsRaw().map((n) =>
      n.user_id === user.id ? { ...n, read: true } : n
    );
    if (typeof window !== 'undefined') {
      localStorage.setItem('sb_notifications', JSON.stringify(notifs));
      window.dispatchEvent(new Event('notifications-change'));
    }
  },

  // Alias usato dalla pagina percorsi (firma compatta)
  async saveRoute(name, description, waypoints, isPremium = false) {
    return this.createRoute({ name, description, waypoints, is_premium: isPremium });
  },

  async getRoute(routeId) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('routes')
        .select('*')
        .eq('id', routeId)
        .maybeSingle();
      if (error) throw error;
      return data;
    } else {
      if (typeof window === 'undefined') return null;
      const routes = getStored('sb_routes');
      let found = routes.find(r => r.id === routeId);
      if (!found) {
        found = INITIAL_ROUTES.find(r => r.id === routeId);
      }
      return found || null;
    }
  }
};

