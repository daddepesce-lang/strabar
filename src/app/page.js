'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { db } from '@/lib/db';
import { notify, ensureNotificationPermission } from '@/lib/notify';
import ShareAppButton from '@/components/ShareAppButton';
import Avatar from '@/components/Avatar';
import { QUICK_DRINKS, EXTRA_DRINKS } from '@/lib/drinks';
import { Beer, MessageSquare, Share2, Trophy, Flame, User, Plus, Award, Calendar, Volume2, Camera, Video, Edit, Trash2, Search, X, Loader } from 'lucide-react';

// Mappa Leaflet reale (caricata solo lato client)
const RouteMap = dynamic(() => import('@/components/RouteMap'), { ssr: false });

// Raggruppa i drink uguali sommando le quantità (per una visualizzazione compatta
// anche su sessioni create prima del merge automatico).
const groupDrinks = (drinks) => {
  const map = {};
  (drinks || []).forEach((d) => {
    const key = `${(d.name || '').trim()}|${d.abv ?? ''}`;
    if (!map[key]) map[key] = { ...d, qty: 0 };
    map[key].qty += (d.qty || 1);
  });
  return Object.values(map);
};

// Richiede la posizione GPS corrente (alta precisione, con fallback a bassa precisione).
// Risolve null se il GPS non è disponibile o l'utente nega il permesso.
const getCurrentPosition = () =>
  new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) { resolve(null); return; }
    const ok = (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude });
    navigator.geolocation.getCurrentPosition(
      ok,
      () => navigator.geolocation.getCurrentPosition(ok, () => resolve(null), { enableHighAccuracy: false, timeout: 12000, maximumAge: 600000 }),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 120000 }
    );
  });

// Tappe reali del Giro dei Bacari di Venezia (coordinate GPS reali)
const VENICE_TOUR = [
  { name: 'Cantina Do Mori', lat: 45.4382, lng: 12.3353, note: 'Il più antico (1462). Imperdibile il francobollo.' },
  { name: "Osteria All'Arco", lat: 45.4384, lng: 12.3355, note: 'Famoso per i cicheti caldi al momento.' },
  { name: 'Osteria Al Mercà', lat: 45.4386, lng: 12.3360, note: 'Spritz al volo davanti al mercato di Rialto.' },
  { name: 'Cantina Aziende Agricole', lat: 45.4430, lng: 12.3300, note: 'Ottimo vino della casa e polpettine.' },
];

