import { createClient as createBrowserClient } from '@/utils/supabase/client';
import { publicName } from '@/lib/names';
import { QUICK_DRINKS, EXTRA_DRINKS, BEER_FAMILIES } from '@/lib/drinks';

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
  // Ridimensiona e ricomprime le foto PRIMA dell'upload (sul dispositivo): una foto da
  // smartphone pesa 3-8 MB e riempirebbe in fretta lo storage. Riduciamo il lato lungo e
  // convertiamo in WEBP (~25-30% più leggero del JPEG a parità di qualità), con fallback
  // automatico a JPEG sui browser che non sanno codificare WebP via canvas.
  // In caso di errore (o GIF animate) si carica l'originale.
  async _compressImage(file, maxDim = 1440, quality = 0.80) {
    if (typeof window === 'undefined') return file;
    if (!file || !file.type || !file.type.startsWith('image/')) return file;
    if (file.type === 'image/gif') return file;
    try {
      const bitmap = await createImageBitmap(file);
      let { width, height } = bitmap;
      const scale = Math.min(1, maxDim / Math.max(width, height));
      width = Math.round(width * scale);
      height = Math.round(height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(bitmap, 0, 0, width, height);
      bitmap.close?.();
      const encode = (type) => new Promise((res) => canvas.toBlob(res, type, quality));
      let blob = await encode('image/webp');
      let ext = 'webp', mime = 'image/webp';
      if (!blob || blob.type !== 'image/webp') { // browser senza encode WebP → JPEG
        blob = await encode('image/jpeg'); ext = 'jpg'; mime = 'image/jpeg';
      }
      if (!blob || blob.size >= file.size) return file; // se non riduce, tieni l'originale
      return new File([blob], (file.name || 'foto').replace(/\.\w+$/, '') + '.' + ext, { type: mime });
    } catch {
      return file;
    }
  },

  // --- UPLOAD STORAGE (Cloudflare R2) ---
  // I file multimediali stanno su R2 (egress gratuito), NON su Supabase Storage. L'upload
  // passa da /api/upload (le chiavi R2 restano sul server). Il client comprime e genera la
  // miniatura PRIMA di inviare, così carichiamo poco e il feed serve una thumbnail leggera.

  // Copertina per il feed: lato lungo ~800px, WebP q.72 (~40-70 KB). Il feed la mostra al
  // massimo a ~680px, quindi 800px basta e avanza anche su retina. Il lightbox/dettaglio usa
  // sempre l'immagine PIENA (≤1440px), quindi nessuna perdita per chi apre la foto.
  // Anteprime più leggere = molta meno banda servita (cached egress) man mano che si scala.
  async _makeThumb(file) {
    return this._compressImage(file, 800, 0.72);
  },

  // Avatar: si vedono a ≤80px, quindi 256px q.72 (~8-18 KB) sono più che sufficienti.
  // Prima venivano salvati a 1080px (~150 KB) e caricati su OGNI card del feed: enorme
  // spreco di banda. Questa è una miniatura dedicata, una sola immagine.
  async _makeAvatar(file) {
    return this._compressImage(file, 256, 0.72);
  },

  // Carica un'immagine su R2 e ritorna { url (piena), thumb (miniatura) }.
  async uploadImage(file) {
    const [full, thumb] = await Promise.all([
      this._compressImage(file),   // piena qualità (≤1440px, q.80)
      this._makeThumb(file),       // miniatura leggera per il feed
    ]);
    const fd = new FormData();
    fd.append('full', full, (full.name || 'foto') + '');
    if (thumb && thumb !== full) fd.append('thumb', thumb, 'thumb.jpg');

    const res = await fetch('/api/upload', { method: 'POST', body: fd });
    if (!res.ok) {
      let msg = 'Caricamento immagine non riuscito.';
      try { const j = await res.json(); if (j.error) msg = j.error; } catch { /* noop */ }
      throw new Error(msg);
    }
    const { url, thumb: thumbUrl } = await res.json();
    return { url, thumb: thumbUrl || url };
  },

  // Avatar (foto profilo): carica UNA sola immagine piccola (256px) su R2. Niente coppia
  // piena+thumb: per un avatar è inutile e spreca banda. Ritorna la sola URL.
  async uploadFileToStorage(file) {
    const small = await this._makeAvatar(file);
    const fd = new FormData();
    fd.append('full', small, (small.name || 'avatar.webp'));
    const res = await fetch('/api/upload', { method: 'POST', body: fd });
    if (!res.ok) {
      let msg = 'Caricamento immagine non riuscito.';
      try { const j = await res.json(); if (j.error) msg = j.error; } catch { /* noop */ }
      throw new Error(msg);
    }
    const { url } = await res.json();
    return url;
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

  async loginWithGoogle(next = '/') {
    if (isSupabaseConfigured) {
      // Propaga la destinazione (next) al callback OAuth, così dopo il login con Google
      // si torna alla pagina richiesta (es. un itinerario condiviso) e non al feed.
      const safeNext = (typeof next === 'string' && next.startsWith('/') && !next.startsWith('//')) ? next : '/';
      const cb = typeof window !== 'undefined'
        ? `${window.location.origin}/auth/callback?next=${encodeURIComponent(safeNext)}`
        : '';
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          // Reindirizza al route handler che scambia il code per una sessione (flusso PKCE)
          redirectTo: cb
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

  async signup(email, password, displayName, username, consentVersion) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            username: username,
            display_name: displayName,
            // Consenso GDPR a Termini/Privacy: il trigger handle_new_user lo registra
            // sul profilo (consent_version + tos_accepted_at = ora del server).
            consent_version: consentVersion || null
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
  // Colonne di lista delle sessioni (SENZA `media`, vedi nota in getActivities), MA con
  // `residual_grams`: serve a far vedere a tutti lo stesso BAC live. `_selectSessions`
  // include la colonna e, se il DB non l'ha ancora migrata, riprova senza (niente crash).
  // `cover_url`: URL della SOLA foto di copertina (anteprima nel feed). Leggero (una
  // stringa) → mostriamo la thumbnail senza scaricare l'intera colonna `media` (che può
  // contenere base64 pesante). Le altre foto si caricano on-demand all'apertura.
  _SESSION_LIST_COLS: 'id, user_id, title, description, drinks, total_units, duration, drank_with, feeling, location, bac_level, is_active, full_stomach, residual_grams, cover_url, created_at',
  async _selectSessions(buildQuery) {
    let res = await buildQuery(this._SESSION_LIST_COLS);
    // Degrada con grazia se il DB non ha ancora la migrazione delle colonne opzionali.
    if (res.error && /residual_grams/i.test(res.error.message || '')) {
      res = await buildQuery(this._SESSION_LIST_COLS.replace(', residual_grams', ''));
    }
    if (res.error && /cover_url/i.test(res.error.message || '')) {
      res = await buildQuery(this._SESSION_LIST_COLS.replace(', cover_url', '').replace(', residual_grams', ''));
    }
    return res;
  },

  // Copertina leggera per il feed: la MINIATURA (thumb) della prima foto, se presente,
  // altrimenti l'URL pieno. Ignora i base64 (data:) per non appesantire cover_url.
  _coverFromMedia(media) {
    if (!Array.isArray(media)) return null;
    const img = media.find((m) => {
      const u = m && m.type === 'image' && (m.thumb || m.url);
      return typeof u === 'string' && /^https?:\/\//.test(u);
    });
    return img ? (img.thumb || img.url) : null;
  },

  // Feed: supporta la PAGINAZIONE. Senza argomenti scarica tutto (retro-compatibile
  // per aggregazioni come classifiche/luoghi); con { limit } scarica solo una pagina,
  // così il feed non legge più l'intera tabella ad ogni apertura.
  async getActivities({ limit, offset = 0 } = {}) {
    if (isSupabaseConfigured) {
      // IMPORTANTE: NON selezioniamo la colonna `media` nel feed/lista. Le foto possono
      // essere salvate come base64 (megabyte) quando lo Storage non è disponibile, e
      // `select *` le scaricava tutte ad ogni apertura del feed → caricamento eterno.
      // Le foto si caricano solo aprendo il singolo post (getActivity).
      const { data, error } = await this._selectSessions((cols) => {
        let query = supabase
          .from('sessions')
          .select(`
            ${cols},
            profiles(username, display_name, use_username, public_leaderboard, avatar_url, weight, sex),
            cheers(count),
            comments(count)
          `)
          .order('created_at', { ascending: false });
        if (limit != null) query = query.range(offset, offset + limit - 1);
        return query;
      });
      if (error) throw error;

      // EGRESS: nel feed scarichiamo solo i CONTEGGI di cheers e commenti (non gli elenchi
      // con i profili annidati). Chi ha messo cheers / i commenti veri si caricano on-demand
      // (getCheerers / getComments) o aprendo il dettaglio (getActivity). `cheered_by_me`
      // viene valorizzato a parte con getMyCheers (una sola query batch per pagina).
      return data.map(act => ({
        ...act,
        cheer_count: Array.isArray(act.cheers) ? (act.cheers[0]?.count ?? 0) : 0,
        cheers: [], // elenco caricato on-demand
        cheered_by_me: false, // valorizzato da getMyCheers lato pagina
        comment_count: Array.isArray(act.comments) ? (act.comments[0]?.count ?? 0) : 0,
        comments: [], // caricati on-demand
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

  // Commenti di una singola sessione, caricati ON-DEMAND (quando si espande la sezione
  // commenti nel feed). Tiene il feed leggero: la lista scarica solo il conteggio.
  async getComments(activityId) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('comments')
        .select('id, text, created_at, user_id, profiles(username, display_name, avatar_url, weight)')
        .eq('session_id', activityId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data || []).map(c => ({
        id: c.id,
        user_id: c.user_id,
        user_name: c.profiles?.display_name || c.profiles?.username || 'Utente Sconosciuto',
        text: c.text,
        created_at: c.created_at,
      }));
    }
    if (typeof window === 'undefined') return [];
    const all = getStored('sb_comments') || [];
    return all.filter((c) => c.session_id === activityId);
  },

  // Quali delle sessioni passate ha "cheerato" l'utente corrente. UNA query leggera per
  // pagina del feed (solo le mie righe tra gli id dati) → imposta `cheered_by_me` senza
  // scaricare TUTTI gli elenchi cheers. Ritorna un Set di session_id.
  async getMyCheers(sessionIds = []) {
    if (!isSupabaseConfigured || !sessionIds.length) return new Set();
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return new Set();
      const { data } = await supabase
        .from('cheers')
        .select('session_id')
        .eq('user_id', user.id)
        .in('session_id', sessionIds);
      return new Set((data || []).map((r) => r.session_id));
    } catch { return new Set(); }
  },

  // Chi ha messo cheers a una sessione, caricato ON-DEMAND (apertura elenco "Cheers").
  async getCheerers(activityId) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('cheers')
        .select('user_id, profiles(username, display_name)')
        .eq('session_id', activityId);
      if (error) throw error;
      return (data || []).map((c) => ({
        id: c.user_id,
        name: c.profiles?.display_name || c.profiles?.username || 'Atleta Strabar',
        username: c.profiles?.username || null,
      }));
    }
    if (typeof window === 'undefined') return [];
    const all = getStored('sb_cheers') || [];
    return all.filter((c) => c.session_id === activityId).map((c) => ({ id: c.user_id, name: 'Atleta', username: null }));
  },

  async getActivity(activityId) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('sessions')
        .select(`
          *,
          profiles(username, display_name, use_username, avatar_url, weight, sex),
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
        cheer_count: data.cheers ? data.cheers.length : 0,
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
      cover_url: this._coverFromMedia(activityData.media),
      full_stomach: activityData.full_stomach !== undefined ? activityData.full_stomach : null,
      is_active: activityData.is_active !== undefined ? activityData.is_active : false,
      // Usa created_at personalizzato per sessioni a posteriori, altrimenti adesso
      created_at: activityData.created_at || new Date().toISOString()
    };

    // CONGELA il residuo pregresso sulla sessione live, qualunque sia l'origine
    // (evento, locale, percorso, manuale): così il BAC live è IDENTICO per tutti
    // (proprietario, profilo, spettatori, radar) e non dipende da chi ha lo storico.
    if (newActivity.is_active && activityData.residual_grams === undefined) {
      try {
        newActivity.residual_grams = await this._computeResidualForNewSession(user.id, newActivity.created_at);
      } catch { /* best effort: senza residuo congelato si ripiega sul calcolo al volo */ }
    } else if (activityData.residual_grams !== undefined) {
      newActivity.residual_grams = activityData.residual_grams;
    }

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
        // Notifica gli amici taggati: "Vuoi avviare la tua sessione?" (best effort)
        this._notifyTaggedCompanions(user, data).catch(() => {});
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

  // Notifica gli amici taggati (drank_with: "Nome (@username)") quando avvii una sessione LIVE,
  // invitandoli ad avviare la loro. Rispetta la preferenza 'tagged' (gestibile, default ON).
  // Notifica gli amici taggati in una live. Se `onlyUsernames` è passato, notifica solo quelli
  // (usato quando si tagga DURANTE la live, per non re-notificare i già taggati).
  // Se la sessione è geolocalizzata, il messaggio cita il LUOGO e il link porta a /log
  // pre-impostato su quel locale: il taggato avvia lì la sua sessione e — se è davvero sul
  // posto (verifica GPS) — conta per la classifica.
  async _notifyTaggedCompanions(actor, session, onlyUsernames = null) {
    let usernames = [];
    (session.drank_with || []).forEach((t) => {
      // [^)]+ così cattura username con punti/altri caratteri (es. "anna.sartori1995"),
      // che con [\w-] venivano IGNORATI → niente notifica di tag a quegli utenti.
      const m = String(t).match(/\(@([^)]+)\)/);
      if (m && m[1]) usernames.push(m[1].trim());
    });
    if (onlyUsernames) {
      const allow = new Set(onlyUsernames.map((u) => u.toLowerCase()));
      usernames = usernames.filter((u) => allow.has(u.toLowerCase()));
    }
    if (!usernames.length || !isSupabaseConfigured) return;
    const actorName = actor.display_name || actor.username || 'Un amico';

    const loc = session.location;
    const geo = loc && loc.name && !loc.freeform && typeof loc.lat === 'number' && typeof loc.lng === 'number';
    const message = geo
      ? `${actorName} ti ha taggato da "${loc.name}"! Apri la tua sessione qui — se sei sul posto conta per la classifica 🍻`
      : `${actorName} ti ha taggato in una sessione live! Vuoi avviare la tua? 🍻`;
    const link = geo
      ? `/log?venue=${encodeURIComponent(loc.name)}&lat=${loc.lat}&lng=${loc.lng}`
      : '/log';

    try {
      const { data: profs } = await supabase
        .from('profiles')
        .select('id, username')
        .in('username', usernames);
      (profs || []).forEach((p) => {
        if (!p?.id || p.id === actor.id) return;
        this.pushNotification(p.id, { type: 'session_tag', actor_id: actor.id, actor_name: actorName, message, link });
      });
    } catch (err) {
      console.warn('Notifica tag live non inviata:', err.message || err);
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

  // Modifica un proprio commento (RLS garantisce che solo l'autore possa farlo).
  async updateComment(commentId, text) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('comments')
        .update({ text })
        .eq('id', commentId)
        .select()
        .single();
      if (error) throw error;
      return data;
    } else {
      const activities = getStored('sb_activities');
      activities.forEach((a) => {
        (a.comments || []).forEach((c) => { if (c.id === commentId) c.text = text; });
      });
      setStored('sb_activities', activities);
      return { id: commentId, text };
    }
  },

  // Elimina un proprio commento (RLS garantisce che solo l'autore possa farlo).
  async deleteComment(commentId) {
    if (isSupabaseConfigured) {
      const { error } = await supabase.from('comments').delete().eq('id', commentId);
      if (error) throw error;
    } else {
      const activities = getStored('sb_activities');
      activities.forEach((a) => { a.comments = (a.comments || []).filter((c) => c.id !== commentId); });
      setStored('sb_activities', activities);
    }
  },

  // --- ROUTES (PUB CRAWLS) ---
  async getRoutes() {
    if (isSupabaseConfigured) {
      // Cap di sicurezza: i 100 percorsi più recenti. Evita di scansionare l'intera tabella
      // man mano che si scala (egress limitato). Più che sufficienti per la lista pubblica.
      const { data, error } = await supabase
        .from('routes')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      // Attacca il profilo di chi ha creato il percorso, così la lista può
      // mostrare l'autore (richiesta: i percorsi caricati dagli utenti devono
      // essere contrassegnati da chi li ha creati).
      const creators = await this._profilesByIds((data || []).map((r) => r.user_id));
      return (data || []).map((r) => ({ ...r, creator: creators[r.user_id] || null }));
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
      visibility: routeData.visibility || 'public', // public | friends | private
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

  // Registra (o aggiorna) il consenso GDPR a Termini/Privacy sul profilo.
  // Usato dal gate post-login per chi non l'ha dato alla registrazione
  // (utenti pre-esistenti, accesso con Google che non passa dai metadati del trigger).
  async recordConsent(userId, version) {
    if (!userId) return false;
    return this.updateProfile(userId, {
      consent_version: version,
      tos_accepted_at: new Date().toISOString(),
    });
  },

  // GDPR — Portabilità (art. 20): raccoglie TUTTI i dati personali dell'utente
  // in un unico oggetto (poi scaricato come JSON dalle impostazioni). Ogni query è
  // protetta: se una tabella non esiste o fallisce, restituisce lista vuota.
  async exportMyData(userId) {
    if (!userId) throw new Error('Utente non valido.');
    if (!isSupabaseConfigured) {
      const profiles = getStored('sb_profiles');
      return {
        exported_at: new Date().toISOString(),
        profile: profiles.find((p) => p.id === userId) || null,
        sessions: (getStored('sb_activities') || []).filter((a) => a.user_id === userId),
      };
    }
    const grab = async (q) => { try { const { data } = await q; return data || []; } catch { return []; } };
    const profileRows = await grab(supabase.from('profiles').select('*').eq('id', userId));
    const [sessions, routes, eventsHosted, eventResponses, comments, cheers, reviews, following, followers, notifications] = await Promise.all([
      grab(supabase.from('sessions').select('*').eq('user_id', userId)),
      grab(supabase.from('routes').select('*').eq('user_id', userId)),
      grab(supabase.from('events').select('*').eq('host_id', userId)),
      grab(supabase.from('event_responses').select('*').eq('user_id', userId)),
      grab(supabase.from('comments').select('*').eq('user_id', userId)),
      grab(supabase.from('cheers').select('*').eq('user_id', userId)),
      grab(supabase.from('place_reviews').select('*').eq('user_id', userId)),
      grab(supabase.from('follows').select('*').eq('follower_id', userId)),
      grab(supabase.from('follows').select('*').eq('following_id', userId)),
      grab(supabase.from('notifications').select('*').eq('user_id', userId)),
    ]);
    return {
      exported_at: new Date().toISOString(),
      profile: profileRows[0] || null,
      sessions,
      routes,
      events_hosted: eventsHosted,
      event_responses: eventResponses,
      comments,
      cheers,
      place_reviews: reviews,
      following,
      followers,
      notifications,
    };
  },

  // GDPR — Diritto all'oblio (art. 17): elimina l'account e TUTTI i dati collegati.
  // La cancellazione vera (auth.users + cascata) avviene lato server con la service
  // role; qui chiamiamo la route protetta e poi chiudiamo la sessione locale.
  async deleteMyAccount() {
    if (!isSupabaseConfigured) {
      const userRaw = typeof window !== 'undefined' ? localStorage.getItem('sb_current_user') : null;
      const user = userRaw ? JSON.parse(userRaw) : null;
      if (user) {
        const profiles = getStored('sb_profiles').filter((p) => p.id !== user.id);
        setStored('sb_profiles', profiles);
        const acts = (getStored('sb_activities') || []).filter((a) => a.user_id !== user.id);
        setStored('sb_activities', acts);
        localStorage.removeItem('sb_current_user');
      }
      return true;
    }
    const res = await fetch('/api/account/delete', { method: 'POST' });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || 'Cancellazione non riuscita. Riprova più tardi.');
    }
    await supabase.auth.signOut().catch(() => {});
    return true;
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
    // Tieni allineata la copertina leggera del feed ogni volta che cambiano i media.
    if ('media' in updatedData) {
      updatedData = { ...updatedData, cover_url: this._coverFromMedia(updatedData.media) };
    }
    if (isSupabaseConfigured) {
      let { data, error } = await supabase
        .from('sessions')
        .update(updatedData)
        .eq('id', activityId)
        .select()
        .single();
      if (error) {
        // Fallback: se una colonna opzionale (is_active/cover_url) non esiste ancora nel DB,
        // rimuoviamola e riproviamo invece di far fallire tutto l'update.
        if (error.code === '42703' || /column .* does not exist/i.test(error.message || '')) {
          const { is_active, cover_url, ...rest } = updatedData;
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

  // --- AUTO-CHIUSURA SESSIONI LIVE ---
  // La sessione si chiude da sola dopo N ore dall'ULTIMO drink registrato (non dall'avvio).
  // A metà strada parte un preavviso ("aggiungi un drink per non farla chiudere").
  SESSION_AUTOCLOSE_HOURS: 4,
  SESSION_WARN_HOURS: 2,

  // Istante (ms) dell'ultimo drink registrato nella sessione (added_times/added_at),
  // con fallback su created_at se nessun drink ha timestamp.
  _lastDrinkTime(s) {
    let last = new Date(s.created_at).getTime();
    (s.drinks || []).forEach((d) => {
      const times = Array.isArray(d.added_times) && d.added_times.length
        ? d.added_times
        : (d.added_at ? [d.added_at] : []);
      times.forEach((t) => {
        const ms = new Date(t).getTime();
        if (Number.isFinite(ms) && ms > last) last = ms;
      });
    });
    return last;
  },

  // Preavviso di inattività al proprietario della sessione. Best effort: marca la sessione
  // per non ripetersi (si "riarma" da solo appena viene aggiunto un nuovo drink, perché il
  // confronto è warned_at < ultimo drink). Rispetta la preferenza notifiche 'inactivity'.
  async _warnInactiveSession(session) {
    try {
      await this.updateActivity(session.id, { inactivity_warned_at: new Date().toISOString() });
    } catch { /* colonna assente: il dedup a 5 min di pushNotification evita lo spam */ }
    this.pushNotification(session.user_id, {
      type: 'inactivity',
      actor_id: session.user_id,
      message: 'La tua sessione si chiuderà tra 2 ore se non aggiungi un drink 🍺',
      link: '/',
    });
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
            profiles(username, display_name, use_username, avatar_url, weight, sex),
            cheers(count),
            comments(count)
          `)
          .eq('user_id', userId)
          .eq('is_active', true)
          // Robusto contro eventuali DUPLICATI (chiusure andate in timeout):
          // prendi la più recente invece di .maybeSingle() che andrebbe in errore con >1 riga.
          .order('created_at', { ascending: false })
          .limit(1)
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

      // Auto-chiusura dopo 4h dall'ULTIMO drink; preavviso a 2h.
      const createdTime = new Date(data.created_at).getTime();
      const lastDrinkMs = this._lastDrinkTime(data);
      const idleHours = (Date.now() - lastDrinkMs) / (1000 * 60 * 60);
      if (idleHours >= this.SESSION_AUTOCLOSE_HOURS) {
        await this.closeSession(data.id, {
          feeling: data.feeling || 'Sobrio',
          description: data.description || 'Chiusa automaticamente dopo 4 ore di inattività.',
          duration: Math.max(1, Math.round((Date.now() - createdTime) / (60 * 1000)))
        });
        return null;
      }
      if (idleHours >= this.SESSION_WARN_HOURS) {
        const warnedMs = data.inactivity_warned_at ? new Date(data.inactivity_warned_at).getTime() : 0;
        if (warnedMs < lastDrinkMs) this._warnInactiveSession(data).catch(() => {});
      }

      // EGRESS: la query principale porta solo i CONTEGGI di cheers/commenti (non gli
      // elenchi: il pannello live non li mostra). Il fallback (getActivity) può invece
      // avere già gli array: in quel caso li manteniamo. Gestiamo entrambe le forme.
      const isCount = (arr) => Array.isArray(arr) && arr[0] && typeof arr[0] === 'object' && 'count' in arr[0];
      return {
        ...data,
        cheer_count: data.cheer_count ?? (isCount(data.cheers) ? (data.cheers[0].count || 0) : (Array.isArray(data.cheers) ? data.cheers.length : 0)),
        cheers: (Array.isArray(data.cheers) && typeof data.cheers[0] === 'string') ? data.cheers : [],
        comment_count: data.comment_count ?? (isCount(data.comments) ? (data.comments[0].count || 0) : (Array.isArray(data.comments) ? data.comments.length : 0)),
        comments: (Array.isArray(data.comments) && data.comments[0] && 'text' in data.comments[0]) ? data.comments : [],
      };
    } else {
      if (typeof window === 'undefined') return null;
      const activities = getStored('sb_activities');
      const found = activities.find(a => a.user_id === userId && a.is_active === true);
      if (!found) return null;

      // Auto-chiusura dopo 4h dall'ULTIMO drink; preavviso a 2h.
      const createdTime = new Date(found.created_at).getTime();
      const lastDrinkMs = this._lastDrinkTime(found);
      const idleHours = (Date.now() - lastDrinkMs) / (1000 * 60 * 60);
      if (idleHours >= this.SESSION_AUTOCLOSE_HOURS) {
        await this.closeSession(found.id, {
          feeling: found.feeling || 'Sobrio',
          description: found.description || 'Chiusa automaticamente dopo 4 ore di inattività.',
          duration: Math.max(1, Math.round((Date.now() - createdTime) / (60 * 1000)))
        });
        return null;
      }
      if (idleHours >= this.SESSION_WARN_HOURS) {
        const warnedMs = found.inactivity_warned_at ? new Date(found.inactivity_warned_at).getTime() : 0;
        if (warnedMs < lastDrinkMs) this._warnInactiveSession(found).catch(() => {});
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
    const updatedData = {
      is_active: false,
      ...finalData
    };
    // Persisti PRIMA su DB; rimuovi il flag locale solo se l'update riesce davvero.
    // (Prima veniva rimosso subito: se l'UPDATE andava in timeout, la sessione
    // restava is_active=true sul DB ma "scomparsa" localmente → ricompariva live.)
    const result = await this.updateActivity(sessionId, updatedData);

    // Spegni anche eventuali ALTRE sessioni attive dello stesso utente (duplicati da
    // chiusure precedenti andate in timeout), così non resta nulla "live" per sbaglio.
    if (isSupabaseConfigured) {
      try {
        const userId = result?.user_id;
        if (userId) {
          await supabase
            .from('sessions')
            .update({ is_active: false })
            .eq('user_id', userId)
            .eq('is_active', true);
        }
      } catch (err) {
        console.warn('Pulizia sessioni attive duplicate fallita:', err.message || err);
      }
    }

    if (typeof window !== 'undefined') {
      localStorage.removeItem('sb_active_session_id');
    }
    return result;
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
    const startTime = new Date(created_at || Date.now());
    const durMs = (durationMinutes || 120) * 60 * 1000;

    // Drink con timestamp esplicito (live). Se lo stesso drink è stato aggiunto più
    // volte, `added_times` contiene l'orario di OGNI aggiunta: lo espandiamo in una
    // unità per ciascun orario reale, così la curva fa uno "scalino" a ogni drink
    // (anche se è lo stesso tipo). Dati vecchi senza `added_times` → invariati.
    const withTs = [];
    drinks.forEach(d => {
      if (!d.added_at) return;
      const times = Array.isArray(d.added_times) && d.added_times.length > 0 ? d.added_times : null;
      if (times) {
        times.forEach(t => withTs.push({ ...d, qty: 1, added_at: t, added_times: undefined }));
      } else {
        withTs.push(d);
      }
    });

    // Drink senza timestamp → espandiamo per qty (ogni unità = uno slot separato)
    // così 2 birre sono distribuite esattamente come 1 birra + 1 spritz.
    const units = [];
    drinks.forEach(d => {
      if (d.added_at) return;
      const qty = d.qty || 1;
      for (let i = 0; i < qty; i++) units.push({ ...d, qty: 1 });
    });

    const n = units.length;
    const expanded = units.map((d, i) => ({
      ...d,
      added_at: new Date(startTime.getTime() + (n > 1 ? (durMs * i) / (n - 1) : 0)).toISOString()
    }));

    return [...withTs, ...expanded];
  },

  // Grammi di alcol ANCORA in circolo a un certo istante, derivanti dalle sessioni
  // CHIUSE recenti dell'utente (per riportare il "residuo" su una nuova sessione live).
  // `activities` = sessioni dell'utente (es. myActivities). Pura, niente query.
  residualGramsAtTime(activities, beforeISO, weightKg, sex, windowHours = 6) {
    const before = new Date(beforeISO).getTime();
    if (!before || !Array.isArray(activities)) return 0;
    const w = parseFloat(weightKg) > 0 ? parseFloat(weightKg) : 70;
    let grams = 0;
    activities.forEach((a) => {
      if (!a || a.is_active) return; // ignora la sessione live in corso
      const drinks = a.drinks || [];
      if (drinks.length === 0) return;
      const parsed = this.getDrinksWithTimestamps(drinks, a.created_at, a.duration || 120);
      const sStart = Math.min(...parsed.map((d) => new Date(d.added_at).getTime()));
      if (!(sStart < before)) return;                 // solo sessioni iniziate prima
      if ((before - sStart) / 3600000 > windowHours) return; // fuori finestra → trascurabile
      // Stesso modello (assorbimento + eliminazione) delle altre stime: niente più
      // assorbimento istantaneo che gonfiava il "livello attuale" rispetto al picco.
      grams += this._netGramsAtTime(parsed, before, w, a.full_stomach, sex, 0);
    });
    return parseFloat(grams.toFixed(1));
  },

  // Residuo (grammi) da usare nei calcoli del BAC live di UNA sessione.
  // Preferisce il valore CONGELATO sulla sessione (`residual_grams`, scritto all'avvio
  // in createActivity): essendo memorizzato, è identico per il proprietario, il suo
  // profilo, gli spettatori e il radar → tutti vedono lo stesso BAC live.
  // Se assente (vecchie sessioni) ricalcola al volo dal pool disponibile, riferito
  // all'avvio sessione (created_at) per restare coerente col modello di eliminazione.
  sessionResidualGrams(session, fallbackPool, weightKg, sex) {
    const stored = session ? parseFloat(session.residual_grams) : NaN;
    if (Number.isFinite(stored)) return stored;
    return this.residualGramsAtTime(fallbackPool || [], session?.created_at, weightKg, sex);
  },

  // Calcola il residuo di alcol pregresso da CONGELARE su una nuova sessione live:
  // grammi ancora in circolo all'orario `createdAtISO` dalle sessioni chiuse di recente
  // dell'utente. Usato una sola volta, alla creazione (vedi createActivity).
  async _computeResidualForNewSession(userId, createdAtISO) {
    let recent = [];
    let weight, sex;
    if (isSupabaseConfigured) {
      const since = new Date(new Date(createdAtISO).getTime() - 6 * 3600000).toISOString();
      const [{ data: sess }, { data: prof }] = await Promise.all([
        supabase.from('sessions').select('drinks, created_at, duration, full_stomach, is_active')
          .eq('user_id', userId).eq('is_active', false).gte('created_at', since),
        supabase.from('profiles').select('weight, sex').eq('id', userId).maybeSingle(),
      ]);
      recent = sess || [];
      weight = prof?.weight; sex = prof?.sex;
    } else {
      recent = (getStored('sb_activities') || []).filter((a) => a.user_id === userId && !a.is_active);
      const p = (getStored('sb_profiles') || []).find((x) => x.id === userId);
      weight = p?.weight; sex = p?.sex;
    }
    return this.residualGramsAtTime(recent, createdAtISO, weight, sex);
  },

  // BACKFILL: congela il residuo sulle sessioni recenti dell'utente che ne sono prive
  // (vecchie o ancora in corso, create prima dell'introduzione del campo). Così anche
  // le live già avviate diventano coerenti per chi le guarda. RLS-safe: aggiorna SOLO
  // le proprie righe. Best-effort: se la colonna non è ancora migrata, esce senza errori.
  async backfillResidualGrams(hoursBack = 12) {
    if (!isSupabaseConfigured) return 0;
    const user = await this.getCurrentUser();
    if (!user) return 0;
    const since = new Date(Date.now() - hoursBack * 3600000).toISOString();
    let rows = [];
    try {
      const { data, error } = await supabase
        .from('sessions')
        .select('id, created_at')
        .eq('user_id', user.id)
        .gte('created_at', since)
        .is('residual_grams', null);
      if (error) return 0; // colonna non migrata (o altro) → niente backfill
      rows = data || [];
    } catch { return 0; }
    let updated = 0;
    for (const r of rows) {
      try {
        const grams = await this._computeResidualForNewSession(user.id, r.created_at);
        const { error } = await supabase.from('sessions').update({ residual_grams: grams }).eq('id', r.id);
        if (!error) updated++;
      } catch { /* ignora la singola riga */ }
    }
    return updated;
  },

  // Coefficiente di distribuzione di Widmark in base al sesso (uomo ~0.68, donna ~0.55).
  _isFemale(sex) {
    const s = (sex || '').toString().toLowerCase();
    return s === 'f' || s === 'female' || s === 'donna';
  },

  _widmarkR(sex) {
    return this._isFemale(sex) ? 0.55 : 0.68;
  },

  // β = velocità di smaltimento BAC (g/l/h).
  // Donna: ~0.14 (meno ADH epatico), Uomo: ~0.17. Fonte: Widmark, Jones & Pounder.
  _beta(sex) {
    return this._isFemale(sex) ? 0.14 : 0.17;
  },

  // Frazione assorbita al tempo dt_h dopo il drink (modello esponenziale).
  // Donna: tau più basso (minore ADH gastrico → assorbimento più rapido).
  // Picco vuoto: Donna ~30min, Uomo ~40min; Pieno: Donna ~75min, Uomo ~90min.
  _absorbedFraction(dt_h, fullStomach, sex) {
    if (dt_h <= 0) return 0;
    const female = this._isFemale(sex);
    const tau = fullStomach ? (female ? 0.60 : 0.75) : (female ? 0.28 : 0.35);
    return 1 - Math.exp(-dt_h / tau);
  },

  // Grammi di alcol puro stimati per un drink (quantità inclusa).
  // 1 U.A. = 12 g → Unità Alcolica italiana ufficiale (ISS / Ministero della Salute).
  // GRAMS_PER_UNIT sostituisce il vecchio 8 g (standard UK) che sottostimava ~33%.
  // `units` assente → default 1.3 U.A.
  // Vale per QUALSIASI drink del catalogo (usa il suo campo `units`), non un caso singolo.
  GRAMS_PER_UNIT: 12,
  _drinkGrams(d) {
    const units = Number.isFinite(d.units) ? d.units : 1.3;
    return units * (d.qty || 1) * this.GRAMS_PER_UNIT;
  },

  // FONTE DI VERITÀ UNICA: grammi NETTI di alcol in circolo a un dato istante.
  // Modello = assorbimento esponenziale per drink + eliminazione lineare (Widmark).
  // Picco, livello attuale, curva e residuo passano TUTTI da qui: così non possono
  // più dare numeri incoerenti tra loro (era la causa di "picco 0,06 vs attuale 0,13").
  _netGramsAtTime(parsedDrinks, refMs, weightKg, fullStomach, sex, priorResidualGrams = 0) {
    const prior = priorResidualGrams || 0;
    if (!parsedDrinks || parsedDrinks.length === 0) return Math.max(0, prior);
    const w = parseFloat(weightKg) > 0 ? parseFloat(weightKg) : 70;
    const r = this._widmarkR(sex);
    const eliminationPerHour = this._beta(sex) * w * r;
    const startTime = Math.min(...parsedDrinks.map(d => new Date(d.added_at).getTime()));
    let absorbed = 0;
    parsedDrinks.forEach(d => {
      const dt_h = (refMs - new Date(d.added_at).getTime()) / 3600000;
      absorbed += this._drinkGrams(d) * this._absorbedFraction(dt_h, fullStomach, sex);
    });
    const eliminated = eliminationPerHour * Math.max(0, (refMs - startTime) / 3600000);
    return Math.max(0, prior + absorbed - eliminated);
  },

  calculateCurrentBAC(drinks, created_at, durationMinutes, referenceTime, weightKg, fullStomach, sex, priorResidualGrams = 0) {
    const w = parseFloat(weightKg) > 0 ? parseFloat(weightKg) : 70;
    const r = this._widmarkR(sex);
    const parsedDrinks = this.getDrinksWithTimestamps(drinks, created_at, durationMinutes);

    // Nessun drink in QUESTA sessione: il BAC può comunque essere > 0 per il residuo
    // di sessioni chiuse da poco (es. apro una sessione subito dopo averne chiusa
    // un'altra, o un brindisi all'evento). Prima qui si usciva sempre con 0,
    // ignorando il residuo finché non si aggiungeva il primo drink.
    if (parsedDrinks.length === 0) {
      const prior = priorResidualGrams || 0;
      return prior > 0 ? parseFloat((prior / (w * r)).toFixed(2)) : 0;
    }

    // Per sessioni storiche usa la fine stimata (non "adesso", che darebbe BAC=0)
    const refMs = referenceTime ? new Date(referenceTime).getTime() : Date.now();

    const bac = this._netGramsAtTime(parsedDrinks, refMs, w, fullStomach, sex, priorResidualGrams) / (w * r);
    return parseFloat(bac.toFixed(2));
  },

  // BAC di PICCO della sessione: il massimo valore raggiunto lungo la curva.
  // Deterministico (a parità di drink/orari/durata dà sempre lo stesso valore),
  // a differenza dello snapshot istantaneo che dipende da QUANDO è stato salvato.
  // È il numero giusto da mostrare nel feed come "Tasso Alcolico Est.".
  calculatePeakBAC(drinks, created_at, durationMinutes, weightKg, fullStomach, sex, priorResidualGrams = 0) {
    const parsedDrinks = this.getDrinksWithTimestamps(drinks, created_at, durationMinutes);
    if (parsedDrinks.length === 0) return 0;

    const w = parseFloat(weightKg) > 0 ? parseFloat(weightKg) : 70;
    const r = this._widmarkR(sex);

    const timestamps = parsedDrinks.map(d => new Date(d.added_at).getTime());
    const startTime = Math.min(...timestamps);
    const maxDrinkTime = Math.max(...timestamps);
    // Il picco cade tra l'ultimo drink e ~3h dopo: campioniamo a passi di 5 min.
    const endTime = maxDrinkTime + 3 * 60 * 60 * 1000;
    const stepMs = 5 * 60 * 1000;

    let peak = 0;
    for (let T = startTime; T <= endTime; T += stepMs) {
      const bac = this._netGramsAtTime(parsedDrinks, T, w, fullStomach, sex, priorResidualGrams) / (w * r);
      if (bac > peak) peak = bac;
    }

    return parseFloat(peak.toFixed(2));
  },

  // Serie DENSA per disegnare la vera curva di ebbrezza (salita → picco → smaltimento).
  // Ritorna ~60 campioni {t, val} dal primo drink fino al ritorno a ~0, più il picco
  // e gli orari chiave. Stesso modello unico → la curva coincide sempre col picco mostrato.
  calculateBACCurve(drinks, created_at, durationMinutes, weightKg, fullStomach, sex, priorResidualGrams = 0) {
    const parsedDrinks = this.getDrinksWithTimestamps(drinks, created_at, durationMinutes);
    if (parsedDrinks.length === 0) return null;

    const w = parseFloat(weightKg) > 0 ? parseFloat(weightKg) : 70;
    const r = this._widmarkR(sex);
    const timestamps = parsedDrinks.map(d => new Date(d.added_at).getTime());
    const startTime = Math.min(...timestamps);
    const maxDrinkTime = Math.max(...timestamps);
    const bacAt = (T) =>
      this._netGramsAtTime(parsedDrinks, T, w, fullStomach, sex, priorResidualGrams) / (w * r);

    // Picco reale (1 min) e primo istante in cui si torna ~sobri.
    const stepFine = 60 * 1000;
    const hardEnd = maxDrinkTime + 10 * 60 * 60 * 1000;
    let peakT = startTime, peakV = bacAt(startTime);
    for (let T = startTime; T <= hardEnd; T += stepFine) {
      const v = bacAt(T);
      if (v > peakV) { peakV = v; peakT = T; }
    }
    let endT = hardEnd;
    for (let T = peakT; T <= hardEnd; T += stepFine) {
      if (bacAt(T) <= 0.005) { endT = T; break; }
    }
    endT = Math.max(endT, startTime + 60 * 60 * 1000); // almeno 1h di arco

    const N = 60;
    const series = [];
    for (let i = 0; i <= N; i++) {
      const T = startTime + ((endT - startTime) * i) / N;
      series.push({ t: T, val: Math.max(0, parseFloat(bacAt(T).toFixed(3))) });
    }
    const fmt = (ms) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // Orario in cui, in DISCESA, si scende sotto il limite legale di 0,5 g/l
    // (solo se il picco l'ha superato). Utile per sapere "da che ora potrei guidare".
    let belowLimit = null;
    if (peakV >= 0.5) {
      for (let T = peakT; T <= endT; T += stepFine) {
        if (bacAt(T) < 0.5) { belowLimit = { t: T, label: fmt(T) }; break; }
      }
    }

    return {
      series,
      start: startTime,
      end: endT,
      peak: { t: peakT, val: Math.max(0, parseFloat(peakV.toFixed(2))), label: fmt(peakT) },
      belowLimit,
      startLabel: fmt(startTime),
      endLabel: fmt(endT),
    };
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
      // Se già lo segui, non fare nulla (idempotente): evita l'errore di chiave duplicata
      // "follows_follower_id_following_id_key" su doppio click / stato UI disallineato.
      const { data: existing } = await supabase
        .from('follows')
        .select('follower_id')
        .eq('follower_id', user.id)
        .eq('following_id', followingId)
        .maybeSingle();
      if (existing) return true;
      const { error } = await supabase
        .from('follows')
        .insert({ follower_id: user.id, following_id: followingId });
      // 23505 = unique_violation: c'è stata una race, ma il follow esiste → ok comunque.
      if (error && error.code !== '23505') throw error;
      if (error) return true; // già seguito per race: niente notifica doppia
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

  // Conteggi follower/seguiti SENZA scaricare le liste (due query count leggere).
  async getFollowCounts(userId) {
    if (!isSupabaseConfigured || !userId) return { followers: 0, following: 0 };
    try {
      const [a, b] = await Promise.all([
        supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', userId),
        supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', userId),
      ]);
      return { followers: a.count || 0, following: b.count || 0 };
    } catch { return { followers: 0, following: 0 }; }
  },

  // Stato di follow tra l'utente loggato e `targetId`, con due check a riga singola
  // (niente caricamento di liste intere). Ritorna { iFollow, followsMe }.
  async getFollowStatus(targetId) {
    if (!isSupabaseConfigured || !targetId) return { iFollow: false, followsMe: false };
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return { iFollow: false, followsMe: false };
      const [a, b] = await Promise.all([
        supabase.from('follows').select('follower_id').eq('follower_id', user.id).eq('following_id', targetId).limit(1),
        supabase.from('follows').select('follower_id').eq('follower_id', targetId).eq('following_id', user.id).limit(1),
      ]);
      return { iFollow: !!(a.data && a.data.length), followsMe: !!(b.data && b.data.length) };
    } catch { return { iFollow: false, followsMe: false }; }
  },

  async getFollowing(userId) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('follows')
        .select(`
          following_id,
          profiles:following_id (id, username, display_name, use_username, avatar_url, is_premium, weight, sex)
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
          profiles:follower_id (id, username, display_name, use_username, avatar_url, is_premium, weight, sex)
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
      // Senza `media` (vedi nota in getActivities); con residual_grams via _selectSessions.
      const { data, error } = await this._selectSessions((cols) =>
        supabase
          .from('sessions')
          .select(`
            ${cols},
            profiles(username, display_name, use_username, avatar_url, weight, sex),
            cheers(user_id),
            comments(id, text, created_at, user_id, profiles(username, display_name, avatar_url, weight))
          `)
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
      );
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
    // Nome coperto per chi ha fatto opt-out dalle classifiche pubbliche, salvo che lo segui.
    const revealIds = await this._revealIdsFor();
    const nameFor = (p, revealed) => (revealed ? publicName(p) : 'Atleta riservato');
    if (isSupabaseConfigured) {
      try {
        const { data, error } = await supabase.rpc('get_top_drinkers', { lim: limit });
        if (error) throw error;
        if (Array.isArray(data)) {
          return data.map((r, i) => {
            const revealed = r.public_leaderboard !== false || revealIds.has(r.user_id);
            return {
              rank: i + 1,
              user_id: r.user_id,
              revealed,
              name: nameFor(r, revealed),
              units: parseFloat(Number(r.total_units || 0).toFixed(1)),
              isPremium: !!r.is_premium,
            };
          });
        }
      } catch (err) {
        console.warn('RPC get_top_drinkers non disponibile, fallback lato client:', err.message || err);
      }
    }
    // Fallback LEGGERO (finché la RPC non è installata): legge solo user_id + total_units
    // (niente join su profili/cheers/commenti), poi recupera i nomi dei soli top N.
    if (isSupabaseConfigured) {
      try {
        const { data, error } = await supabase
          .from('sessions')
          .select('user_id, total_units')
          .order('created_at', { ascending: false })
          .limit(1000);
        if (error) throw error;
        const byUser = {};
        (data || []).forEach((a) => {
          if (!a.user_id) return;
          byUser[a.user_id] = (byUser[a.user_id] || 0) + parseFloat(a.total_units || 0);
        });
        const top = Object.entries(byUser)
          .map(([uid, units]) => ({ user_id: uid, units: parseFloat(units.toFixed(1)) }))
          .sort((a, b) => b.units - a.units)
          .slice(0, limit);
        if (top.length === 0) return [];
        const { data: profs } = await supabase
          .from('profiles')
          .select('id, username, display_name, use_username, public_leaderboard, is_premium')
          .in('id', top.map((t) => t.user_id));
        const pmap = {};
        (profs || []).forEach((p) => { pmap[p.id] = p; });
        return top.map((t, i) => {
          const revealed = pmap[t.user_id]?.public_leaderboard !== false || revealIds.has(t.user_id);
          return {
            rank: i + 1,
            user_id: t.user_id,
            revealed,
            name: nameFor(pmap[t.user_id], revealed),
            units: t.units,
            isPremium: !!pmap[t.user_id]?.is_premium,
          };
        });
      } catch (err) {
        console.warn('Fallback classifica fallito:', err.message || err);
        return [];
      }
    }
    // LocalStorage
    const acts = await this.getActivities().catch(() => []);
    const byUser = {};
    acts.forEach((a) => {
      const uid = a.user_id;
      if (!uid) return;
      const revealed = a.profiles?.public_leaderboard !== false || revealIds.has(uid);
      const name = revealed ? (a.profiles?.display_name || a.profiles?.username || 'Atleta Strabar') : 'Atleta riservato';
      if (!byUser[uid]) byUser[uid] = { user_id: uid, name, revealed, units: 0, isPremium: a.profiles?.is_premium || false };
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
  // Suggerimenti "potresti conoscere" — versione LEGGERA (egress): 2 sole query, niente
  // N+1 sui seguiti-dei-seguiti né getAllProfiles. Mostra atleti recenti non ancora seguiti.
  // Suggerimenti "Potresti conoscere": SOLO amici di amici (almeno 1 amico in comune).
  // Un amico in comune M = qualcuno che IO seguo e che a sua volta segue il candidato P.
  // Se non hai amici in comune con nessuno, la lista è vuota: si usa la barra di ricerca.
  async getSuggestedProfiles(userId, limit = 24) {
    if (!userId || !isSupabaseConfigured) return [];
    try {
      // 1. Chi seguo io (i miei "amici")
      const { data: fol } = await supabase.from('follows').select('following_id').eq('follower_id', userId);
      const myFollowing = (fol || []).map((f) => f.following_id);
      if (myFollowing.length === 0) return []; // niente amici → niente amici in comune

      // 2. Chi seguono i miei amici (archi amico → candidato)
      const { data: fof } = await supabase
        .from('follows')
        .select('follower_id, following_id')
        .in('follower_id', myFollowing);

      // 3. Conta gli amici in comune per ogni candidato, escludendo me e chi già seguo
      const excluded = new Set(myFollowing);
      excluded.add(userId);
      const mutuals = new Map(); // candidateId -> Set di amici in comune
      for (const edge of fof || []) {
        const cand = edge.following_id;
        if (excluded.has(cand)) continue;
        if (!mutuals.has(cand)) mutuals.set(cand, new Set());
        mutuals.get(cand).add(edge.follower_id);
      }
      if (mutuals.size === 0) return [];

      // 4. Ordina per numero di amici in comune (decrescente) e prendi i migliori
      const ranked = [...mutuals.entries()]
        .map(([id, set]) => ({ id, mutualCount: set.size }))
        .sort((a, b) => b.mutualCount - a.mutualCount)
        .slice(0, limit);

      // 5. Recupera i profili solo per i candidati selezionati
      const { data: profs } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url, is_premium')
        .in('id', ranked.map((r) => r.id));
      const byId = new Map((profs || []).map((p) => [p.id, p]));

      return ranked
        .map((r) => (byId.has(r.id) ? { ...byId.get(r.id), mutualCount: r.mutualCount } : null))
        .filter(Boolean);
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
          .select('id, user_id, location, created_at, bac_level, drinks, is_active, full_stomach, duration, residual_grams, profiles(username, display_name, use_username, weight, sex)')
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
        name: publicName(a.profiles),
        username: a.profiles?.username || 'atleta',
        place: loc.name || 'Posizione condivisa',
        lat: loc.lat,
        lng: loc.lng,
        share: loc.share,
        distance,
        drinks: (a.drinks || []).reduce((s, d) => s + (d.qty || 0), 0),
        // BAC ricalcolato ADESSO con peso/sesso reali + residuo CONGELATO della sessione:
        // stesso identico numero che vede il proprietario nel suo pannello live.
        bac: this.calculateCurrentBAC(
          a.drinks || [], a.created_at,
          a.duration || Math.max(1, Math.round((now - new Date(a.created_at).getTime()) / 60000)),
          undefined, a.profiles?.weight, a.full_stomach, a.profiles?.sex,
          this.sessionResidualGrams(a, [], a.profiles?.weight, a.profiles?.sex)
        ),
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
      // Un "luogo" reale ha coordinate. Le sessioni LIBERE (es. festa a casa, name
      // "Sessione Libera") non hanno lat/lng → escluse: non sono locali e non devono
      // comparire tra i locali/classifiche.
      if (typeof loc.lat !== 'number' || typeof loc.lng !== 'number') return;
      if (loc.freeform) return;
      if (loc.share === 'private') return; // sessione privata: esclusa dalle classifiche pubbliche
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
        // Leggenda del Locale = chi ha consumato più U.A. totali (metrica unica, usata
        // ovunque: pagina locali, dettaglio sessione, evento → niente più incoerenze).
        let legend = { name: 'Nessuno', count: 0, units: 0 };
        drinkers.forEach((d) => { if (d.units > legend.units) legend = d; });
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

    // Cerca SEMPRE i locali reali da OpenStreetMap fino a 1 km (così mostriamo anche i bar
    // dove non è ancora stata fatta nessuna sessione, non solo quelli community).
    const SHOW_RADIUS = Math.max(radius, 1000);
    const osm = await this.getNearbyVenues(lat, lng, SHOW_RADIUS);

    // Unione community + OSM entro il raggio di visualizzazione, ordinata per distanza.
    const merged = this._dedupeVenues([
      ...community.filter((p) => p.distance != null && p.distance <= SHOW_RADIUS),
      ...osm,
    ])
      .filter((v) => v.distance == null || v.distance <= SHOW_RADIUS)
      .sort((a, b) => {
        if (a.distance != null && b.distance != null) return a.distance - b.distance;
        if (a.distance != null) return -1;
        if (b.distance != null) return 1;
        return (b.sessionsCount || 0) - (a.sessionsCount || 0);
      });

    // "widened" = nessun locale entro il raggio originale (es. 200 m): il più vicino è oltre.
    const nearest = merged.find((v) => v.distance != null);
    const widened = !!nearest && nearest.distance > radius;

    return { venues: merged, radius, widened };
  },

  // Classifica atleti per un singolo locale (visite + unità alcoliche)
  // Una sessione conta per le classifiche PUBBLICHE del locale se è a un locale reale
  // (coordinate, verificato, non libero) e NON è privata. Le relazioni di chi guarda
  // non contano: la classifica è la stessa per tutti (la RLS lascia leggere tutto).
  _countsForVenue(a) {
    const loc = a && a.location;
    // Conta ogni check-in GEOLOCALIZZATO e verificato presso il locale, A PRESCINDERE
    // dalla privacy: anche le sessioni 'private' concorrono ai totali/classifiche, ma il
    // NOME viene coperto ("Atleta riservato"). La privacy nasconde l'identità, non rimuove
    // la sessione dai conteggi. (Esclude solo testo libero e check-in non verificati.)
    return !!(loc && loc.name && !loc.freeform && !loc.unverified &&
      typeof loc.lat === 'number' && typeof loc.lng === 'number');
  },

  // Una sessione concorre alla CLASSIFICA GENERALE con la STESSA identica regola della
  // classifica del locale (_countsForVenue): check-in geolocalizzato e verificato, non libero
  // (private incluse, col nome coperto). Così i numeri RICONCILIANO: il totale generale di un
  // atleta è la somma delle stesse sessioni che lo fanno comparire nelle classifiche dei
  // locali — non può più risultare inferiore a una sua singola sessione presso un locale.
  _countsForGlobalBoard(a) {
    return this._countsForVenue(a);
  },

  async getPlaceLeaderboard(placeKey) {
    const activities = await this.getActivities();
    const sessions = activities.filter(
      (a) => this._countsForVenue(a) && this.normalizePlaceKey(a.location.name) === placeKey
    );
    const byUser = {};
    sessions.forEach((s) => {
      const uid = s.user_id;
      const name = s.profiles?.display_name || s.profiles?.username || 'Atleta Strabar';
      if (!byUser[uid]) byUser[uid] = { user_id: uid, name, visits: 0, units: 0, hasPublic: false, optedOut: s.profiles?.public_leaderboard === false };
      byUser[uid].visits += 1;
      byUser[uid].units += parseFloat(s.total_units || 0);
      if (s.location?.share !== 'private') byUser[uid].hasPublic = true;
    });
    // Nome coperto se l'utente ha fatto opt-out o se ha SOLO sessioni private qui.
    return Object.values(byUser).map((u) => ({
      user_id: u.user_id,
      name: (u.optedOut || !u.hasPublic) ? 'Atleta riservato' : u.name,
      visits: u.visits,
      units: parseFloat(u.units.toFixed(1)),
    }));
  },

  // FONTE UNICA della "Classifica del Locale" mostrata nel dettaglio sessione e altrove.
  // Su DATI COMPLETI (non sul feed troncato/filtrato per spettatore) ed escludendo le
  // sessioni private. Ritorna: classifica U.A. per utente, record BAC per sessione,
  // e la Leggenda (= #1 per U.A. totali). Stesso identico risultato per chiunque guardi.
  async getVenueBoard(placeKey) {
    if (!placeKey) return { sessionsCount: 0, legend: { name: 'Nessuno', units: 0, visits: 0 }, byUnits: [], topBac: [] };
    const activities = await this.getActivities();
    const sessions = activities.filter(
      (a) => this._countsForVenue(a) && this.normalizePlaceKey(a.location.name) === placeKey
    );
    const byUser = {};
    sessions.forEach((s) => {
      const uid = s.user_id;
      const name = s.profiles?.display_name || s.profiles?.username || 'Atleta Strabar';
      if (!byUser[uid]) byUser[uid] = { user_id: uid, name, visits: 0, units: 0, hasPublic: false, optedOut: s.profiles?.public_leaderboard === false };
      byUser[uid].visits += 1;
      byUser[uid].units += parseFloat(s.total_units || 0);
      if (s.location?.share !== 'private') byUser[uid].hasPublic = true;
    });
    // Nome coperto se l'utente ha fatto opt-out o se ha SOLO sessioni private qui.
    const byUnits = Object.values(byUser)
      .map((u) => ({
        user_id: u.user_id,
        name: (u.optedOut || !u.hasPublic) ? 'Atleta riservato' : u.name,
        visits: u.visits,
        units: parseFloat(u.units.toFixed(1)),
      }))
      .sort((a, b) => b.units - a.units || b.visits - a.visits);
    const topBac = sessions
      .map((s) => {
        // Picco BAC è per-sessione: una sessione privata (o di chi è in opt-out) resta anonima.
        const revealed = s.location?.share !== 'private' && s.profiles?.public_leaderboard !== false;
        return {
          name: revealed ? (s.profiles?.display_name || s.profiles?.username || 'Atleta Strabar') : 'Atleta riservato',
          bac: this.calculatePeakBAC(s.drinks || [], s.created_at, s.duration || 120, s.profiles?.weight, s.full_stomach, s.profiles?.sex),
        };
      })
      .sort((a, b) => b.bac - a.bac)
      .slice(0, 3);
    return {
      key: placeKey,
      sessionsCount: sessions.length,
      legend: byUnits[0] || { name: 'Nessuno', units: 0, visits: 0 },
      byUnits: byUnits.slice(0, 3),
      topBac,
    };
  },

  // Insieme degli ID di cui lo spettatore può vedere il NOME nelle classifiche: se stesso
  // + chi segue + chi lo segue. Tutti gli altri restano "coperti" (privacy globale).
  async _revealIdsFor(viewerId) {
    let viewer = viewerId;
    if (viewer === undefined) {
      try { viewer = (await this.getCurrentUser())?.id || null; } catch { viewer = null; }
    }
    const ids = new Set();
    if (viewer) {
      ids.add(viewer);
      try {
        const [following, followers] = await Promise.all([
          this.getFollowing(viewer).catch(() => []),
          this.getFollowers(viewer).catch(() => []),
        ]);
        [...(following || []), ...(followers || [])].forEach((f) => f?.id && ids.add(f.id));
      } catch { /* noop */ }
    }
    return ids;
  },

  // Classifica globale degli atleti Strabar (per U.A. totali, sessioni, drink, locali).
  // I TOTALI sono identici per tutti (le private concorrono, vedi _countsForGlobalBoard). Il
  // NOME è visibile col proprio nome se l'utente è pubblico (default) o se vi seguite; chi ha
  // fatto opt-out resta "coperto" (revealed=false) per gli estranei.
  // includeAll = false → solo check-in geolocalizzati verificati (classifica VERIFICATA).
  // includeAll = true  → tutte le sessioni, anche libere/private (classifica ATTIVITÀ TOTALE,
  //                      non verificata: solo statistica, niente premi/valore competitivo).
  async getUserLeaderboard(viewerId, includeAll = false) {
    const activities = await this.getActivities();
    const counts = (a) => includeAll
      ? true                              // tutte le sessioni (anche libere e private)
      : this._countsForGlobalBoard(a);    // solo geolocalizzate verificate (private incluse)
    const byUser = {};
    activities.forEach((a) => {
      const uid = a.user_id;
      if (!uid) return;
      if (!counts(a)) return;
      if (!byUser[uid]) {
        byUser[uid] = {
          user_id: uid,
          name: a.profiles?.display_name || a.profiles?.username || 'Atleta Strabar',
          username: a.profiles?.username || 'atleta',
          is_premium: a.profiles?.is_premium || false,
          public_leaderboard: a.profiles?.public_leaderboard !== false, // default: visibile
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

    // Chi può vedere il nome: io + chi seguo + chi mi segue. Gli altri restano anonimi.
    const revealIds = await this._revealIdsFor(viewerId);

    return Object.values(byUser)
      .map((u) => {
        // Nome visibile se l'utente è pubblico (default) o se vi seguite.
        const revealed = u.public_leaderboard || revealIds.has(u.user_id);
        return {
          user_id: u.user_id,
          revealed,
          name: revealed ? u.name : 'Atleta riservato',
          username: revealed ? u.username : null,
          is_premium: u.is_premium,
          sessions: u.sessions,
          units: parseFloat(u.units.toFixed(1)),
          drinks: u.drinks,
          placesCount: u.places.size,
        };
      })
      .sort((a, b) => b.units - a.units || b.sessions - a.sessions);
  },

  // Classifica + statistiche di un EVENTO: aggrega le sessioni avviate dall'evento
  // (location.event_id === eventId). Rispetta la privacy globale: i totali si basano
  // solo sulle sessioni che lo spettatore può effettivamente vedere (la RLS filtra le
  // 'amici'/'private' dei non collegati), e il NOME è svelato solo per te e i tuoi amici.
  async getEventBoard(eventId, viewerId) {
    if (!eventId) return null;
    const activities = await this.getActivities();
    const sessions = activities.filter((a) => a.location?.event_id === eventId);

    const byUser = {};
    sessions.forEach((s) => {
      const uid = s.user_id;
      if (!uid) return;
      if (!byUser[uid]) {
        byUser[uid] = {
          user_id: uid,
          name: s.profiles?.display_name || s.profiles?.username || 'Atleta Strabar',
          username: s.profiles?.username || 'atleta',
          is_premium: s.profiles?.is_premium || false,
          public_leaderboard: s.profiles?.public_leaderboard !== false, // default: visibile
          sessions: 0, units: 0, drinks: 0,
        };
      }
      const u = byUser[uid];
      u.sessions += 1;
      u.units += parseFloat(s.total_units || 0);
      u.drinks += (s.drinks || []).reduce((acc, d) => acc + (d.qty || 0), 0);
    });

    const revealIds = await this._revealIdsFor(viewerId);
    // In un evento i partecipanti si vedono tra loro: svela i nomi di host,
    // invitati e di chi ha risposto, a prescindere dal rapporto di follow.
    try {
      let host_id = null, invited = [], responders = [];
      if (isSupabaseConfigured) {
        const { data: ev } = await supabase
          .from('events')
          .select('host_id, invited, event_responses(user_id)')
          .eq('id', eventId)
          .maybeSingle();
        if (ev) { host_id = ev.host_id; invited = ev.invited || []; responders = (ev.event_responses || []).map((r) => r.user_id); }
      } else {
        const ev = this.getEventsRaw().find((e) => e.id === eventId);
        if (ev) { host_id = ev.host_id; invited = ev.invited || []; responders = (ev.responses || []).map((r) => r.user_id); }
      }
      [host_id, ...invited, ...responders].forEach((uid) => uid && revealIds.add(uid));
    } catch { /* noop */ }
    const board = Object.values(byUser)
      .map((u) => {
        // Nome visibile se l'utente è pubblico (default), se vi seguite o se è un partecipante.
        const revealed = u.public_leaderboard || revealIds.has(u.user_id);
        return {
          user_id: u.user_id,
          revealed,
          name: revealed ? u.name : 'Atleta riservato',
          username: revealed ? u.username : null,
          is_premium: u.is_premium,
          sessions: u.sessions,
          units: parseFloat(u.units.toFixed(1)),
          drinks: u.drinks,
        };
      })
      .sort((a, b) => b.units - a.units || b.drinks - a.drinks);

    const totalUnits = board.reduce((s, u) => s + u.units, 0);
    const totalDrinks = board.reduce((s, u) => s + u.drinks, 0);
    const participants = board.length;
    const topBac = sessions
      .map((s) => {
        const revealed = s.profiles?.public_leaderboard !== false || revealIds.has(s.user_id);
        return {
          name: revealed ? (s.profiles?.display_name || s.profiles?.username || 'Atleta') : 'Atleta riservato',
          revealed,
          bac: this.calculatePeakBAC(s.drinks || [], s.created_at, s.duration || 120, s.profiles?.weight, s.full_stomach, s.profiles?.sex),
        };
      })
      .sort((a, b) => b.bac - a.bac)
      .slice(0, 3);

    return {
      eventId,
      participants,
      activeNow: sessions.filter((s) => s.is_active).length,
      totalUnits: parseFloat(totalUnits.toFixed(1)),
      totalDrinks,
      avgUnits: participants ? parseFloat((totalUnits / participants).toFixed(1)) : 0,
      routeName: sessions.find((s) => s.location?.route_name)?.location?.route_name || null,
      board,
      topBac,
    };
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

  // Recupera i profili (id, username, display_name, avatar_url) per una lista di id.
  async _profilesByIds(ids) {
    const unique = [...new Set((ids || []).filter(Boolean))];
    if (unique.length === 0) return {};
    const { data } = await supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url')
      .in('id', unique);
    const map = {};
    (data || []).forEach((p) => { map[p.id] = p; });
    return map;
  },

  async getEvents() {
    const user = await this.getCurrentUser();
    if (isSupabaseConfigured) {
      // Cap di sicurezza: solo eventi da ieri in poi (gli eventi passati non servono nella
      // lista) e max 100. Riduce molto l'egress quando lo storico cresce.
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from('events')
        .select(`*, event_responses(user_id, status)`)
        .gte('date', since)
        .order('date', { ascending: true })
        .limit(100);
      if (error) throw error;
      const hostMap = await this._profilesByIds((data || []).map((e) => e.host_id));
      return (data || []).map((e) => {
        const responses = e.event_responses || [];
        const host = hostMap[e.host_id] || { display_name: 'Organizzatore', username: 'host' };
        return {
          ...e,
          host,
          host_name: host.display_name || host.username,
          goingCount: responses.filter((r) => r.status === 'going').length,
          myResponse: user ? (responses.find((r) => r.user_id === user.id)?.status || null) : null,
          isInvited: user ? (e.host_id === user.id || (e.invited || []).includes(user.id)) : false,
        };
      });
    }
    // localStorage
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
    const user = await this.getCurrentUser();
    if (isSupabaseConfigured) {
      const { data: e, error } = await supabase
        .from('events')
        .select(`*, event_responses(user_id, status, created_at)`)
        .eq('id', eventId)
        .maybeSingle();
      if (error) throw error;
      if (!e) return null;
      const responses = e.event_responses || [];
      const invitedIds = e.invited || [];
      const pmap = await this._profilesByIds([e.host_id, ...responses.map((r) => r.user_id), ...invitedIds]);
      const host = pmap[e.host_id] || { display_name: 'Organizzatore', username: 'host' };
      return {
        ...e,
        host,
        host_name: host.display_name || host.username,
        goingCount: responses.filter((r) => r.status === 'going').length,
        myResponse: user ? (responses.find((r) => r.user_id === user.id)?.status || null) : null,
        isInvited: user ? (e.host_id === user.id || invitedIds.includes(user.id)) : false,
        responses: responses.map((r) => ({
          ...r,
          profile: pmap[r.user_id] || { display_name: 'Atleta', username: 'utente' },
        })),
        // Profili degli invitati (per mostrarne la lista nella scheda evento).
        invitedProfiles: invitedIds.map((uid) => pmap[uid] || { id: uid, display_name: 'Atleta', username: 'utente' }),
      };
    }
    // localStorage
    const events = await this.getEvents();
    const ev = events.find((e) => e.id === eventId);
    if (!ev) return null;
    const profiles = await this.getAllProfiles();
    const responses = (ev.responses || []).map((r) => ({
      ...r,
      profile: profiles.find((p) => p.id === r.user_id) || { display_name: r.user_name, username: 'utente' },
    }));
    const invitedProfiles = (ev.invited || []).map((uid) =>
      profiles.find((p) => p.id === uid) || { id: uid, display_name: 'Atleta', username: 'utente' });
    return { ...ev, responses, invitedProfiles };
  },

  async createEvent(data) {
    const user = await this.getCurrentUser();
    if (!user) throw new Error('Devi essere loggato per creare un evento!');
    const invited = data.invited || [];
    // Normalizza la data in ISO (UTC). L'input datetime-local è ora locale: convertendolo
    // qui, la visualizzazione (toLocale...) torna corretta e coerente con la modifica.
    if (data.date) { const d = new Date(data.date); if (!isNaN(d)) data = { ...data, date: d.toISOString() }; }

    if (isSupabaseConfigured) {
      const { data: created, error } = await supabase
        .from('events')
        .insert({
          host_id: user.id,
          title: data.title || 'Nuovo Evento',
          description: data.description || '',
          date: data.date,
          location_name: data.location_name || '',
          location: data.location || null,
          route_id: data.route_id || null,
          route_name: data.route_name || null,
          invited,
        })
        .select()
        .single();
      if (error) throw error;
      // L'host partecipa di default
      await supabase.from('event_responses')
        .upsert({ event_id: created.id, user_id: user.id, status: 'going' }, { onConflict: 'event_id,user_id' });
      invited.forEach((uid) => this.pushNotification(uid, {
        type: 'event_invite',
        actor_id: user.id,
        actor_name: user.display_name || user.username,
        message: `${user.display_name || user.username} ti ha invitato a "${created.title}"`,
        link: `/events/${created.id}`,
      }));
      return created;
    }

    // localStorage
    const events = this.getEventsRaw();
    const newEvent = {
      id: 'evt-' + Math.random().toString(36).substr(2, 9),
      host_id: user.id,
      host_name: user.display_name || user.username,
      title: data.title || 'Nuovo Evento',
      description: data.description || '',
      date: data.date,
      location_name: data.location_name || '',
      location: data.location || null,
      route_id: data.route_id || null,
      route_name: data.route_name || null,
      invited,
      responses: [{ user_id: user.id, user_name: user.display_name || user.username, status: 'going', created_at: new Date().toISOString() }],
      created_at: new Date().toISOString(),
    };
    events.push(newEvent);
    this.setEventsRaw(events);
    invited.forEach((uid) => this.pushNotification(uid, {
      type: 'event_invite', actor_id: user.id, actor_name: user.display_name || user.username,
      message: `${user.display_name || user.username} ti ha invitato a "${newEvent.title}"`, link: `/events/${newEvent.id}`,
    }));
    return newEvent;
  },

  async respondToEvent(eventId, status) {
    const user = await this.getCurrentUser();
    if (!user) throw new Error('Devi essere loggato per rispondere a un evento!');

    if (isSupabaseConfigured) {
      // Stato precedente: serve per notificare l'host SOLO quando la risposta cambia
      // davvero (evita le notifiche duplicate se si ritocca più volte lo stesso pulsante).
      const { data: prev } = await supabase
        .from('event_responses')
        .select('status')
        .eq('event_id', eventId).eq('user_id', user.id)
        .maybeSingle();
      const { error } = await supabase
        .from('event_responses')
        .upsert({ event_id: eventId, user_id: user.id, status }, { onConflict: 'event_id,user_id' });
      if (error) throw error;
      // Notifica l'host (se non sono io) solo al primo RSVP o a un effettivo cambio.
      if (!prev || prev.status !== status) {
        const { data: ev } = await supabase.from('events').select('host_id, title').eq('id', eventId).maybeSingle();
        if (ev && ev.host_id !== user.id) {
          const label = status === 'going' ? 'Partecipo' : status === 'maybe' ? 'Forse' : 'Non posso';
          this.pushNotification(ev.host_id, {
            type: 'event_rsvp', actor_id: user.id, actor_name: user.display_name || user.username,
            message: `${user.display_name || user.username} ha risposto "${label}" a "${ev.title}"`, link: `/events/${eventId}`,
          });
        }
      }
      return true;
    }

    // localStorage
    const events = this.getEventsRaw();
    const idx = events.findIndex((e) => e.id === eventId);
    if (idx === -1) throw new Error('Evento non trovato!');
    const ev = events[idx];
    ev.responses = ev.responses || [];
    const entry = { user_id: user.id, user_name: user.display_name || user.username, status, created_at: new Date().toISOString() };
    const rIdx = ev.responses.findIndex((r) => r.user_id === user.id);
    const prevStatus = rIdx > -1 ? ev.responses[rIdx].status : null;
    if (rIdx > -1) ev.responses[rIdx] = entry; else ev.responses.push(entry);
    events[idx] = ev;
    this.setEventsRaw(events);
    if (ev.host_id !== user.id && prevStatus !== status) {
      const label = status === 'going' ? 'Partecipo' : status === 'maybe' ? 'Forse' : 'Non posso';
      this.pushNotification(ev.host_id, {
        type: 'event_rsvp', actor_id: user.id, actor_name: user.display_name || user.username,
        message: `${user.display_name || user.username} ha risposto "${label}" a "${ev.title}"`, link: `/events/${ev.id}`,
      });
    }
    return ev;
  },

  async inviteToEvent(eventId, userIds) {
    const user = await this.getCurrentUser();
    if (!user) throw new Error('Devi essere loggato!');

    if (isSupabaseConfigured) {
      const { data: ev, error: selErr } = await supabase.from('events').select('invited, title').eq('id', eventId).maybeSingle();
      if (selErr) throw selErr;
      if (!ev) throw new Error('Evento non trovato!');
      const current = ev.invited || [];
      const newInvites = (userIds || []).filter((uid) => !current.includes(uid));
      if (newInvites.length === 0) return true;
      const { error } = await supabase.from('events').update({ invited: [...current, ...newInvites] }).eq('id', eventId);
      if (error) throw error;
      newInvites.forEach((uid) => this.pushNotification(uid, {
        type: 'event_invite', actor_id: user.id, actor_name: user.display_name || user.username,
        message: `${user.display_name || user.username} ti ha invitato a "${ev.title}"`, link: `/events/${eventId}`,
      }));
      return true;
    }

    // localStorage
    const events = this.getEventsRaw();
    const idx = events.findIndex((e) => e.id === eventId);
    if (idx === -1) throw new Error('Evento non trovato!');
    const ev = events[idx];
    const newInvites = (userIds || []).filter((uid) => !(ev.invited || []).includes(uid));
    ev.invited = [...(ev.invited || []), ...newInvites];
    events[idx] = ev;
    this.setEventsRaw(events);
    newInvites.forEach((uid) => this.pushNotification(uid, {
      type: 'event_invite', actor_id: user.id, actor_name: user.display_name || user.username,
      message: `${user.display_name || user.username} ti ha invitato a "${ev.title}"`, link: `/events/${ev.id}`,
    }));
    return ev;
  },

  async updateEvent(eventId, fields) {
    const user = await this.getCurrentUser();
    if (!user) throw new Error('Devi essere loggato!');
    const allowed = ['title', 'description', 'date', 'location_name', 'location', 'route_id', 'route_name'];
    const patch = {};
    allowed.forEach((k) => { if (k in fields) patch[k] = fields[k]; });

    if (isSupabaseConfigured) {
      // La policy RLS consente l'UPDATE solo all'host.
      const { data, error } = await supabase.from('events').update(patch).eq('id', eventId).select().maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Solo l'organizzatore può modificare l'evento.");
      return data;
    }

    // localStorage
    const events = this.getEventsRaw();
    const idx = events.findIndex((e) => e.id === eventId);
    if (idx === -1) throw new Error('Evento non trovato!');
    if (events[idx].host_id !== user.id) throw new Error("Solo l'organizzatore può modificare l'evento.");
    events[idx] = { ...events[idx], ...patch };
    this.setEventsRaw(events);
    return events[idx];
  },

  async deleteEvent(eventId) {
    const user = await this.getCurrentUser();
    if (!user) throw new Error('Devi essere loggato!');
    if (isSupabaseConfigured) {
      // La policy RLS consente il DELETE solo all'host.
      const { error } = await supabase.from('events').delete().eq('id', eventId);
      if (error) throw error;
      return true;
    }
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

  // Ottiene il service worker registrato e ATTIVO, registrandolo se manca.
  // Importante: non usa solo navigator.serviceWorker.ready (che resta appeso per sempre
  // se nessun SW è registrato, es. in dev) → race con timeout così l'UI non gira a vuoto.
  async _swReady() {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
      throw new Error('Service worker non supportato su questo browser');
    }
    let reg = await navigator.serviceWorker.getRegistration();
    if (!reg) reg = await navigator.serviceWorker.register('/sw.js');
    if (!reg.active) {
      await Promise.race([
        navigator.serviceWorker.ready,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Service worker non pronto (timeout)')), 10000)),
      ]);
      reg = (await navigator.serviceWorker.getRegistration()) || reg;
    }
    return reg;
  },

  // Registra la PUSH subscription del dispositivo corrente, così l'utente riceve
  // le notifiche anche ad app chiusa (Web Push). Da chiamare dopo aver concesso il permesso.
  // Ritorna true se l'iscrizione è andata a buon fine.
  async registerPushSubscription() {
    if (typeof window === 'undefined' || !isSupabaseConfigured) return false;
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;
    if (!('Notification' in window) || Notification.permission !== 'granted') return false;
    const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapid) { console.warn('Push disattivato: manca NEXT_PUBLIC_VAPID_PUBLIC_KEY'); return false; }
    const user = await this.getCurrentUser();
    if (!user) return false;

    const reg = await this._swReady();
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      const toUint8 = (b64) => {
        const padding = '='.repeat((4 - (b64.length % 4)) % 4);
        const base64 = (b64 + padding).replace(/-/g, '+').replace(/_/g, '/');
        const raw = atob(base64);
        const arr = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
        return arr;
      };
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toUint8(vapid) });
    }
    const { error } = await supabase.from('push_subscriptions').upsert(
      { user_id: user.id, endpoint: sub.endpoint, subscription: sub.toJSON() },
      { onConflict: 'endpoint' }
    );
    if (error) throw error;
    return true;
  },

  // Stato attuale: il dispositivo è iscritto alle push? (usa getRegistration: non si blocca)
  async isPushSubscribed() {
    try {
      if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) return false;
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) return false;
      const sub = await reg.pushManager.getSubscription();
      return !!sub;
    } catch { return false; }
  },

  // Disattiva le push su questo dispositivo (annulla la subscription + rimuove dal DB).
  async unregisterPushSubscription() {
    try {
      if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) return;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        const endpoint = sub.endpoint;
        await sub.unsubscribe().catch(() => {});
        if (isSupabaseConfigured) await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint);
      }
    } catch (err) {
      console.warn('unregisterPushSubscription fallita:', err.message || err);
    }
  },

  async pushNotification(recipientId, payload) {
    if (!recipientId) return;

    // Preferenze notifiche. I DEFAULT devono combaciare con ciò che la pagina Impostazioni
    // mostra acceso di default (tutti ON): altrimenti l'utente vede il flag ATTIVO ma, se non
    // ha mai toccato i toggle, `notif_prefs` è vuoto sul DB e qui si bloccava (es. eventi e
    // follow erano OFF di default → niente notifiche pur con flag verde). Ora coerenti.
    const NOTIF_DEFAULTS = { follow: true, cheers: true, comment: true, events: true, tagged: true, inactivity: true };
    const category = { cheers: 'cheers', comment: 'comment', follow: 'follow', event_invite: 'events', event_rsvp: 'events', session_tag: 'tagged', inactivity: 'inactivity' }[payload.type] || null;
    if (category && isSupabaseConfigured) {
      try {
        const { data: prof } = await supabase.from('profiles').select('notif_prefs').eq('id', recipientId).maybeSingle();
        const prefs = prof?.notif_prefs || {};
        const enabled = prefs[category] !== undefined ? prefs[category] : NOTIF_DEFAULTS[category];
        if (!enabled) return; // tipo disattivato (o off di default) → non notificare
      } catch { /* in caso di errore invia comunque */ }
    }

    if (isSupabaseConfigured) {
      // Anti-duplicato: se una notifica identica (stesso destinatario, tipo e testo)
      // è già arrivata negli ultimi 5 minuti, non re-inserirla. Protegge da doppi tap
      // o invii ripetuti a prescindere dal chiamante.
      try {
        const sinceISO = new Date(Date.now() - 5 * 60 * 1000).toISOString();
        const { data: dup } = await supabase.from('notifications')
          .select('id')
          .eq('user_id', recipientId)
          .eq('type', payload.type || 'info')
          .eq('message', payload.message || '')
          .gte('created_at', sinceISO)
          .limit(1);
        if (dup && dup.length > 0) return;
      } catch { /* in dubbio, procedi con l'inserimento */ }
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
      // Invia anche il PUSH (notifica ad app chiusa) — best effort, non blocca il flusso.
      try {
        supabase.functions.invoke('send-push', {
          body: {
            user_ids: [recipientId],
            title: 'Strabar 🍻',
            body: payload.message || '',
            url: payload.link || '/',
          },
        }).catch(() => {});
      } catch { /* funzione non deployata: ignora */ }
      if (typeof window !== 'undefined') window.dispatchEvent(new Event('notifications-change'));
      return;
    }

    if (typeof window === 'undefined') return;
    const notifs = this.getNotificationsRaw();
    // Anti-duplicato (vedi sopra): salta notifiche identiche degli ultimi 5 minuti.
    const since = Date.now() - 5 * 60 * 1000;
    const isDup = notifs.some((n) =>
      n.user_id === recipientId &&
      (n.type || 'info') === (payload.type || 'info') &&
      (n.message || '') === (payload.message || '') &&
      new Date(n.created_at).getTime() >= since
    );
    if (isDup) return;
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
  async saveRoute(name, description, waypoints, isPremium = false, visibility = 'public') {
    return this.createRoute({ name, description, waypoints, is_premium: isPremium, visibility });
  },

  // Aggiorna un percorso esistente (solo il proprietario, garantito dalla RLS UPDATE).
  async updateRoute(routeId, fields) {
    if (isSupabaseConfigured) {
      let { data, error } = await supabase
        .from('routes')
        .update(fields)
        .eq('id', routeId)
        .select()
        .single();
      // Se la colonna visibility non esiste ancora nel DB, riprova senza.
      if (error && (error.code === '42703' || /column .* does not exist|visibility/i.test(error.message || ''))) {
        const { visibility, ...rest } = fields;
        ({ data, error } = await supabase.from('routes').update(rest).eq('id', routeId).select().single());
      }
      if (error) throw error;
      return data;
    } else {
      const routes = getStored('sb_routes');
      const idx = routes.findIndex((r) => r.id === routeId);
      if (idx === -1) throw new Error('Percorso non trovato!');
      routes[idx] = { ...routes[idx], ...fields };
      setStored('sb_routes', routes);
      return routes[idx];
    }
  },

  // Elimina un percorso (solo il proprietario, garantito dalla RLS DELETE).
  async deleteRoute(routeId) {
    if (isSupabaseConfigured) {
      const { error } = await supabase.from('routes').delete().eq('id', routeId);
      if (error) throw error;
    } else {
      const routes = getStored('sb_routes').filter((r) => r.id !== routeId);
      setStored('sb_routes', routes);
    }
  },

  // Config globale dell'app (riga singola). Messa in CACHE in localStorage per 24h così non
  // genera query ad ogni apertura: di fatto costo Supabase ~zero. Ritorna sempre dei default.
  async getAppConfig() {
    const DEFAULTS = { push_reminder_enabled: true, push_reminder_every: 3 };
    if (typeof window !== 'undefined') {
      try {
        const cached = JSON.parse(localStorage.getItem('sb_app_config') || 'null');
        if (cached && Date.now() - cached.t < 24 * 60 * 60 * 1000) return { ...DEFAULTS, ...cached.v };
      } catch { /* noop */ }
    }
    if (!isSupabaseConfigured) return DEFAULTS;
    try {
      const { data } = await supabase.from('app_config').select('push_reminder_enabled, push_reminder_every').eq('id', 'singleton').maybeSingle();
      const v = { ...DEFAULTS, ...(data || {}) };
      if (typeof window !== 'undefined') localStorage.setItem('sb_app_config', JSON.stringify({ t: Date.now(), v }));
      return v;
    } catch { return DEFAULTS; }
  },

  // Catalogo drink: override gestito da admin (app_config.drink_catalog) oppure il
  // catalogo STATICO di default. Cache 24h in localStorage → ~zero query Supabase.
  // Struttura: { quick:[], extra:[], beerFamilies:[] } (come src/lib/drinks.js).
  DEFAULT_DRINK_CATALOG: { quick: QUICK_DRINKS, extra: EXTRA_DRINKS, beerFamilies: BEER_FAMILIES },
  _validCatalog(c) {
    return !!(c && Array.isArray(c.quick) && Array.isArray(c.extra) && Array.isArray(c.beerFamilies));
  },
  // Legge la cache locale del catalogo (sincrono). Ritorna { t, v } oppure null.
  _cachedDrinkCatalog() {
    if (typeof window === 'undefined') return null;
    try {
      const c = JSON.parse(localStorage.getItem('sb_drink_catalog') || 'null');
      if (c && this._validCatalog(c.v)) return c;
    } catch { /* noop */ }
    return null;
  },
  // Con { force:true } ignora la cache e va sempre in rete (usato per la rivalidazione
  // stale-while-revalidate dell'hook, così i drink aggiunti dall'admin compaiono a TUTTI).
  async getDrinkCatalog({ force = false } = {}) {
    const DEFAULT = this.DEFAULT_DRINK_CATALOG;
    if (typeof window !== 'undefined' && !force) {
      const cached = this._cachedDrinkCatalog();
      if (cached && Date.now() - cached.t < 24 * 60 * 60 * 1000) return cached.v;
    }
    if (!isSupabaseConfigured) return DEFAULT;
    try {
      const { data } = await supabase.from('app_config').select('drink_catalog').eq('id', 'singleton').maybeSingle();
      const v = this._validCatalog(data?.drink_catalog) ? data.drink_catalog : DEFAULT;
      if (typeof window !== 'undefined') localStorage.setItem('sb_drink_catalog', JSON.stringify({ t: Date.now(), v }));
      return v;
    } catch { return DEFAULT; }
  },
  // Forza il refresh della cache catalogo (dopo un salvataggio admin).
  clearDrinkCatalogCache() {
    if (typeof window !== 'undefined') { try { localStorage.removeItem('sb_drink_catalog'); } catch { /* noop */ } }
  },

  // Banner pubblicitari attivi (la RLS restituisce solo quelli attivi e in finestra temporale),
  // ordinati per priorità. Usati nel feed. Best effort: se la tabella non esiste, [].
  async getActiveBanners() {
    if (!isSupabaseConfigured) return [];
    try {
      const { data, error } = await supabase
        .from('ad_banners')
        .select('id, title, body, image_url, link_url, cta, partner, category, priority')
        .order('priority', { ascending: false })
        .limit(10);
      if (error) return [];
      return data || [];
    } catch { return []; }
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

