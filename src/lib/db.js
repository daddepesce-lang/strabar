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
  // --- AUTH UTILS ---
  async getCurrentUser() {
    if (isSupabaseConfigured) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      
      // Get profile
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();
        
      if (error) {
        console.error("Errore nel recupero del profilo:", error);
      }
      return { ...user, ...(profile || { username: user.email.split('@')[0], display_name: user.email.split('@')[0], is_premium: false }) };
    } else {
      if (typeof window === 'undefined') return null;
      const current = localStorage.getItem('sb_current_user');
      if (!current) return null;
      
      const user = JSON.parse(current);
      // Ricarica profilo aggiornato
      const profiles = getStored('sb_profiles');
      const profile = profiles.find(p => p.id === user.id);
      return profile || user;
    }
  },

  async login(email, password) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      return data.user;
    } else {
      // Login fittizio: usa email come username o trova utente esistente
      const profiles = getStored('sb_profiles');
      let profile = profiles.find(p => p.username === email.split('@')[0]);
      
      if (!profile) {
        // Se non esiste, crea un utente al volo per semplicità di test
        profile = {
          id: 'user-' + Math.random().toString(36).substr(2, 9),
          username: email.split('@')[0] || 'utente_strabar',
          display_name: email.split('@')[0].toUpperCase() || 'Utente Strabar',
          avatar_url: '',
          is_premium: false,
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
          redirectTo: typeof window !== 'undefined' ? window.location.origin : ''
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
        is_premium: false,
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
      
      // The database trigger 'on_auth_user_created' will automatically
      // create the profile using the metadata we passed above.
      // Wait a moment for the trigger to execute.
      await new Promise(resolve => setTimeout(resolve, 500));
      
      return data.user;
    } else {
      const profiles = getStored('sb_profiles');
      const existing = profiles.find(p => p.username === username);
      if (existing) throw new Error("Questo username è già registrato!");
      
      const newProfile = {
        id: 'user-' + Math.random().toString(36).substr(2, 9),
        username,
        display_name: displayName,
        avatar_url: '',
        is_premium: false,
        created_at: new Date().toISOString()
      };
      
      profiles.push(newProfile);
      setStored('sb_profiles', profiles);
      localStorage.setItem('sb_current_user', JSON.stringify(newProfile));
      return newProfile;
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
        .select('*, profiles(username, display_name, avatar_url)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
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

  async createActivity(activityData) {
    const user = await this.getCurrentUser();
    if (!user) throw new Error("Devi essere loggato per registrare una sessione!");

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
      created_at: new Date().toISOString()
    };

    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('sessions')
        .insert({
          ...newActivity,
          user_id: user.id
        })
        .select()
        .single();
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
      const { data: existing } = await supabase
        .from('cheers')
        .select('*')
        .eq('session_id', activityId)
        .eq('user_id', user.id)
        .single();

      if (existing) {
        await supabase
          .from('cheers')
          .delete()
          .eq('session_id', activityId)
          .eq('user_id', user.id);
        return false;
      } else {
        await supabase
          .from('cheers')
          .insert({ session_id: activityId, user_id: user.id });
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
      return newComment;
    }
  },

  // --- ROUTES (BACARO TOURS) ---
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
  }
};

