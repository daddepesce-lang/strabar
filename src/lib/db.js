import { createClient as createBrowserClient } from '@/utils/supabase/client';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = !!(supabaseUrl && supabaseAnonKey);

export const supabase = isSupabaseConfigured
  ? createBrowserClient()
  : null;

// --- MOCK DATABASE (localStorage based) ---
const INITIAL_PROFILES = [];
const INITIAL_ACTIVITIES = [];
const INITIAL_ROUTES = [];

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

      // Durante la beta tutte le funzioni sono gratuite per tutti: niente scadenza.
      return {
        ...user,
        ...profileData,
        is_premium: true,
        premium_remaining_days: null,
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

      // Durante la beta tutte le funzioni sono gratuite per tutti: niente scadenza.
      return {
        ...profile,
        is_premium: true,
        premium_remaining_days: null,
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

  // Invia l'email di reset password (Supabase invia il link tramite l'SMTP configurato, es. Resend)
  async resetPassword(email) {
    if (!isSupabaseConfigured) {
      // In modalità mock non c'è invio reale
      return { mock: true };
    }
    const redirectTo = typeof window !== 'undefined' ? `${window.location.origin}/auth/reset` : undefined;
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) throw error;
    return true;
  },

  // Imposta una nuova password (dopo aver cliccato il link di recupero)
  async updatePassword(newPassword) {
    if (!isSupabaseConfigured) return { mock: true };
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;
    return true;
  },

  // --- ACTIVITIES (BEVUTE) ---
  // Feed: supporta la PAGINAZIONE. Senza argomenti scarica tutto (retro-compatibile
  // per aggregazioni come classifiche/luoghi); con { limit } scarica solo una pagina,
  // così il feed non legge più l'intera tabella ad ogni apertura.
  async getActivities({ limit, offset = 0 } = {}) {
    if (isSupabaseConfigured) {
      let query = supabase
        .from('sessions')
        .select(`
          *,
          profiles(username, display_name, avatar_url, weight),
          cheers(user_id),
          comments(id, text, created_at, user_id, profiles(username, display_name, avatar_url, weight))
        `)
        .order('created_at', { ascending: false });
      if (limit != null) query = query.range(offset, offset + limit - 1);
      const { data, error } = await query;
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
      const sorted = populated.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      return limit != null ? sorted.slice(offset, offset + limit) : sorted;
    }
  },

  async getActivity(activityId) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('sessions')
        .select(`
          *,
          profiles(username, display_name, avatar_url, weight),
          cheers(user_id),
          comments(id, text, created_at, user_id, profiles(username, display_name, avatar_url, weight))
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
      full_stomach: activityData.full_stomach !== undefined ? activityData.full_stomach : null,
      is_active: activityData.is_active !== undefined ? activityData.is_active : false,
      // Usa created_at personalizzato per sessioni a posteriori, altrimenti adesso
      created_at: activityData.created_at || new Date().toISOString()
    };

    if (isSupabaseConfigured) {
      // Inserisci la sessione. Se lo schema del DB non ha ancora una colonna opzionale,
      // rimuoviamo SOLO la colonna mancante segnalata dall'errore e riproviamo.
      // (Prima venivano azzerati tutti i campi opzionali insieme — incluso `location` —
      // e questo faceva sparire i dati del Tour guidato dalla sessione live.)
      // Esegui comunque la MIGRAZIONE in supabase_schema.sql per non perdere questi dati.
      const insertRow = { ...newActivity, user_id: user.id };
      let data = null;
      let error = null;
      for (let attempt = 0; attempt < 8; attempt++) {
        ({ data, error } = await supabase
          .from('sessions')
          .insert(insertRow)
          .select()
          .single());
        if (!error) break;

        const isMissingColumn =
          error.code === 'PGRST204' ||
          error.code === '42703' ||
          /Could not find the '\w+' column|column .* does not exist/i.test(error.message || '');
        if (!isMissingColumn) break;

        // Estrai il nome della colonna mancante dal messaggio d'errore
        const m = (error.message || '').match(/'(\w+)'|column "?(\w+)"?/i);
        const col = m ? (m[1] || m[2]) : null;
        // Non rimuovere mai le colonne essenziali (sempre presenti nello schema base)
        if (col && col in insertRow && !['title', 'user_id', 'created_at', 'drinks'].includes(col)) {
          console.warn(`Colonna '${col}' mancante nello schema sessions: la rimuovo e riprovo. Esegui la migrazione SQL.`);
          delete insertRow[col];
          continue;
        }
        break;
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
              link: `/?activity=${activityId}`,
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
          link: `/?activity=${activityId}`,
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
            link: `/?activity=${activityId}`,
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
          link: `/?activity=${activityId}`,
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
            profiles(username, display_name, avatar_url, weight),
            cheers(user_id),
            comments(id, text, created_at, user_id, profiles(username, display_name, avatar_url, weight))
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

      // Auto-expire se è più vecchia di 5 ore
      const createdTime = new Date(data.created_at).getTime();
      const elapsedHours = (Date.now() - createdTime) / (1000 * 60 * 60);
      if (elapsedHours > 5) {
        await this.closeSession(data.id, {
          feeling: data.feeling || 'Sobrio',
          description: data.description || 'Chiusa automaticamente dal sistema dopo 5 ore.',
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

      // Auto-expire se è più vecchia di 5 ore
      const createdTime = new Date(found.created_at).getTime();
      const elapsedHours = (Date.now() - createdTime) / (1000 * 60 * 60);
      if (elapsedHours > 5) {
        await this.closeSession(found.id, {
          feeling: found.feeling || 'Sobrio',
          description: found.description || 'Chiusa automaticamente dal sistema dopo 5 ore.',
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
    // created_at è l'INIZIO della sessione: i drink senza orario vengono
    // distribuiti in AVANTI lungo la durata (da inizio a inizio+durata).
    // Questo mantiene coerenza con il referenceTime = created_at + durata usato
    // per le sessioni storiche, evitando di conteggiare lo smaltimento due volte.
    const startTime = new Date(created_at || Date.now());
    const durMs = (durationMinutes || 120) * 60 * 1000;

    return drinks.map((d, index) => {
      if (d.added_at) return { ...d };

      // Spazia i drink senza timestamp uniformemente lungo la durata
      const numDrinks = drinks.length;
      const offsetMs = numDrinks > 1 ? (durMs * index) / (numDrinks - 1) : 0;
      return {
        ...d,
        qty: d.qty || 1,
        added_at: new Date(startTime.getTime() + offsetMs).toISOString()
      };
    });
  },

  calculateBACTimeline(drinks, created_at, durationMinutes, weightKg, fullStomach) {
    const parsedDrinks = this.getDrinksWithTimestamps(drinks, created_at, durationMinutes);
    if (parsedDrinks.length === 0) return [];

    // Peso reale dell'utente se disponibile, altrimenti 70kg di default (Widmark)
    const w = parseFloat(weightKg) > 0 ? parseFloat(weightKg) : 70;
    const r = 0.68;
    const eliminationPerHour = 0.15 * w * r; // grammi smaltiti all'ora
    // A stomaco pieno l'assorbimento è più lento e il picco più basso (~ -20%)
    const stomachFactor = fullStomach ? 0.8 : 1.0;

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
        totalAbsorbedGrams += drinkUnits * 8 * absorbedFraction * stomachFactor;
      });

      const hoursSinceStart = (T.getTime() - startTime.getTime()) / (1000 * 60 * 60);
      const totalEliminatedGrams = eliminationPerHour * hoursSinceStart;

      const netGramsInBlood = Math.max(0, totalAbsorbedGrams - totalEliminatedGrams);
      const bac = netGramsInBlood / (w * r);

      timepoints.push({
        time: T,
        label: T.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        val: Math.max(0, parseFloat(bac.toFixed(2)))
      });
    }

    return timepoints;
  },

  calculateCurrentBAC(drinks, created_at, durationMinutes, referenceTime, weightKg, fullStomach) {
    const parsedDrinks = this.getDrinksWithTimestamps(drinks, created_at, durationMinutes);
    if (parsedDrinks.length === 0) return 0;

    const w = parseFloat(weightKg) > 0 ? parseFloat(weightKg) : 70;
    const r = 0.68;
    const eliminationPerHour = 0.15 * w * r;
    const stomachFactor = fullStomach ? 0.8 : 1.0;

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
      totalAbsorbedGrams += drinkUnits * 8 * absorbedFraction * stomachFactor;
    });

    const hoursSinceStart = (refMs - startTime.getTime()) / (1000 * 60 * 60);
    const totalEliminatedGrams = eliminationPerHour * hoursSinceStart;

    const netGramsInBlood = Math.max(0, totalAbsorbedGrams - totalEliminatedGrams);
    const bac = netGramsInBlood / (w * r);

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

  // Ritorna le attività di un singolo utente. Filtra lato DB (indice su user_id):
  // non scarica più l'intera tabella per poi filtrare in JS.
  async getUserActivities(userId) {
    if (!userId) return [];
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('sessions')
        .select(`
          *,
          profiles(username, display_name, avatar_url, weight),
          cheers(user_id),
          comments(id, text, created_at, user_id, profiles(username, display_name, avatar_url, weight))
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []).map(act => ({
        ...act,
        cheers: act.cheers ? act.cheers.map(c => c.user_id) : [],
        comments: act.comments ? act.comments.map(c => ({
          id: c.id,
          user_id: c.user_id,
          user_name: c.profiles?.display_name || c.profiles?.username || 'Utente Sconosciuto',
          text: c.text,
          created_at: c.created_at,
        })) : [],
      }));
    }
    const all = await this.getActivities();
    return all.filter(a => a.user_id === userId);
  },

  // Classifica globale "top atleti per U.A.". Usa una funzione SQL (RPC) che aggrega
  // nel database; se la RPC non è ancora installata (vedi supabase_scale.sql) ricade
  // sul calcolo lato client. Con tante sessioni la RPC evita di scaricare tutto.
  async getTopDrinkers(limit = 5) {
    if (isSupabaseConfigured) {
      try {
        const { data, error } = await supabase.rpc('get_top_drinkers', { lim: limit });
        if (error) throw error;
        if (Array.isArray(data)) {
          return data.map((r, i) => ({
            rank: i + 1,
            user_id: r.user_id,
            name: r.display_name || r.username || 'Atleta Strabar',
            units: parseFloat(Number(r.total_units || 0).toFixed(1)),
            isPremium: !!r.is_premium,
          }));
        }
      } catch (err) {
        console.warn('RPC get_top_drinkers non disponibile, fallback lato client:', err.message || err);
      }
    }
    // Fallback (solo finché la RPC non è installata): aggrega su un numero LIMITATO
    // di sessioni recenti per non scaricare l'intera tabella e saturare il DB.
    const acts = await this.getActivities({ limit: 500 }).catch(() => []);
    const byUser = {};
    acts.forEach((a) => {
      const uid = a.user_id;
      if (!uid) return;
      const name = a.profiles?.display_name || a.profiles?.username || 'Atleta Strabar';
      if (!byUser[uid]) byUser[uid] = { user_id: uid, name, units: 0, isPremium: a.profiles?.is_premium || false };
      byUser[uid].units += parseFloat(a.total_units || 0);
    });
    return Object.values(byUser)
      .map((u) => ({ ...u, units: parseFloat(u.units.toFixed(1)) }))
      .sort((a, b) => b.units - a.units)
      .slice(0, limit)
      .map((u, i) => ({ ...u, rank: i + 1 }));
  },

  // Suggerimenti "Potresti conoscere": amici-di-amici che non segui ancora,
  // ordinati per numero di connessioni in comune. Se non ce ne sono, propone
  // altri atleti che non segui.
  async getSuggestedProfiles(userId, limit = 8) {
    if (!userId) return [];
    try {
      const myFollowing = await this.getFollowing(userId);
      const excluded = new Set(myFollowing.map((f) => f.id));
      excluded.add(userId);

      const counts = {};
      await Promise.all(
        myFollowing.map(async (f) => {
          const theirs = await this.getFollowing(f.id).catch(() => []);
          theirs.forEach((t) => {
            if (excluded.has(t.id)) return;
            if (!counts[t.id]) counts[t.id] = { profile: t, mutual: 0 };
            counts[t.id].mutual += 1;
          });
        })
      );

      let list = Object.values(counts).sort((a, b) => b.mutual - a.mutual);

      // Fallback: nessun amico-di-amico → altri atleti non ancora seguiti
      if (list.length < limit) {
        const all = await this.getAllProfiles().catch(() => []);
        const already = new Set(list.map((x) => x.profile.id));
        all.forEach((p) => {
          if (!excluded.has(p.id) && !already.has(p.id)) {
            list.push({ profile: p, mutual: 0 });
          }
        });
      }

      return list.slice(0, limit).map((x) => ({ ...x.profile, mutualCount: x.mutual }));
    } catch (err) {
      console.error('Errore suggerimenti profili:', err);
      return [];
    }
  },

  // --- RADAR LIVE: chi sta bevendo vicino a me adesso ---
  // Mostra solo sessioni LIVE recenti (<6h) con condivisione posizione attiva
  // (location.share = 'public' | 'friends'). Le 'friends' sono visibili solo a chi le segue.
  // Query LEGGERA delle sole sessioni live (ultime 5h): niente join su commenti/cheers,
  // solo i campi che servono a radar e badge "live ora". Riduce di molto il carico DB
  // rispetto a getActivities() (che scarica TUTTE le sessioni con tutti i join).
  async getActiveSessionsLight() {
    if (isSupabaseConfigured) {
      const since = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString();
      try {
        const { data, error } = await supabase
          .from('sessions')
          .select('id, user_id, location, created_at, bac_level, drinks, is_active, profiles(username, display_name)')
          .eq('is_active', true)
          .gte('created_at', since)
          .order('created_at', { ascending: false });
        if (error) throw error;
        return data || [];
      } catch (err) {
        // Fallback (es. colonna is_active mancante): ripiega sulla query completa.
        console.warn('getActiveSessionsLight fallback a getActivities:', err.message || err);
        return (await this.getActivities().catch(() => [])).filter((a) => a.is_active);
      }
    }
    return (await this.getActivities()).filter((a) => a.is_active);
  },

  async getLiveDrinkers(lat, lng, radiusM, viewerId) {
    if (!lat || !lng) return [];
    const acts = await this.getActiveSessionsLight().catch(() => []);
    const now = Date.now();

    // "Amici" = collegamento di follow in QUALSIASI direzione (io seguo te O tu segui me).
    let connectedIds = new Set();
    if (viewerId) {
      try {
        const [following, followers] = await Promise.all([
          this.getFollowing(viewerId).catch(() => []),
          this.getFollowers(viewerId).catch(() => []),
        ]);
        connectedIds = new Set([...(following || []), ...(followers || [])].map((f) => f.id));
      } catch { /* noop */ }
    }

    const out = [];
    acts.forEach((a) => {
      if (!a.is_active) return;
      if (now - new Date(a.created_at).getTime() > 5 * 60 * 60 * 1000) return;
      if (viewerId && a.user_id === viewerId) return; // non mostrare me stesso
      const loc = a.location;
      if (!loc || typeof loc.lat !== 'number' || typeof loc.lng !== 'number') return;
      if (loc.share !== 'public' && loc.share !== 'friends') return;
      if (loc.share === 'friends' && !connectedIds.has(a.user_id)) return;

      const distance = this.checkGeofencing(loc.lat, loc.lng, lat, lng, Infinity).distance;
      if (distance > radiusM) return;

      out.push({
        id: a.id,
        user_id: a.user_id,
        name: a.profiles?.display_name || a.profiles?.username || 'Atleta Strabar',
        username: a.profiles?.username || 'atleta',
        place: loc.name || 'Posizione condivisa',
        lat: loc.lat,
        lng: loc.lng,
        share: loc.share,
        distance,
        drinks: (a.drinks || []).reduce((s, d) => s + (d.qty || 0), 0),
        bac: parseFloat(a.bac_level || 0),
        created_at: a.created_at,
      });
    });

    return out.sort((x, y) => x.distance - y.distance);
  },

  // Conta le sessioni live (con condivisione) visibili all'utente, senza GPS.
  // Usato per il badge "X live ora" nella navbar.
  // Badge "X live ora": COUNT lato server (head: true → nessuna riga scaricata).
  // Conteggio approssimato delle sessioni attive condivise nelle ultime 5h: per un
  // badge va benissimo e regge tantissime sessioni live senza scaricarle tutte.
  // (Il radar applica poi i filtri precisi di follow/posizione sui soli risultati vicini.)
  async getLiveCount() {
    if (isSupabaseConfigured) {
      try {
        const since = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString();
        const { count, error } = await supabase
          .from('sessions')
          .select('id', { count: 'exact', head: true })
          .eq('is_active', true)
          .gte('created_at', since);
        if (error) throw error;
        return count || 0;
      } catch (err) {
        console.warn('getLiveCount fallback:', err.message || err);
        return 0;
      }
    }
    const acts = await this.getActiveSessionsLight().catch(() => []);
    const now = Date.now();
    return acts.filter((a) => a.is_active && now - new Date(a.created_at).getTime() <= 5 * 60 * 60 * 1000).length;
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
      if (loc.unverified) return; // sessione fuori dal locale: non conta per le classifiche
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
    // Classe/tipo OSM (per distinguere un vero locale da un paese/via/regione).
    const osmClass = raw.category || raw.class || (tags.amenity ? 'amenity' : tags.shop ? 'shop' : '');
    const osmType = raw.type || tags.amenity || tags.shop || '';

    return {
      key: this.normalizePlaceKey(name) + '|' + lat.toFixed(4) + ',' + lng.toFixed(4),
      name,
      address,
      lat,
      lng,
      amenity,
      osmClass,
      osmType,
      isVenue: this.isVenuePlace(osmClass, osmType),
      source: 'osm',
      avgRating: 0,
      reviewsCount: 0,
      uniqueDrinkers: 0,
      sessionsCount: 0,
    };
  },

  // Distingue un vero locale (bar/pub/ristorante/negozio…) da entità geografiche
  // (paesi, città, vie, regioni) che NON devono essere selezionabili come "locale".
  isVenuePlace(osmClass, osmType) {
    const VENUE_CLASSES = new Set(['amenity', 'shop', 'leisure', 'tourism', 'craft', 'club', 'office']);
    const NON_VENUE_AMENITIES = new Set(['parking', 'bench', 'toilets', 'fuel', 'townhall', 'place_of_worship', 'school', 'hospital']);
    if (!VENUE_CLASSES.has(osmClass)) return false;
    if (osmClass === 'amenity' && NON_VENUE_AMENITIES.has(osmType)) return false;
    return true;
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
      (a) => a.location && !a.location.unverified && this.normalizePlaceKey(a.location.name) === placeKey
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
      if (a.location?.unverified) return; // sessione non verificata: esclusa dalla classifica
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
      location: data.location || null, // { name, lat, lng } se scelto un locale/indirizzo reale
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

  async updateEvent(eventId, fields) {
    const user = await this.getCurrentUser();
    if (!user) throw new Error('Devi essere loggato!');
    const events = this.getEventsRaw();
    const idx = events.findIndex((e) => e.id === eventId);
    if (idx === -1) throw new Error('Evento non trovato!');
    if (events[idx].host_id !== user.id) throw new Error("Solo l'organizzatore può modificare l'evento.");
    const allowed = ['title', 'description', 'date', 'location_name', 'location', 'route_id', 'route_name'];
    const patch = {};
    allowed.forEach((k) => { if (k in fields) patch[k] = fields[k]; });
    events[idx] = { ...events[idx], ...patch };
    this.setEventsRaw(events);
    return events[idx];
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