export default function FeedPage() {
  const router = useRouter();
  const FEED_PAGE_SIZE = 10;
  const [currentUser, setCurrentUser] = useState(null);
  const [activities, setActivities] = useState([]);
  const [feedHasMore, setFeedHasMore] = useState(false);
  const [feedLoadingMore, setFeedLoadingMore] = useState(false);
  const [myActivities, setMyActivities] = useState([]); // sessioni dell'utente (statistiche personali)
  const [topDrinkers, setTopDrinkers] = useState([]); // classifica globale top atleti
  const [loading, setLoading] = useState(true);
  const [newCommentText, setNewCommentText] = useState({});
  const [activeCommentsSection, setActiveCommentsSection] = useState({});
  const [selectedActivity, setSelectedActivity] = useState(null);
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);

  // Nuovi stati per il paradigma Live Session e Slideshow Feed
  const [activeSession, setActiveSession] = useState(null);
  const [elapsedMinutes, setElapsedMinutes] = useState(0);
  const [feedSlideIndices, setFeedSlideIndices] = useState({}); // { [actId]: index }
  const [profilesList, setProfilesList] = useState([]);
  const [showCloseForm, setShowCloseForm] = useState(false);
  const [editingActivity, setEditingActivity] = useState(null);

  // Stati per il tagging amici e upload foto nella sessione live
  const [friendQuery, setFriendQuery] = useState('');
  const [friendResults, setFriendResults] = useState([]);
  const [searchingFriends, setSearchingFriends] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);

  // Ricerca amici per il modale di modifica sessione
  const [editFriendQuery, setEditFriendQuery] = useState('');
  const [editFriendResults, setEditFriendResults] = useState([]);
  const [editSearchingFriends, setEditSearchingFriends] = useState(false);
  const [showAllLiveDrinks, setShowAllLiveDrinks] = useState(false);
  const [showAllEditDrinks, setShowAllEditDrinks] = useState(false);
  const [showCheersList, setShowCheersList] = useState(false);
  const [cheersListActivity, setCheersListActivity] = useState(null); // attività di cui mostrare i cheers

  // Stati social: filtro feed (amici/tutti) e gestione follow
  const [feedFilter, setFeedFilter] = useState('all'); // 'all' | 'friends'
  const [followingIds, setFollowingIds] = useState([]);
  const [followerIds, setFollowerIds] = useState([]); // chi segue ME (per "Amici" bidirezionale)
  const [followBusy, setFollowBusy] = useState({});

  // Stati per il completamento profilo Google obbligatorio
  const [showCompleteProfileModal, setShowCompleteProfileModal] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customUsername, setCustomUsername] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState('');

  const handleOpenActivity = async (act) => {
    // Mostra subito i dati già in lista, poi carica la versione completa con le FOTO
    // (la lista del feed non scarica `media` per restare leggera).
    setSelectedActivity(act);
    setCurrentSlideIndex(0);
    try {
      if (typeof db.getActivity === 'function') {
        const full = await db.getActivity(act.id);
        if (full) setSelectedActivity((prev) => (prev && prev.id === act.id ? { ...prev, ...full } : prev));
      }
    } catch { /* noop */ }
  };

  const triggerLocalNotification = (title, body) => {
    // Usa il service worker quando disponibile (necessario per le PWA mobile)
    notify(title, body);
  };

  const loadFeed = async () => {
    try {
      if (!db || typeof db.getCurrentUser !== 'function') return;
      const user = await db.getCurrentUser();
      setCurrentUser(user);

      // PERCORSO CRITICO: solo ciò che serve a mostrare il feed e a chiudere la live
      // in modo affidabile. Poche query leggere → reggono anche col DB sotto carico.
      const [acts, active, following, followers] = await Promise.all([
        typeof db.getActivities === 'function' ? db.getActivities({ limit: FEED_PAGE_SIZE }).catch(() => []) : Promise.resolve([]),
        user && typeof db.getActiveSession === 'function' ? db.getActiveSession(user.id).catch(() => null) : Promise.resolve(null),
        user && typeof db.getFollowing === 'function' ? db.getFollowing(user.id).catch(() => []) : Promise.resolve([]),
        user && typeof db.getFollowers === 'function' ? db.getFollowers(user.id).catch(() => []) : Promise.resolve([]),
      ]);

      setActivities(acts);
      setFeedHasMore(acts.length >= FEED_PAGE_SIZE);

      if (user) {
        setActiveSession(active);
        setFollowingIds((following || []).map((f) => f.id));
        setFollowerIds((followers || []).map((f) => f.id));

        // Controllo completezza profilo per Google Login
        const emailPrefix = user.email ? user.email.split('@')[0] : '';
        const isGoogleDefault = user.app_metadata?.provider === 'google' ||
                                user.identities?.some(id => id.provider === 'google') ||
                                (user.id && user.id.startsWith('user-google-'));

        if (isGoogleDefault && (user.display_name === emailPrefix || user.display_name === 'Gara Google Demo' || user.display_name === 'google_user' || !user.display_name)) {
          setShowCompleteProfileModal(true);
          setCustomName(user.display_name !== 'Gara Google Demo' && user.display_name !== 'google_user' ? user.display_name : '');
          setCustomUsername(user.username && user.username !== 'google_user' ? user.username : '');
        }

        // SECONDARIO (non blocca il feed né la chiusura live): profili per i tag,
        // statistiche personali e classifica. Caricati dopo, in modo indipendente.
        if (typeof db.getAllProfiles === 'function') db.getAllProfiles().then(setProfilesList).catch(() => {});
        if (typeof db.getUserActivities === 'function') db.getUserActivities(user.id).then(setMyActivities).catch(() => {});
        if (typeof db.getTopDrinkers === 'function') db.getTopDrinkers(5).then(setTopDrinkers).catch(() => {});
      }
    } catch (err) {
      console.error("Errore nel caricamento del feed:", err);
    } finally {
      setLoading(false);
    }
  };

  // Carica la pagina successiva del feed (append), senza ricaricare tutto.
  const loadMoreFeed = async () => {
    if (feedLoadingMore || !feedHasMore) return;
    setFeedLoadingMore(true);
    try {
      const next = await db.getActivities({ limit: FEED_PAGE_SIZE, offset: activities.length });
      setActivities((prev) => {
        const seen = new Set(prev.map((a) => a.id));
        return [...prev, ...next.filter((a) => !seen.has(a.id))];
      });
      setFeedHasMore(next.length >= FEED_PAGE_SIZE);
    } catch (err) {
      console.error('Errore caricamento altre attività:', err);
    } finally {
      setFeedLoadingMore(false);
    }
  };

  // Scroll infinito: carica altre attività quando il sentinel entra in vista.
  const loadMoreRef = useRef(null);
  useEffect(() => {
    const el = loadMoreRef.current;
    if (!el || !feedHasMore) return;
    const obs = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) loadMoreFeed(); },
      { rootMargin: '400px' }
    );
    obs.observe(el);
    return () => obs.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feedHasMore, feedLoadingMore, activities.length]);

  useEffect(() => {
    loadFeed();

    // Richiedi permessi notifiche PWA e, se concessi, registra la push subscription
    // (così le notifiche arrivano anche ad app chiusa).
    ensureNotificationPermission().then((perm) => {
      if (perm === 'granted' && typeof db.registerPushSubscription === 'function') {
        db.registerPushSubscription();
      }
    });
  }, []);

  // Apre il dettaglio di una sessione dato il suo id (usato dalle notifiche)
  const openActivityById = async (actId) => {
    if (!actId) return;
    try {
      const found = typeof db.getActivity === 'function' ? await db.getActivity(actId) : null;
      if (found) {
        setSelectedActivity(found);
        setCurrentSlideIndex(0);
        setActiveCommentsSection((prev) => ({ ...prev, [actId]: true }));
      }
    } catch (err) {
      console.error('Errore apertura notifica:', err);
    }
  };

  // 1) Da un'altra pagina: si arriva su /?activity=<id> → apri al mount.
  // 2) Già sulla home: la navbar lancia l'evento 'strabar:open-activity'.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const actId = params.get('activity');
    if (actId) {
      openActivityById(actId);
      window.history.replaceState({}, '', '/');
    }
    const onOpen = (e) => openActivityById(e.detail);
    window.addEventListener('strabar:open-activity', onOpen);
    return () => window.removeEventListener('strabar:open-activity', onOpen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Timer per la sessione attiva
  useEffect(() => {
    if (!activeSession) return;

    const tick = () => {
      const diffMs = new Date().getTime() - new Date(activeSession.created_at).getTime();
      const mins = Math.max(1, Math.round(diffMs / (60 * 1000)));
      setElapsedMinutes(mins);

      // A 4 ore: avviso (una volta sola) che si chiuderà tra ~1 ora
      if (mins >= 240 && mins < 300) {
        const key = 'sb_live_warned_' + activeSession.id;
        try {
          if (!localStorage.getItem(key)) {
            localStorage.setItem(key, '1');
            triggerLocalNotification('La sessione live si sta per chiudere ⏳', 'Sei ancora in giro? Se non la chiudi tu, verrà chiusa automaticamente tra circa 1 ora.');
          }
        } catch { /* noop */ }
      }

      // A 5 ore: chiusura automatica
      if (mins >= 300) {
        db.closeSession(activeSession.id, {
          feeling: activeSession.feeling || 'Sobrio',
          description: activeSession.description || 'Chiusa automaticamente dopo 5 ore.',
          duration: mins,
        })
          .then(() => {
            triggerLocalNotification('Sessione chiusa automaticamente 🏁', 'La tua sessione live è stata chiusa dopo 5 ore.');
            setActiveSession(null);
            loadFeed();
          })
          .catch((err) => console.error('Errore chiusura automatica:', err));
      }
    };

    const interval = setInterval(tick, 15000); // aggiorna ogni 15s
    tick();

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSession]);

  // Applica una trasformazione a un'attività sia nel feed che nel modale aperto
  const patchActivity = (activityId, updater) => {
    setActivities((prev) => prev.map((a) => (a.id === activityId ? updater(a) : a)));
    setSelectedActivity((prev) => (prev && prev.id === activityId ? updater(prev) : prev));
  };

  const handleCheers = async (activityId) => {
    if (!currentUser) {
      router.push('/auth');
      return;
    }
    // Aggiornamento ottimistico immediato (niente reload completo del feed)
    const had = activities.find((a) => a.id === activityId)?.cheers?.includes(currentUser.id);
    patchActivity(activityId, (a) => {
      const cheers = a.cheers || [];
      return {
        ...a,
        cheers: had ? cheers.filter((id) => id !== currentUser.id) : [...cheers, currentUser.id],
      };
    });
    try {
      await db.toggleCheers(activityId);
    } catch (err) {
      console.error(err);
      // Rollback
      patchActivity(activityId, (a) => {
        const cheers = a.cheers || [];
        return {
          ...a,
          cheers: had ? [...cheers, currentUser.id] : cheers.filter((id) => id !== currentUser.id),
        };
      });
    }
  };

  // Segui / smetti di seguire un atleta direttamente dal feed
  const handleToggleFollow = async (userId) => {
    if (!currentUser) {
      router.push('/auth');
      return;
    }
    if (userId === currentUser.id) return;
    setFollowBusy((prev) => ({ ...prev, [userId]: true }));
    const isFollowing = followingIds.includes(userId);
    // Aggiornamento ottimistico
    setFollowingIds((prev) =>
      isFollowing ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
    try {
      if (isFollowing) {
        await db.unfollowUser(userId);
      } else {
        await db.followUser(userId);
      }
    } catch (err) {
      console.error('Errore follow/unfollow:', err);
      // Rollback in caso di errore
      setFollowingIds((prev) =>
        isFollowing ? [...prev, userId] : prev.filter((id) => id !== userId)
      );
      alert('Operazione non riuscita: ' + (err.message || err));
    } finally {
      setFollowBusy((prev) => ({ ...prev, [userId]: false }));
    }
  };

  const handleCompleteProfileSubmit = async (e) => {
    e.preventDefault();
    setProfileError('');
    setSavingProfile(true);
    
    try {
      const name = customName.trim();
      const username = customUsername.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
      
      if (!name) throw new Error("Inserisci il tuo nome reale!");
      if (username.length < 3) throw new Error("Lo username deve contenere almeno 3 caratteri!");
      
      // Controlla se lo username è già occupato
      if (typeof db.getAllProfiles === 'function') {
        const all = await db.getAllProfiles();
        const existing = all.find(p => p.username === username && p.id !== currentUser.id);
        if (existing) throw new Error("Questo username è già registrato da un altro atleta!");
      }
      
      // Aggiorna
      if (typeof db.updateProfile === 'function') {
        await db.updateProfile(currentUser.id, {
          display_name: name,
          username: username
        });
      }
      
      // Ricarica l'utente aggiornato
      const updatedUser = await db.getCurrentUser();
      setCurrentUser(updatedUser);
      setShowCompleteProfileModal(false);
      await loadFeed();
    } catch (err) {
      setProfileError(err.message || "Impossibile aggiornare il profilo.");
    } finally {
      setSavingProfile(false);
    }
  };

  const toggleCommentsSection = (activityId) => {
    setActiveCommentsSection(prev => ({
      ...prev,
      [activityId]: !prev[activityId]
    }));
  };

  const handleCommentSubmit = async (e, activityId) => {
    e.preventDefault();
    const text = (newCommentText[activityId] || '').trim();
    if (!text) return;

    if (!currentUser) {
      router.push('/auth');
      return;
    }

    // Commento ottimistico: appare subito, indipendentemente dal reload del feed
    const tempId = 'temp-' + Date.now();
    const optimistic = {
      id: tempId,
      user_id: currentUser.id,
      user_name: currentUser.display_name || currentUser.username || 'Tu',
      text,
      created_at: new Date().toISOString(),
    };
    patchActivity(activityId, (a) => ({ ...a, comments: [...(a.comments || []), optimistic] }));
    setNewCommentText(prev => ({ ...prev, [activityId]: '' }));

    try {
      const saved = await db.addComment(activityId, text);
      if (saved && saved.id) {
        patchActivity(activityId, (a) => ({
          ...a,
          comments: (a.comments || []).map((c) => (c.id === tempId ? { ...c, id: saved.id } : c)),
        }));
      }
    } catch (err) {
      console.error('Errore invio commento:', err);
      // Rollback del commento ottimistico
      patchActivity(activityId, (a) => ({
        ...a,
        comments: (a.comments || []).filter((c) => c.id !== tempId),
      }));
      setNewCommentText((prev) => ({ ...prev, [activityId]: text }));
      alert('Impossibile inviare il commento: ' + (err.message || err));
    }
  };

  const handleAddDrinkToSession = async (preset) => {
    if (!selectedActivity) return;
    
    try {
      const nowStr = new Date().toISOString();
      const newDrink = {
        name: preset.name,
        abv: preset.abv,
        units: preset.units,
        qty: 1,
        added_at: nowStr
      };
      
      // IMPORTANTE: rileggi sempre la sessione fresca dal DB per evitare stato stale
      const freshAct = typeof db.getActivity === 'function'
        ? await db.getActivity(selectedActivity.id)
        : null;
      const baseActivity = freshAct || selectedActivity;

      // Assicura che i drink esistenti abbiano orari validi
      const existingDrinks = db.getDrinksWithTimestamps(
        baseActivity.drinks || [],
        baseActivity.created_at,
        baseActivity.duration || 120
      );

      // Se lo stesso drink è già presente, incrementa la quantità invece di aggiungere una riga
      const dupIdx = existingDrinks.findIndex((d) => d.name === newDrink.name);
      let updatedDrinks;
      if (dupIdx >= 0) {
        updatedDrinks = [...existingDrinks];
        updatedDrinks[dupIdx] = { ...updatedDrinks[dupIdx], qty: (updatedDrinks[dupIdx].qty || 1) + 1 };
      } else {
        updatedDrinks = [...existingDrinks, newDrink];
      }
      
      // Nuova somma delle unità
      const newTotalUnits = updatedDrinks.reduce((acc, d) => acc + (d.units * (d.qty || 1)), 0);
      
      // Calcola la nuova durata: tempo trascorso dal primo drink all'ora corrente
      const timestamps = updatedDrinks.map(d => new Date(d.added_at).getTime());
      const startTimeMs = Math.min(...timestamps);
      const newDuration = Math.max(
        selectedActivity.duration || 120,
        Math.round((new Date().getTime() - startTimeMs) / (60 * 1000))
      );
      
      // Calcola il nuovo BAC stimato (peso reale dell'utente se impostato nel profilo)
      const newBac = db.calculateCurrentBAC(updatedDrinks, selectedActivity.created_at, newDuration, undefined, currentUser?.weight, selectedActivity.full_stomach, currentUser?.sex);
      
      const updatedFields = {
        drinks: updatedDrinks,
        total_units: parseFloat(newTotalUnits.toFixed(1)),
        duration: newDuration,
        bac_level: parseFloat(newBac.toFixed(2))
      };
      
      // Aggiorna nel database
      await db.updateActivity(selectedActivity.id, updatedFields);
      
      // Ricarica feed e aggiorna modal locale
      await loadFeed();
      
      // Aggiorna selectedActivity locale per mostrare all'istante le modifiche
      setSelectedActivity(prev => {
        if (!prev) return null;
        return {
          ...prev,
          ...updatedFields
        };
      });

      // Niente notifica per ogni singolo drink (troppo rumorosa).
    } catch (err) {
      console.error("Errore nell'aggiunta del drink alla sessione:", err);
      alert("Impossibile aggiungere il drink: " + (err.message || err));
    }
  };

  // Cambia stomaco pieno/vuoto durante la live e ricalcola subito il BAC.
  const handleToggleFullStomach = async (value) => {
    if (!activeSession || !!activeSession.full_stomach === !!value) return;
    const duration = activeSession.duration || 1;
    const newBac = db.calculateCurrentBAC(activeSession.drinks || [], activeSession.created_at, duration, undefined, currentUser?.weight, value, currentUser?.sex);
    const updated = { full_stomach: value, bac_level: parseFloat(newBac.toFixed(2)) };
    setActiveSession((prev) => (prev ? { ...prev, ...updated } : prev));
    try {
      await db.updateActivity(activeSession.id, updated);
    } catch (err) {
      console.error('Errore aggiornamento stomaco:', err);
    }
  };

  const handleAddDrinkToActiveSession = async (preset) => {
    if (!activeSession) return;
    
    try {
      const nowStr = new Date().toISOString();
      const newDrink = {
        name: preset.name,
        abv: preset.abv,
        units: preset.units,
        qty: 1,
        added_at: nowStr
      };

      // IMPORTANTE: rileggi sempre la sessione fresca dal DB per evitare
      // che lo stato React stale contenga drink di sessioni precedenti.
      const freshSession = typeof db.getActivity === 'function'
        ? await db.getActivity(activeSession.id)
        : null;
      const base = freshSession || activeSession;
      const currentDrinks = base.drinks || [];

      // VERIFICA POSIZIONE (solo Tour): quando registri un drink alcolico, controlla
      // che tu sia davvero alla tappa corrente. Solo allora la tappa conta per le
      // classifiche (leggenda del locale e atleti). Niente gate all'avvio del tour.
      let locationUpdate = null;
      let verifyMessage = null;
      const tour = base.location?.tour;
      if (tour && preset.abv > 0) {
        const cur = tour.current || 0;
        const curStop = (tour.stops || [])[cur];
        const alreadyVerified = tour.visited?.[cur]?.verified;
        if (!alreadyVerified && curStop?.lat && curStop?.lng) {
          const pos = await getCurrentPosition();
          if (pos) {
            const { distance } = db.checkGeofencing(curStop.lat, curStop.lng, pos.lat, pos.lng, Infinity);
            if (distance <= 300) {
              const newVisited = (tour.visited || []).map((v, i) => (i === cur ? { ...v, verified: true } : v));
              locationUpdate = { ...base.location, unverified: false, tour: { ...tour, visited: newVisited } };
              verifyMessage = `✅ Sei a ${curStop.name}: tappa verificata, conta per le classifiche!`;
            } else {
              const dist = distance >= 1000 ? `${(distance / 1000).toFixed(1)} km` : `${distance} m`;
              verifyMessage = `📍 Sei a ~${dist} da ${curStop.name}: drink registrato, ma la tappa non conta per le classifiche finché non ti avvicini.`;
            }
          } else {
            verifyMessage = `📍 GPS non disponibile: la tappa non conta per le classifiche finché non verifichi la posizione sul posto.`;
          }
        }
      }

      // Stesso drink già presente → +1 quantità invece di una nuova riga
      const dupIdx = currentDrinks.findIndex((d) => d.name === newDrink.name);
      let updatedDrinks;
      if (dupIdx >= 0) {
        updatedDrinks = [...currentDrinks];
        updatedDrinks[dupIdx] = { ...updatedDrinks[dupIdx], qty: (updatedDrinks[dupIdx].qty || 1) + 1 };
      } else {
        updatedDrinks = [...currentDrinks, newDrink];
      }
      const newTotalUnits = updatedDrinks.reduce((acc, d) => acc + ((d.units || 0) * (d.qty || 1)), 0);
      
      // Calcola la durata: differenza tra primo drink e ora corrente
      const timestamps = updatedDrinks.map(d => new Date(d.added_at).getTime());
      const startTimeMs = Math.min(...timestamps);
      const duration = Math.max(1, Math.round((new Date().getTime() - startTimeMs) / (60 * 1000)));
      
      // Calcola il BAC corrente (sessione live -> referenceTime = adesso, default; peso reale se impostato)
      const newBac = db.calculateCurrentBAC(updatedDrinks, activeSession.created_at, duration, undefined, currentUser?.weight, activeSession.full_stomach, currentUser?.sex);
      
      const updatedFields = {
        drinks: updatedDrinks,
        total_units: parseFloat(newTotalUnits.toFixed(1)),
        duration: duration,
        bac_level: parseFloat(newBac.toFixed(2)),
        ...(locationUpdate ? { location: locationUpdate } : {})
      };

      await db.updateActivity(activeSession.id, updatedFields);

      // Aggiorna lo stato locale SENZA ricaricare tutto il feed (più leggero e veloce
      // quando ci sono più utenti collegati). Il feed completo si aggiorna agli eventi chiave.
      setActiveSession((prev) => (prev ? { ...prev, ...updatedFields } : prev));
      patchActivity(activeSession.id, (a) => ({ ...a, ...updatedFields }));

      // Notifica SOLO gli eventi importanti (verifica tappa). Niente notifica per ogni
      // singolo drink: era troppo rumorosa.
      if (verifyMessage) {
        triggerLocalNotification(locationUpdate ? 'Tappa verificata! ✅' : 'Drink registrato 🍺', verifyMessage);
      }
    } catch (err) {
      console.error("Errore nell'aggiunta del drink alla sessione attiva:", err);
      alert("Impossibile aggiungere il drink: " + err.message);
    }
  };

  // Rimuove un drink (1 unità) dalla sessione live in corso — per correggere un errore.
  const handleRemoveDrinkFromActiveSession = async (drinkName) => {
    if (!activeSession) return;
    try {
      const freshSession = typeof db.getActivity === 'function' ? await db.getActivity(activeSession.id) : null;
      const base = freshSession || activeSession;
      const drinks = [...(base.drinks || [])];
      // Trova l'ultima riga con questo nome
      const revIdx = [...drinks].reverse().findIndex((d) => d.name === drinkName);
      if (revIdx === -1) return;
      const idx = drinks.length - 1 - revIdx;
      const row = { ...drinks[idx] };
      if ((row.qty || 1) > 1) {
        row.qty = row.qty - 1;
        drinks[idx] = row;
      } else {
        drinks.splice(idx, 1);
      }

      const newTotalUnits = drinks.reduce((acc, d) => acc + ((d.units || 0) * (d.qty || 1)), 0);
      let duration = base.duration || 1;
      if (drinks.length > 0) {
        const timestamps = drinks.map((d) => new Date(d.added_at || base.created_at).getTime());
        const startTimeMs = Math.min(...timestamps);
        duration = Math.max(1, Math.round((Date.now() - startTimeMs) / 60000));
      }
      const newBac = db.calculateCurrentBAC(drinks, base.created_at, duration, undefined, currentUser?.weight, base.full_stomach, currentUser?.sex);
      const updatedFields = {
        drinks,
        total_units: parseFloat(newTotalUnits.toFixed(1)),
        duration,
        bac_level: parseFloat(newBac.toFixed(2)),
      };
      await db.updateActivity(activeSession.id, updatedFields);
      setActiveSession((prev) => (prev ? { ...prev, ...updatedFields } : prev));
      patchActivity(activeSession.id, (a) => ({ ...a, ...updatedFields }));
    } catch (err) {
      console.error('Errore rimozione drink:', err);
      alert('Impossibile rimuovere il drink: ' + (err.message || err));
    }
  };

  // Ricerca amici da taggare (debounced) usando i profili reali
  useEffect(() => {
    if (!activeSession) return;
    const q = friendQuery.trim();
    if (q.length < 1) {
      setFriendResults([]);
      setSearchingFriends(false);
      return;
    }
    setSearchingFriends(true);
    const handle = setTimeout(async () => {
      try {
        const res = typeof db.searchProfiles === 'function' ? await db.searchProfiles(q) : [];
        const already = (activeSession.drank_with || []).join(' ').toLowerCase();
        const filtered = (res || []).filter(
          (p) =>
            p.id !== currentUser?.id &&
            !already.includes('(@' + (p.username || '').toLowerCase() + ')')
        );
        setFriendResults(filtered);
      } catch (err) {
        console.error('Errore ricerca amici:', err);
        setFriendResults([]);
      } finally {
        setSearchingFriends(false);
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [friendQuery, activeSession, currentUser]);

  // Aggiunge un compagno alla sessione (profilo reale o testo libero)
  const addCompanion = async (value) => {
    if (!activeSession || !value) return;
    const updated = [...(activeSession.drank_with || []), value];
    setActiveSession((prev) => (prev ? { ...prev, drank_with: updated } : prev));
    setFriendQuery('');
    setFriendResults([]);
    try {
      await db.updateActivity(activeSession.id, { drank_with: updated });
    } catch (err) {
      console.error('Errore nel taggare il compagno:', err);
      alert('Impossibile aggiungere il compagno: ' + (err.message || err));
    }
  };

  // Ricerca amici per il modale di MODIFICA sessione (debounced)
  useEffect(() => {
    if (!editingActivity) return;
    const q = editFriendQuery.trim();
    if (q.length < 1) {
      setEditFriendResults([]);
      setEditSearchingFriends(false);
      return;
    }
    setEditSearchingFriends(true);
    const handle = setTimeout(async () => {
      try {
        const res = typeof db.searchProfiles === 'function' ? await db.searchProfiles(q) : [];
        const already = (editingActivity.drank_with || []).join(' ').toLowerCase();
        const filtered = (res || []).filter(
          (p) =>
            p.id !== currentUser?.id &&
            !already.includes('(@' + (p.username || '').toLowerCase() + ')')
        );
        setEditFriendResults(filtered);
      } catch (err) {
        console.error('Errore ricerca amici (modifica):', err);
        setEditFriendResults([]);
      } finally {
        setEditSearchingFriends(false);
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [editFriendQuery, editingActivity, currentUser]);

  const addEditCompanion = (value) => {
    if (!value) return;
    setEditingActivity((prev) => (prev ? { ...prev, drank_with: [...(prev.drank_with || []), value] } : prev));
    setEditFriendQuery('');
    setEditFriendResults([]);
  };

  const removeEditCompanion = (idx) => {
    setEditingActivity((prev) => (prev ? { ...prev, drank_with: (prev.drank_with || []).filter((_, i) => i !== idx) } : prev));
  };

  // Carica una foto e la allega alla sessione live in corso
  const handleAddSessionPhoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !activeSession) return;
    if (!file.type.startsWith('image/')) {
      alert("Seleziona un file immagine valido.");
      return;
    }
    setPhotoUploading(true);
    try {
      const url = await db.uploadFileToStorage(file);
      const newMedia = [...(activeSession.media || []), { type: 'image', name: file.name, url }];
      setActiveSession((prev) => (prev ? { ...prev, media: newMedia } : prev));
      await db.updateActivity(activeSession.id, { media: newMedia });
    } catch (err) {
      console.error("Errore upload foto:", err);
      alert("Errore nel caricamento della foto: " + (err.message || err));
    } finally {
      setPhotoUploading(false);
    }
  };

  // Sposta la sessione-tour su una tappa (per indice), registra l'arrivo, salva e
  // apre le indicazioni stradali. Usato sia per avanzare alla prossima tappa
  // schedulata sia per le tappe extra non in programma.
  const goToTourStop = async (stops, index) => {
    const tour = activeSession?.location?.tour;
    if (!tour) return;
    const stop = stops[index];
    if (!stop) return;

    // Nessuna verifica GPS qui: avanzi alla tappa per ricevere le indicazioni e
    // raggiungerla. La verifica della posizione avviene quando registri un drink
    // sul posto. La nuova tappa nasce quindi "non verificata".
    const totalDrinks = (activeSession.drinks || []).reduce((s, d) => s + (d.qty || 1), 0);
    const newVisited = [
      ...(tour.visited || []),
      { name: stop.name, lat: stop.lat ?? null, lng: stop.lng ?? null, arrived_at: new Date().toISOString(), drinksAtStart: totalDrinks, verified: false },
    ];
    const newLocation = {
      ...activeSession.location,
      name: stop.name,
      // Se la tappa extra non ha coordinate, mantieni quelle precedenti così
      // l'atleta resta comunque visibile nel radar live.
      lat: stop.lat ?? activeSession.location?.lat ?? null,
      lng: stop.lng ?? activeSession.location?.lng ?? null,
      unverified: true, // verrà confermata registrando un drink sul posto
      tour: { ...tour, stops, current: index, visited: newVisited },
    };
    setActiveSession((prev) => (prev ? { ...prev, location: newLocation } : prev));
    try {
      await db.updateActivity(activeSession.id, { location: newLocation });
      // Nessuna apertura automatica di Maps: usa il pulsante "🧭 Guidami a ..." nel pannello.
    } catch (err) {
      console.error('Errore cambio tappa:', err);
      alert('Impossibile passare alla tappa: ' + (err.message || err));
    }
  };

  // Avanza alla tappa successiva schedulata e apre la navigazione
  const handleAdvanceTourStop = async () => {
    const tour = activeSession?.location?.tour;
    if (!tour) return;
    const next = (tour.current || 0) + 1;
    if (next >= tour.stops.length) return;
    await goToTourStop(tour.stops, next);
  };

  // Aggiunge una tappa NON in programma (es. un bar trovato per caso) subito
  // dopo quella corrente, senza alterare la sequenza delle tappe schedulate.
  const handleAddUnscheduledStop = async () => {
    const tour = activeSession?.location?.tour;
    if (!tour) return;
    const name = (typeof window !== 'undefined' ? window.prompt('Tappa extra — nome del locale dove ti sei fermato:') : '') || '';
    if (!name.trim()) return;
    const cur = tour.current || 0;
    const stops = [...tour.stops];
    stops.splice(cur + 1, 0, { name: name.trim(), lat: null, lng: null, note: 'Tappa extra (non in programma)', unscheduled: true });
    await goToTourStop(stops, cur + 1);
  };

  // Annulla (elimina) la sessione live in corso, con doppia conferma
  const handleCancelActiveSession = async () => {
    if (!activeSession) return;
    if (!window.confirm('Vuoi annullare la sessione live in corso? Non verrà salvata nel tuo diario.')) return;
    if (!window.confirm('Sei sicuro? La sessione e i drink registrati verranno eliminati definitivamente.')) return;
    try {
      await db.deleteActivity(activeSession.id);
      setActiveSession(null);
      setShowCloseForm(false);
      await loadFeed();
    } catch (err) {
      console.error('Errore annullamento sessione:', err);
      alert('Impossibile annullare la sessione: ' + (err.message || err));
    }
  };

  const handleCloseActiveSession = async (e) => {
    e.preventDefault();
    if (!activeSession) return;

    const feeling = e.target.feeling.value || 'Brillo Felice';
    let description = e.target.description.value || '';

    // Recap automatico per i Tour guidati
    const tour = activeSession.location?.tour;
    if (tour) {
      const visited = tour.visited || [];
      const recap = `🗺️ Tour "${tour.route_name}" completato: ${visited.length}/${tour.stops.length} tappe — ${visited.map((s) => s.name).join(' ➔ ')}.`;
      description = description ? `${recap}\n${description}` : recap;
    }

    const finalData = {
      is_active: false,
      feeling,
      description,
      duration: elapsedMinutes
    };

    try {
      await db.closeSession(activeSession.id, finalData);
      // Niente notifica all'utente per la propria chiusura sessione (azione volontaria).
      setActiveSession(null);
      await loadFeed();
    } catch (err) {
      console.error("Errore nella chiusura della sessione:", err);
      alert("Errore durante la chiusura: " + err.message);
    }
  };

  const handleEditActivity = (act) => {
    setEditingActivity({
      ...act,
      drinks: act.drinks ? JSON.parse(JSON.stringify(act.drinks)) : []
    });
  };

  const handleUpdateEditField = (field, value) => {
    setEditingActivity(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleUpdateEditDrinkQty = (index, increment) => {
    setEditingActivity(prev => {
      const drinks = [...prev.drinks];
      drinks[index] = { ...drinks[index] };
      drinks[index].qty += increment;
      
      if (drinks[index].qty <= 0) {
        drinks.splice(index, 1);
      }
      
      return {
        ...prev,
        drinks
      };
    });
  };

  const handleRemoveEditDrink = (index) => {
    setEditingActivity(prev => {
      const drinks = prev.drinks.filter((_, i) => i !== index);
      return {
        ...prev,
        drinks
      };
    });
  };

  const handleAddTaskPresetToEdit = (preset) => {
    setEditingActivity(prev => {
      const existingIdx = prev.drinks.findIndex(d => d.name === preset.name);
      const drinks = [...prev.drinks];
      if (existingIdx > -1) {
        drinks[existingIdx] = {
          ...drinks[existingIdx],
          qty: drinks[existingIdx].qty + 1
        };
      } else {
        drinks.push({
          name: preset.name,
          abv: preset.abv,
          units: preset.units,
          qty: 1,
          added_at: new Date().toISOString()
        });
      }
      return {
        ...prev,
        drinks
      };
    });
  };

  const handleSaveEdit = async () => {
    if (!editingActivity) return;
    try {
      const totalUnits = editingActivity.drinks.reduce((acc, d) => acc + (d.units * d.qty), 0);
      const updatedDrinks = editingActivity.drinks;
      const bac = db.calculateCurrentBAC(updatedDrinks, editingActivity.created_at, editingActivity.duration, undefined, currentUser?.weight, editingActivity.full_stomach, currentUser?.sex);
      
      const updatedFields = {
        title: editingActivity.title,
        description: editingActivity.description,
        feeling: editingActivity.feeling,
        duration: parseInt(editingActivity.duration) || 120,
        drinks: updatedDrinks,
        drank_with: editingActivity.drank_with || [],
        total_units: parseFloat(totalUnits.toFixed(1)),
        bac_level: parseFloat(bac.toFixed(2)),
        // Privacy modificabile: salva la visibilità scelta nella location.
        ...(editingActivity.location ? { location: editingActivity.location } : {})
      };

      await db.updateActivity(editingActivity.id, updatedFields);
      setEditingActivity(null);
      await loadFeed();
    } catch (err) {
      console.error("Errore salvataggio modifica:", err);
      alert("Errore nel salvataggio: " + err.message);
    }
  };

  const handleDeleteActivity = async (actId) => {
    if (!window.confirm("Sei sicuro di voler eliminare questa attività per sempre?")) return;
    try {
      await db.deleteActivity(actId);
      setEditingActivity(null);
      await loadFeed();
    } catch (err) {
      console.error("Errore eliminazione:", err);
      alert("Errore durante l'eliminazione: " + err.message);
    }
  };

  const handleNextSlide = (actId, maxIndex) => {
    setFeedSlideIndices(prev => ({
      ...prev,
      [actId]: ((prev[actId] || 0) + 1) % maxIndex
    }));
  };

  const handlePrevSlide = (actId, maxIndex) => {
    setFeedSlideIndices(prev => ({
      ...prev,
      [actId]: (prev[actId] || 0) === 0 ? maxIndex - 1 : (prev[actId] || 0) - 1
    }));
  };

  const renderCompanionsList = (act) => {
    // "Ha bevuto con" SOLO le persone taggate esplicitamente (drank_with).
    // Niente più rilevamento automatico per vicinanza/orario: dava falsi "insieme".
    const regIds = new Set();

    const drankWith = act.drank_with || [];
    const finalCompanions = [];

    drankWith.forEach(nameStr => {
      let usernameMatch = nameStr.match(/@([\w-]+)/);
      let username = usernameMatch ? usernameMatch[1] : null;
      let displayName = nameStr.replace(/\s*\(@?[\w-]+\)/g, '').trim();
      
      const matchedProfile = profilesList.find(p => {
        if (username) {
          return p.username.toLowerCase() === username.toLowerCase();
        }
        return p.display_name.toLowerCase() === displayName.toLowerCase() ||
               p.username.toLowerCase() === displayName.toLowerCase();
      });
      
      if (matchedProfile) {
        if (!regIds.has(matchedProfile.id)) {
          finalCompanions.push({
            id: matchedProfile.id,
            name: matchedProfile.display_name || matchedProfile.username,
            isRegistered: true
          });
          regIds.add(matchedProfile.id);
        }
      } else {
        finalCompanions.push({
          id: null,
          name: displayName,
          isRegistered: false
        });
      }
    });
    
    if (finalCompanions.length === 0) return null;
    
    return (
      <div style={{ fontSize: '13px', color: 'var(--text-dark-secondary)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
        <span>🍻</span>
        <strong style={{ color: '#FFF' }}>{act.profiles?.display_name || 'Atleta'}</strong>
        <span>ha bevuto con</span>
        {finalCompanions.map((c, i) => {
          const isLast = i === finalCompanions.length - 1;
          const isPenultimate = i === finalCompanions.length - 2;
          const separator = isLast ? '' : isPenultimate ? ' e ' : ', ';
          
          return (
            <span key={i}>
              {c.isRegistered ? (
                <Link href={`/u/${c.id}`} style={{ color: 'var(--primary)', fontWeight: 700 }}>
                  {c.name}
                </Link>
              ) : (
                <strong style={{ color: 'var(--text-dark-primary)' }}>{c.name}</strong>
              )}
              {separator}
            </span>
          );
        })}
      </div>
    );
  };

  const handleCommentChange = (activityId, text) => {
    setNewCommentText(prev => ({
      ...prev,
      [activityId]: text
    }));
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

    if (diffMins < 60) {
      return diffMins <= 0 ? 'Adesso' : `${diffMins} min fa`;
    } else if (diffHours < 24) {
      return `${diffHours} ore fa`;
    } else if (diffHours < 48) {
      return 'Ieri';
    } else {
      return date.toLocaleDateString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    }
  };

  // Una sessione è "live" se attiva e iniziata da meno di 5 ore.
  const isLiveAct = (a) => !!a?.is_active && (Date.now() - new Date(a.created_at).getTime() < 5 * 60 * 60 * 1000);
  // Tempo sforzo = dall'apertura della live a ORA (se live) oppure la durata registrata
  // alla chiusura (apertura → chiusura). In minuti.
  const effortMinutes = (a) => {
    if (!a) return 0;
    if (isLiveAct(a)) return Math.max(1, Math.round((Date.now() - new Date(a.created_at).getTime()) / 60000));
    return a.duration || 0;
  };
  const fmtEffort = (a) => { const m = effortMinutes(a); return `${Math.floor(m / 60)}h ${m % 60}m`; };

  // Per i Tour: raggruppa i drink per tappa, in base alle finestre temporali di arrivo
  // ad ogni tappa (visited[i].arrived_at → visited[i+1].arrived_at). Ritorna null se non è un tour.
  const tourDrinksByStop = (act) => {
    const tour = act?.location?.tour;
    if (!tour || !Array.isArray(tour.visited) || tour.visited.length === 0) return null;
    const visited = tour.visited;
    const drinks = (act.drinks || []).filter((d) => d.added_at);
    return visited.map((v, i) => {
      const start = new Date(v.arrived_at || act.created_at).getTime();
      const end = i + 1 < visited.length ? new Date(visited[i + 1].arrived_at).getTime() : Infinity;
      const stopDrinks = drinks.filter((d) => {
        const t = new Date(d.added_at).getTime();
        return t >= start && t < end;
      });
      return { name: v.name, verified: !!v.verified, drinks: groupDrinks(stopDrinks) };
    });
  };

  // Calcola statistiche per la sidebar dell'utente loggato.
  // Usa myActivities (query dedicata, tutte le sessioni dell'utente) così le statistiche
  // restano corrette anche con il feed paginato.
  const userActivities = myActivities;
  const totalDrinksCount = userActivities.reduce((acc, act) => {
    return acc + act.drinks.reduce((dAcc, d) => dAcc + d.qty, 0);
  }, 0);
  const weeklyStreak = userActivities.filter(a => {
    const diffTime = Math.abs(new Date() - new Date(a.created_at));
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays <= 7;
  }).length;

  // 1. U.A. Oggi
  const todayUnits = userActivities.reduce((acc, act) => {
    const actDate = new Date(act.created_at);
    const today = new Date();
    if (actDate.getDate() === today.getDate() &&
        actDate.getMonth() === today.getMonth() &&
        actDate.getFullYear() === today.getFullYear()) {
      return acc + parseFloat(act.total_units || 0);
    }
    return acc;
  }, 0);

  // 2. U.A. Settimanali (ultimi 7 giorni)
  const weeklyUnits = userActivities.reduce((acc, act) => {
    const actDate = new Date(act.created_at);
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    if (actDate >= oneWeekAgo) {
      return acc + parseFloat(act.total_units || 0);
    }
    return acc;
  }, 0);

  // 3. U.A. Mensili (mese corrente)
  const monthlyUnits = userActivities.reduce((acc, act) => {
    const actDate = new Date(act.created_at);
    const today = new Date();
    if (actDate.getMonth() === today.getMonth() && actDate.getFullYear() === today.getFullYear()) {
      return acc + parseFloat(act.total_units || 0);
    }
    return acc;
  }, 0);

  // 4. Numero di bar/locali unici visitati
  const uniqueBarsVisited = new Set(
    userActivities
      .map(act => act.location?.name)
      .filter(Boolean)
  ).size;

  // 5. Tour completati
  const toursCompleted = userActivities.filter(act => 
    act.description?.includes('percorso') || 
    act.description?.includes('Percorso') ||
    act.description?.includes('tour')
  ).length;

  // Classifica REALE (atleti veri) aggregata dalle sessioni del feed, per U.A. totali
  // Classifica globale: calcolata dal DB (getTopDrinkers), non dal feed paginato.
  const leaderboardData = topDrinkers;

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <div className="pulse" style={{ color: 'var(--primary)', fontSize: '20px', fontWeight: 'bold' }}>
          Versando una fresca... 🍺
        </div>
      </div>
    );
  }

  // SCHERMATA D'IMPATTO SE L'UTENTE NON E LOGGATO
  if (!currentUser) {
    return (
      <div className="landing-section-gap" style={{ display: 'flex', flexDirection: 'column', gap: '90px', marginTop: '-30px', paddingBottom: '90px' }}>
        
        {/* HERO SECTION */}
        <section className="r-grid-2-1" style={{ alignItems: 'center', minHeight: '80vh', padding: '40px 0', borderBottom: '1px solid var(--border-dark)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '25px' }}>
            <span style={{ background: 'rgba(255, 32, 0, 0.1)', color: 'var(--primary)', padding: '6px 14px', borderRadius: '30px', fontSize: '14px', fontWeight: '700', width: 'fit-content', textTransform: 'uppercase', letterSpacing: '1px' }}>
              🎖️ Il Social Network degli Atleti da Bar
            </span>
            <h1 className="hero-title">
              Traccia le tue bevute. <br />
              Sblocca <span style={{ background: 'var(--premium-gradient)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>nuovi record</span>.
            </h1>
            <p className="hero-para">
              Unisciti a milioni di atleti del terzo tempo in tutto il mondo. Traccia le tue sessioni, analizza le unità alcoliche (U.A.) assunte e sfida gli amici nelle classifiche dei pub di tutto il mondo.
            </p>
            <div className="hero-btns">
              <Link href="/auth" className="btn btn-primary" style={{ padding: '16px 32px', borderRadius: '30px', fontSize: '17px', fontWeight: '700' }}>
                Comincia Ora (Gratis)
              </Link>
              <Link href="/routes" className="btn btn-secondary" style={{ padding: '16px 32px', borderRadius: '30px', fontSize: '17px' }}>
                Esplora i Percorsi
              </Link>
            </div>
          </div>

          {/* Grafica del telefono / mockup di performance */}
          <div style={{ background: 'linear-gradient(135deg, rgba(22, 24, 34, 0.9) 0%, rgba(255, 32, 0, 0.15) 100%)', border: '2px solid var(--primary)', borderRadius: '24px', padding: '30px', boxShadow: '0px 10px 40px rgba(255, 32, 0, 0.15)', display: 'flex', flexDirection: 'column', gap: '20px', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: '-50px', right: '-50px', width: '150px', height: '150px', background: 'var(--primary)', filter: 'blur(80px)', borderRadius: '50%', opacity: 0.4 }}></div>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div className="activity-avatar" style={{ border: '2px solid var(--primary)', width: '38px', height: '38px', fontSize: '14px' }}>S</div>
                <div>
                  <h4 style={{ fontSize: '14px', fontWeight: '700' }}>Atleta Strabar</h4>
                  <span style={{ fontSize: '11px', color: 'var(--text-dark-secondary)' }}>Esempio di sessione</span>
                </div>
              </div>
              <span className="badge-premium" style={{ fontSize: '8px' }}>PRO</span>
            </div>

            <h3 style={{ fontSize: '20px', fontWeight: '800', color: '#FFF' }}>Aperitivo Sforzo Massimo 🏆</h3>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', background: 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: '10px', border: '1px solid var(--border-dark)' }}>
              <div style={{ textAlign: 'center' }}>
                <span style={{ fontSize: '10px', color: 'var(--text-dark-secondary)' }}>Drink</span>
                <div style={{ fontSize: '20px', fontWeight: '800', color: 'var(--primary)' }}>5</div>
              </div>
              <div style={{ textAlign: 'center', borderLeft: '1px solid var(--border-dark)', borderRight: '1px solid var(--border-dark)' }}>
                <span style={{ fontSize: '10px', color: 'var(--text-dark-secondary)' }}>Tempo</span>
                <div style={{ fontSize: '18px', fontWeight: '800' }}>2h 15m</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <span style={{ fontSize: '10px', color: 'var(--text-dark-secondary)' }}>Carico</span>
                <div style={{ fontSize: '18px', fontWeight: '800', color: 'var(--secondary)' }}>5.2 UA</div>
              </div>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              <span className="drink-tag" style={{ fontSize: '11px' }}>🍺 3x Birra Chiara</span>
              <span className="drink-tag" style={{ fontSize: '11px' }}>🍹 2x Spritz Campari</span>
            </div>

            <div style={{ borderTop: '1px solid var(--border-dark)', paddingTop: '15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', color: 'var(--text-dark-secondary)' }}>
              <span>👥 Con Luca e Francesca</span>
              <span style={{ color: 'var(--primary)', fontWeight: '700' }}>Stato: Molto Caldo 🔥</span>
            </div>
          </div>
        </section>

        {/* STATS SECTION */}
        <section className="r-grid-stat-4" style={{ gap: '20px', textAlign: 'center' }}>
          <div className="card" style={{ padding: '24px 16px' }}>
            <div className="landing-stat-num" style={{ color: 'var(--primary)' }}>12+ Mln</div>
            <p style={{ color: 'var(--text-dark-secondary)', fontSize: '14px', marginTop: '5px' }}>Brindisi Registrati</p>
          </div>
          <div className="card" style={{ padding: '24px 16px' }}>
            <div className="landing-stat-num" style={{ color: '#FFF' }}>380k</div>
            <p style={{ color: 'var(--text-dark-secondary)', fontSize: '14px', marginTop: '5px' }}>Atleti Attivi</p>
          </div>
          <div className="card" style={{ padding: '24px 16px' }}>
            <div className="landing-stat-num" style={{ color: 'var(--secondary)' }}>80+</div>
            <p style={{ color: 'var(--text-dark-secondary)', fontSize: '14px', marginTop: '5px' }}>Paesi</p>
          </div>
          <div className="card" style={{ padding: '24px 16px' }}>
            <div className="landing-stat-num" style={{ color: '#10B981' }}>0.0%</div>
            <p style={{ color: 'var(--text-dark-secondary)', fontSize: '14px', marginTop: '5px' }}>Giudizio Morale</p>
          </div>
        </section>

        {/* DEFAULT VENICE ITINERARY PREVIEW SECTION */}
        <section className="r-grid-1-2 landing-section-padded" style={{ borderTop: '1px solid var(--border-dark)', borderBottom: '1px solid var(--border-dark)', padding: '60px 0' }}>
          <div>
            <span style={{ background: 'rgba(223, 255, 0, 0.1)', color: 'var(--secondary)', padding: '6px 12px', borderRadius: '30px', fontSize: '13px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              🗺️ Itinerario di Esempio di Default
            </span>
            <h2 style={{ fontSize: '38px', fontWeight: '900', color: '#FFF', marginTop: '15px', marginBottom: '15px' }}>
              Giro dei Bacari Storico a Venezia 🛶
            </h2>
            <p style={{ color: 'var(--text-dark-secondary)', fontSize: '16px', lineHeight: '1.6', marginBottom: '25px' }}>
              Esplora la laguna veneziana attraverso il nostro itinerario più celebre. Strabar ti permette di pianificare le tappe con coordinate reali del GPS dei pub, calcolare le calorie e le distanze, e tracciare le soste per l&apos;aperitivo.
            </p>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'start', gap: '12px' }}>
                <span style={{ background: 'var(--primary)', color: '#FFF', width: '24px', height: '24px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: '800', marginTop: '2px' }}>1</span>
                <div>
                  <strong style={{ color: '#FFF' }}>Cantina Do Mori</strong>
                  <p style={{ fontSize: '13px', color: 'var(--text-dark-secondary)' }}>Il locale più antico di Venezia (fondato nel 1462). Famoso per i cicheti &quot;francobolli&quot;.</p>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'start', gap: '12px' }}>
                <span style={{ background: 'var(--primary)', color: '#FFF', width: '24px', height: '24px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: '800', marginTop: '2px' }}>2</span>
                <div>
                  <strong style={{ color: '#FFF' }}>Osteria All&apos;Arco</strong>
                  <p style={{ fontSize: '13px', color: 'var(--text-dark-secondary)' }}>Tappa leggendaria per i cicheti caldi preparati al momento con ingredienti freschi del mercato.</p>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'start', gap: '12px' }}>
                <span style={{ background: 'var(--primary)', color: '#FFF', width: '24px', height: '24px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: '800', marginTop: '2px' }}>3</span>
                <div>
                  <strong style={{ color: '#FFF' }}>Osteria Al Mercà</strong>
                  <p style={{ fontSize: '13px', color: 'var(--text-dark-secondary)' }}>Famoso per lo spritz al Select o al Campari, servito al volo in piedi proprio davanti a Rialto.</p>
                </div>
              </div>
            </div>
            
            <div style={{ marginTop: '30px' }}>
              <Link href="/routes" className="btn btn-primary" style={{ padding: '12px 24px', fontSize: '15px' }}>
                Vedi Tutti i Percorsi Sulla Mappa
              </Link>
            </div>
          </div>

          {/* Mappa Leaflet REALE e interattiva del tour di Venezia */}
          <div className="landing-fake-map" style={{ position: 'relative', height: '420px' }}>
            <RouteMap waypoints={VENICE_TOUR} height="100%" />
            <div style={{ position: 'absolute', bottom: '15px', left: '15px', background: 'rgba(0,0,0,0.8)', padding: '8px 12px', borderRadius: '6px', fontSize: '12px', border: '1px solid var(--border-dark)', zIndex: 500, pointerEvents: 'none' }}>
              📍 Venezia, Italia • <strong>4 tappe reali</strong>
            </div>
          </div>
        </section>

        {/* SEZIONE CLASSIFICA / LEGGENDA DEL LOCALE */}
        <section className="r-grid-2" style={{ alignItems: 'center' }}>
          <div style={{ background: 'linear-gradient(135deg, rgba(223, 255, 0, 0.05) 0%, rgba(22, 24, 34, 0.8) 100%)', border: '1px solid var(--border-dark)', borderRadius: '16px', padding: '30px', boxShadow: 'var(--shadow)' }}>
            <div style={{ color: 'var(--secondary)', marginBottom: '15px' }}>
              <Trophy size={36} />
            </div>
            <h3 style={{ fontSize: '24px', fontWeight: '800', color: '#FFF', marginBottom: '10px' }}>Classifica: Diventa la &quot;Leggenda del Locale&quot; 👑</h3>
            <p style={{ color: 'var(--text-dark-secondary)', fontSize: '15px', lineHeight: '1.5', marginBottom: '20px' }}>
              Su Strabar, ogni locale o bar reale ha la sua classifica e la sua leggenda del locale. Chi registra più sessioni o consuma più U.A. in un determinato locale ne diventa il custode supremo.
            </p>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {[
                'Fai check-in in un locale ad ogni sessione',
                'Accumula visite e Unità Alcoliche in quel bar',
                'Supera gli altri e diventa la Leggenda del Locale 👑',
              ].map((t, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid var(--border-dark)' }}>
                  <span style={{ background: 'var(--secondary)', color: '#000', width: '24px', height: '24px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: '800', flexShrink: 0 }}>{i + 1}</span>
                  <span style={{ fontSize: '14px', fontWeight: '600' }}>{t}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <span style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10B981', padding: '6px 12px', borderRadius: '30px', fontSize: '13px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px', width: 'fit-content' }}>
              📈 Statistiche & Analisi
            </span>
            <h2 style={{ fontSize: '38px', fontWeight: '900', color: '#FFF' }}>
              Non è alcolismo. È analisi statistica.
            </h2>
            <p style={{ color: 'var(--text-dark-secondary)', fontSize: '16px', lineHeight: '1.6' }}>
              Analizziamo ogni sessione generando una heatmap mensile delle tue bevute, proprio come la mappa di calore dei tuoi allenamenti. Tieni traccia dell&apos;andamento del fegato, controlla la gradazione media di ogni bevuta e analizza i tempi spesi a tavola per ottimizzare le tue performance sociali nel tempo.
            </p>
          </div>
        </section>

        {/* FEATURES GRID SECTION */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: '40px' }}>
          <div style={{ textAlign: 'center' }}>
            <h2 style={{ fontSize: '40px', fontWeight: '900', color: '#FFF' }}>Le Caratteristiche del Campione 🥇</h2>
            <p style={{ color: 'var(--text-dark-secondary)', fontSize: '18px', marginTop: '10px' }}>Tutte le funzionalità di cui hai bisogno per tracciare le tue sessioni sociali.</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '35px' }}>
            <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '15px', padding: '30px' }}>
              <div style={{ color: 'var(--primary)', background: 'rgba(255, 32, 0, 0.1)', padding: '12px', borderRadius: '50%', width: 'fit-content' }}>
                <Beer size={28} />
              </div>
              <h3 style={{ fontSize: '20px', fontWeight: '800', color: '#FFF' }}>Analizzatore del Carico (U.A.)</h3>
              <p style={{ color: 'var(--text-dark-secondary)', lineHeight: '1.6', fontSize: '15px' }}>
                Traccia l&apos;alcol in base alle Unità Alcoliche (U.A.) reali dei singoli drink, calcolate secondo gradazione (ABV) e volume del bicchiere. Monitora lo sforzo e capisci quando fermarti.
              </p>
            </div>

            <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '15px', padding: '30px' }}>
              <div style={{ color: 'var(--secondary)', background: 'rgba(223, 255, 0, 0.1)', padding: '12px', borderRadius: '50%', width: 'fit-content' }}>
                <Trophy size={28} />
              </div>
              <h3 style={{ fontSize: '20px', fontWeight: '800', color: '#FFF' }}>Classifiche Club & Sfide</h3>
              <p style={{ color: 'var(--text-dark-secondary)', lineHeight: '1.6', fontSize: '15px' }}>
                Competi nelle classifiche settimanali del club. Guadagna badge digitali esclusivi completando le sfide del mese, proprio come i badge di rendimento degli atleti.
              </p>
            </div>

            <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '15px', padding: '30px' }}>
              <div style={{ color: '#10B981', background: 'rgba(16, 185, 129, 0.1)', padding: '12px', borderRadius: '50%', width: 'fit-content' }}>
                <Flame size={28} />
              </div>
              <h3 style={{ fontSize: '20px', fontWeight: '800', color: '#FFF' }}>Mappe & Ricerca Locali</h3>
              <p style={{ color: 'var(--text-dark-secondary)', lineHeight: '1.6', fontSize: '15px' }}>
                Crea itinerari personalizzati integrati con OpenStreetMap. Cerca bar reali ovunque ti trovi nel mondo, pianifica le tappe e calcola le distanze di camminata tra un cicchetto e l&apos;altro.
              </p>
            </div>
          </div>
        </section>

        {/* CTA CARD */}
        <section className="card landing-cta-pad" style={{ background: 'linear-gradient(135deg, rgba(255, 32, 0, 0.15) 0%, rgba(22, 24, 34, 0.95) 100%)', border: '1px solid var(--border-dark)', padding: '60px 40px', borderRadius: '24px', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '20px', alignItems: 'center' }}>
          <h2 style={{ fontSize: '38px', fontWeight: '900', color: '#FFF', maxWidth: '600px' }}>
            Pronto per il prossimo record personale al tavolo?
          </h2>
          <p style={{ color: 'var(--text-dark-secondary)', fontSize: '17px', maxWidth: '500px', lineHeight: '1.5' }}>
            Crea il tuo profilo atleta, tagga i tuoi compagni di brindisi e inizia subito ad analizzare le tue sessioni.
          </p>
          <Link href="/auth" className="btn btn-primary" style={{ padding: '16px 36px', borderRadius: '30px', fontSize: '18px', fontWeight: '700', marginTop: '10px' }}>
            Registrati Subito Gratis
          </Link>
        </section>

      </div>
    );
  }

  // Dynamic variables for selected activity modal
  let totalU = 0;
  let derivedBac = 0;
  let barSessions = [];
  let localLegend = { name: "Nessuno", count: 0 };
  let topUnitsLeaderboard = [];
  let topBacLeaderboard = [];
  let bacTimeline = [];

  if (selectedActivity) {
    totalU = parseFloat(selectedActivity.total_units || selectedActivity.drinks?.reduce((acc, d) => acc + ((d.units || 1.5) * d.qty), 0) || 0);

    // Per sessioni storiche (non live) calcola il BAC al momento di fine sessione stimata,
    // non adesso (che darebbe sempre 0 perché l'alcol è già smaltito da tempo).
    const isLiveSession = selectedActivity.is_active &&
      (Date.now() - new Date(selectedActivity.created_at).getTime()) < 5 * 60 * 60 * 1000;
    const sessionEndTime = isLiveSession
      ? undefined  // usa now (default)
      : new Date(new Date(selectedActivity.created_at).getTime() + (selectedActivity.duration || 120) * 60 * 1000).toISOString();

    // Peso e sesso del proprietario della sessione (per BAC/curva precisi); fallback 70kg
    const ownerWeight =
      (selectedActivity.user_id === currentUser?.id ? currentUser?.weight : selectedActivity.profiles?.weight) || undefined;
    const ownerSex =
      (selectedActivity.user_id === currentUser?.id ? currentUser?.sex : selectedActivity.profiles?.sex) || undefined;

    derivedBac = (selectedActivity.bac_level && parseFloat(selectedActivity.bac_level) > 0)
      ? parseFloat(selectedActivity.bac_level)
      : db.calculateCurrentBAC(selectedActivity.drinks || [], selectedActivity.created_at, selectedActivity.duration || 120, sessionEndTime, ownerWeight, selectedActivity.full_stomach, ownerSex);

    // La "Classifica del Locale" ha senso solo per locali REALI (con coordinate e verificati):
    // le sessioni libere/non verificate non sono locali → niente classifica/legenda.
    const loc = selectedActivity.location;
    const isRealVenue = loc && loc.name && !loc.freeform && typeof loc.lat === 'number' && typeof loc.lng === 'number';
    if (isRealVenue) {
      const locNameNormalized = loc.name.trim().toLowerCase();
      barSessions = activities.filter(act =>
        act.location &&
        act.location.name &&
        !act.location.freeform &&
        !act.location.unverified &&
        act.location.name.trim().toLowerCase() === locNameNormalized
      );

      // Calcola Leggenda del Locale (visite)
      const userVisits = {};
      barSessions.forEach(s => {
        const uId = s.user_id;
        const name = s.profiles?.display_name || s.profiles?.username || "Atleta Strabar";
        if (!userVisits[uId]) {
          userVisits[uId] = { name, count: 0 };
        }
        userVisits[uId].count += 1;
      });
      
      Object.values(userVisits).forEach(u => {
        if (u.count > localLegend.count) {
          localLegend = u;
        }
      });

      // Top Carico (Max U.A. in una singola sessione)
      topUnitsLeaderboard = [...barSessions]
        .map(s => ({
          name: s.profiles?.display_name || s.profiles?.username || "Atleta Strabar",
          totalUnits: parseFloat(s.total_units || 0)
        }))
        .sort((a, b) => b.totalUnits - a.totalUnits)
        .slice(0, 3);

      // Top BAC (Tasso Alcolico Record in una singola sessione).
      // Se il BAC salvato è 0/mancante (es. sessioni vecchie), lo ricalcoliamo al volo.
      topBacLeaderboard = [...barSessions]
        .map(s => {
          let bac = (s.bac_level && parseFloat(s.bac_level) > 0) ? parseFloat(s.bac_level) : 0;
          if (bac === 0 && s.drinks && s.drinks.length > 0) {
            const isLive = s.is_active && (Date.now() - new Date(s.created_at).getTime()) < 5 * 60 * 60 * 1000;
            const endRef = isLive ? undefined : new Date(new Date(s.created_at).getTime() + (s.duration || 120) * 60 * 1000).toISOString();
            bac = db.calculateCurrentBAC(s.drinks, s.created_at, s.duration || 120, endRef, s.profiles?.weight, s.full_stomach, s.profiles?.sex);
          }
          return {
            name: s.profiles?.display_name || s.profiles?.username || "Atleta Strabar",
            bac
          };
        })
        .sort((a, b) => b.bac - a.bac)
        .slice(0, 3);
    }

    // Timeline BAC reale basata sugli orari di aggiunta dei singoli drink (peso reale se disponibile)
    bacTimeline = db.calculateBACTimeline(selectedActivity.drinks || [], selectedActivity.created_at, selectedActivity.duration || 120, ownerWeight, selectedActivity.full_stomach, ownerSex);
  }

  // Visibilità live: una sessione PRIVATA non appare a nessuno finché è attiva
  // (riappare nel feed solo a chiusura); 'friends' solo ai follower. Le mie le vedo sempre.
  const isVisibleToMe = (a) => {
    if (!a.is_active) return true; // sessioni chiuse: sempre nel feed
    if (currentUser && a.user_id === currentUser.id) return true; // le mie
    const share = a.location?.share;
    if (share === 'private') return false;
    // "Amici" = collegamento di follow in QUALSIASI direzione (io seguo lui O lui segue me).
    if (share === 'friends') return followingIds.includes(a.user_id) || followerIds.includes(a.user_id);
    return true; // 'public' o sessioni storiche senza flag
  };

  // Feed filtrato: prima per visibilità, poi "Amici" mostra le sessioni di chi seguo + le mie
  const visibleActivities = activities
    .filter(isVisibleToMe)
    .filter((a) =>
      feedFilter === 'friends' && currentUser
        ? a.user_id === currentUser.id || followingIds.includes(a.user_id)
        : true
    );

  return (
    <div className="dashboard-grid">
      {/* Colonna Sinistra: Feed delle Attività */}
      <div className="feed-list">
        {currentUser ? (
          activeSession ? (
            <div className="card" style={{ border: '2px solid var(--primary)', background: 'linear-gradient(135deg, #17181B 0%, #1c130c 100%)', marginBottom: '25px', position: 'relative', boxShadow: '0px 0px 20px rgba(255, 32, 0, 0.25)', borderRadius: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: '1 1 auto' }}>
                  <span className="pulse" style={{ color: 'var(--primary)', fontWeight: '800', fontSize: '14px', display: 'inline-flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--primary)', display: 'inline-block' }} />
                    LIVE 🔴
                  </span>
                  <span style={{ fontSize: '14px', color: '#FFF', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
                    presso <strong>{activeSession.location ? activeSession.location.name : 'Sessione Libera'}</strong>
                  </span>
                </div>
                <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-dark-secondary)', flexShrink: 0, whiteSpace: 'nowrap' }}>
                  ⏱️ {elapsedMinutes} min
                </span>
              </div>
              {/* Pannello TOUR guidato (se la sessione è una modalità percorso) */}
              {activeSession.location?.tour ? (() => {
                const tour = activeSession.location.tour;
                const stops = tour.stops || [];
                const cur = tour.current || 0;
                const curStop = stops[cur];
                const nextStop = stops[cur + 1];
                const totalDrinks = (activeSession.drinks || []).reduce((s, d) => s + (d.qty || 1), 0);
                const drinksAtStart = tour.visited?.[cur]?.drinksAtStart || 0;
                const atThisStop = Math.max(0, totalDrinks - drinksAtStart);
                const target = tour.target || 2;
                const pct = Math.min(100, (atThisStop / target) * 100);
                return (
                  <div style={{ marginBottom: '15px', background: 'rgba(223, 255, 0,0.06)', border: '1px solid rgba(223, 255, 0,0.25)', borderRadius: '10px', padding: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', flexWrap: 'wrap', gap: '6px' }}>
                      <strong style={{ fontSize: '13px', color: 'var(--secondary)' }}>🗺️ Tour: {tour.route_name}</strong>
                      <span style={{ fontSize: '12px', color: 'var(--text-dark-secondary)', fontWeight: 700 }}>Tappa {cur + 1}/{stops.length}</span>
                    </div>
                    <div style={{ fontSize: '15px', fontWeight: 800, color: '#FFF', marginBottom: '4px' }}>📍 {curStop?.name}</div>
                    <div style={{ fontSize: '11px', marginBottom: '8px', fontWeight: 700, color: activeSession.location?.unverified ? 'var(--text-dark-secondary)' : 'var(--success)' }}>
                      {activeSession.location?.unverified
                        ? '○ Tappa non ancora verificata — registra un drink qui sul posto per validarla'
                        : '✅ Tappa verificata — conta per le classifiche'}
                    </div>

                    {/* Budget drink a questa tappa */}
                    <div style={{ marginBottom: '10px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-dark-secondary)', marginBottom: '4px' }}>
                        <span>Drink a questa tappa</span>
                        <strong style={{ color: atThisStop >= target ? 'var(--error)' : 'var(--secondary)' }}>{atThisStop} / {target}</strong>
                      </div>
                      <div style={{ height: '6px', background: 'rgba(255,255,255,0.08)', borderRadius: '4px', overflow: 'hidden' }}>
                        <div style={{ width: `${pct}%`, height: '100%', background: atThisStop >= target ? 'var(--error)' : 'var(--secondary)', transition: 'width 0.3s' }} />
                      </div>
                      {atThisStop >= target && <div style={{ fontSize: '10px', color: 'var(--error)', marginTop: '4px' }}>Target raggiunto — valuta di passare alla prossima tappa 😉</div>}
                    </div>

                    {/* Navigazione verso la tappa CORRENTE (sempre in primo piano: guida l'atleta) */}
                    {curStop?.lat && curStop?.lng ? (
                      <a href={`https://www.google.com/maps/dir/?api=1&destination=${curStop.lat},${curStop.lng}`} target="_blank" rel="noopener noreferrer" className="btn btn-primary" style={{ width: '100%', fontSize: '13px', padding: '9px 12px', borderRadius: '14px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontWeight: 700, marginBottom: '8px' }}>
                        🧭 Guidami a {curStop.name.length > 22 ? curStop.name.slice(0, 20) + '…' : curStop.name}
                      </a>
                    ) : (
                      <div style={{ fontSize: '11px', color: 'var(--text-dark-secondary)', marginBottom: '8px' }}>📍 Tappa extra senza coordinate — registra qui i tuoi drink.</div>
                    )}

                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      {nextStop ? (
                        <button onClick={handleAdvanceTourStop} className="btn btn-primary" style={{ flex: 1, fontSize: '12px', padding: '6px 12px', borderRadius: '14px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '5px', fontWeight: 700 }}>
                          ➡️ Prossima: {nextStop.name.length > 16 ? nextStop.name.slice(0, 14) + '…' : nextStop.name}
                        </button>
                      ) : (
                        <span style={{ flex: 1, fontSize: '11px', color: 'var(--text-dark-secondary)', alignSelf: 'center', textAlign: 'center' }}>Ultima tappa — chiudi per il recap 🏁</span>
                      )}
                      <button onClick={handleAddUnscheduledStop} className="btn btn-secondary" style={{ fontSize: '12px', padding: '6px 12px', borderRadius: '14px', display: 'inline-flex', alignItems: 'center', gap: '5px' }} title="Aggiungi una tappa non prevista nel percorso">
                        ➕ Tappa extra
                      </button>
                    </div>

                    {/* Mappa del percorso con la tappa corrente evidenziata */}
                    {(() => {
                      const mapWaypoints = stops
                        .map((s, i) => ({ name: s.name, lat: s.lat, lng: s.lng, label: i + 1 }))
                        .filter((s) => typeof s.lat === 'number' && typeof s.lng === 'number');
                      if (mapWaypoints.length === 0) return null;
                      const activeIdx = mapWaypoints.findIndex((s) => s.label === cur + 1);
                      return (
                        <div style={{ marginTop: '12px' }} data-no-open>
                          <RouteMap waypoints={mapWaypoints} activeIndex={activeIdx >= 0 ? activeIdx : null} height="220px" />
                        </div>
                      );
                    })()}
                  </div>
                );
              })() : (
                <div style={{ marginBottom: '15px' }}>
                  <button
                    onClick={() => router.push('/log?action=append')}
                    className="btn btn-secondary"
                    style={{ fontSize: '12px', padding: '6px 12px', borderRadius: '14px', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                  >
                    📍 Aggiungi Tappa / Cambia Bar
                  </button>
                </div>
              )}

              {/* Titolo e info modificabili della sessione live */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px', marginBottom: '15px' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3 style={{ fontSize: '17px', fontWeight: '800', color: '#FFF', wordBreak: 'break-word' }}>
                    {activeSession.title || 'Brindisi Live 🍻'}
                  </h3>
                  {activeSession.description && (
                    <p style={{ fontSize: '12px', color: 'var(--text-dark-secondary)', marginTop: '2px' }}>{activeSession.description}</p>
                  )}
                </div>
                <button
                  onClick={() => handleEditActivity(activeSession)}
                  className="btn btn-secondary"
                  style={{ fontSize: '11px', padding: '5px 10px', borderRadius: '12px', display: 'inline-flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}
                >
                  <Edit size={12} /> Modifica info
                </button>
              </div>

              {/* Statistiche Live */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', background: 'rgba(255,255,255,0.02)', padding: '15px', borderRadius: '8px', border: '1px solid var(--border-dark)', marginBottom: '15px' }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-dark-secondary)', textTransform: 'uppercase', fontWeight: '600' }}>Carico Alcolico</div>
                  <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--secondary)', marginTop: '4px' }}>
                    {activeSession.total_units ? activeSession.total_units.toFixed(1) : '0.0'} <span style={{ fontSize: '12px' }}>U.A.</span>
                  </div>
                </div>
                <div style={{ textAlign: 'center', borderLeft: '1px solid var(--border-dark)' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-dark-secondary)', textTransform: 'uppercase', fontWeight: '600' }}>BAC Stimato</div>
                  <div style={{ fontSize: '24px', fontWeight: '800', color: (activeSession.bac_level || 0) > 0.5 ? 'var(--error)' : 'var(--success)', marginTop: '4px' }}>
                    {activeSession.bac_level ? activeSession.bac_level.toFixed(2) : '0.00'} <span style={{ fontSize: '12px' }}>g/l</span>
                  </div>
                </div>
              </div>

              {/* Stomaco pieno/vuoto (compatto): incide sulla stima del BAC */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-dark-secondary)' }}>🍽️ Stomaco</span>
                <div style={{ display: 'inline-flex', gap: '4px', background: 'var(--bg-input-dark)', border: '1px solid var(--border-dark)', borderRadius: '8px', padding: '2px' }}>
                  <button type="button" onClick={() => handleToggleFullStomach(false)} style={{ fontSize: '11px', padding: '4px 10px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontWeight: 700, background: !activeSession.full_stomach ? 'var(--primary)' : 'transparent', color: !activeSession.full_stomach ? '#fff' : 'var(--text-dark-secondary)' }}>Vuoto</button>
                  <button type="button" onClick={() => handleToggleFullStomach(true)} style={{ fontSize: '11px', padding: '4px 10px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontWeight: 700, background: activeSession.full_stomach ? 'var(--primary)' : 'transparent', color: activeSession.full_stomach ? '#fff' : 'var(--text-dark-secondary)' }}>🍝 Pieno</button>
                </div>
              </div>

              {/* Curva BAC per orario (in tempo reale), tiene conto degli orari dei drink */}
              {(() => {
                const tl = db.calculateBACTimeline(activeSession.drinks || [], activeSession.created_at, activeSession.duration || elapsedMinutes || 1, currentUser?.weight, activeSession.full_stomach, currentUser?.sex);
                if (!tl || tl.length === 0) return null;
                return (
                  <div style={{ marginBottom: '15px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-dark)', borderRadius: '8px', padding: '12px' }}>
                    <span style={{ fontSize: '11px', color: 'var(--text-dark-secondary)', textTransform: 'uppercase', fontWeight: '600', display: 'block', marginBottom: '6px' }}>📈 Curva BAC (g/l)</span>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', position: 'relative', padding: '6px 0' }}>
                      <div style={{ position: 'absolute', top: '18px', left: '12px', right: '12px', height: '3px', background: 'linear-gradient(90deg, var(--success) 0%, var(--primary) 50%, var(--error) 100%)', zIndex: 1 }} />
                      {tl.map((pt, idx) => (
                        <div key={idx} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 2, flex: 1 }}>
                          <span style={{ fontSize: '10px', color: 'var(--text-dark-secondary)' }}>{pt.label}</span>
                          <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: pt.val > 0.8 ? 'var(--error)' : pt.val > 0.5 ? 'var(--primary)' : 'var(--success)', border: '2px solid #000', margin: '5px 0' }} />
                          <span style={{ fontSize: '11px', fontWeight: 800, color: pt.val > 0.5 ? 'var(--primary)' : '#FFF' }}>{pt.val.toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* Elenco drink correnti */}
              <div style={{ marginBottom: '15px' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-dark-secondary)', textTransform: 'uppercase', fontWeight: '600', display: 'block', marginBottom: '6px' }}>
                  Drink in questa sessione ({(activeSession.drinks || []).reduce((s, d) => s + (d.qty || 1), 0)}):
                </span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', maxHeight: '100px', overflowY: 'auto' }}>
                  {activeSession.drinks?.length > 0 ? (
                    groupDrinks(activeSession.drinks).map((d, i) => (
                      <span key={i} className="drink-tag" style={{ margin: 0, fontSize: '11px', padding: '3px 4px 3px 8px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <Beer size={10} /> {(d.qty || 1) > 1 ? `${d.qty}× ` : ''}{d.name}
                        <button
                          type="button"
                          onClick={() => handleRemoveDrinkFromActiveSession(d.name)}
                          title="Rimuovi un drink (correggi un errore)"
                          style={{ background: 'rgba(239,68,68,0.15)', border: 'none', color: '#EF4444', borderRadius: '50%', width: 16, height: 16, cursor: 'pointer', fontSize: 11, lineHeight: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                        >
                          ×
                        </button>
                      </span>
                    ))
                  ) : (
                    <span style={{ fontSize: '12px', color: 'var(--text-dark-secondary)', fontStyle: 'italic' }}>Nessun drink registrato. Aggiungi il primo!</span>
                  )}
                </div>
              </div>

              {/* Pulsantiera Quick Add */}
              <div style={{ marginBottom: '15px' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-dark-secondary)', textTransform: 'uppercase', fontWeight: '600', display: 'block', marginBottom: '8px' }}>
                  Registra un drink (1-Tap):
                </span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {QUICK_DRINKS.map((preset, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleAddDrinkToActiveSession(preset)}
                      className="btn btn-secondary"
                      style={{ padding: '6px 12px', fontSize: '12px', borderRadius: '15px' }}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => setShowAllLiveDrinks((v) => !v)}
                  style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontSize: '12px', fontWeight: 700, marginTop: '8px' }}
                >
                  {showAllLiveDrinks ? '▲ Nascondi altri drink' : '▾ Altri drink (cocktail, distillati, birre…)'}
                </button>
                {showAllLiveDrinks && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px' }}>
                    {EXTRA_DRINKS.map((preset, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleAddDrinkToActiveSession(preset)}
                        className="btn btn-secondary"
                        style={{ padding: '6px 12px', fontSize: '12px', borderRadius: '15px', border: '1px solid var(--border-dark)' }}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Gestione Compagni (drank_with) con ricerca amici reale */}
              <div style={{ marginBottom: '15px', borderTop: '1px solid var(--border-dark)', paddingTop: '12px' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-dark-secondary)', textTransform: 'uppercase', fontWeight: '600', display: 'block', marginBottom: '6px' }}>
                  Tagga i compagni di bevuta:
                </span>

                <div style={{ position: 'relative', marginBottom: '10px' }}>
                  <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dark-secondary)' }} />
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Cerca un amico per nome o @username..."
                    value={friendQuery}
                    onChange={(e) => setFriendQuery(e.target.value)}
                    style={{ height: '34px', fontSize: '12px', padding: '0 10px 0 30px' }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        const val = friendQuery.trim();
                        if (val) addCompanion(val);
                      }
                    }}
                  />
                  {searchingFriends && (
                    <Loader size={13} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--primary)', animation: 'spin 1s linear infinite' }} />
                  )}

                  {/* Dropdown risultati */}
                  {friendQuery.trim().length >= 1 && (friendResults.length > 0 || (!searchingFriends)) && (
                    <div style={{ position: 'absolute', top: '38px', left: 0, right: 0, background: 'var(--surface-dark, #17181B)', border: '1px solid var(--border-dark)', borderRadius: '8px', zIndex: 50, maxHeight: '180px', overflowY: 'auto', boxShadow: '0 8px 20px rgba(0,0,0,0.4)' }}>
                      {friendResults.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => addCompanion(`${p.display_name || p.username} (@${p.username})`)}
                          style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', textAlign: 'left', padding: '8px 10px', background: 'none', border: 'none', borderBottom: '1px solid var(--border-dark)', cursor: 'pointer', color: '#FFF' }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255, 32, 0,0.08)'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
                        >
                          <span className="activity-avatar" style={{ width: '26px', height: '26px', fontSize: '12px', flexShrink: 0 }}>
                            {(p.display_name || p.username || 'U').charAt(0).toUpperCase()}
                          </span>
                          <span style={{ display: 'flex', flexDirection: 'column' }}>
                            <strong style={{ fontSize: '12px' }}>{p.display_name || p.username}</strong>
                            <span style={{ fontSize: '10px', color: 'var(--text-dark-secondary)' }}>@{p.username}</span>
                          </span>
                        </button>
                      ))}
                      {friendResults.length === 0 && !searchingFriends && (
                        <button
                          onClick={() => addCompanion(friendQuery.trim())}
                          style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dark-secondary)', fontSize: '12px' }}
                        >
                          Nessun atleta registrato. Tagga &quot;<strong style={{ color: '#FFF' }}>{friendQuery.trim()}</strong>&quot; come ospite ↵
                        </button>
                      )}
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {activeSession.drank_with?.map((friend, idx) => (
                    <span key={idx} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-dark)', padding: '3px 8px', borderRadius: '15px', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      {friend}
                      <button
                        onClick={async () => {
                          const updated = activeSession.drank_with.filter((_, i) => i !== idx);
                          setActiveSession(prev => ({ ...prev, drank_with: updated }));
                          await db.updateActivity(activeSession.id, { drank_with: updated });
                        }}
                        style={{ color: 'var(--error)', cursor: 'pointer', border: 'none', background: 'none', fontWeight: 'bold' }}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>

              {/* Foto della sessione live */}
              <div style={{ marginBottom: '15px', borderTop: '1px solid var(--border-dark)', paddingTop: '12px' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-dark-secondary)', textTransform: 'uppercase', fontWeight: '600', display: 'block', marginBottom: '8px' }}>
                  Foto della serata:
                </span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                  {activeSession.media?.filter(m => m.type === 'image').map((med, idx) => (
                    <div key={idx} style={{ position: 'relative', width: '60px', height: '60px', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border-dark)' }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={med.url} alt={med.name || 'foto'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      <button
                        onClick={async () => {
                          const updated = (activeSession.media || []).filter((_, i) => i !== idx);
                          setActiveSession(prev => ({ ...prev, media: updated }));
                          await db.updateActivity(activeSession.id, { media: updated });
                        }}
                        style={{ position: 'absolute', top: '2px', right: '2px', background: 'rgba(0,0,0,0.6)', color: '#FFF', border: 'none', borderRadius: '50%', width: '18px', height: '18px', fontSize: '12px', cursor: 'pointer', lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  <label
                    style={{ width: '60px', height: '60px', borderRadius: '8px', border: '1px dashed var(--border-dark)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: photoUploading ? 'wait' : 'pointer', color: 'var(--text-dark-secondary)', gap: '2px' }}
                  >
                    {photoUploading ? (
                      <Loader size={18} style={{ animation: 'spin 1s linear infinite', color: 'var(--primary)' }} />
                    ) : (
                      <>
                        <Camera size={18} />
                        <span style={{ fontSize: '9px' }}>Aggiungi</span>
                      </>
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={handleAddSessionPhoto}
                      disabled={photoUploading}
                      style={{ display: 'none' }}
                    />
                  </label>
                </div>
              </div>

              {/* Toggle Form Termina */}
              {!showCloseForm ? (
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => setShowCloseForm(true)}
                    className="btn btn-primary"
                    style={{ flex: 1, borderRadius: '20px', padding: '8px', fontSize: '14px', fontWeight: 'bold' }}
                  >
                    Termina Allenamento 🏁
                  </button>
                  <button
                    onClick={handleCancelActiveSession}
                    className="btn btn-secondary"
                    title="Annulla la sessione senza salvarla"
                    style={{ borderRadius: '20px', padding: '8px 14px', fontSize: '13px', color: 'var(--error)', flexShrink: 0 }}
                  >
                    <Trash2 size={15} /> Annulla
                  </button>
                </div>
              ) : (
                <form onSubmit={handleCloseActiveSession} style={{ borderTop: '1px solid var(--border-dark)', paddingTop: '15px', marginTop: '15px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: '11px', color: 'var(--text-dark-secondary)', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Stato d&apos;animo</label>
                      <select name="feeling" className="form-control" style={{ height: '36px', fontSize: '13px', padding: '0 8px' }}>
                        <option value="Sobrio">Sobrio</option>
                        <option value="Allegro">Allegro</option>
                        <option value="Brillo Felice">Brillo Felice</option>
                        <option value="Intenditore">Intenditore</option>
                        <option value="Molto Caldo">Molto Caldo 🔥</option>
                        <option value="Pieno Raso">Pieno Raso 💀</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label style={{ fontSize: '11px', color: 'var(--text-dark-secondary)', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Note sulla sessione</label>
                    <textarea name="description" className="form-control" placeholder="Com'è andata la serata? Racconta..." rows={2} style={{ fontSize: '13px', resize: 'none' }} />
                  </div>
                  <div style={{ display: 'flex', gap: '10px', marginTop: '5px' }}>
                    <button type="button" onClick={() => setShowCloseForm(false)} className="btn btn-secondary" style={{ flex: 1, borderRadius: '20px', fontSize: '13px', padding: '6px' }}>
                      Annulla
                    </button>
                    <button type="submit" className="btn btn-primary" style={{ flex: 2, borderRadius: '20px', fontSize: '13px', padding: '6px', fontWeight: 'bold' }}>
                      Salva e Chiudi
                    </button>
                  </div>
                </form>
              )}
            </div>
          ) : null
        ) : (
          <div className="card" style={{ padding: '24px', background: 'linear-gradient(135deg, rgba(255, 32, 0, 0.1) 0%, rgba(22, 24, 34, 1) 100%)', border: '1px solid var(--border-dark)', textAlign: 'center', marginBottom: '10px' }}>
            <h2 style={{ fontSize: '22px', fontWeight: '800', marginBottom: '10px' }}>🍻 Unisciti alla Community di Strabar!</h2>
            <p style={{ color: 'var(--text-dark-secondary)', fontSize: '15px', marginBottom: '20px', maxWidth: '500px', margin: '0 auto 20px auto' }}>
              Registra le tue bevute, sfida i tuoi amici in classifica e pianifica i tuoi percorsi preferiti.
            </p>
            <Link href="/auth" className="btn btn-primary">
              Crea un Account Gratuito
            </Link>
          </div>
        )}

        {/* Filtro feed: Amici / Tutti */}
        {currentUser && activities.length > 0 && (
          <div className="seg-tabs feed-filter-tabs" style={{ marginTop: '20px', marginBottom: '12px', maxWidth: '280px' }}>
            <div
              className={`seg-tab ${feedFilter === 'friends' ? 'active' : ''}`}
              onClick={() => setFeedFilter('friends')}
            >
              👥 Amici
            </div>
            <div
              className={`seg-tab ${feedFilter === 'all' ? 'active' : ''}`}
              onClick={() => setFeedFilter('all')}
            >
              🌍 Tutti
            </div>
          </div>
        )}

        {visibleActivities.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '40px' }}>
            {feedFilter === 'friends' ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px' }}>
                <p style={{ color: 'var(--text-dark-secondary)' }}>
                  Nessuna sessione dai tuoi amici. Invitali su Strabar, oppure passa a <strong style={{ color: 'var(--primary)', cursor: 'pointer' }} onClick={() => setFeedFilter('all')}>🌍 Tutti</strong>.
                </p>
                <ShareAppButton style={{ borderRadius: '24px', padding: '11px 22px' }} label="Invita amici su Strabar" />
              </div>
            ) : (
              <p style={{ color: 'var(--text-dark-secondary)' }}>Nessuna attività registrata. Sii il primo a brindare! 🥂</p>
            )}
          </div>
        ) : (
          visibleActivities.map((act) => {
            const hasCheered = act.cheers?.includes(currentUser?.id);
            const isReallyActive = act.is_active && (new Date().getTime() - new Date(act.created_at).getTime() < 5 * 60 * 60 * 1000);
            return (
              <article 
                key={act.id} 
                className="card activity-card"
                style={{ cursor: 'pointer' }}
                onClick={(e) => {
                  // Non aprire il dettaglio se si interagisce con controlli (bottoni, link, form, sezione commenti)
                  if (
                    !['BUTTON', 'A', 'INPUT', 'TEXTAREA', 'SELECT', 'LABEL', 'FORM'].includes(e.target.tagName) &&
                    !e.target.closest('button') &&
                    !e.target.closest('a') &&
                    !e.target.closest('input') &&
                    !e.target.closest('form') &&
                    !e.target.closest('[data-no-open]')
                  ) {
                    handleOpenActivity(act);
                  }
                }}
              >
                <div className="activity-header" style={{ gap: '12px' }}>
                  <Link href={`/u/${act.user_id}`} style={{ flexShrink: 0 }}>
                    <Avatar src={act.profiles?.avatar_url} name={act.profiles?.display_name || act.profiles?.username} size={44} />
                  </Link>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="activity-author">
                      <Link href={`/u/${act.user_id}`} style={{ color: 'inherit' }}>
                        {act.profiles?.display_name || 'Utente Strabar'}
                      </Link>
                      {act.profiles?.is_premium && (
                        <span className="badge-premium" style={{ marginLeft: '8px', fontSize: '8px' }}>
                          Premium
                        </span>
                      )}
                    </div>
                    <div className="activity-meta" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {formatDate(act.created_at)} · <strong style={{ color: 'var(--primary)' }}>{act.feeling}</strong>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px', flexShrink: 0 }}>
                    {isReallyActive && (
                      <span className="pulse" style={{ color: 'var(--primary)', fontWeight: '800', fontSize: '10px', display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'rgba(255, 32, 0, 0.1)', padding: '2px 6px', borderRadius: '10px', border: '1px solid var(--primary)' }}>
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--primary)', display: 'inline-block' }} />
                        LIVE 🔴
                      </span>
                    )}
                    {currentUser && act.user_id !== currentUser.id && (
                      <button
                        onClick={() => handleToggleFollow(act.user_id)}
                        disabled={followBusy[act.user_id]}
                        className={`btn ${followingIds.includes(act.user_id) ? 'btn-secondary' : 'btn-primary'}`}
                        style={{ padding: '5px 12px', fontSize: '12px', borderRadius: '16px', fontWeight: '700', whiteSpace: 'nowrap' }}
                      >
                        {followingIds.includes(act.user_id) ? 'Segui ✓' : '+ Segui'}
                      </button>
                    )}
                  </div>
                </div>

                <h2 className="activity-title" style={{ cursor: 'pointer' }} onClick={() => handleOpenActivity(act)}>{act.title}</h2>
                {act.description && (
                  <p style={{ color: 'var(--text-dark-primary)', fontSize: '15px', marginBottom: '16px', lineHeight: '1.5', cursor: 'pointer' }} onClick={() => handleOpenActivity(act)}>
                    {act.description}
                  </p>
                )}

                <div className="activity-stats">
                  <div className="stat-box">
                    <span className="stat-label">Drink Totali</span>
                    <span className="stat-value highlight">
                      {act.drinks.reduce((acc, d) => acc + d.qty, 0)}
                    </span>
                  </div>
                  <div className="stat-box">
                    <span className="stat-label">Tempo a Tavola</span>
                    <span className="stat-value">
                      {fmtEffort(act)}
                    </span>
                  </div>
                  <div className="stat-box">
                    <span className="stat-label">Carico (U.A.)</span>
                    <span className="stat-value highlight">
                      {act.total_units} U.A.
                    </span>
                  </div>
                  <div className="stat-box">
                    <span className="stat-label">Tasso Alcolico Est.</span>
                    <span className="stat-value">
                      {(act.bac_level || 0).toFixed(2)} g/l
                    </span>
                  </div>
                </div>

                {/* Lista Drink taggati (raggruppati per quantità) */}
                <div className="activity-drinks-detail">
                  {groupDrinks(act.drinks).map((drink, idx) => (
                    <span key={idx} className="drink-tag">
                      <Beer size={12} />
                      {drink.qty}x {drink.name} ({drink.abv}%)
                    </span>
                  ))}
                </div>

                 {act.location && (
                   <div style={{ fontSize: '13px', color: 'var(--primary)', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', cursor: 'pointer' }} onClick={() => handleOpenActivity(act)}>
                     <span>📍 presso <strong>{act.location.name}</strong></span>
                     {act.location.unverified && (
                       <span title="Registrata lontano dal locale: non conta per le classifiche" style={{ fontSize: '10px', color: 'var(--text-dark-secondary)', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-dark)', borderRadius: '10px', padding: '1px 7px', fontWeight: 600 }}>
                         non verificata
                       </span>
                     )}
                   </div>
                 )}

                 {/* Avanzamento del Tour visibile ai follower */}
                 {act.location?.tour && (() => {
                   const t = act.location.tour;
                   const stops = t.stops || [];
                   const cur = t.current || 0;
                   const total = stops.length || 1;
                   const pct = Math.min(100, ((cur + 1) / total) * 100);
                   const path = (t.visited || []).map((s) => s.name);
                   return (
                     <div data-no-open style={{ marginBottom: '12px', background: 'rgba(223, 255, 0,0.05)', border: '1px solid rgba(223, 255, 0,0.2)', borderRadius: '10px', padding: '10px 12px', cursor: 'pointer' }} onClick={() => handleOpenActivity(act)}>
                       <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', gap: '6px', flexWrap: 'wrap' }}>
                         <strong style={{ fontSize: '12px', color: 'var(--secondary)' }}>🗺️ Tour: {t.route_name}</strong>
                         <span style={{ fontSize: '11px', color: 'var(--text-dark-secondary)', fontWeight: 700 }}>
                           {isReallyActive ? `Tappa ${cur + 1}/${total}` : `${path.length}/${total} tappe`}
                         </span>
                       </div>
                       <div style={{ height: '5px', background: 'rgba(255,255,255,0.08)', borderRadius: '4px', overflow: 'hidden', marginBottom: path.length ? '6px' : 0 }}>
                         <div style={{ width: `${pct}%`, height: '100%', background: 'var(--secondary)', transition: 'width 0.3s' }} />
                       </div>
                       {path.length > 0 && (
                         <div style={{ fontSize: '11px', color: 'var(--text-dark-secondary)', lineHeight: 1.4 }}>
                           {path.map((name, i) => (
                             <span key={i} style={i === cur && isReallyActive ? { color: 'var(--secondary)', fontWeight: 700 } : undefined}>
                               {name}{i < path.length - 1 ? ' ➔ ' : ''}
                             </span>
                           ))}
                         </div>
                       )}
                     </div>
                   );
                 })()}

                 {(() => {
                   const images = act.media?.filter(m => m.type === 'image') || [];
                   const otherMedia = act.media?.filter(m => m.type !== 'image') || [];
                   const activeSlideIdx = feedSlideIndices[act.id] || 0;
                   if (images.length === 0 && otherMedia.length === 0) return null;
                   
                   return (
                     <div style={{ marginBottom: '15px' }}>
                       {images.length > 0 && (
                         <div style={{ position: 'relative', width: '100%', height: '220px', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border-dark)', marginBottom: otherMedia.length > 0 ? '8px' : '0' }}>
                           {/* Active image */}
                           <div style={{
                             width: '100%',
                             height: '100%',
                             backgroundImage: `url(${images[activeSlideIdx]?.url})`,
                             backgroundSize: 'cover',
                             backgroundPosition: 'center',
                             transition: 'background-image 0.2s ease-in-out'
                           }} />
                           
                           {/* Overlay index */}
                           <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.8) 0%, transparent 100%)', padding: '12px 16px', color: '#FFF', display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 2 }}>
                             <span style={{ fontSize: '13px', fontWeight: '600' }}>
                               {`Ricordo ${activeSlideIdx + 1}`}
                             </span>
                             <span style={{ fontSize: '11px', fontWeight: '600', background: 'rgba(0,0,0,0.5)', padding: '2px 6px', borderRadius: '10px' }}>
                               {activeSlideIdx + 1} / {images.length}
                             </span>
                           </div>

                           {/* Arrows */}
                           {images.length > 1 && (
                             <>
                               <button
                                 type="button"
                                 onClick={() => handlePrevSlide(act.id, images.length)}
                                 style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.6)', border: 'none', color: '#FFF', width: '30px', height: '30px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontWeight: 'bold', fontSize: '16px', zIndex: 3 }}
                               >
                                 ‹
                               </button>
                               <button
                                 type="button"
                                 onClick={() => handleNextSlide(act.id, images.length)}
                                 style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.6)', border: 'none', color: '#FFF', width: '30px', height: '30px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontWeight: 'bold', fontSize: '16px', zIndex: 3 }}
                               >
                                 ›
                               </button>
                             </>
                           )}
                         </div>
                       )}

                       {/* Non-image files */}
                       {otherMedia.length > 0 && (
                         <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                           {otherMedia.map((med, idx) => (
                             <span key={idx} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-dark)', padding: '4px 10px', borderRadius: '20px', fontSize: '12px', color: '#FFF', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                               {med.type === 'video' ? '🎥' : med.type === 'audio' ? '🎵' : '📎'} {med.name}
                             </span>
                           ))}
                         </div>
                       )}
                     </div>
                   );
                 })()}

                {renderCompanionsList(act)}

                {/* Chi ha messo Cheers (nel feed, senza aprire il dettaglio) */}
                {act.cheers && act.cheers.length > 0 && (() => {
                  const people = act.cheers.map((uid) => {
                    const p = profilesList.find((pr) => pr.id === uid);
                    return { id: uid, name: uid === currentUser?.id ? 'Tu' : (p?.display_name || p?.username || 'Atleta') };
                  });
                  const shown = people.slice(0, 3);
                  const extra = people.length - shown.length;
                  return (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--text-dark-secondary)', marginBottom: '4px', flexWrap: 'wrap' }}>
                      <Beer size={13} style={{ color: 'var(--primary)', flexShrink: 0 }} fill="var(--primary)" />
                      <span>
                        Cheers di{' '}
                        {shown.map((p, i) => (
                          <span key={p.id}>
                            <Link href={`/u/${p.id}`} style={{ color: '#FFF', fontWeight: 600 }}>{p.name}</Link>
                            {i < shown.length - 1 ? ', ' : ''}
                          </span>
                        ))}
                        {extra > 0 && (
                          <>
                            {' '}e{' '}
                            <button
                              onClick={() => { setCheersListActivity(act); setShowCheersList(true); }}
                              style={{ color: 'var(--primary)', fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: '13px' }}
                            >
                              altri {extra}
                            </button>
                          </>
                        )}
                      </span>
                    </div>
                  );
                })()}

                {/* Actions (Cheers, Commenta, Condividi) */}
                <div className="activity-actions">
                  <button 
                    onClick={() => handleCheers(act.id)} 
                    className={`action-btn ${hasCheered ? 'active' : ''}`}
                  >
                    <Beer size={18} fill={hasCheered ? 'var(--primary)' : 'none'} />
                    <span>Cheers ({act.cheers?.length || 0})</span>
                  </button>

                  <button onClick={() => toggleCommentsSection(act.id)} className="action-btn">
                    <MessageSquare size={18} />
                    <span>Commenta ({act.comments?.length || 0})</span>
                  </button>

                  <Link href={`/share/${act.id}`} className="action-btn">
                    <Share2 size={18} />
                    <span className="action-btn-label-long">Esporta Social</span>
                    <span className="action-btn-label-short" style={{ display: 'none' }}>Esporta</span>
                  </Link>

                  {currentUser && act.user_id === currentUser.id && (
                    <button onClick={() => handleEditActivity(act)} className="action-btn">
                      <Edit size={18} />
                      <span>Modifica</span>
                    </button>
                  )}
                </div>

                {/* Comments Section */}
                {activeCommentsSection[act.id] && (
                  <div data-no-open onClick={(e) => e.stopPropagation()} style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border-dark)' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '15px' }}>
                      {act.comments && act.comments.map((comment) => (
                        <div key={comment.id} style={{ display: 'flex', gap: '10px', fontSize: '14px', background: 'rgba(255,255,255,0.02)', padding: '10px', borderRadius: '8px' }}>
                          <div className="activity-avatar" style={{ width: '28px', height: '28px', fontSize: '12px' }}>
                            {comment.user_name ? comment.user_name.charAt(0) : 'U'}
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                              <strong>{comment.user_name}</strong>
                              <span style={{ fontSize: '11px', color: 'var(--text-dark-secondary)' }}>
                                {formatDate(comment.created_at)}
                              </span>
                            </div>
                            <p style={{ color: 'var(--text-dark-primary)' }}>{comment.text}</p>
                          </div>
                        </div>
                      ))}
                    </div>

                    {currentUser ? (
                      <form onSubmit={(e) => handleCommentSubmit(e, act.id)} style={{ display: 'flex', gap: '10px' }}>
                        <input
                          type="text"
                          className="form-control"
                          placeholder="Scrivi un commento di incoraggiamento..."
                          value={newCommentText[act.id] || ''}
                          onChange={(e) => handleCommentChange(act.id, e.target.value)}
                          style={{ height: '40px', padding: '10px 15px', borderRadius: '20px', fontSize: '14px' }}
                          required
                        />
                        <button type="submit" className="btn btn-primary" style={{ padding: '0 20px', borderRadius: '20px', fontSize: '14px' }}>
                          Invia
                        </button>
                      </form>
                    ) : (
                      <p style={{ fontSize: '13px', color: 'var(--text-dark-secondary)', textAlign: 'center' }}>
                        <Link href="/auth" style={{ color: 'var(--primary)', fontWeight: '600' }}>Accedi</Link> per commentare questa attività.
                      </p>
                    )}
                  </div>
                )}
              </article>
            );
          })
        )}

        {/* Scroll infinito: il sentinel carica automaticamente altre attività */}
        {feedHasMore && visibleActivities.length > 0 && (
          <div ref={loadMoreRef} style={{ display: 'flex', justifyContent: 'center', padding: '14px' }}>
            {feedLoadingMore ? (
              <Loader size={20} style={{ color: 'var(--primary)', animation: 'spin 1s linear infinite' }} />
            ) : (
              <button onClick={loadMoreFeed} className="btn btn-secondary" style={{ borderRadius: '14px', padding: '8px 16px', fontSize: '13px' }}>
                Carica altre
              </button>
            )}
          </div>
        )}
      </div>

      {/* Colonna Destra: Sidebar Statistiche e Leaderboard */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* Invita amici */}
        <div className="card" style={{ border: '1px solid var(--primary)', background: 'linear-gradient(135deg, rgba(22,24,34,1) 0%, rgba(255, 32, 0,0.08) 100%)', textAlign: 'center' }}>
          <h3 style={{ fontSize: '16px', fontWeight: '800', marginBottom: '6px' }}>📲 Invita i tuoi amici</h3>
          <p style={{ fontSize: '13px', color: 'var(--text-dark-secondary)', marginBottom: '14px', lineHeight: 1.4 }}>
            Strabar è più divertente in compagnia: condividi l&apos;app e sfidatevi in classifica!
          </p>
          <ShareAppButton style={{ width: '100%', borderRadius: '24px', padding: '12px' }} label="Condividi Strabar" />
        </div>

        {/* Widget Profilo Rapido */}
        {currentUser && (
          <div className="card">
            <h3 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <User size={18} color="var(--primary)" />
              Attività Recente
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-dark)', paddingBottom: '10px' }}>
                <span style={{ color: 'var(--text-dark-secondary)', fontSize: '14px' }}>Sessioni (7gg)</span>
                <strong style={{ fontSize: '16px' }}>{weeklyStreak}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-dark)', paddingBottom: '10px' }}>
                <span style={{ color: 'var(--text-dark-secondary)', fontSize: '14px' }}>Drink Totali</span>
                <strong style={{ fontSize: '16px' }}>{totalDrinksCount}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-dark-secondary)', fontSize: '14px' }}>Stato Premium</span>
                <strong>
                  {currentUser.is_premium ? (
                    <span style={{ color: 'var(--secondary)', fontWeight: '700', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Award size={14} /> Attivo
                    </span>
                  ) : (
                    <Link href="/premium" style={{ color: 'var(--primary)', fontWeight: '600', fontSize: '14px' }}>
                      Attiva
                    </Link>
                  )}
                </strong>
              </div>
            </div>
            <div style={{ marginTop: '20px' }}>
              <Link href="/profile" className="btn btn-secondary" style={{ width: '100%', borderRadius: '20px', padding: '8px 0', fontSize: '13px' }}>
                <Calendar size={14} /> Vedi Calendario
              </Link>
            </div>
          </div>
        )}

        {/* Widget Classifica */}
        <div className="card">
          <h3 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Trophy size={18} color="var(--secondary)" />
            Leaderboard Club 🏆
          </h3>
          <p style={{ fontSize: '12px', color: 'var(--text-dark-secondary)', marginBottom: '15px' }}>
            Classifica settimanale basata sulle Unità Alcoliche (U.A.) registrate.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {leaderboardData.map((item, idx) => (
              <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: item.name === currentUser?.display_name ? 'rgba(255, 32, 0, 0.08)' : 'rgba(255,255,255,0.01)', borderRadius: '8px', border: item.name === currentUser?.display_name ? '1px dashed var(--primary)' : '1px solid transparent' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '14px', fontWeight: '800', width: '20px', color: idx === 0 ? 'var(--secondary)' : 'var(--text-dark-secondary)' }}>
                    #{idx + 1}
                  </span>
                  <span style={{ fontSize: '14px', fontWeight: '600' }}>
                    {item.name}
                    {item.isPremium && (
                      <span className="badge-premium" style={{ fontSize: '7px', padding: '1px 4px', marginLeft: '5px' }}>
                        P
                      </span>
                    )}
                  </span>
                </div>
                <strong style={{ fontSize: '14px', color: idx === 0 ? 'var(--secondary)' : 'inherit' }}>
                  {item.units} U.A.
                </strong>
              </div>
            ))}
          </div>
        </div>

        {/* Sfide & Premi Strabar */}
        <div className="card" style={{ background: 'linear-gradient(135deg, rgba(22, 24, 34, 1) 0%, rgba(255, 32, 0, 0.05) 100%)', border: '1px solid var(--border-dark)', display: 'flex', flexDirection: 'column', gap: '15px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid var(--border-dark)', paddingBottom: '10px', margin: 0 }}>
            <Trophy size={18} color="var(--secondary)" />
            Sfide & Premi Atleta 🏆
          </h3>

          {!currentUser ? (
            <div style={{ textAlign: 'center', padding: '10px 0' }}>
              <p style={{ fontSize: '12px', color: 'var(--text-dark-secondary)', marginBottom: '12px' }}>
                Accedi per tracciare le tue sfide e sbloccare badge esclusivi sul tuo profilo.
              </p>
              <Link href="/auth" className="btn btn-secondary" style={{ fontSize: '12px', padding: '6px 12px' }}>
                Accedi a Strabar
              </Link>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              
              {/* Sfida 1: Giro d'Italia (Tour Alcolici) */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong style={{ fontSize: '13px', color: '#FFF' }}>🇮🇹 Giro d&apos;Italia</strong>
                  <span style={{ fontSize: '11px', color: 'var(--secondary)', fontWeight: '700' }}>{toursCompleted}/3 Tour</span>
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-dark-secondary)' }}>Completa 3 tour alcolici questo mese</div>
                <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{ width: `${Math.min((toursCompleted / 3) * 100, 100)}%`, height: '100%', background: 'var(--secondary)', borderRadius: '3px' }} />
                </div>
                <div style={{ fontSize: '10px', color: toursCompleted >= 3 ? 'var(--success)' : 'var(--text-dark-secondary)', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                  <Award size={10} /> Premio: {toursCompleted >= 3 ? '🏆 Gomito di Bronzo (SBLOCCATO)' : '🏆 Gomito di Bronzo'}
                </div>
              </div>

              {/* Sfida 2: Resistenza Settimanale */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong style={{ fontSize: '13px', color: '#FFF' }}>🏋️ Resistenza Settimanale</strong>
                  <span style={{ fontSize: '11px', color: 'var(--primary)', fontWeight: '700' }}>{weeklyUnits.toFixed(1)}/10 U.A.</span>
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-dark-secondary)' }}>Consuma 10 U.A. negli ultimi 7 giorni</div>
                <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{ width: `${Math.min((weeklyUnits / 10) * 100, 100)}%`, height: '100%', background: 'var(--primary)', borderRadius: '3px' }} />
                </div>
                <div style={{ fontSize: '10px', color: weeklyUnits >= 10 ? 'var(--success)' : 'var(--text-dark-secondary)', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                  <Award size={10} /> Premio: {weeklyUnits >= 10 ? '🏋️ Gomito d&apos;Acciaio (SBLOCCATO)' : '🏋️ Gomito d&apos;Acciaio'}
                </div>
              </div>

              {/* Sfida 3: Esploratore di Bar */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong style={{ fontSize: '13px', color: '#FFF' }}>🗺️ Esploratore di Locali</strong>
                  <span style={{ fontSize: '11px', color: '#10B981', fontWeight: '700' }}>{uniqueBarsVisited}/5 Bar</span>
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-dark-secondary)' }}>Fai check-in in 5 diversi locali</div>
                <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{ width: `${Math.min((uniqueBarsVisited / 5) * 100, 100)}%`, height: '100%', background: '#10B981', borderRadius: '3px' }} />
                </div>
                <div style={{ fontSize: '10px', color: uniqueBarsVisited >= 5 ? 'var(--success)' : 'var(--text-dark-secondary)', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                  <Award size={10} /> Premio: {uniqueBarsVisited >= 5 ? '🗺️ Bussola del Bevitore (SBLOCCATO)' : '🗺️ Bussola del Bevitore'}
                </div>
              </div>

              {/* Sfida 4: Bere Responsabile (Limite Giornaliero) */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong style={{ fontSize: '13px', color: '#FFF' }}>🛡️ Bere Responsabile</strong>
                  <span style={{ fontSize: '11px', color: todayUnits > 4 ? 'var(--error)' : 'var(--success)', fontWeight: '700' }}>
                    {todayUnits.toFixed(1)}/4.0 U.A.
                  </span>
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-dark-secondary)' }}>Rimani sotto le 4.0 U.A. oggi</div>
                <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{ width: `${Math.min((todayUnits / 4) * 100, 100)}%`, height: '100%', background: todayUnits > 4 ? 'var(--error)' : 'var(--success)', borderRadius: '3px' }} />
                </div>
                <div style={{ fontSize: '10px', color: (todayUnits > 0 && todayUnits <= 4) ? 'var(--success)' : 'var(--text-dark-secondary)', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                  <Award size={10} /> Premio: {(todayUnits > 0 && todayUnits <= 4) ? '🛡️ Scudo del Moderatore (ATTIVO)' : todayUnits > 4 ? '❌ Superato limite oggi' : '🛡️ Scudo del Moderatore'}
                </div>
              </div>

            </div>
          )}
          
          <Link href="/routes" className="btn btn-primary" style={{ width: '100%', borderRadius: '20px', padding: '8px 0', fontSize: '13px', textAlign: 'center' }}>
            Trova Percorsi & Tour
          </Link>
        </div>
      </div>

      {/* MODAL DETTAGLI ATTIVITA */}
      {selectedActivity && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0, 0, 0, 0.85)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px', backdropFilter: 'blur(8px)' }} onClick={() => setSelectedActivity(null)}>
          <div className="card" style={{ width: '100%', maxWidth: '650px', maxHeight: '90vh', overflowY: 'auto', background: '#0B0A09', border: '2px solid var(--primary)', boxShadow: '0px 0px 30px rgba(255, 32, 0, 0.25)', animation: 'slideUp 0.3s ease', position: 'relative' }} onClick={(e) => e.stopPropagation()}>
            
            {/* Header del Modal */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '20px', borderBottom: '1px solid var(--border-dark)', paddingBottom: '15px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <Avatar src={selectedActivity.profiles?.avatar_url} name={selectedActivity.profiles?.display_name || selectedActivity.profiles?.username} size={45} style={{ border: '2px solid var(--primary)' }} />
                <div>
                  <h4 style={{ fontSize: '16px', fontWeight: '700', margin: 0, display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    {selectedActivity.profiles?.display_name || 'Atleta Strabar'}
                    {isLiveAct(selectedActivity) && (
                      <span className="pulse" style={{ color: 'var(--primary)', fontWeight: 800, fontSize: '10px', display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'rgba(255, 32, 0, 0.1)', padding: '2px 7px', borderRadius: '10px', border: '1px solid var(--primary)' }}>
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--primary)', display: 'inline-block' }} /> LIVE 🔴
                      </span>
                    )}
                  </h4>
                  <span style={{ fontSize: '12px', color: 'var(--text-dark-secondary)' }}>{formatDate(selectedActivity.created_at)}</span>
                </div>
              </div>
              <button className="btn btn-secondary" style={{ padding: '4px 10px', borderRadius: '50%', minWidth: '32px', height: '32px' }} onClick={() => setSelectedActivity(null)}>×</button>
            </div>

            {/* Slideshow Copertina Attività (se ci sono immagini) */}
            {(() => {
              const images = selectedActivity.media?.filter(m => m.type === 'image') || [];
              if (images.length === 0) return null;
              return (
                <div style={{ position: 'relative', width: '100%', height: '260px', borderRadius: '12px', overflow: 'hidden', marginBottom: '20px', border: '1px solid var(--border-dark)' }}>
                  {/* Immagine Attiva */}
                  <div style={{
                    width: '100%',
                    height: '100%',
                    backgroundImage: `url(${images[currentSlideIndex]?.url})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    transition: 'background-image 0.2s ease-in-out'
                  }} />
                  
                  {/* Nome e contatore Overlay */}
                  <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.9) 0%, transparent 100%)', padding: '20px', color: '#FFF', display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 2 }}>
                    <span style={{ fontSize: '14px', fontWeight: '700' }}>
                      {`Immagine ${currentSlideIndex + 1}`}
                    </span>
                    <span style={{ fontSize: '12px', fontWeight: '600', background: 'rgba(0,0,0,0.5)', padding: '3px 8px', borderRadius: '20px' }}>
                      {currentSlideIndex + 1} / {images.length}
                    </span>
                  </div>

                  {/* Frecce Navigazione */}
                  {images.length > 1 && (
                    <>
                      <button
                        type="button"
                        onClick={() => setCurrentSlideIndex(prev => (prev === 0 ? images.length - 1 : prev - 1))}
                        style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.6)', border: 'none', color: '#FFF', width: '36px', height: '36px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontWeight: 'bold', fontSize: '18px', zIndex: 3 }}
                      >
                        ‹
                      </button>
                      <button
                        type="button"
                        onClick={() => setCurrentSlideIndex(prev => (prev === images.length - 1 ? 0 : prev + 1))}
                        style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.6)', border: 'none', color: '#FFF', width: '36px', height: '36px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontWeight: 'bold', fontSize: '18px', zIndex: 3 }}
                      >
                        ›
                      </button>
                    </>
                  )}
                </div>
              );
            })()}

            {/* Titolo e Descrizione */}
            <h2 style={{ fontSize: '26px', fontWeight: '800', color: '#FFF', marginBottom: '10px' }}>{selectedActivity.title}</h2>
            {selectedActivity.description && (
              <p style={{ color: 'var(--text-dark-primary)', fontSize: '16px', lineHeight: '1.6', marginBottom: '20px', background: 'rgba(255, 255, 255, 0.02)', padding: '12px', borderRadius: '8px', borderLeft: '3px solid var(--primary)' }}>
                {selectedActivity.description}
              </p>
            )}

            {/* Performance Stats */}
            <div className="r-grid-stat-4" style={{ marginBottom: '25px', background: 'rgba(255, 32, 0, 0.04)', padding: '15px', borderRadius: '12px', border: '1px solid rgba(255, 32, 0, 0.15)' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-dark-secondary)', fontWeight: '600', textTransform: 'uppercase' }}>Drink Totali</div>
                <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--primary)', marginTop: '5px' }}>
                  {selectedActivity.drinks.reduce((acc, d) => acc + d.qty, 0)}
                </div>
              </div>
              <div style={{ textAlign: 'center', borderLeft: '1px solid var(--border-dark)' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-dark-secondary)', fontWeight: '600', textTransform: 'uppercase' }}>Tempo Sforzo</div>
                <div style={{ fontSize: '20px', fontWeight: '800', color: '#FFF', marginTop: '8px' }}>
                  {fmtEffort(selectedActivity)}
                </div>
              </div>
              <div style={{ textAlign: 'center', borderLeft: '1px solid var(--border-dark)' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-dark-secondary)', fontWeight: '600', textTransform: 'uppercase' }}>Carico Alcolico</div>
                <div style={{ fontSize: '22px', fontWeight: '800', color: 'var(--secondary)', marginTop: '5px' }}>
                  {totalU.toFixed(1)} <span style={{ fontSize: '12px', fontWeight: '600' }}>U.A.</span>
                </div>
              </div>
              <div style={{ textAlign: 'center', borderLeft: '1px solid var(--border-dark)' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-dark-secondary)', fontWeight: '600', textTransform: 'uppercase' }}>BAC Stimato</div>
                <div style={{ fontSize: '22px', fontWeight: '800', color: derivedBac > 0.5 ? 'var(--error)' : 'var(--success)', marginTop: '5px' }}>
                  {derivedBac.toFixed(2)} <span style={{ fontSize: '12px', fontWeight: '600' }}>g/l</span>
                </div>
              </div>
            </div>

            {/* TIMELINE CURVA BAC */}
            <div style={{ marginBottom: '25px', background: 'rgba(255, 32, 0, 0.02)', border: '1px solid var(--border-dark)', padding: '16px', borderRadius: '8px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: '700', marginBottom: '8px', color: '#FFF', display: 'flex', alignItems: 'center', gap: '8px' }}>
                📈 Curva d&apos;Ebbrezza (Assorbimento &amp; Smaltimento Widmark)
              </h3>
              {/* Nota: curva della singola sessione */}
              <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-start', background: 'rgba(223, 255, 0,0.05)', border: '1px solid rgba(223, 255, 0,0.15)', borderRadius: '6px', padding: '7px 10px', marginBottom: '12px' }}>
                <span style={{ fontSize: '12px', flexShrink: 0 }}>ℹ️</span>
                <p style={{ fontSize: '11px', color: 'var(--text-dark-secondary)', margin: 0, lineHeight: 1.4 }}>
                  {selectedActivity?.is_active && (Date.now() - new Date(selectedActivity.created_at).getTime()) < 5 * 60 * 60 * 1000
                    ? <><strong style={{ color: 'var(--primary)' }}>Sessione LIVE in corso.</strong> Il BAC è calcolato in tempo reale al momento attuale.</>
                    : <><strong style={{ color: 'var(--secondary)' }}>Curva storica di questa singola sessione.</strong> Il BAC mostrato rappresenta il picco stimato al termine della sessione, non adesso. (L&apos;alcol è già smaltito.)</>}
                </p>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative', padding: '10px 0' }}>
                <div style={{ position: 'absolute', top: '24px', left: '20px', right: '20px', height: '3px', background: 'linear-gradient(90deg, var(--success) 0%, var(--primary) 50%, var(--error) 100%)', zIndex: 1 }} />
                
                {bacTimeline.map((pt, idx) => (
                  <div key={idx} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 2, flex: 1 }}>
                    <span style={{ fontSize: '11px', color: 'var(--text-dark-secondary)', fontWeight: '600' }}>{pt.label}</span>
                    <div style={{ 
                      width: '18px', 
                      height: '18px', 
                      borderRadius: '50%', 
                      background: pt.val > 0.8 ? 'var(--error)' : pt.val > 0.5 ? 'var(--primary)' : 'var(--success)', 
                      border: '3px solid #000',
                      boxShadow: '0 0 10px rgba(255, 32, 0,0.5)',
                      marginTop: '6px',
                      marginBottom: '6px'
                    }} />
                    <span style={{ fontSize: '12px', fontWeight: '800', color: pt.val > 0.5 ? 'var(--primary)' : '#FFF' }}>
                      {pt.val.toFixed(2)} <span style={{ fontSize: '9px', fontWeight: 'normal', color: 'var(--text-dark-secondary)' }}>g/l</span>
                    </span>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-dark-secondary)', marginTop: '8px' }}>
                <span>Inizio (Sobrio)</span>
                <span>Fase di Salita</span>
                <span>Fine Sforzo (Smaltimento fegato)</span>
              </div>
            </div>

            {/* SEZIONE MAPPA / INTEGRAZIONE LOCALE */}
            {selectedActivity.location && (
              <div style={{ marginBottom: '25px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: '700', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  📍 Sede del Brindisi (Mappe e Itinerario)
                </h3>
                <div style={{ background: 'var(--bg-input-dark)', border: '1px solid var(--border-dark)', borderRadius: '8px', padding: '15px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                    <div>
                      <strong style={{ color: '#FFF', fontSize: '15px' }}>{selectedActivity.location.name}</strong>
                      <div style={{ fontSize: '12px', color: 'var(--text-dark-secondary)', marginTop: '2px' }}>{selectedActivity.location.address}</div>
                    </div>
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selectedActivity.location.name + ' ' + selectedActivity.location.address)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-secondary"
                      style={{ padding: '6px 12px', fontSize: '12px', borderRadius: '6px' }}
                    >
                      Apri in Google Maps
                    </a>
                  </div>
                  
                  {/* Mappa Leaflet Reale ed Interattiva del percorso */}
                  <div style={{ height: '220px', width: '100%', borderRadius: '12px', overflow: 'hidden', position: 'relative' }}>
                    {(() => {
                      const tour = selectedActivity.location.tour;
                      let waypoints, activeIndex = null;
                      if (tour && Array.isArray(tour.stops)) {
                        // Tour: mostra tutte le tappe con coordinate, evidenziando quella corrente.
                        const stopsWithCoords = tour.stops
                          .map((s, i) => ({ name: s.name, lat: s.lat, lng: s.lng ?? s.lon, label: i + 1, note: i === (tour.current || 0) ? 'Qui ora 📍' : '' }))
                          .filter((s) => typeof s.lat === 'number' && typeof s.lng === 'number');
                        waypoints = stopsWithCoords;
                        activeIndex = stopsWithCoords.findIndex((s) => s.label === (tour.current || 0) + 1);
                      } else {
                        waypoints = selectedActivity.location.sequence && Array.isArray(selectedActivity.location.sequence)
                          ? selectedActivity.location.sequence
                          : [{
                              name: selectedActivity.location.name,
                              lat: selectedActivity.location.lat,
                              lng: selectedActivity.location.lng ?? selectedActivity.location.lon,
                              note: 'Partenza'
                            }];
                      }
                      return <RouteMap waypoints={waypoints} activeIndex={activeIndex >= 0 ? activeIndex : null} height="100%" connectLine={true} />;
                    })()}
                  </div>

                  {/* TOUR: drink divisi per tappa/locale */}
                  {(() => {
                    const perStop = tourDrinksByStop(selectedActivity);
                    if (!perStop) return null;
                    return (
                      <div style={{ marginTop: '15px', borderTop: '1px solid var(--border-dark)', paddingTop: '15px' }}>
                        <h4 style={{ fontSize: '14px', fontWeight: '800', color: 'var(--secondary)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          🗺️ Cosa ha bevuto, tappa per tappa
                        </h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                          {perStop.map((s, i) => (
                            <div key={i} style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-dark)', borderRadius: '8px', padding: '10px 12px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                                <span style={{ background: '#EF4444', color: '#fff', width: 20, height: 20, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, flexShrink: 0 }}>{i + 1}</span>
                                <strong style={{ fontSize: '13px', color: '#FFF' }}>{s.name}</strong>
                                {!s.verified && <span style={{ fontSize: '9px', color: 'var(--text-dark-secondary)', border: '1px solid var(--border-dark)', borderRadius: '8px', padding: '1px 6px' }}>non verificata</span>}
                              </div>
                              {s.drinks.length === 0 ? (
                                <span style={{ fontSize: '12px', color: 'var(--text-dark-secondary)' }}>Nessun drink registrato qui</span>
                              ) : (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                  {s.drinks.map((d, k) => (
                                    <span key={k} className="drink-tag"><Beer size={12} /> {d.qty}x {d.name}</span>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Classifiche del Locale — solo per locali reali (no sessioni libere) */}
                  {!selectedActivity.location.freeform && typeof selectedActivity.location.lat === 'number' && (
                  <div style={{ marginTop: '15px', borderTop: '1px solid var(--border-dark)', paddingTop: '15px' }}>
                    <h4 style={{ fontSize: '14px', fontWeight: '800', color: 'var(--secondary)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      🏆 Classifica del Locale (Top Atleti)
                    </h4>
                    
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                      {/* Top Carico Alcolico */}
                      <div style={{ background: 'rgba(0,0,0,0.3)', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-dark)', minWidth: 0 }}>
                        <div style={{ fontSize: '11px', color: 'var(--text-dark-secondary)', fontWeight: '700', textTransform: 'uppercase', marginBottom: '8px' }}>
                          🏋️‍♂️ Record Carico (Max U.A.)
                        </div>
                        {topUnitsLeaderboard.length === 0 ? (
                          <div style={{ fontSize: '11px', color: 'var(--text-dark-secondary)' }}>Nessun record</div>
                        ) : (
                          topUnitsLeaderboard.map((item, index) => (
                            <div key={index} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '6px', fontSize: '12px', padding: '4px 0', borderBottom: index < topUnitsLeaderboard.length - 1 ? '1px solid rgba(255,255,255,0.02)' : 'none' }}>
                              <span style={{ textOverflow: 'ellipsis', whiteSpace: 'nowrap', overflow: 'hidden', flex: 1, minWidth: 0 }}>#{index+1} {item.name}</span>
                              <strong style={{ color: 'var(--secondary)', whiteSpace: 'nowrap', flexShrink: 0 }}>{item.totalUnits.toFixed(1)} U.A.</strong>
                            </div>
                          ))
                        )}
                      </div>

                      {/* Top BAC */}
                      <div style={{ background: 'rgba(0,0,0,0.3)', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-dark)', minWidth: 0 }}>
                        <div style={{ fontSize: '11px', color: 'var(--text-dark-secondary)', fontWeight: '700', textTransform: 'uppercase', marginBottom: '8px' }}>
                          ⚡ Record BAC (Picco g/l)
                        </div>
                        {topBacLeaderboard.length === 0 ? (
                          <div style={{ fontSize: '11px', color: 'var(--text-dark-secondary)' }}>Nessun record</div>
                        ) : (
                          topBacLeaderboard.map((item, index) => (
                            <div key={index} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '6px', fontSize: '12px', padding: '4px 0', borderBottom: index < topBacLeaderboard.length - 1 ? '1px solid rgba(255,255,255,0.02)' : 'none' }}>
                              <span style={{ textOverflow: 'ellipsis', whiteSpace: 'nowrap', overflow: 'hidden', flex: 1, minWidth: 0 }}>#{index+1} {item.name}</span>
                              <strong style={{ color: 'var(--error)', whiteSpace: 'nowrap', flexShrink: 0 }}>{item.bac.toFixed(2)} g/l</strong>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(223, 255, 0,0.04)', padding: '10px', borderRadius: '6px', border: '1px solid rgba(223, 255, 0,0.1)', marginTop: '12px', fontSize: '12px' }}>
                      <span>👑</span>
                      <div>
                        <strong>Leggenda del Locale:</strong> {localLegend.name} ({localLegend.count} {localLegend.count === 1 ? 'sessione' : 'sessioni'} registrate qui).
                      </div>
                    </div>
                  </div>
                  )}
                </div>
              </div>
            )}

            {/* SEZIONE ALLEGATI MULTIMEDIALI (FOTO / AUDIO / VIDEO) */}
            {selectedActivity.media && selectedActivity.media.length > 0 && (
              <div style={{ marginBottom: '25px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: '700', marginBottom: '10px' }}>
                  🖼️ Media e Ricordi della Serata
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '12px' }}>
                  {selectedActivity.media.map((med, idx) => (
                    <div key={idx} style={{ background: 'var(--bg-input-dark)', border: '1px solid var(--border-dark)', borderRadius: '8px', padding: '10px', textAlign: 'center', position: 'relative', overflow: 'hidden', height: '120px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: '8px' }}>
                      {med.type === 'image' && (
                        <div style={{ width: '100%', height: '100%', backgroundSize: 'cover', backgroundImage: `url(${med.url})`, position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
                      )}
                      
                      <div style={{ zIndex: 1, color: med.type === 'image' ? '#FFF' : 'var(--primary)', background: med.type === 'image' ? 'rgba(0,0,0,0.6)' : 'none', padding: med.type === 'image' ? '6px' : '0', borderRadius: med.type === 'image' ? '50%' : '0' }}>
                        {med.type === 'video' ? <Video size={32} /> : med.type === 'audio' ? <Volume2 size={32} /> : <Camera size={20} />}
                      </div>
                      
                      <span style={{ zIndex: 1, fontSize: '11px', fontWeight: '600', color: '#FFF', background: 'rgba(0,0,0,0.7)', padding: '2px 6px', borderRadius: '4px', maxWidth: '90%', textOverflow: 'ellipsis', whiteSpace: 'nowrap', overflow: 'hidden' }}>
                        {med.name || (med.type.toUpperCase())}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Elenco completo e dettagliato delle consumazioni */}
            <h3 style={{ fontSize: '16px', fontWeight: '700', marginBottom: '12px' }}>Dettagli della Prestazione (Drinks)</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '25px' }}>
              {groupDrinks(selectedActivity.drinks).map((drink, idx) => {
                const calculatedUnits = (drink.units ? (drink.units * drink.qty) : (drink.qty * 1.5));
                const drinkTime = drink.added_at 
                  ? new Date(drink.added_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
                  : '';
                
                return (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: 'var(--bg-input-dark)', border: '1px solid var(--border-dark)', borderRadius: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <Beer size={18} color="var(--primary)" />
                      <div>
                        <strong style={{ fontSize: '15px' }}>{drink.name}</strong>
                        <div style={{ fontSize: '12px', color: 'var(--text-dark-secondary)' }}>
                          Gradazione: {drink.abv}% {drinkTime && `| Consumato alle: ${drinkTime}`}
                        </div>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: '700', fontSize: '15px' }}>{drink.qty} bicchiere/i</div>
                      <div style={{ fontSize: '11px', color: 'var(--primary)' }}>~ {calculatedUnits.toFixed(1)} Unità</div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Sezione Aggiungi Drink (Modifica Sessione) */}
            {currentUser && selectedActivity.user_id === currentUser.id && (
              <div style={{ background: 'rgba(255, 32, 0, 0.05)', border: '1px dashed var(--primary)', padding: '15px', borderRadius: '12px', marginBottom: '25px' }}>
                <h4 style={{ fontSize: '14px', fontWeight: '800', color: 'var(--primary)', marginBottom: '10px', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Plus size={16} /> Aggiungi Drink in tempo reale
                </h4>
                <p style={{ fontSize: '11px', color: 'var(--text-dark-secondary)', marginBottom: '12px' }}>
                  Aggiungi un drink consumato adesso. La curva di ebbrezza e la durata della sessione verranno ricalcolate all&apos;orario corrente.
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {[
                    { name: 'Spritz (Campari/Aperol/Select)', abv: 11, units: 1.3, label: '🍹 Spritz' },
                    { name: 'Birra Chiara Media', abv: 5, units: 1.6, label: '🍺 Birra' },
                    { name: 'Calice Vino (Rosso/Bianco/Prosecco)', abv: 12.5, units: 1.3, label: '🍷 Vino' },
                    { name: 'Shot (Tequila/Rhum/Chupito)', abv: 40, units: 1.3, label: '🥃 Shot' }
                  ].map((preset, pIdx) => (
                    <button
                      key={pIdx}
                      type="button"
                      onClick={() => handleAddDrinkToSession(preset)}
                      className="btn btn-secondary"
                      style={{ padding: '6px 12px', fontSize: '12px', borderRadius: '20px' }}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Social details (Compagnia e Cheers) */}
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '15px', borderTop: '1px solid var(--border-dark)', paddingTop: '20px', fontSize: '14px' }}>
              {selectedActivity.drank_with && selectedActivity.drank_with.length > 0 ? (
                <div style={{ color: 'var(--text-dark-secondary)' }}>
                  👥 Compagni di allenamento: <strong style={{ color: '#FFF' }}>{selectedActivity.drank_with.join(', ')}</strong>
                </div>
              ) : (
                <div style={{ color: 'var(--text-dark-secondary)' }}>🏃 Allenamento Solitario</div>
              )}
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                <span style={{ color: 'var(--text-dark-secondary)' }}>
                  🔥 Livello Sforzo: <strong style={{ color: 'var(--primary)' }}>{selectedActivity.feeling}</strong>
                </span>
                <Link href={`/share/${selectedActivity.id}`} className="btn btn-secondary" style={{ padding: '6px 14px', fontSize: '13px' }} onClick={() => setSelectedActivity(null)}>
                  <Share2 size={14} /> Esporta
                </Link>
              </div>
            </div>

            {/* Cheers & Commenti dentro il dettaglio */}
            <div style={{ borderTop: '1px solid var(--border-dark)', paddingTop: '16px', marginTop: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '16px' }}>
                <button
                  onClick={() => handleCheers(selectedActivity.id)}
                  className={`action-btn ${selectedActivity.cheers?.includes(currentUser?.id) ? 'active' : ''}`}
                  style={{ background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  <Beer size={18} fill={selectedActivity.cheers?.includes(currentUser?.id) ? 'var(--primary)' : 'none'} />
                  <span>Cheers ({selectedActivity.cheers?.length || 0})</span>
                </button>
                <span className="action-btn" style={{ cursor: 'default' }}>
                  <MessageSquare size={18} />
                  <span>Commenti ({selectedActivity.comments?.length || 0})</span>
                </span>
              </div>

              {/* Chi ha messo Cheers — primi 3 cliccabili + "altri" */}
              {selectedActivity.cheers && selectedActivity.cheers.length > 0 && (() => {
                const people = selectedActivity.cheers.map((uid) => {
                  const p = profilesList.find((pr) => pr.id === uid);
                  return { id: uid, name: uid === currentUser?.id ? 'Tu' : (p?.display_name || p?.username || 'Atleta') };
                });
                const shown = people.slice(0, 3);
                const extra = people.length - shown.length;
                return (
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', background: 'rgba(255, 32, 0,0.05)', border: '1px solid rgba(255, 32, 0,0.15)', borderRadius: '8px', padding: '8px 12px', marginBottom: '15px', flexWrap: 'wrap' }}>
                    <Beer size={15} style={{ color: 'var(--primary)', flexShrink: 0, marginTop: '2px' }} fill="var(--primary)" />
                    <span style={{ fontSize: '13px', color: 'var(--text-dark-primary)', lineHeight: 1.5 }}>
                      Hanno brindato:{' '}
                      {shown.map((p, i) => (
                        <span key={p.id}>
                          <Link href={`/u/${p.id}`} style={{ color: '#FFF', fontWeight: 700 }}>{p.name}</Link>
                          {i < shown.length - 1 ? ', ' : ''}
                        </span>
                      ))}
                      {extra > 0 && (
                        <>
                          {' '}e{' '}
                          <button
                            onClick={() => { setCheersListActivity(selectedActivity); setShowCheersList(true); }}
                            style={{ color: 'var(--primary)', fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: '13px' }}
                          >
                            altri {extra}
                          </button>
                        </>
                      )}
                    </span>
                  </div>
                );
              })()}

              {selectedActivity.comments && selectedActivity.comments.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '15px', maxHeight: '240px', overflowY: 'auto' }}>
                  {selectedActivity.comments.map((comment) => (
                    <div key={comment.id} style={{ display: 'flex', gap: '10px', fontSize: '14px', background: 'rgba(255,255,255,0.02)', padding: '10px', borderRadius: '8px' }}>
                      <div className="activity-avatar" style={{ width: '28px', height: '28px', fontSize: '12px', flexShrink: 0 }}>
                        {comment.user_name ? comment.user_name.charAt(0) : 'U'}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', marginBottom: '2px' }}>
                          <strong style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{comment.user_name}</strong>
                          <span style={{ fontSize: '11px', color: 'var(--text-dark-secondary)', flexShrink: 0 }}>{formatDate(comment.created_at)}</span>
                        </div>
                        <p style={{ color: 'var(--text-dark-primary)', overflowWrap: 'anywhere' }}>{comment.text}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {currentUser ? (
                <form onSubmit={(e) => handleCommentSubmit(e, selectedActivity.id)} style={{ display: 'flex', gap: '10px' }}>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Scrivi un commento..."
                    value={newCommentText[selectedActivity.id] || ''}
                    onChange={(e) => handleCommentChange(selectedActivity.id, e.target.value)}
                    style={{ height: '40px', padding: '10px 15px', borderRadius: '20px', fontSize: '14px' }}
                    required
                  />
                  <button type="submit" className="btn btn-primary" style={{ padding: '0 20px', borderRadius: '20px', fontSize: '14px' }}>
                    Invia
                  </button>
                </form>
              ) : (
                <p style={{ fontSize: '13px', color: 'var(--text-dark-secondary)', textAlign: 'center' }}>
                  <Link href="/auth" style={{ color: 'var(--primary)', fontWeight: '600' }}>Accedi</Link> per commentare.
                </p>
              )}
            </div>

          </div>
        </div>
      )}

      {/* MODAL LISTA COMPLETA CHEERS (stile Instagram) */}
      {showCheersList && cheersListActivity && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', backdropFilter: 'blur(6px)' }} onClick={() => setShowCheersList(false)}>
          <div className="card" style={{ width: '100%', maxWidth: '420px', maxHeight: '70vh', display: 'flex', flexDirection: 'column', border: '1px solid var(--border-dark)', padding: '0', overflow: 'hidden' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 18px', borderBottom: '1px solid var(--border-dark)' }}>
              <strong style={{ fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Beer size={18} color="var(--primary)" fill="var(--primary)" /> Cheers ({cheersListActivity.cheers.length})
              </strong>
              <button onClick={() => setShowCheersList(false)} className="btn btn-secondary" style={{ padding: '4px 10px', borderRadius: '50%', minWidth: '32px', height: '32px' }}>×</button>
            </div>
            <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
              {cheersListActivity.cheers.map((uid) => {
                const p = profilesList.find((pr) => pr.id === uid);
                const name = uid === currentUser?.id ? 'Tu' : (p?.display_name || p?.username || 'Atleta Strabar');
                return (
                  <Link
                    key={uid}
                    href={`/u/${uid}`}
                    onClick={() => { setShowCheersList(false); setSelectedActivity(null); }}
                    style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 18px', borderBottom: '1px solid var(--border-dark)', textDecoration: 'none' }}
                  >
                    <div className="activity-avatar" style={{ width: 40, height: 40, fontSize: 16, flexShrink: 0 }}>
                      {name.charAt(0).toUpperCase()}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <strong style={{ fontSize: '14px', color: '#FFF', display: 'block' }}>{name}</strong>
                      {p?.username && <span style={{ fontSize: '12px', color: 'var(--text-dark-secondary)' }}>@{p.username}</span>}
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* MODAL MODIFICA ATTIVITA */}
      {editingActivity && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0, 0, 0, 0.85)', zIndex: 1100, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px', backdropFilter: 'blur(8px)' }} onClick={() => setEditingActivity(null)}>
          <div className="card" style={{ width: '100%', maxWidth: '600px', maxHeight: '90vh', overflowY: 'auto', background: '#0B0A09', border: '2px solid var(--primary)', boxShadow: '0px 0px 30px rgba(255, 32, 0, 0.25)', animation: 'slideUp 0.3s ease', position: 'relative' }} onClick={(e) => e.stopPropagation()}>
            
            {/* Header del Modal */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid var(--border-dark)', paddingBottom: '15px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: '800', color: '#FFF', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Edit size={18} color="var(--primary)" />
                Modifica Sessione Alcolica
              </h3>
              <button className="btn btn-secondary" style={{ padding: '4px 10px', borderRadius: '50%', minWidth: '32px', height: '32px' }} onClick={() => setEditingActivity(null)}>×</button>
            </div>

            {/* Form Fields */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginBottom: '20px' }}>
              <div>
                <label style={{ fontSize: '11px', color: 'var(--text-dark-secondary)', textTransform: 'uppercase', display: 'block', marginBottom: '4px', fontWeight: '600' }}>Titolo Attività</label>
                <input
                  type="text"
                  className="form-control"
                  value={editingActivity.title}
                  onChange={(e) => handleUpdateEditField('title', e.target.value)}
                  style={{ height: '40px', padding: '0 12px', fontSize: '14px' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '11px', color: 'var(--text-dark-secondary)', textTransform: 'uppercase', display: 'block', marginBottom: '4px', fontWeight: '600' }}>Descrizione / Note</label>
                <textarea
                  className="form-control"
                  value={editingActivity.description || ''}
                  onChange={(e) => handleUpdateEditField('description', e.target.value)}
                  rows={2}
                  style={{ padding: '10px 12px', fontSize: '14px', resize: 'none' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                <div>
                  <label style={{ fontSize: '11px', color: 'var(--text-dark-secondary)', textTransform: 'uppercase', display: 'block', marginBottom: '4px', fontWeight: '600' }}>Durata (minuti)</label>
                  <input
                    type="number"
                    className="form-control"
                    value={editingActivity.duration}
                    onChange={(e) => handleUpdateEditField('duration', parseInt(e.target.value) || 0)}
                    style={{ height: '40px', padding: '0 12px', fontSize: '14px' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '11px', color: 'var(--text-dark-secondary)', textTransform: 'uppercase', display: 'block', marginBottom: '4px', fontWeight: '600' }}>Stato / Sforzo</label>
                  <select
                    className="form-control"
                    value={editingActivity.feeling}
                    onChange={(e) => handleUpdateEditField('feeling', e.target.value)}
                    style={{ height: '40px', padding: '0 10px', fontSize: '14px' }}
                  >
                    <option value="Sobrio">Sobrio</option>
                    <option value="Allegro">Allegro</option>
                    <option value="Brillo Felice">Brillo Felice</option>
                    <option value="Intenditore">Intenditore</option>
                    <option value="Molto Caldo">Molto Caldo 🔥</option>
                    <option value="Pieno Raso">Pieno Raso 💀</option>
                    <option value="Postumi Assicurati">Postumi Assicurati 🤕</option>
                  </select>
                </div>
              </div>

              {/* Privacy della sessione (chi la vede) */}
              <div style={{ marginTop: '14px' }}>
                <label style={{ fontSize: '11px', color: 'var(--text-dark-secondary)', textTransform: 'uppercase', display: 'block', marginBottom: '6px', fontWeight: '600' }}>Chi la vede</label>
                <div className="seg-tabs">
                  {[
                    { k: 'public', l: '🌍 Tutti' },
                    { k: 'friends', l: '👥 Amici' },
                    { k: 'private', l: '🔒 Nessuno' },
                  ].map(({ k, l }) => (
                    <div
                      key={k}
                      className={`seg-tab ${(editingActivity.location?.share || 'friends') === k ? 'active' : ''}`}
                      onClick={() => setEditingActivity((prev) => ({ ...prev, location: { ...(prev.location || { name: prev.location?.name || 'Sessione Libera' }), share: k } }))}
                    >
                      {l}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Sezione Drinks */}
            <div style={{ borderTop: '1px solid var(--border-dark)', paddingTop: '15px', marginBottom: '20px' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-dark-secondary)', textTransform: 'uppercase', display: 'block', marginBottom: '8px', fontWeight: '600' }}>
                Modifica Drinks Consumati ({editingActivity.drinks?.length || 0})
              </span>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '180px', overflowY: 'auto', marginBottom: '15px' }}>
                {editingActivity.drinks?.length > 0 ? (
                  editingActivity.drinks.map((d, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border-dark)' }}>
                      <div>
                        <strong style={{ fontSize: '13px' }}>{d.name}</strong>
                        <span style={{ display: 'block', fontSize: '10px', color: 'var(--text-dark-secondary)' }}>
                          Gradazione: {d.abv}% | ~{(d.units * d.qty).toFixed(1)} U.A.
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <button type="button" onClick={() => handleUpdateEditDrinkQty(i, -1)} style={{ cursor: 'pointer', background: 'rgba(255,255,255,0.05)', width: '24px', height: '24px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          -
                        </button>
                        <strong style={{ fontSize: '14px', width: '15px', textAlign: 'center' }}>{d.qty}</strong>
                        <button type="button" onClick={() => handleUpdateEditDrinkQty(i, 1)} style={{ cursor: 'pointer', background: 'rgba(255,255,255,0.05)', width: '24px', height: '24px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          +
                        </button>
                        <button type="button" onClick={() => handleRemoveEditDrink(i)} style={{ color: 'var(--error)', marginLeft: '10px', cursor: 'pointer' }}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <span style={{ fontSize: '12px', color: 'var(--text-dark-secondary)', fontStyle: 'italic' }}>Nessun drink registrato in questa sessione.</span>
                )}
              </div>

              {/* Quick Add Presets in Edit */}
              <span style={{ fontSize: '11px', color: 'var(--text-dark-secondary)', textTransform: 'uppercase', display: 'block', marginBottom: '8px', fontWeight: '600' }}>
                Aggiungi Drink Preset:
              </span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {QUICK_DRINKS.map((preset, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleAddTaskPresetToEdit(preset)}
                    className="btn btn-secondary"
                    style={{ padding: '4px 10px', fontSize: '11px', borderRadius: '15px' }}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setShowAllEditDrinks((v) => !v)}
                style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontSize: '11px', fontWeight: 700, marginTop: '8px' }}
              >
                {showAllEditDrinks ? '▲ Nascondi altri drink' : '▾ Altri drink'}
              </button>
              {showAllEditDrinks && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
                  {EXTRA_DRINKS.map((preset, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleAddTaskPresetToEdit(preset)}
                      className="btn btn-secondary"
                      style={{ padding: '4px 10px', fontSize: '11px', borderRadius: '15px', border: '1px solid var(--border-dark)' }}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Tag compagni di bevuta */}
            <div style={{ marginBottom: '20px', borderTop: '1px solid var(--border-dark)', paddingTop: '15px' }}>
              <label style={{ fontSize: '11px', color: 'var(--text-dark-secondary)', textTransform: 'uppercase', fontWeight: '600', display: 'block', marginBottom: '8px' }}>
                Tagga i compagni di bevuta
              </label>
              <div style={{ position: 'relative', marginBottom: '10px' }}>
                <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dark-secondary)' }} />
                <input
                  type="text"
                  className="form-control"
                  placeholder="Cerca un amico per nome o @username..."
                  value={editFriendQuery}
                  onChange={(e) => setEditFriendQuery(e.target.value)}
                  style={{ height: '36px', fontSize: '13px', padding: '0 10px 0 30px' }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const val = editFriendQuery.trim();
                      if (val) addEditCompanion(val);
                    }
                  }}
                />
                {editSearchingFriends && (
                  <Loader size={13} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--primary)', animation: 'spin 1s linear infinite' }} />
                )}
                {editFriendQuery.trim().length >= 1 && (
                  <div style={{ position: 'absolute', top: '40px', left: 0, right: 0, background: 'var(--bg-card-dark, #17181B)', border: '1px solid var(--border-dark)', borderRadius: '8px', zIndex: 50, maxHeight: '180px', overflowY: 'auto', boxShadow: '0 8px 20px rgba(0,0,0,0.4)' }}>
                    {editFriendResults.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => addEditCompanion(`${p.display_name || p.username} (@${p.username})`)}
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', textAlign: 'left', padding: '8px 10px', background: 'none', border: 'none', borderBottom: '1px solid var(--border-dark)', cursor: 'pointer', color: '#FFF' }}
                      >
                        <span className="activity-avatar" style={{ width: '26px', height: '26px', fontSize: '12px', flexShrink: 0 }}>
                          {(p.display_name || p.username || 'U').charAt(0).toUpperCase()}
                        </span>
                        <span style={{ display: 'flex', flexDirection: 'column' }}>
                          <strong style={{ fontSize: '12px' }}>{p.display_name || p.username}</strong>
                          <span style={{ fontSize: '10px', color: 'var(--text-dark-secondary)' }}>@{p.username}</span>
                        </span>
                      </button>
                    ))}
                    {editFriendResults.length === 0 && !editSearchingFriends && (
                      <button
                        type="button"
                        onClick={() => addEditCompanion(editFriendQuery.trim())}
                        style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dark-secondary)', fontSize: '12px' }}
                      >
                        Tagga &quot;<strong style={{ color: '#FFF' }}>{editFriendQuery.trim()}</strong>&quot; come ospite ↵
                      </button>
                    )}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {(editingActivity.drank_with || []).map((friend, idx) => (
                  <span key={idx} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-dark)', padding: '3px 8px', borderRadius: '15px', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    {friend}
                    <button type="button" onClick={() => removeEditCompanion(idx)} style={{ color: 'var(--error)', cursor: 'pointer', border: 'none', background: 'none', fontWeight: 'bold' }}>×</button>
                  </span>
                ))}
              </div>
            </div>

            {/* Actions Footer */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border-dark)', paddingTop: '15px', marginTop: '20px' }}>
              <button
                type="button"
                onClick={() => handleDeleteActivity(editingActivity.id)}
                className="btn btn-secondary"
                style={{ color: 'var(--error)', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', borderRadius: '20px', padding: '8px 16px' }}
              >
                <Trash2 size={14} /> Elimina
              </button>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setEditingActivity(null)}
                  className="btn btn-secondary"
                  style={{ borderRadius: '20px', padding: '8px 16px', fontSize: '13px' }}
                >
                  Annulla
                </button>
                <button
                  type="button"
                  onClick={handleSaveEdit}
                  className="btn btn-primary"
                  style={{ borderRadius: '20px', padding: '8px 20px', fontSize: '13px', fontWeight: 'bold' }}
                >
                  Salva Modifiche
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* MODAL BLOCCO REGISTRAZIONE COMPLETAMENTO NOME (GOOGLE OAUTH FORCED) */}
      {showCompleteProfileModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0, 0, 0, 0.9)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px', backdropFilter: 'blur(10px)' }}>
          <div className="card" style={{ width: '100%', maxWidth: '450px', border: '2px solid var(--primary)', boxShadow: '0px 0px 30px rgba(255, 32, 0, 0.3)', padding: '30px', borderRadius: '16px', background: '#0B0A09', position: 'relative' }}>
            
            <div style={{ textAlign: 'center', marginBottom: '20px' }}>
              <div style={{ display: 'inline-flex', background: 'rgba(255, 32, 0, 0.1)', padding: '15px', borderRadius: '50%', color: 'var(--primary)', marginBottom: '15px' }}>
                <Award size={40} />
              </div>
              <h2 style={{ fontSize: '24px', fontWeight: '800', color: '#FFF', marginBottom: '8px' }}>Completa il Profilo 🏅</h2>
              <p style={{ color: 'var(--text-dark-secondary)', fontSize: '13px', lineHeight: '1.4' }}>
                Ti sei registrato con Google! Per accedere alle classifiche e alle sfide degli Atleti da Bar, inserisci il tuo nome reale e scegli un username unico.
              </p>
            </div>

            {profileError && (
              <div style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid var(--error)', color: '#FF7D7D', padding: '10px 14px', borderRadius: '8px', fontSize: '13px', marginBottom: '15px', fontWeight: '500' }}>
                {profileError}
              </div>
            )}

            <form onSubmit={handleCompleteProfileSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div className="form-group">
                <label className="form-label" style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Nome Completo</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="E.g. Mario Rossi"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  required
                  style={{ height: '40px', fontSize: '14px' }}
                />
              </div>

              <div className="form-group" style={{ marginBottom: '10px' }}>
                <label className="form-label" style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Username Unico</label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dark-secondary)', fontSize: '14px' }}>@</span>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="mario_rossi"
                    value={customUsername}
                    onChange={(e) => setCustomUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                    required
                    style={{ height: '40px', fontSize: '14px', paddingLeft: '28px' }}
                  />
                </div>
              </div>

              <button
                type="submit"
                className="btn btn-primary"
                disabled={savingProfile}
                style={{ width: '100%', padding: '12px', borderRadius: '30px', fontSize: '15px', fontWeight: 'bold', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', marginTop: '10px' }}
              >
                {savingProfile ? 'Salvataggio in corso...' : 'Entra nel Terzo Tempo 🍻'}
              </button>
            </form>

          </div>
        </div>
      )}
    </div>
  );
}
