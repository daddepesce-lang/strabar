'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { db } from '@/lib/db';
import { notify, ensureNotificationPermission } from '@/lib/notify';
import ShareAppButton from '@/components/ShareAppButton';
import Avatar from '@/components/Avatar';
import BacInfo from '@/components/BacInfo';
import BacCurve from '@/components/BacCurve';
import { useDrinkCatalog } from '@/lib/useDrinkCatalog';
import { publicName } from '@/lib/names';
import { siteUrl } from '@/lib/site';
import MediaLightbox from '@/components/MediaLightbox';
import BeerPicker from '@/components/BeerPicker';
import InfoPopover from '@/components/InfoPopover';
import LazyMap from '@/components/LazyMap';
import { Beer, MessageSquare, Share2, Trophy, Flame, User, Plus, Award, Calendar, Volume2, Camera, Video, Edit, Trash2, Search, X, Loader, Bell, MapPin, Gauge, BarChart3, Users, Zap, Radar, ChevronRight, Sparkles } from 'lucide-react';

// Mappa Leaflet reale (caricata solo lato client)
const RouteMap = dynamic(() => import('@/components/RouteMap'), { ssr: false });

// Emoji rappresentativa del drink dal nome (per una lista più ordinata e leggibile).
const drinkEmoji = (name = '') => {
  const n = name.toLowerCase();
  if (/spritz|aperol|campari|negroni|americano/.test(n)) return '🍹';
  if (/birra|beer|ipa|lager|doppio malto|stout|weiss|analcolica/.test(n)) return '🍺';
  if (/vino|wine|prosecco|spumante|champagne|bollicine|rosso|bianco/.test(n)) return '🍷';
  if (/gin|tonic|vodka|martini|cocktail|mojito|margarita|daiquiri|cuba/.test(n)) return '🍸';
  if (/shot|tequila|rum|whisky|whiskey|grappa|amaro|liquore|sambuca|vodka/.test(n)) return '🥃';
  if (/sidro|cider/.test(n)) return '🍏';
  if (/caffè|caffe|coffee/.test(n)) return '☕';
  return '🍺';
};

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
  // Catalogo drink dinamico (gestito da admin), con fallback statico immediato.
  const { quick: QUICK_DRINKS, extra: EXTRA_DRINKS } = useDrinkCatalog();
  const router = useRouter();
  const FEED_PAGE_SIZE = 5;
  const [currentUser, setCurrentUser] = useState(null);
  const [activities, setActivities] = useState([]);
  const [feedHasMore, setFeedHasMore] = useState(false);
  const [feedLoadingMore, setFeedLoadingMore] = useState(false);
  const [myActivities, setMyActivities] = useState([]); // sessioni dell'utente (statistiche personali)
  const [topDrinkers, setTopDrinkers] = useState([]); // classifica globale top atleti
  const [loading, setLoading] = useState(true);
  const [newCommentText, setNewCommentText] = useState({});
  const [editingComment, setEditingComment] = useState(null); // { id, text } commento in modifica
  const [activeCommentsSection, setActiveCommentsSection] = useState({});
  const [selectedActivity, setSelectedActivity] = useState(null);
  const [lightbox, setLightbox] = useState(null); // { images: [url], index } per lo slideshow foto
  const [venueBoard, setVenueBoard] = useState(null); // classifica del locale (dati completi)

  // Apre lo slideshow delle foto di una sessione. Mostra subito la copertina (nessuna attesa),
  // poi carica le altre foto ON-DEMAND con getActivity (il feed non scarica `media` per restare
  // velocissimo). Così l'egress avviene solo quando l'utente apre davvero le foto.
  const openSessionPhotos = async (act, startIndex = 0) => {
    setLightbox({ images: act.cover_url ? [act.cover_url] : [], index: 0 });
    try {
      const full = (act.media && act.media.length) ? act : await db.getActivity(act.id);
      const imgs = (full?.media || []).filter((m) => m.type === 'image' && m.url).map((m) => m.url);
      if (imgs.length) setLightbox({ images: imgs, index: Math.min(startIndex, imgs.length - 1) });
    } catch { /* in caso di errore resta visibile la sola copertina */ }
  };
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false); // visore foto a schermo intero

  // Nuovi stati per il paradigma Live Session e Slideshow Feed
  const [activeSession, setActiveSession] = useState(null);
  const [showLivePanel, setShowLivePanel] = useState(false); // pannello live a comparsa (non nel feed)
  const [tourMsg, setTourMsg] = useState(null); // ultimo esito tappa (mostrato in-app, per intero)
  const [pacingTip, setPacingTip] = useState(false); // consiglio: non loggare i drink tutti insieme
  const [banners, setBanners] = useState([]); // banner pubblicitari gestiti da admin
  const [liveResidualGrams, setLiveResidualGrams] = useState(0); // alcol residuo da sessioni precedenti recenti
  // Lock per l'aggiunta drink: blocca nuove selezioni finché l'aggiunta non è completata
  // (evita il doppio tap sullo stesso drink causato dal lag di rete). Il ref garantisce
  // un guard SINCRONO (tap ravvicinati prima del re-render); lo state aggiorna la UI.
  const [addingDrink, setAddingDrink] = useState(false);
  const addingDrinkRef = useRef(false);
  const [elapsedMinutes, setElapsedMinutes] = useState(0);
  const [profilesList, setProfilesList] = useState([]);
  const [showCloseForm, setShowCloseForm] = useState(false);
  const [completedSession, setCompletedSession] = useState(null); // resoconto post-chiusura (modale congratulazioni)
  const [shareSheet, setShareSheet] = useState(null); // { id, caption } → selettore "link o scheda social"
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
  const [cheersListPeople, setCheersListPeople] = useState([]); // chi ha cheerato (caricato on-demand)
  const [cheersListLoading, setCheersListLoading] = useState(false);

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
    setLightboxOpen(false);
    try {
      if (typeof db.getActivity === 'function') {
        const full = await db.getActivity(act.id);
        if (full) setSelectedActivity((prev) => (prev && prev.id === act.id ? { ...prev, ...full } : prev));
      }
    } catch { /* noop */ }
  };

  // Classifica del Locale per il dettaglio: caricata su DATI COMPLETI (non sul feed
  // troncato) ed escludendo le sessioni private. Così la Leggenda è UGUALE per tutti
  // e coincide con la classifica della pagina Locali.
  useEffect(() => {
    const loc = selectedActivity?.location;
    const isVenue = !!(loc && loc.name && !loc.freeform && !loc.unverified && typeof loc.lat === 'number' && typeof loc.lng === 'number');
    if (!isVenue || typeof db.getVenueBoard !== 'function') { setVenueBoard(null); return; }
    let cancelled = false;
    db.getVenueBoard(db.normalizePlaceKey(loc.name))
      .then((b) => { if (!cancelled) setVenueBoard(b); })
      .catch(() => { if (!cancelled) setVenueBoard(null); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedActivity?.id]);

  const triggerLocalNotification = (title, body) => {
    // Usa il service worker quando disponibile (necessario per le PWA mobile)
    notify(title, body);
  };

  // EGRESS: il feed scarica solo il CONTEGGIO cheers. Qui, con UNA query batch, segniamo
  // quali post ha già "cheerato" l'utente corrente (per evidenziare il pulsante).
  const hydrateMyCheers = async (acts) => {
    if (!acts?.length || typeof db.getMyCheers !== 'function') return;
    try {
      const set = await db.getMyCheers(acts.map((a) => a.id));
      if (set && set.size) setActivities((prev) => prev.map((a) => (set.has(a.id) ? { ...a, cheered_by_me: true } : a)));
    } catch { /* noop */ }
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
      if (user) hydrateMyCheers(acts);

      // Banner pubblicitari (best effort, non blocca il feed)
      if (typeof db.getActiveBanners === 'function') {
        db.getActiveBanners().then(setBanners).catch(() => {});
      }

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
        // Leaderboard Club: STESSA fonte e regola della classifica generale (/places) — solo
        // check-in geolocalizzati verificati — così i numeri coincidono e non risultano più alti qui.
        if (typeof db.getUserLeaderboard === 'function') {
          db.getUserLeaderboard(user.id)
            .then((rows) => setTopDrinkers((rows || []).slice(0, 5).map((u) => ({ user_id: u.user_id, name: u.name, units: u.units, isPremium: u.is_premium }))))
            .catch(() => {});
        }

        // Backfill una-tantum: congela il residuo sulle MIE sessioni recenti che ne sono
        // prive (vecchie o live già in corso). Dopo, ricarico così il valore compare
        // anche per chi guarda. RLS-safe e silenzioso se la colonna non è ancora migrata.
        if (typeof db.backfillResidualGrams === 'function') {
          db.backfillResidualGrams().then((n) => {
            if (n > 0) {
              db.getUserActivities(user.id).then(setMyActivities).catch(() => {});
              db.getActivities({ limit: FEED_PAGE_SIZE }).then(setActivities).catch(() => {});
            }
          }).catch(() => {});
        }
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
      if (currentUser) hydrateMyCheers(next);
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

  // Scroll-reveal della landing (solo per utenti non loggati): aggiunge .is-visible
  // agli elementi .reveal quando entrano nel viewport.
  useEffect(() => {
    if (loading || currentUser) return;
    const els = Array.from(document.querySelectorAll('.reveal'));
    if (els.length === 0) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    if (reduce) { els.forEach((el) => el.classList.add('is-visible')); return; }
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) { e.target.classList.add('is-visible'); obs.unobserve(e.target); }
        });
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.12 }
    );
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [loading, currentUser]);

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

    // Apertura pannello live: da ?live=1 (navbar su altra pagina) o evento (navbar su home).
    if (params.get('live') === '1') {
      setShowLivePanel(true);
      window.history.replaceState({}, '', '/');
    }
    const onOpenLive = () => setShowLivePanel(true);
    window.addEventListener('strabar:open-live', onOpenLive);

    return () => {
      window.removeEventListener('strabar:open-activity', onOpen);
      window.removeEventListener('strabar:open-live', onOpenLive);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Calcola alcol residuo da sessioni precedenti per la live
  useEffect(() => {
    if (!activeSession) { setLiveResidualGrams(0); return; }
    // Preferisce il residuo CONGELATO sulla sessione (coerente con profilo/spettatori/radar).
    const g = db.sessionResidualGrams(activeSession, myActivities, currentUser?.weight, currentUser?.sex);
    setLiveResidualGrams(g);
  }, [activeSession?.id, myActivities.length]);

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
            setShowLivePanel(false);
            if (typeof window !== 'undefined') window.dispatchEvent(new Event('strabar:live-changed'));
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
    // Modello unificato: nel feed conosciamo solo il CONTEGGIO (cheer_count) e se ho cheerato
    // io (cheered_by_me); nel dettaglio c'è anche l'elenco (cheers). L'update ottimistico
    // tiene coerenti tutti e tre. `others` = cheers degli altri, stabile per il rollback.
    const target = activities.find((a) => a.id === activityId) || (selectedActivity?.id === activityId ? selectedActivity : null);
    const had = !!(target?.cheered_by_me || target?.cheers?.includes(currentUser.id));
    const origCount = target?.cheer_count != null ? target.cheer_count : (target?.cheers?.length || 0);
    const others = Math.max(0, origCount - (had ? 1 : 0));
    const applyMine = (mine) => patchActivity(activityId, (a) => {
      const base = (a.cheers || []).filter((id) => id !== currentUser.id);
      return {
        ...a,
        cheers: mine ? [...base, currentUser.id] : base,
        cheered_by_me: mine,
        cheer_count: others + (mine ? 1 : 0),
      };
    });
    applyMine(!had); // ottimistico
    try {
      await db.toggleCheers(activityId);
    } catch (err) {
      console.error(err);
      applyMine(had); // rollback allo stato iniziale
    }
  };

  // Apre l'elenco "Chi ha messo cheers". Nel feed il post ha solo il conteggio, quindi
  // l'elenco si carica ON-DEMAND (getCheerers). Nel dettaglio l'elenco uid c'è già.
  const openCheersList = async (act) => {
    setCheersListActivity(act);
    setShowCheersList(true);
    // Usa l'elenco già in memoria SOLO se è COMPLETO (nel dettaglio: cheers.length combacia
    // col conteggio). Nel feed l'array è parziale (al più il mio) → carica da DB.
    const arr = Array.isArray(act.cheers) ? act.cheers : [];
    const complete = arr.length > 0 && (act.cheer_count == null || arr.length === act.cheer_count);
    if (complete) {
      setCheersListPeople(arr.map((uid) => {
        const p = profilesList.find((pr) => pr.id === uid);
        return { id: uid, name: uid === currentUser?.id ? 'Tu' : (p?.display_name || p?.username || 'Atleta Strabar'), username: p?.username || null };
      }));
      setCheersListLoading(false);
      return;
    }
    setCheersListPeople([]);
    setCheersListLoading(true);
    try {
      const people = (typeof db.getCheerers === 'function') ? await db.getCheerers(act.id) : [];
      setCheersListPeople(people.map((p) => (p.id === currentUser?.id ? { ...p, name: 'Tu' } : p)));
    } catch { setCheersListPeople([]); }
    finally { setCheersListLoading(false); }
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
    const opening = !activeCommentsSection[activityId];
    setActiveCommentsSection(prev => ({ ...prev, [activityId]: !prev[activityId] }));
    // EGRESS: il feed scarica solo il CONTEGGIO dei commenti. Alla prima espansione
    // carichiamo i commenti veri SOLO per quel post, on-demand.
    if (opening) {
      const act = activities.find((a) => a.id === activityId);
      const needLoad = act && (!Array.isArray(act.comments) || act.comments.length === 0) && (act.comment_count || 0) > 0;
      if (needLoad && typeof db.getComments === 'function') {
        db.getComments(activityId)
          .then((list) => patchActivity(activityId, (a) => ({ ...a, comments: list })))
          .catch(() => {});
      }
    }
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

  // Modifica/elimina un PROPRIO commento
  const handleSaveCommentEdit = async (activityId, commentId) => {
    const text = (editingComment?.text || '').trim();
    if (!text) return;
    patchActivity(activityId, (a) => ({ ...a, comments: (a.comments || []).map((c) => (c.id === commentId ? { ...c, text } : c)) }));
    setEditingComment(null);
    try {
      await db.updateComment(commentId, text);
    } catch (err) {
      console.error('Errore modifica commento:', err);
      alert('Impossibile modificare il commento: ' + (err.message || err));
    }
  };
  const handleDeleteComment = async (activityId, commentId) => {
    if (!window.confirm('Eliminare questo commento?')) return;
    patchActivity(activityId, (a) => ({ ...a, comments: (a.comments || []).filter((c) => c.id !== commentId) }));
    try {
      await db.deleteComment(commentId);
    } catch (err) {
      console.error('Errore eliminazione commento:', err);
      alert('Impossibile eliminare il commento: ' + (err.message || err));
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
        added_at: nowStr,
        added_times: [nowStr]
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

      // Attribuisci il drink al locale della sessione (statistiche bar).
      if (baseActivity.location?.name) {
        newDrink.place_key = baseActivity.location.placeKey || null;
        newDrink.place_name = baseActivity.location.name;
        newDrink.added_places = [{ key: baseActivity.location.placeKey || null, name: baseActivity.location.name }];
      }

      // existingDrinks è già espanso in unità con orario distinto: aggiungiamo la nuova
      // unità con il suo orario (così la curva fa lo scalino). Il display raggruppa per
      // nome con groupDrinks(), quindi non serve più accorpare qui sul campo qty.
      const updatedDrinks = [...existingDrinks, newDrink];
      
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
    const newBac = db.calculateCurrentBAC(activeSession.drinks || [], activeSession.created_at, duration, undefined, currentUser?.weight, value, currentUser?.sex, liveResidualGrams);
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
    // Guard anti doppio-tap: ignora nuove selezioni finché l'aggiunta in corso non è
    // completata. Il ref blocca in modo sincrono anche i tap ravvicinati nello stesso tick.
    if (addingDrinkRef.current) return;
    addingDrinkRef.current = true;
    setAddingDrink(true);

    try {
      const nowStr = new Date().toISOString();
      const newDrink = {
        name: preset.name,
        abv: preset.abv,
        units: preset.units,
        qty: 1,
        added_at: nowStr,
        added_times: [nowStr]
      };

      // IMPORTANTE: rileggi sempre la sessione fresca dal DB per evitare
      // che lo stato React stale contenga drink di sessioni precedenti.
      const freshSession = typeof db.getActivity === 'function'
        ? await db.getActivity(activeSession.id)
        : null;
      const base = freshSession || activeSession;
      const currentDrinks = base.drinks || [];

      // CONSIGLIO "PACING": se aggiungi un drink entro 1 min dal precedente, è probabile
      // che tu li stia inserendo tutti insieme. La curva BAC usa l'orario di OGNI drink,
      // quindi loggarli in blocco la rende meno realistica (picco anticipato e più alto).
      // Mostriamo il consiglio UNA volta per sessione.
      const priorTimes = currentDrinks.flatMap((d) => (
        Array.isArray(d.added_times) && d.added_times.length ? d.added_times : (d.added_at ? [d.added_at] : [])
      ));
      const lastPriorMs = priorTimes.length ? Math.max(...priorTimes.map((t) => new Date(t).getTime())) : 0;
      if (lastPriorMs && (Date.now() - lastPriorMs) < 60000) {
        try {
          const k = `strabar_pacing_tip_${activeSession.id}`;
          if (sessionStorage.getItem(k) !== '1') { sessionStorage.setItem(k, '1'); setPacingTip(true); }
        } catch { setPacingTip(true); }
      }

      // LOCALE CORRENTE per attribuire il drink (statistiche bar per-tappa).
      // Con un tour attivo → la tappa corrente; altrimenti → il locale della sessione.
      const tourForPlace = base.location?.tour;
      const curStopForPlace = tourForPlace ? (tourForPlace.stops || [])[tourForPlace.current || 0] : null;
      const curPlace = curStopForPlace
        ? { key: curStopForPlace.placeKey || null, name: curStopForPlace.name || null }
        : (base.location?.name ? { key: base.location.placeKey || null, name: base.location.name } : null);
      newDrink.place_key = curPlace?.key || null;
      newDrink.place_name = curPlace?.name || null;
      newDrink.added_places = [curPlace || null];

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

      // Stesso drink già presente → +1 quantità, ma REGISTRA anche l'orario di questa
      // aggiunta in added_times (così la curva fa lo scalino come per drink diversi).
      const dupIdx = currentDrinks.findIndex((d) => d.name === newDrink.name);
      let updatedDrinks;
      if (dupIdx >= 0) {
        updatedDrinks = [...currentDrinks];
        const ex = updatedDrinks[dupIdx];
        const exTimes = Array.isArray(ex.added_times) && ex.added_times.length > 0
          ? ex.added_times
          : (ex.added_at ? [ex.added_at] : []);
        // Allinea added_places a added_times (i drink vecchi non ce l'hanno: ricostruisce
        // dalla place_name dell'entry così le aggiunte storiche restano attribuite).
        const exPlaces = Array.isArray(ex.added_places) && ex.added_places.length === exTimes.length
          ? ex.added_places
          : exTimes.map(() => (ex.place_name ? { key: ex.place_key || null, name: ex.place_name } : null));
        updatedDrinks[dupIdx] = {
          ...ex,
          qty: (ex.qty || 1) + 1,
          added_times: [...exTimes, nowStr],
          added_places: [...exPlaces, curPlace || null],
        };
      } else {
        updatedDrinks = [...currentDrinks, newDrink];
      }
      const newTotalUnits = updatedDrinks.reduce((acc, d) => acc + ((d.units || 0) * (d.qty || 1)), 0);
      
      // Calcola la durata: differenza tra primo drink e ora corrente
      const timestamps = updatedDrinks.map(d => new Date(d.added_at).getTime());
      const startTimeMs = Math.min(...timestamps);
      const duration = Math.max(1, Math.round((new Date().getTime() - startTimeMs) / (60 * 1000)));
      
      // Calcola il BAC corrente (sessione live -> referenceTime = adesso, default; peso reale se impostato)
      const newBac = db.calculateCurrentBAC(updatedDrinks, activeSession.created_at, duration, undefined, currentUser?.weight, activeSession.full_stomach, currentUser?.sex, liveResidualGrams);

      // Avviso superamento limite legale di guida (0,5 g/L) — solo al momento del sorpasso
      // della soglia, e disattivabile dall'utente (preferenza 'driving', default ON).
      const prevBac = parseFloat(activeSession.bac_level || 0);
      if (newBac >= 0.5 && prevBac < 0.5 && currentUser?.notif_prefs?.driving !== false) {
        triggerLocalNotification('⚠️ Limite di guida superato', 'Hai superato 0,5 g/L: NON metterti alla guida. Smaltisci con calma o chiama un taxi/NCC. 🚕');
      }

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
        // Mostralo anche IN-APP per intero: la notifica di sistema tronca il testo.
        setTourMsg(verifyMessage);
        setTimeout(() => setTourMsg((m) => (m === verifyMessage ? null : m)), 9000);
      }
    } catch (err) {
      console.error("Errore nell'aggiunta del drink alla sessione attiva:", err);
      alert("Impossibile aggiungere il drink: " + err.message);
    } finally {
      addingDrinkRef.current = false;
      setAddingDrink(false);
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
        // Tieni allineati gli orari delle singole aggiunte (rimuovi l'ultimo).
        if (Array.isArray(row.added_times) && row.added_times.length > 0) {
          row.added_times = row.added_times.slice(0, -1);
        }
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
      const newBac = db.calculateCurrentBAC(drinks, base.created_at, duration, undefined, currentUser?.weight, base.full_stomach, currentUser?.sex, liveResidualGrams);
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
      // Se ho taggato un utente reale (@username), avvisalo: può aprire la SUA sessione
      // nello stesso luogo (link con il locale; conta per la classifica se è sul posto).
      const m = String(value).match(/\(@([^)]+)\)/);
      if (m && m[1] && currentUser && typeof db._notifyTaggedCompanions === 'function') {
        db._notifyTaggedCompanions(currentUser, { ...activeSession, drank_with: updated }, [m[1]]).catch(() => {});
      }
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
      const { url, thumb } = await db.uploadImage(file);
      const newMedia = [...(activeSession.media || []), { type: 'image', name: file.name, url, thumb }];
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

  // Torna alla tappa PRECEDENTE (es. hai premuto "prossima" per errore): riporta indietro
  // l'indice e annulla l'ultima visita registrata, senza eliminare i drink.
  const handleGoBackTourStop = async () => {
    const tour = activeSession?.location?.tour;
    if (!tour) return;
    const prev = (tour.current || 0) - 1;
    if (prev < 0) return;
    const stop = tour.stops[prev];
    if (!stop) return;
    const visited = (tour.visited || []).slice(0, -1); // rimuove l'avanzamento per errore
    const newLocation = {
      ...activeSession.location,
      name: stop.name,
      lat: stop.lat ?? activeSession.location?.lat ?? null,
      lng: stop.lng ?? activeSession.location?.lng ?? null,
      unverified: true,
      tour: { ...tour, current: prev, visited },
    };
    setActiveSession((p) => (p ? { ...p, location: newLocation } : p));
    try {
      await db.updateActivity(activeSession.id, { location: newLocation });
    } catch (err) {
      console.error('Errore ritorno tappa:', err);
      alert('Impossibile tornare alla tappa precedente: ' + (err.message || err));
    }
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
      setShowLivePanel(false);
      setShowCloseForm(false);
      if (typeof window !== 'undefined') window.dispatchEvent(new Event('strabar:live-changed'));
      await loadFeed();
    } catch (err) {
      console.error('Errore annullamento sessione:', err);
      alert('Impossibile annullare la sessione: ' + (err.message || err));
    }
  };

  // Condivide una sessione tramite il foglio nativo (WhatsApp/Instagram/SMS…) con il
  // link alla card social /share/<id>. Fallback desktop: copia il link negli appunti.
  const shareSessionLink = async (sessionId, caption) => {
    const url = siteUrl(`/share/${sessionId}`);
    const text = caption || 'Guarda la mia sessione su Strabar 🍻';
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({ title: 'Strabar 🍻', text, url });
        return;
      }
    } catch { return; /* condivisione annullata */ }
    try {
      await navigator.clipboard.writeText(`${text} ${url}`);
      alert('Link copiato negli appunti!');
    } catch {
      alert(`Condividi questo link: ${url}`);
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

    const sess = activeSession; // cattura prima di azzerare lo stato (serve per il resoconto)
    try {
      await db.closeSession(sess.id, finalData);
      // Niente notifica all'utente per la propria chiusura sessione (azione volontaria).

      // Resoconto per il modale di congratulazioni (picco BAC deterministico a sessione chiusa).
      const peakBac = db.calculatePeakBAC(
        sess.drinks || [],
        sess.created_at,
        finalData.duration || sess.duration || 120,
        currentUser?.weight,
        sess.full_stomach,
        currentUser?.sex,
        priorResidualFor(sess)
      );
      const drinkCount = (sess.drinks || []).reduce((n, d) => n + (d.qty || 1), 0);
      setCompletedSession({
        id: sess.id,
        title: sess.title || 'Brindisi Live 🍻',
        units: parseFloat(sess.total_units || 0),
        drinkCount,
        peakBac,
        duration: finalData.duration,
        feeling,
        locationName: sess.location?.name || null,
      });

      setActiveSession(null);
      setShowLivePanel(false);
      setShowCloseForm(false);
      if (typeof window !== 'undefined') window.dispatchEvent(new Event('strabar:live-changed'));
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
      setSelectedActivity(null);
      await loadFeed();
    } catch (err) {
      console.error("Errore eliminazione:", err);
      alert("Errore durante l'eliminazione: " + err.message);
    }
  };

  const renderCompanionsList = (act) => {
    // "Ha bevuto con" SOLO le persone taggate esplicitamente (drank_with).
    // Niente più rilevamento automatico per vicinanza/orario: dava falsi "insieme".
    const regIds = new Set();

    const drankWith = act.drank_with || [];
    const finalCompanions = [];

    drankWith.forEach(nameStr => {
      let usernameMatch = nameStr.match(/@([\w.-]+)/);
      let username = usernameMatch ? usernameMatch[1] : null;
      let displayName = nameStr.replace(/\s*\(@?[\w.-]+\)/g, '').trim();
      
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
        <strong style={{ color: '#FFF' }}>{publicName(act.profiles, 'Atleta')}</strong>
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

  // Tasso alcolemico mostrato nel feed = BAC di PICCO della sessione (deterministico),
  // usando peso/sesso del proprietario. Niente più snapshot volatili che davano valori
  // diversi a parità di drink/durata.
  // Residuo alcolico (grammi) ancora in circolo da sessioni precedenti dello stesso
  // utente chiuse nelle ultime 4h. Best-effort sulle attività caricate nel feed.
  const priorResidualFor = (a) => {
    if (!a) return 0;
    const ownerWeight = (a.user_id === currentUser?.id ? currentUser?.weight : a.profiles?.weight) || undefined;
    const ownerSex = (a.user_id === currentUser?.id ? currentUser?.sex : a.profiles?.sex) || undefined;
    const pool = (a.user_id === currentUser?.id ? myActivities : activities) || [];
    const others = pool.filter((x) => x.user_id === a.user_id && x.id !== a.id);
    // Preferisce il residuo CONGELATO sulla sessione (uguale per tutti); fallback al calcolo.
    return db.sessionResidualGrams(a, others, ownerWeight, ownerSex);
  };

  const displayBac = (a) => {
    if (!a || !a.drinks || a.drinks.length === 0) return 0;
    const ownerWeight = (a.user_id === currentUser?.id ? currentUser?.weight : a.profiles?.weight) || undefined;
    const ownerSex = (a.user_id === currentUser?.id ? currentUser?.sex : a.profiles?.sex) || undefined;
    // Sessione LIVE: tutti vedono lo stesso numero del proprietario, cioè il BAC
    // ATTUALE (adesso). Solo a sessione chiusa si mostra il PICCO deterministico.
    if (isLiveAct(a)) {
      return db.calculateCurrentBAC(a.drinks, a.created_at, a.duration || effortMinutes(a) || 1, undefined, ownerWeight, a.full_stomach, ownerSex, priorResidualFor(a));
    }
    return db.calculatePeakBAC(a.drinks, a.created_at, a.duration || effortMinutes(a) || 120, ownerWeight, a.full_stomach, ownerSex, priorResidualFor(a));
  };

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
      <div style={{ paddingTop: '8px' }}>
        <div className="pulse" style={{ color: 'var(--primary)', fontSize: '15px', fontWeight: 700, textAlign: 'center', marginBottom: '18px' }}>
          Versando una fresca... 🍺
        </div>
        <div className="skeleton-feed">
          {[0, 1, 2].map((i) => (
            <div key={i} className="card activity-card" style={{ cursor: 'default' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                <div className="sk sk-avatar" />
                <div style={{ flex: 1 }}>
                  <div className="sk sk-line" style={{ width: '45%', marginBottom: '8px' }} />
                  <div className="sk sk-line" style={{ width: '30%', height: '9px' }} />
                </div>
              </div>
              <div className="sk sk-line" style={{ width: '70%', height: '18px', marginBottom: '12px' }} />
              <div className="sk sk-stats" />
              <div style={{ display: 'flex', gap: '8px' }}>
                <div className="sk sk-line" style={{ width: '64px', height: '26px', borderRadius: '20px' }} />
                <div className="sk sk-line" style={{ width: '80px', height: '26px', borderRadius: '20px' }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // SCHERMATA D'IMPATTO SE L'UTENTE NON E LOGGATO
  if (!currentUser) {
    return (
      <div className="landing-section-gap" style={{ display: 'flex', flexDirection: 'column', gap: '96px', marginTop: '-30px', paddingBottom: '90px' }}>

        {/* HERO SECTION */}
        <section className="r-grid-2-1" style={{ alignItems: 'center', minHeight: '82vh', padding: '40px 0', borderBottom: '1px solid var(--border-dark)', position: 'relative' }}>
          <div className="glow-orb" style={{ top: '-40px', left: '-60px', width: '260px', height: '260px', background: 'var(--primary)' }} />
          <div className="glow-orb" style={{ bottom: '-30px', right: '10%', width: '200px', height: '200px', background: 'var(--secondary)', opacity: 0.18, animationDelay: '1.5s' }} />

          <div className="reveal is-visible" style={{ display: 'flex', flexDirection: 'column', gap: '24px', position: 'relative', zIndex: 1 }}>
            <span className="eyebrow-pill" style={{ background: 'rgba(255, 32, 0, 0.1)', color: 'var(--primary)' }}>
              <span className="live-dot" /> Il Social Network degli Atleti da Bar
            </span>
            <h1 className="hero-title">
              Bevi con gli amici.<br />
              Sfidali. <span className="gradient-text">Condividi tutto.</span>
            </h1>
            <p className="hero-para">
              Strabar è il <b style={{ color: '#FFF' }}>social degli atleti da bar</b>: registra le sessioni, tagga gli amici e brindate insieme. Calcoliamo <b style={{ color: '#FFF' }}>Unità Alcoliche</b> e <b style={{ color: '#FFF' }}>tasso alcolico (BAC)</b>, scali le classifiche dei locali e condividi i tuoi record. Insieme è più divertente — e più consapevole.
            </p>
            <div className="hero-btns">
              <Link href="/auth" className="btn btn-primary lift" style={{ padding: '16px 32px', borderRadius: '30px', fontSize: '17px', fontWeight: '700', display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                Inizia Gratis <ChevronRight size={18} />
              </Link>
              <Link href="/routes" className="btn btn-secondary lift" style={{ padding: '16px 32px', borderRadius: '30px', fontSize: '17px' }}>
                Esplora i Percorsi
              </Link>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap', color: 'var(--text-dark-secondary)', fontSize: '13px', fontWeight: 600 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}><Zap size={14} color="var(--secondary)" /> Nessuna app store</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}><Gauge size={14} color="var(--success)" /> 100% gratis</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>🔞 Solo 18+</span>
            </div>
          </div>

          {/* Mockup telefono fluttuante con BAC live */}
          <div className="hero-mock reveal is-visible reveal-d2" style={{ background: 'linear-gradient(135deg, rgba(22, 24, 34, 0.95) 0%, rgba(255, 32, 0, 0.14) 100%)', border: '1px solid var(--primary)', borderRadius: '24px', padding: '26px', boxShadow: '0px 18px 50px rgba(255, 32, 0, 0.18)', display: 'flex', flexDirection: 'column', gap: '18px', position: 'relative', overflow: 'hidden', zIndex: 1 }}>
            <div style={{ position: 'absolute', top: '-50px', right: '-50px', width: '150px', height: '150px', background: 'var(--primary)', filter: 'blur(80px)', borderRadius: '50%', opacity: 0.4 }} />

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div className="activity-avatar" style={{ border: '2px solid var(--primary)', width: '38px', height: '38px', fontSize: '14px' }}>S</div>
                <div>
                  <h4 style={{ fontSize: '14px', fontWeight: '700' }}>La tua sessione</h4>
                  <span style={{ fontSize: '11px', color: 'var(--success)', display: 'inline-flex', alignItems: 'center', gap: '5px' }}><span className="live-dot" /> Live ora</span>
                </div>
              </div>
              <span className="badge-premium" style={{ fontSize: '8px' }}>PRO</span>
            </div>

            {/* Gauge BAC animato */}
            <div style={{ background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-dark)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '10px' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-dark-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Tasso alcolico stimato</span>
                <span style={{ fontFamily: 'var(--font-display)', fontSize: '24px', color: 'var(--primary)', lineHeight: 1 }}>0,68 <span style={{ fontSize: '12px', fontFamily: 'var(--font-sans)', color: 'var(--text-dark-secondary)' }}>g/l</span></span>
              </div>
              <div className="bac-track"><div className="bac-fill" /></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '7px', fontSize: '10px', color: 'var(--text-dark-secondary)' }}>
                <span>Sobrio</span><span>Limite guida</span><span>Alto</span>
              </div>
            </div>

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

            <div style={{ borderTop: '1px solid var(--border-dark)', paddingTop: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', color: 'var(--text-dark-secondary)' }}>
              <span>👥 Con Luca e Francesca</span>
              <span style={{ color: 'var(--primary)', fontWeight: '700' }}>Stato: Molto Caldo 🔥</span>
            </div>
          </div>
        </section>

        {/* CAPABILITY CHIPS — sostituiscono le statistiche inventate con fatti reali */}
        <section className="cap-grid reveal">
          {[
            { ico: <Gauge size={22} />, c: 'var(--primary)', bg: 'rgba(255,32,0,0.1)', t: 'Widmark', s: 'Calcolo BAC scientifico' },
            { ico: <MapPin size={22} />, c: 'var(--secondary)', bg: 'rgba(223,255,0,0.1)', t: 'GPS reale', s: 'Mappe OpenStreetMap' },
            { ico: <Zap size={22} />, c: 'var(--success)', bg: 'rgba(16,185,129,0.1)', t: 'Gratis', s: 'Nessun costo, niente store' },
            { ico: <Bell size={22} />, c: '#2563EB', bg: 'rgba(37,99,235,0.12)', t: 'PWA', s: 'Installabile + notifiche' },
          ].map((x, i) => (
            <div key={i} className={`cap-chip lift reveal reveal-d${(i % 3) + 1}`}>
              <div className="cap-ico" style={{ color: x.c, background: x.bg }}>{x.ico}</div>
              <div className="cap-title">{x.t}</div>
              <div className="cap-sub">{x.s}</div>
            </div>
          ))}
        </section>

        {/* SOCIAL / COMMUNITY — è un social: si compete e si condivide */}
        <section className="r-grid-2 reveal" style={{ alignItems: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <span className="eyebrow-pill" style={{ background: 'rgba(255,32,0,0.1)', color: 'var(--primary)' }}>
              <Users size={14} /> Community
            </span>
            <h2 style={{ fontSize: '38px', fontWeight: '900', color: '#FFF' }}>
              Non è un diario. È un <span className="gradient-text">social</span>.
            </h2>
            <p style={{ color: 'var(--text-dark-secondary)', fontSize: '16px', lineHeight: '1.6' }}>
              Segui gli amici, vedi le loro sessioni nel feed, taggali e mandate brindisi. Competete nelle classifiche dei locali per il titolo di Leggenda e condividete i record direttamente sui social. Bere diventa un gioco di squadra.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {[
                { ico: <Users size={18} />, c: 'var(--primary)', bg: 'rgba(255,32,0,0.1)', t: 'Feed & amici', d: 'Segui gli atleti, tagga i compagni e segui le loro serate in tempo reale.' },
                { ico: <Trophy size={18} />, c: 'var(--secondary)', bg: 'rgba(223,255,0,0.1)', t: 'Competi', d: 'Classifiche per locale e settimanali: scala la vetta e difendi il trono.' },
                { ico: <Share2 size={18} />, c: 'var(--success)', bg: 'rgba(16,185,129,0.1)', t: 'Condividi', d: 'Esporta sessioni e record con una grafica pronta per Instagram e WhatsApp.' },
              ].map((x, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '12px 14px', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px solid var(--border-dark)' }}>
                  <span className="feat-ico" style={{ color: x.c, background: x.bg, width: '38px', height: '38px', borderRadius: '10px' }}>{x.ico}</span>
                  <div>
                    <strong style={{ color: '#FFF', fontSize: '15px' }}>{x.t}</strong>
                    <p style={{ fontSize: '13px', color: 'var(--text-dark-secondary)', lineHeight: 1.45 }}>{x.d}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Mock di un post del feed: tag, brindisi, commenti, condivisione */}
          <div className="lift" style={{ background: 'var(--bg-card-dark)', border: '1px solid var(--border-dark)', borderRadius: '18px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px', boxShadow: 'var(--shadow)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div className="activity-avatar" style={{ width: '40px', height: '40px', fontSize: '15px' }}>L</div>
              <div style={{ flex: 1 }}>
                <strong style={{ fontSize: '14px', color: '#FFF', display: 'block' }}>Luca M.</strong>
                <span style={{ fontSize: '12px', color: 'var(--text-dark-secondary)' }}>con <b style={{ color: 'var(--primary)' }}>@francy</b> e altri 2 • 2h fa</span>
              </div>
              <span style={{ fontSize: '11px', color: 'var(--success)', display: 'inline-flex', alignItems: 'center', gap: '5px' }}><span className="live-dot" /> Live</span>
            </div>

            <h3 className="activity-title" style={{ fontSize: '18px' }}>Aperitivo Sforzo Massimo 🏆</h3>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              <span className="drink-tag" style={{ fontSize: '11px' }}>🍺 3x Birra</span>
              <span className="drink-tag" style={{ fontSize: '11px' }}>🍹 2x Spritz</span>
              <span className="drink-tag" style={{ fontSize: '11px' }}>📍 Bar Centrale</span>
            </div>

            <div style={{ borderTop: '1px solid var(--border-dark)', paddingTop: '12px', display: 'flex', alignItems: 'center', gap: '18px', fontSize: '13px', color: 'var(--text-dark-secondary)' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'var(--secondary)', fontWeight: 700 }}>🍻 12 brindisi</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}><MessageSquare size={15} /> 4</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', marginLeft: 'auto', color: 'var(--primary)', fontWeight: 700 }}><Share2 size={15} /> Condividi</span>
            </div>
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: '36px' }}>
          <div className="reveal" style={{ textAlign: 'center' }}>
            <span className="eyebrow-pill reveal" style={{ background: 'rgba(223,255,0,0.1)', color: 'var(--secondary)', margin: '0 auto' }}>Come funziona</span>
            <h2 style={{ fontSize: '40px', fontWeight: '900', color: '#FFF', marginTop: '14px' }}>Dalla prima birra al record, in 3 passi</h2>
          </div>
          <div className="how-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px' }}>
            {[
              { n: '01', t: 'Registra la sessione', d: 'Aggiungi i drink dal catalogo o crea il tuo. Tagga gli amici e fai check-in nel locale.' },
              { n: '02', t: 'Analizza BAC & U.A.', d: 'Vediamo tasso alcolico, unità alcoliche, durata e curva di smaltimento in tempo reale.' },
              { n: '03', t: 'Scala la classifica', d: 'Accumula U.A. nel tuo locale, diventa la Leggenda e ricevi le notifiche delle sfide.' },
            ].map((s, i) => (
              <div key={i} className={`how-step lift reveal reveal-d${i + 1}`}>
                <div className="how-num">{s.n}</div>
                <h4>{s.t}</h4>
                <p>{s.d}</p>
              </div>
            ))}
          </div>
        </section>

        {/* FEATURES GRID — cosa fa davvero Strabar */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: '36px' }}>
          <div className="reveal" style={{ textAlign: 'center' }}>
            <h2 style={{ fontSize: '40px', fontWeight: '900', color: '#FFF' }}>Tutto quello che fa Strabar</h2>
            <p style={{ color: 'var(--text-dark-secondary)', fontSize: '18px', marginTop: '10px', maxWidth: '620px', marginInline: 'auto' }}>
              Non solo un diario delle bevute: un assistente completo per le tue serate.
            </p>
          </div>

          <div className="feat-grid">
            {[
              { ico: <Gauge size={24} />, c: 'var(--primary)', bg: 'rgba(255,32,0,0.1)', t: 'Tasso alcolico (BAC)', d: 'Stimiamo il tuo tasso alcolico con la formula di Widmark in base a peso, sesso, drink e tempo. Curva di smaltimento e momento stimato del ritorno a 0,0 g/l. Valore indicativo, mai medico o legale.' },
              { ico: <Beer size={24} />, c: 'var(--secondary)', bg: 'rgba(223,255,0,0.1)', t: 'Unità Alcoliche (U.A.)', d: 'Ogni drink pesa in U.A. reali, calcolate da gradazione (ABV) e volume del bicchiere. Capisci quanto stai realmente bevendo e quando è il caso di fermarti.' },
              { ico: <Bell size={24} />, c: '#2563EB', bg: 'rgba(37,99,235,0.12)', t: 'Notifiche push', d: 'Ricevi avvisi quando un amico ti tagga, commenta o brinda con te, quando perdi il trono di un locale o quando parte una nuova sfida. Anche ad app chiusa.' },
              { ico: <Calendar size={24} />, c: 'var(--success)', bg: 'rgba(16,185,129,0.1)', t: 'Eventi', d: 'Crea o unisciti agli eventi: aperitivi, pub crawl e serate di gruppo. Vedi chi partecipa, ritrovati nel locale e fai partire la sessione condivisa con un tap.' },
              { ico: <MapPin size={24} />, c: 'var(--primary)', bg: 'rgba(255,32,0,0.1)', t: 'Percorsi & Pub Crawl', d: 'Pianifica itinerari tra bar reali con mappe OpenStreetMap. Coordinate GPS vere, distanze a piedi tra le tappe e itinerari pronti come il Giro dei Bacari a Venezia.' },
              { ico: <Trophy size={24} />, c: 'var(--secondary)', bg: 'rgba(223,255,0,0.1)', t: 'Classifiche & Leggenda', d: 'Ogni locale ha la sua classifica. Accumula visite e U.A. per diventare la Leggenda del Locale, sblocca badge e scala le classifiche settimanali con gli amici.' },
            ].map((f, i) => (
              <div key={i} className={`feat-card lift reveal reveal-d${(i % 3) + 1}`}>
                <div className="feat-ico" style={{ color: f.c, background: f.bg }}>{f.ico}</div>
                <h3>{f.t}</h3>
                <p>{f.d}</p>
              </div>
            ))}
          </div>
        </section>

        {/* PERCORSI — preview mappa reale di Venezia */}
        <section className="r-grid-1-2 landing-section-padded reveal" style={{ borderTop: '1px solid var(--border-dark)', borderBottom: '1px solid var(--border-dark)', padding: '60px 0' }}>
          <div>
            <span className="eyebrow-pill" style={{ background: 'rgba(223, 255, 0, 0.1)', color: 'var(--secondary)' }}>
              <MapPin size={14} /> Percorsi
            </span>
            <h2 style={{ fontSize: '38px', fontWeight: '900', color: '#FFF', marginTop: '15px', marginBottom: '15px' }}>
              Giro dei Bacari Storico a Venezia 🛶
            </h2>
            <p style={{ color: 'var(--text-dark-secondary)', fontSize: '16px', lineHeight: '1.6', marginBottom: '25px' }}>
              Un esempio dei percorsi che puoi seguire o creare. Tappe con coordinate GPS reali, distanze a piedi calcolate e ordine ottimizzato per il tuo pub crawl perfetto.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {[
                { t: 'Cantina Do Mori', d: 'Il locale più antico di Venezia (fondato nel 1462). Famoso per i cicheti "francobolli".' },
                { t: "Osteria All'Arco", d: 'Tappa leggendaria per i cicheti caldi preparati al momento con ingredienti del mercato.' },
                { t: 'Osteria Al Mercà', d: 'Famoso per lo spritz al Select o al Campari, servito al volo in piedi davanti a Rialto.' },
              ].map((p, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'start', gap: '12px' }}>
                  <span style={{ background: 'var(--primary)', color: '#FFF', width: '24px', height: '24px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: '800', marginTop: '2px', flexShrink: 0 }}>{i + 1}</span>
                  <div>
                    <strong style={{ color: '#FFF' }}>{p.t}</strong>
                    <p style={{ fontSize: '13px', color: 'var(--text-dark-secondary)' }}>{p.d}</p>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: '30px' }}>
              <Link href="/routes" className="btn btn-primary lift" style={{ padding: '12px 24px', fontSize: '15px', display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                Vedi tutti i percorsi <ChevronRight size={16} />
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

        {/* STATISTICHE & LEGGENDA DEL LOCALE */}
        <section className="r-grid-2 reveal" style={{ alignItems: 'center' }}>
          <div className="lift" style={{ background: 'linear-gradient(135deg, rgba(223, 255, 0, 0.05) 0%, rgba(22, 24, 34, 0.8) 100%)', border: '1px solid var(--border-dark)', borderRadius: '16px', padding: '30px', boxShadow: 'var(--shadow)' }}>
            <div style={{ color: 'var(--secondary)', marginBottom: '15px' }}>
              <Trophy size={36} />
            </div>
            <h3 style={{ fontSize: '24px', fontWeight: '800', color: '#FFF', marginBottom: '10px' }}>Diventa la &quot;Leggenda del Locale&quot; 👑</h3>
            <p style={{ color: 'var(--text-dark-secondary)', fontSize: '15px', lineHeight: '1.5', marginBottom: '20px' }}>
              Ogni bar reale ha la sua classifica. Chi registra più sessioni o consuma più U.A. in un determinato locale ne diventa il custode supremo.
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
            <span className="eyebrow-pill" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10B981' }}>
              <BarChart3 size={14} /> Statistiche & Analisi
            </span>
            <h2 style={{ fontSize: '38px', fontWeight: '900', color: '#FFF' }}>
              Non è alcolismo. È analisi statistica.
            </h2>
            <p style={{ color: 'var(--text-dark-secondary)', fontSize: '16px', lineHeight: '1.6' }}>
              Ogni sessione diventa un grafico: heatmap mensile delle bevute, gradazione media, tempi a tavola e andamento del tasso alcolico nel tempo. Un radar live ti mostra anche chi sta bevendo vicino a te adesso. Le tue performance sociali, finalmente in numeri.
            </p>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <span className="drink-tag" style={{ fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}><Radar size={13} /> Radar live</span>
              <span className="drink-tag" style={{ fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}><Flame size={13} /> Heatmap mensile</span>
              <span className="drink-tag" style={{ fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}><Users size={13} /> Tag amici</span>
            </div>
          </div>
        </section>

        {/* CTA CARD */}
        <section className="card landing-cta-pad reveal" style={{ position: 'relative', overflow: 'hidden', background: 'linear-gradient(135deg, rgba(255, 32, 0, 0.15) 0%, rgba(22, 24, 34, 0.95) 100%)', border: '1px solid var(--border-dark)', padding: '60px 40px', borderRadius: '24px', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '20px', alignItems: 'center' }}>
          <div className="glow-orb" style={{ top: '-60px', left: '50%', width: '240px', height: '240px', background: 'var(--primary)', opacity: 0.25 }} />
          <Sparkles size={32} color="var(--secondary)" style={{ position: 'relative', zIndex: 1 }} />
          <h2 style={{ fontSize: '38px', fontWeight: '900', color: '#FFF', maxWidth: '600px', position: 'relative', zIndex: 1 }}>
            Pronto per il prossimo record al tavolo?
          </h2>
          <p style={{ color: 'var(--text-dark-secondary)', fontSize: '17px', maxWidth: '500px', lineHeight: '1.5', position: 'relative', zIndex: 1 }}>
            Crea il tuo profilo atleta, tagga i compagni di brindisi e inizia subito ad analizzare le tue sessioni. Gratis, dal browser.
          </p>
          <Link href="/auth" className="btn btn-primary lift" style={{ padding: '16px 36px', borderRadius: '30px', fontSize: '18px', fontWeight: '700', marginTop: '10px', position: 'relative', zIndex: 1, display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
            Registrati gratis <ChevronRight size={18} />
          </Link>
        </section>

      </div>
    );
  }

  // Dynamic variables for selected activity modal
  let totalU = 0;
  let derivedBac = 0;
  let localLegend = { name: "Nessuno", count: 0 };
  let topUnitsLeaderboard = [];
  let topBacLeaderboard = [];
  let bacCurve = null;
  let isRealVenue = false;

  if (selectedActivity) {
    totalU = parseFloat(selectedActivity.total_units || selectedActivity.drinks?.reduce((acc, d) => acc + ((d.units || 1.5) * d.qty), 0) || 0);

    // Peso e sesso del proprietario della sessione (per BAC/curva precisi); fallback 70kg
    const ownerWeight =
      (selectedActivity.user_id === currentUser?.id ? currentUser?.weight : selectedActivity.profiles?.weight) || undefined;
    const ownerSex =
      (selectedActivity.user_id === currentUser?.id ? currentUser?.sex : selectedActivity.profiles?.sex) || undefined;

    // Residuo da sessioni precedenti dello stesso utente (tasso pregresso), anche per lo storico
    const selResidual = priorResidualFor(selectedActivity);

    // Sessione LIVE → BAC attuale (adesso), coerente col pannello live del proprietario
    // e uguale per tutti gli spettatori. Sessione chiusa → picco deterministico.
    derivedBac = isLiveAct(selectedActivity)
      ? db.calculateCurrentBAC(selectedActivity.drinks || [], selectedActivity.created_at, selectedActivity.duration || effortMinutes(selectedActivity) || 1, undefined, ownerWeight, selectedActivity.full_stomach, ownerSex, selResidual)
      : db.calculatePeakBAC(selectedActivity.drinks || [], selectedActivity.created_at, selectedActivity.duration || 120, ownerWeight, selectedActivity.full_stomach, ownerSex, selResidual);

    // La "Classifica del Locale" ha senso solo per locali REALI (con coordinate e verificati):
    // le sessioni libere/non verificate non sono locali → niente classifica/legenda.
    const loc = selectedActivity.location;
    isRealVenue = !!(loc && loc.name && !loc.freeform && !loc.unverified && typeof loc.lat === 'number' && typeof loc.lng === 'number');
    if (isRealVenue && venueBoard && venueBoard.key === db.normalizePlaceKey(loc.name)) {
      // Classifiche da DATI COMPLETI (venueBoard), uguali per tutti, private escluse.
      // U.A. per utente (la stessa persona non compare due volte).
      topUnitsLeaderboard = (venueBoard.byUnits || []).map(u => ({ name: u.name, totalUnits: u.units }));
      // Leggenda = #1 per U.A. totali (metrica unica, coerente con la pagina Locali).
      localLegend = venueBoard.legend?.name
        ? { name: venueBoard.legend.name, totalUnits: venueBoard.legend.units }
        : localLegend;
      // Record BAC di picco per singola sessione.
      topBacLeaderboard = venueBoard.topBac || [];
    }

    // Curva BAC reale basata sugli orari di aggiunta dei singoli drink (peso reale se disponibile)
    bacCurve = db.calculateBACCurve(selectedActivity.drinks || [], selectedActivity.created_at, selectedActivity.duration || 120, ownerWeight, selectedActivity.full_stomach, ownerSex, selResidual);
  }

  // Visibilità live: una sessione PRIVATA non appare a nessuno finché è attiva
  // (riappare nel feed solo a chiusura); 'friends' solo ai follower. Le mie le vedo sempre.
  const isVisibleToMe = (a) => {
    // La mia sessione live attiva è rappresentata dal banner/pannello, non nel feed.
    if (activeSession && a.id === activeSession.id) return false;
    if (!a.is_active) return true; // sessioni chiuse: sempre nel feed
    if (currentUser && a.user_id === currentUser.id) return true; // le mie
    const share = a.location?.share;
    if (share === 'private') return false;
    // "Amici" = collegamento di follow in QUALSIASI direzione (io seguo lui O lui segue me).
    if (share === 'friends') return followingIds.includes(a.user_id) || followerIds.includes(a.user_id);
    return true; // 'public' o sessioni storiche senza flag
  };

  // Feed filtrato: prima per visibilità, poi il filtro scelto.
  // 'all' = tutto; 'friends' = chi seguo + le mie; 'live' = solo sessioni live in corso.
  const visibleActivities = activities
    .filter(isVisibleToMe)
    .filter((a) => {
      if (feedFilter === 'live') return isLiveAct(a);
      if (feedFilter === 'friends' && currentUser) return a.user_id === currentUser.id || followingIds.includes(a.user_id);
      return true;
    });

  return (
    <div className="dashboard-grid">
      {/* Colonna Sinistra: Feed delle Attività */}
      <div className="feed-list">
        {/* Banner sponsor (gestito da /admin) */}
        {banners.length > 0 && (() => {
          const b = banners[0];
          const inner = (
            <div className="card" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              {b.image_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={b.image_url} alt={b.title} style={{ width: '100%', maxHeight: 160, objectFit: 'cover' }} />
              )}
              <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-dark-secondary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    Sponsor{b.partner ? ` · ${b.partner}` : ''}
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#FFF', marginTop: 2 }}>{b.title}</div>
                  {b.body && <div style={{ fontSize: 13, color: 'var(--text-dark-secondary)', marginTop: 2 }}>{b.body}</div>}
                </div>
                {b.link_url && (
                  <span className="btn btn-primary" style={{ flexShrink: 0, borderRadius: 20, padding: '8px 16px', fontSize: 13 }}>{b.cta || 'Scopri'}</span>
                )}
              </div>
            </div>
          );
          return b.link_url
            ? <a href={b.link_url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', display: 'block', marginBottom: 16 }}>{inner}</a>
            : <div style={{ marginBottom: 16 }}>{inner}</div>;
        })()}
        {currentUser ? (
          activeSession ? (
            <>
              {/* Banner compatto: la diretta non occupa più il feed. Tocca per gestirla. */}
              <button type="button" onClick={() => setShowLivePanel(true)} style={{ width: '100%', textAlign: 'left', cursor: 'pointer', border: '1px solid var(--primary)', background: 'linear-gradient(135deg, #17181B 0%, #1c130c 100%)', borderRadius: '14px', padding: '12px 14px', marginBottom: '18px', display: 'flex', alignItems: 'center', gap: '10px', boxShadow: '0 0 16px rgba(255,32,0,0.2)' }}>
                <span className="pulse" style={{ color: 'var(--primary)', fontWeight: 800, fontSize: '13px', display: 'inline-flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--primary)', display: 'inline-block' }} /> LIVE 🔴
                </span>
                <span style={{ flex: 1, minWidth: 0, fontSize: '13px', color: '#FFF', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  Sei in diretta · <strong>{activeSession.location ? activeSession.location.name : 'Sessione Libera'}</strong> · ⏱️ {elapsedMinutes} min
                </span>
                <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--primary)', flexShrink: 0 }}>Gestisci ›</span>
              </button>

              {showLivePanel && (
              <div onClick={() => setShowLivePanel(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)', zIndex: 1300, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '16px', overflowY: 'auto' }}>
              <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: '640px', marginTop: 'calc(78px + env(safe-area-inset-top, 0px))', marginBottom: '40px' }}>
            <div className="card" style={{ border: '2px solid var(--primary)', background: 'linear-gradient(135deg, #17181B 0%, #1c130c 100%)', marginBottom: '25px', position: 'relative', boxShadow: '0px 0px 20px rgba(255, 32, 0, 0.25)', borderRadius: '16px' }}>
              <button onClick={() => setShowLivePanel(false)} aria-label="Chiudi" className="btn btn-secondary" style={{ position: 'absolute', top: '12px', right: '12px', borderRadius: '50%', width: 34, height: 34, padding: 0, fontSize: 18, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 5 }}>×</button>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', marginBottom: '10px', paddingRight: '40px' }}>
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

                    {/* Esito ultimo drink/posizione, mostrato per intero (la notifica di sistema lo tronca) */}
                    {tourMsg && (
                      <div onClick={() => setTourMsg(null)} style={{ fontSize: '12px', lineHeight: 1.45, background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-dark)', borderRadius: '10px', padding: '10px 12px', marginBottom: '10px', cursor: 'pointer', color: 'var(--text-dark-primary)' }}>
                        {tourMsg}
                        <span style={{ display: 'block', fontSize: '10px', color: 'var(--text-dark-secondary)', marginTop: '4px' }}>tocca per chiudere</span>
                      </div>
                    )}

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
                      {cur > 0 && (
                        <button onClick={handleGoBackTourStop} className="btn btn-secondary" style={{ fontSize: '12px', padding: '6px 12px', borderRadius: '14px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }} title="Torna alla tappa precedente (annulla un avanzamento per errore)">
                          ⬅️ Indietro
                        </button>
                      )}
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
                <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                  <button
                    onClick={() => setShareSheet({ id: activeSession.id, caption: `Sono in diretta su Strabar 🍻 — ${activeSession.total_units ? activeSession.total_units.toFixed(1) + ' U.A.' : 'segui la mia sessione'}!` })}
                    className="btn btn-primary"
                    title="Condividi la diretta (link o scheda social)"
                    style={{ fontSize: '11px', padding: '5px 10px', borderRadius: '12px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                  >
                    <Share2 size={12} /> Condividi
                  </button>
                  <button
                    onClick={() => handleEditActivity(activeSession)}
                    className="btn btn-secondary"
                    style={{ fontSize: '11px', padding: '5px 10px', borderRadius: '12px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                  >
                    <Edit size={12} /> Modifica
                  </button>
                </div>
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
                  {/* BAC ATTUALE (adesso), ricalcolato live: non è il picco, che si vede
                      a sessione chiusa. elapsedMinutes lo tiene aggiornato ogni 15s. */}
                  {(() => {
                    const liveBac = db.calculateCurrentBAC(
                      activeSession.drinks || [],
                      activeSession.created_at,
                      activeSession.duration || elapsedMinutes || 1,
                      undefined,
                      currentUser?.weight,
                      activeSession.full_stomach,
                      currentUser?.sex,
                      liveResidualGrams
                    );
                    return (
                      <>
                        <div style={{ fontSize: '11px', color: 'var(--text-dark-secondary)', textTransform: 'uppercase', fontWeight: '600', display: 'inline-flex', alignItems: 'center', gap: '4px', justifyContent: 'center' }}>BAC Attuale <BacInfo size={12} /></div>
                        <div style={{ fontSize: '24px', fontWeight: '800', color: liveBac > 0.5 ? 'var(--error)' : 'var(--success)', marginTop: '4px' }}>
                          {liveBac.toFixed(2)} <span style={{ fontSize: '12px' }}>g/l</span>
                        </div>
                      </>
                    );
                  })()}
                  {liveResidualGrams > 0 && (
                    <div style={{ fontSize: '10px', color: 'var(--secondary)', marginTop: '2px' }}>
                      include residuo precedente
                    </div>
                  )}
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
                const curve = db.calculateBACCurve(activeSession.drinks || [], activeSession.created_at, activeSession.duration || elapsedMinutes || 1, currentUser?.weight, activeSession.full_stomach, currentUser?.sex, liveResidualGrams);
                if (!curve) return null;
                return (
                  <div style={{ marginBottom: '15px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-dark)', borderRadius: '8px', padding: '12px' }}>
                    <span style={{ fontSize: '11px', color: 'var(--text-dark-secondary)', textTransform: 'uppercase', fontWeight: '600', display: 'block', marginBottom: '6px' }}>📈 Curva di ebbrezza (g/l)</span>
                    <BacCurve curve={curve} height={140} />
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

              {/* Consiglio pacing: evita di loggare i drink tutti insieme (curva più realistica) */}
              {pacingTip && (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', background: 'rgba(223,255,0,0.08)', border: '1px solid rgba(223,255,0,0.35)', borderRadius: '12px', padding: '12px 14px', marginBottom: '14px' }}>
                  <span style={{ fontSize: '18px', flexShrink: 0, lineHeight: 1.2 }}>📈</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <strong style={{ fontSize: '13px', color: '#FFF', display: 'block', marginBottom: '2px' }}>Registra ogni drink quando lo inizi</strong>
                    <span style={{ fontSize: '12px', color: 'var(--text-dark-secondary)', lineHeight: 1.45 }}>
                      La curva del tasso alcolico usa l&apos;orario di ogni drink. Inserirli tutti insieme la rende meno precisa (picco anticipato e più alto del reale). Aggiungili man mano che bevi per una stima accurata.
                    </span>
                  </div>
                  <button onClick={() => setPacingTip(false)} aria-label="Chiudi" style={{ background: 'none', border: 'none', color: 'var(--text-dark-secondary)', cursor: 'pointer', flexShrink: 0, fontSize: '16px', lineHeight: 1, padding: '2px' }}>×</button>
                </div>
              )}

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
                      disabled={addingDrink}
                      className="btn btn-secondary"
                      style={{ padding: '6px 12px', fontSize: '12px', borderRadius: '15px', opacity: addingDrink ? 0.5 : 1, cursor: addingDrink ? 'wait' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                    >
                      {preset.label}
                      <span style={{ fontSize: '10px', fontWeight: 700, color: preset.abv > 0 ? 'var(--secondary)' : 'var(--text-dark-secondary)', background: 'rgba(0,0,0,0.25)', borderRadius: '8px', padding: '1px 5px' }}>
                        {preset.abv > 0 ? `${preset.abv}°` : 'analc.'}
                      </span>
                    </button>
                  ))}
                </div>
                <div style={{ marginTop: '12px' }}>
                  <BeerPicker onPick={handleAddDrinkToActiveSession} disabled={addingDrink} />
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
                        disabled={addingDrink}
                        className="btn btn-secondary"
                        style={{ padding: '6px 12px', fontSize: '12px', borderRadius: '15px', border: '1px solid var(--border-dark)', opacity: addingDrink ? 0.5 : 1, cursor: addingDrink ? 'wait' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                      >
                        {preset.label}
                        <span style={{ fontSize: '10px', fontWeight: 700, color: preset.abv > 0 ? 'var(--secondary)' : 'var(--text-dark-secondary)', background: 'rgba(0,0,0,0.25)', borderRadius: '8px', padding: '1px 5px' }}>
                          {preset.abv > 0 ? `${preset.abv}°` : 'analc.'}
                        </span>
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
                          onClick={() => addCompanion(`${(p.name_mode === 'alias' && p.alias) || p.display_name || p.username} (@${p.username})`)}
                          style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', textAlign: 'left', padding: '8px 10px', background: 'none', border: 'none', borderBottom: '1px solid var(--border-dark)', cursor: 'pointer', color: '#FFF' }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255, 32, 0,0.08)'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
                        >
                          <span className="activity-avatar" style={{ width: '26px', height: '26px', fontSize: '12px', flexShrink: 0 }}>
                            {(p.display_name || p.username || 'U').charAt(0).toUpperCase()}
                          </span>
                          <span style={{ display: 'flex', flexDirection: 'column' }}>
                            <strong style={{ fontSize: '12px' }}>{publicName(p)}</strong>
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
              </div>
              </div>
              )}
            </>
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

        {/* Filtro feed: Amici / Tutti / Live */}
        {currentUser && activities.length > 0 && (
          <div className="seg-tabs feed-filter-tabs" style={{ marginTop: '20px', marginBottom: '12px', maxWidth: '360px' }}>
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
            <div
              className={`seg-tab ${feedFilter === 'live' ? 'active' : ''}`}
              onClick={() => setFeedFilter('live')}
            >
              🔴 Live
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
            ) : feedFilter === 'live' ? (
              <p style={{ color: 'var(--text-dark-secondary)' }}>Nessuna sessione 🔴 live in questo momento. Avviane una tu! 🍻</p>
            ) : (
              <p style={{ color: 'var(--text-dark-secondary)' }}>Nessuna attività registrata. Sii il primo a brindare! 🥂</p>
            )}
          </div>
        ) : (
          visibleActivities.map((act) => {
            const hasCheered = act.cheered_by_me || act.cheers?.includes(currentUser?.id);
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
                        {publicName(act.profiles, 'Utente Strabar')}
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
                    <span className="stat-label" style={{ gap: '4px' }}>Tasso Alcolico Est. <BacInfo size={12} /></span>
                    <span className={`bac-pill ${displayBac(act) >= 0.5 ? 'high' : displayBac(act) >= 0.2 ? 'mid' : 'low'}`}>
                      {displayBac(act).toFixed(2)} <span style={{ fontSize: '13px', fontFamily: 'var(--font-sans)', fontWeight: 700, opacity: 0.7 }}>g/l</span>
                    </span>
                  </div>
                </div>

                {/* Lista Drink (raggruppati): chip con emoji per tipo + badge quantità */}
                <div className="activity-drinks-detail">
                  {groupDrinks(act.drinks).map((drink, idx) => (
                    <span key={idx} className="drink-tag">
                      <span style={{ fontSize: '14px', lineHeight: 1 }}>{drinkEmoji(drink.name)}</span>
                      {drink.name}
                      {drink.qty > 1 && (
                        <strong style={{ color: 'var(--primary)', background: 'rgba(255,32,0,0.12)', borderRadius: '7px', padding: '0 6px', fontSize: '11px' }}>×{drink.qty}</strong>
                      )}
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

                 {/* Anteprima foto (copertina leggera): UNA sola immagine lazy nel feed; al
                     tocco apre lo slideshow con TUTTE le foto, caricate solo allora.
                     Così il feed resta velocissimo (nessun download foto finché non serve). */}
                 {act.cover_url && (
                   <button
                     type="button"
                     onClick={(e) => { e.stopPropagation(); openSessionPhotos(act); }}
                     aria-label="Apri le foto della serata"
                     className="activity-cover"
                   >
                     {/* eslint-disable-next-line @next/next/no-img-element */}
                     <img
                       src={act.cover_url}
                       alt="Foto della serata"
                       loading="lazy"
                       decoding="async"
                     />
                     <span style={{ position: 'absolute', bottom: 10, right: 10, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', color: '#FFF', fontSize: 11, fontWeight: 600, padding: '4px 9px', borderRadius: 14, display: 'inline-flex', alignItems: 'center', gap: 4, zIndex: 1 }}>
                       <Camera size={12} /> Foto
                     </span>
                   </button>
                 )}

                 {/* Niente foto ma sessione geolocalizzata (anche "libera"): mostra la mappa
                     del punto. Mappa NON interattiva: lo scroll del feed scorre sopra e il
                     tap sulla mappa apre il dettaglio della sessione (dove c'è la mappa piena). */}
                 {!act.cover_url && (() => {
                   const loc = act.location;
                   const lat = loc?.lat;
                   const lng = loc?.lng ?? loc?.lon;
                   if (typeof lat !== 'number' || typeof lng !== 'number') return null;
                   const wp = [{ name: loc.name || 'Qui', lat, lng, note: loc.name || '' }];
                   return (
                     <div style={{ height: '170px', width: '100%', borderRadius: '10px', overflow: 'hidden', border: '1px solid var(--border-dark)', marginBottom: '15px', position: 'relative' }}>
                       <LazyMap waypoints={wp} height="100%" connectLine={false} interactive={false} />
                     </div>
                   );
                 })()}

                {renderCompanionsList(act)}

                {/* Chi ha messo Cheers — mostriamo il CONTEGGIO cliccabile: toccandolo si
                    apre l'elenco, caricato ON-DEMAND (getCheerers). */}
                {(act.cheer_count || 0) > 0 && (
                  <button
                    type="button"
                    onClick={() => openCheersList(act)}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--text-dark-secondary)', marginBottom: '4px', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                  >
                    <Beer size={13} style={{ color: 'var(--primary)', flexShrink: 0 }} fill="var(--primary)" />
                    <span><strong style={{ color: '#FFF' }}>{act.cheer_count}</strong> cheers</span>
                  </button>
                )}

                {/* Actions (Cheers, Commenta, Condividi) */}
                <div className="activity-actions">
                  <button 
                    onClick={() => handleCheers(act.id)} 
                    className={`action-btn ${hasCheered ? 'active' : ''}`}
                  >
                    <Beer size={18} fill={hasCheered ? 'var(--primary)' : 'none'} />
                    <span>Cheers ({act.cheer_count ?? act.cheers?.length ?? 0})</span>
                  </button>

                  <button onClick={() => toggleCommentsSection(act.id)} className="action-btn">
                    <MessageSquare size={18} />
                    <span>Commenta ({act.comments?.length || act.comment_count || 0})</span>
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
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                              <strong>{comment.user_name}</strong>
                              <span style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                                <span style={{ fontSize: '11px', color: 'var(--text-dark-secondary)' }}>{formatDate(comment.created_at)}</span>
                                {currentUser && comment.user_id === currentUser.id && editingComment?.id !== comment.id && (
                                  <>
                                    <button type="button" onClick={() => setEditingComment({ id: comment.id, text: comment.text })} title="Modifica" style={{ background: 'none', border: 'none', color: 'var(--text-dark-secondary)', cursor: 'pointer', padding: 0, fontSize: '12px' }}>✏️</button>
                                    <button type="button" onClick={() => handleDeleteComment(act.id, comment.id)} title="Elimina" style={{ background: 'none', border: 'none', color: 'var(--error)', cursor: 'pointer', padding: 0, fontSize: '12px' }}>🗑️</button>
                                  </>
                                )}
                              </span>
                            </div>
                            {editingComment?.id === comment.id ? (
                              <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                                <input
                                  className="form-control"
                                  value={editingComment.text}
                                  onChange={(e) => setEditingComment((p) => ({ ...p, text: e.target.value }))}
                                  onKeyDown={(e) => { if (e.key === 'Enter') handleSaveCommentEdit(act.id, comment.id); if (e.key === 'Escape') setEditingComment(null); }}
                                  style={{ flex: 1, height: '32px', fontSize: '13px' }}
                                  autoFocus
                                />
                                <button type="button" onClick={() => handleSaveCommentEdit(act.id, comment.id)} className="btn btn-primary" style={{ borderRadius: '8px', padding: '4px 10px', fontSize: '12px' }}>Salva</button>
                                <button type="button" onClick={() => setEditingComment(null)} className="btn btn-secondary" style={{ borderRadius: '8px', padding: '4px 10px', fontSize: '12px' }}>✕</button>
                              </div>
                            ) : (
                              <p style={{ color: 'var(--text-dark-primary)' }}>{comment.text}</p>
                            )}
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

      {/* Colonna Destra: Sidebar Statistiche e Leaderboard — NASCOSTA su mobile (le card
          non hanno senso sotto il feed; la classifica è in /places, i premi sul profilo). */}
      <div className="home-sidebar" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
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
            Classifica per Unità Alcoliche (U.A.) dei check-in geolocalizzati — come nella sezione Classifiche.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {leaderboardData.map((item, idx) => (
              <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: item.user_id === currentUser?.id ? 'rgba(255, 32, 0, 0.08)' : 'rgba(255,255,255,0.01)', borderRadius: '8px', border: item.user_id === currentUser?.id ? '1px dashed var(--primary)' : '1px solid transparent' }}>
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

      {/* Slideshow foto a tutto schermo (apribile da feed e dettaglio) */}
      {lightbox && lightbox.images.length > 0 && (
        <MediaLightbox images={lightbox.images} startIndex={lightbox.index} onClose={() => setLightbox(null)} />
      )}

      {/* MODAL DETTAGLI ATTIVITA */}
      {selectedActivity && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0, 0, 0, 0.85)', zIndex: 1400, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px', backdropFilter: 'blur(8px)' }} onClick={() => setSelectedActivity(null)}>
          <div className="card" style={{ width: '100%', maxWidth: '650px', maxHeight: '90vh', overflowY: 'auto', background: '#0B0A09', border: '2px solid var(--primary)', boxShadow: '0px 0px 30px rgba(255, 32, 0, 0.25)', animation: 'slideUp 0.3s ease', position: 'relative', paddingBottom: 'calc(24px + env(safe-area-inset-bottom, 0px))' }} onClick={(e) => e.stopPropagation()}>
            
            {/* Header del Modal */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '20px', borderBottom: '1px solid var(--border-dark)', paddingBottom: '15px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <Link href={`/u/${selectedActivity.user_id}`} onClick={() => setSelectedActivity(null)} aria-label="Apri profilo">
                  <Avatar src={selectedActivity.profiles?.avatar_url} name={selectedActivity.profiles?.display_name || selectedActivity.profiles?.username} size={45} style={{ border: '2px solid var(--primary)', cursor: 'pointer' }} />
                </Link>
                <div>
                  <h4 style={{ fontSize: '16px', fontWeight: '700', margin: 0, display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <Link href={`/u/${selectedActivity.user_id}`} onClick={() => setSelectedActivity(null)} style={{ color: 'inherit' }}>{publicName(selectedActivity.profiles)}</Link>
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
                  {/* Immagine Attiva (tap per ingrandire a schermo intero) */}
                  <div
                    onClick={() => setLightboxOpen(true)}
                    title="Tocca per ingrandire"
                    style={{
                      width: '100%',
                      height: '100%',
                      backgroundImage: `url(${images[currentSlideIndex]?.url})`,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                      transition: 'background-image 0.2s ease-in-out',
                      cursor: 'zoom-in'
                    }} />
                  {/* Icona "ingrandisci" in alto a destra */}
                  <div style={{ position: 'absolute', top: '10px', right: '10px', background: 'rgba(0,0,0,0.55)', color: '#FFF', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2, pointerEvents: 'none', fontSize: '15px' }}>⛶</div>
                  
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

            {/* Visore foto a schermo intero (lightbox) */}
            {lightboxOpen && (() => {
              const images = selectedActivity.media?.filter(m => m.type === 'image') || [];
              if (images.length === 0) return null;
              const idx = Math.min(currentSlideIndex, images.length - 1);
              return (
                <div
                  onClick={() => setLightboxOpen(false)}
                  style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.94)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={images[idx]?.url}
                    alt={`Foto ${idx + 1}`}
                    onClick={(e) => e.stopPropagation()}
                    style={{ maxWidth: '96vw', maxHeight: '88vh', objectFit: 'contain', borderRadius: '8px' }}
                  />
                  {/* Chiudi */}
                  <button
                    type="button"
                    onClick={() => setLightboxOpen(false)}
                    style={{ position: 'absolute', top: '16px', right: '16px', background: 'rgba(255,255,255,0.15)', border: 'none', color: '#FFF', width: '40px', height: '40px', borderRadius: '50%', fontSize: '20px', cursor: 'pointer', zIndex: 2 }}
                  >
                    ✕
                  </button>
                  {/* Contatore */}
                  <div style={{ position: 'absolute', bottom: '20px', left: '50%', transform: 'translateX(-50%)', color: '#FFF', fontSize: '13px', fontWeight: 600, background: 'rgba(0,0,0,0.5)', padding: '4px 12px', borderRadius: '20px' }}>
                    {idx + 1} / {images.length}
                  </div>
                  {/* Frecce */}
                  {images.length > 1 && (
                    <>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setCurrentSlideIndex(prev => (prev === 0 ? images.length - 1 : prev - 1)); }}
                        style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.15)', border: 'none', color: '#FFF', width: '44px', height: '44px', borderRadius: '50%', fontSize: '24px', cursor: 'pointer' }}
                      >
                        ‹
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setCurrentSlideIndex(prev => (prev === images.length - 1 ? 0 : prev + 1)); }}
                        style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.15)', border: 'none', color: '#FFF', width: '44px', height: '44px', borderRadius: '50%', fontSize: '24px', cursor: 'pointer' }}
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
                <div style={{ fontSize: '11px', color: 'var(--text-dark-secondary)', fontWeight: '600', textTransform: 'uppercase', display: 'inline-flex', alignItems: 'center', gap: '4px', justifyContent: 'center' }}>BAC Stimato <BacInfo size={12} /></div>
                <div style={{ fontSize: '22px', fontWeight: '800', color: derivedBac > 0.5 ? 'var(--error)' : 'var(--success)', marginTop: '5px' }}>
                  {derivedBac.toFixed(2)} <span style={{ fontSize: '12px', fontWeight: '600' }}>g/l</span>
                </div>
              </div>
            </div>

            {/* TIMELINE CURVA BAC */}
            <div style={{ marginBottom: '25px', background: 'rgba(255, 32, 0, 0.02)', border: '1px solid var(--border-dark)', padding: '16px', borderRadius: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
                <h3 style={{ fontSize: '15px', fontWeight: '700', color: '#FFF', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                  📈 Curva d&apos;Ebbrezza
                </h3>
                <InfoPopover size={16} label="Come viene calcolato il tasso alcolico">
                  <strong style={{ color: '#FFF', display: 'block', marginBottom: '6px', fontSize: '13px' }}>Come viene calcolato — formula di Widmark</strong>
                  <p style={{ margin: '0 0 8px 0' }}>
                    Il tasso alcolemico (BAC, g/l) è calcolato con la <strong style={{ color: 'var(--secondary)' }}>formula di Widmark</strong>:
                  </p>
                  <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: '6px', padding: '8px 12px', fontFamily: 'monospace', fontSize: '11px', color: 'var(--secondary)', marginBottom: '8px' }}>
                    BAC = grammi_alcol_netti / (peso_kg × r)
                  </div>
                  <strong style={{ color: '#FFF', display: 'block', marginBottom: '4px' }}>Dati usati per il calcolo:</strong>
                  <ul style={{ margin: '0 0 8px 0', paddingLeft: '16px' }}>
                    <li><strong style={{ color: '#FFF' }}>Drink registrati</strong> — tipo, gradazione (ABV%) e Unità Alcoliche (U.A.). 1 U.A. = 12 g di alcol puro (standard italiano). I drink vengono distribuiti uniformemente nell&apos;arco della sessione.</li>
                    <li><strong style={{ color: '#FFF' }}>Peso corporeo</strong> — dal tuo profilo (default: 70 kg se non impostato). Più pesi, più il BAC si diluisce.</li>
                    <li><strong style={{ color: '#FFF' }}>Sesso biologico</strong> — dal profilo. Il coefficiente r di Widmark è 0,68 (uomo) o 0,55 (donna); la velocità di smaltimento β è 0,17 g/l/h (uomo) o 0,14 g/l/h (donna).</li>
                    <li><strong style={{ color: '#FFF' }}>Stomaco pieno o vuoto</strong> — cambia la velocità di assorbimento. A stomaco vuoto il picco arriva prima (≈30–40 min); a stomaco pieno più tardi (≈75–90 min).</li>
                    <li><strong style={{ color: '#FFF' }}>Residuo alcolico pregresso</strong> — grammi ancora in circolo da sessioni chiuse nelle 6 ore precedenti, che si sommano al calcolo corrente.</li>
                  </ul>
                  <p style={{ margin: 0, color: 'rgba(255,255,255,0.4)', fontSize: '11px' }}>
                    ⚠️ Stima indicativa a scopo informativo, non diagnostico. I valori reali variano in base a metabolismo, idratazione e altri fattori individuali.
                  </p>
                </InfoPopover>
              </div>

              {/* Nota: curva della singola sessione */}
              <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-start', background: 'rgba(223, 255, 0,0.05)', border: '1px solid rgba(223, 255, 0,0.15)', borderRadius: '6px', padding: '7px 10px', marginBottom: '12px' }}>
                <span style={{ fontSize: '12px', flexShrink: 0 }}>ℹ️</span>
                <p style={{ fontSize: '11px', color: 'var(--text-dark-secondary)', margin: 0, lineHeight: 1.4 }}>
                  {selectedActivity?.is_active && (Date.now() - new Date(selectedActivity.created_at).getTime()) < 5 * 60 * 60 * 1000
                    ? <><strong style={{ color: 'var(--primary)' }}>Sessione LIVE in corso.</strong> Il BAC è calcolato in tempo reale al momento attuale.</>
                    : <><strong style={{ color: 'var(--secondary)' }}>Curva storica di questa singola sessione.</strong> Il BAC mostrato rappresenta il picco stimato al termine della sessione, non adesso. (L&apos;alcol è già smaltito.)</>}
                </p>
              </div>
              {bacCurve
                ? <BacCurve curve={bacCurve} height={170} />
                : <p style={{ fontSize: '12px', color: 'var(--text-dark-secondary)', fontStyle: 'italic', margin: '8px 0' }}>Nessun drink registrato in questa sessione.</p>}
            </div>

            {/* SEZIONE MAPPA / INTEGRAZIONE LOCALE */}
            {selectedActivity.location && (
              <div style={{ marginBottom: '25px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: '700', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  📍 Sede del Brindisi
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

                  {/* Classifiche del Locale — solo per locali reali e verificati (no sessioni libere/non verificate) */}
                  {isRealVenue && (
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
                        <div style={{ fontSize: '11px', color: 'var(--text-dark-secondary)', fontWeight: '700', textTransform: 'uppercase', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          ⚡ Record BAC (Picco g/l) <BacInfo size={12} />
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
                        <strong>Leggenda del Locale:</strong> {localLegend.name}{localLegend.totalUnits ? ` (${localLegend.totalUnits.toFixed(1)} U.A. totali)` : ''}.
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
                    <div key={idx} onClick={med.type === 'image' ? () => openSessionPhotos(selectedActivity, idx) : undefined} style={{ background: 'var(--bg-input-dark)', border: '1px solid var(--border-dark)', borderRadius: '8px', padding: '10px', textAlign: 'center', position: 'relative', overflow: 'hidden', height: '120px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: '8px', cursor: med.type === 'image' ? 'pointer' : 'default' }}>
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

            {/* Elenco consumazioni — ordinato, con icona per tipo, quantità e barra U.A. */}
            <h3 style={{ fontSize: '16px', fontWeight: '700', marginBottom: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>Drink della sessione</span>
              <span style={{ fontSize: '12px', color: 'var(--text-dark-secondary)', fontWeight: 600 }}>
                {selectedActivity.drinks.reduce((s, d) => s + (d.qty || 0), 0)} drink · {parseFloat(selectedActivity.total_units || 0).toFixed(1)} U.A.
              </span>
            </h3>
            {(() => {
              const grouped = groupDrinks(selectedActivity.drinks);
              const maxU = Math.max(0.1, ...grouped.map((d) => (d.units ? d.units * d.qty : d.qty * 1.5)));
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '25px' }}>
                  {grouped.map((drink, idx) => {
                    const calculatedUnits = drink.units ? drink.units * drink.qty : drink.qty * 1.5;
                    const drinkTime = drink.added_at ? new Date(drink.added_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
                    return (
                      <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', background: 'var(--bg-input-dark)', border: '1px solid var(--border-dark)', borderRadius: '10px' }}>
                        <div style={{ width: 38, height: 38, borderRadius: '10px', background: 'rgba(255,32,0,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>
                          {drinkEmoji(drink.name)}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <strong style={{ fontSize: '14px', color: '#FFF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{drink.name}</strong>
                            {drink.qty > 1 && <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--primary)', background: 'rgba(255,32,0,0.12)', borderRadius: '8px', padding: '1px 7px', flexShrink: 0 }}>×{drink.qty}</span>}
                          </div>
                          <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden', marginTop: 6 }}>
                            <div style={{ width: `${(calculatedUnits / maxU) * 100}%`, height: '100%', background: 'var(--primary)', borderRadius: 3 }} />
                          </div>
                          <div style={{ fontSize: '10px', color: 'var(--text-dark-secondary)', marginTop: 3 }}>
                            {drink.abv}%{drinkTime && ` · ${drinkTime}`}
                          </div>
                        </div>
                        <strong style={{ fontSize: '14px', color: 'var(--primary)', flexShrink: 0, minWidth: 56, textAlign: 'right' }}>{calculatedUnits.toFixed(1)} U.A.</strong>
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            {/* Sezione Aggiungi Drink — solo per la sessione LIVE in corso, non sui post già chiusi */}
            {currentUser && selectedActivity.user_id === currentUser.id && selectedActivity.is_active && (
              <div style={{ background: 'rgba(255, 32, 0, 0.05)', border: '1px dashed var(--primary)', padding: '15px', borderRadius: '12px', marginBottom: '25px' }}>
                <h4 style={{ fontSize: '14px', fontWeight: '800', color: 'var(--primary)', marginBottom: '10px', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Plus size={16} /> Aggiungi Drink in tempo reale
                </h4>
                <p style={{ fontSize: '11px', color: 'var(--text-dark-secondary)', marginBottom: '12px' }}>
                  Aggiungi un drink consumato adesso. La curva di ebbrezza e la durata della sessione verranno ricalcolate all&apos;orario corrente.
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {QUICK_DRINKS.map((preset, pIdx) => (
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
                <div style={{ marginTop: '12px' }}>
                  <BeerPicker onPick={handleAddDrinkToSession} />
                </div>
              </div>
            )}

            {/* Azioni proprietario: modifica/elimina la sessione anche dallo storico */}
            {currentUser && selectedActivity.user_id === currentUser.id && (
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '25px' }}>
                <button
                  type="button"
                  onClick={() => { handleEditActivity(selectedActivity); setSelectedActivity(null); }}
                  className="btn btn-secondary"
                  style={{ flex: 1, minWidth: '140px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '10px 14px', fontSize: '13px', fontWeight: 700 }}
                >
                  <Edit size={15} /> Modifica sessione
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteActivity(selectedActivity.id)}
                  style={{ flex: 1, minWidth: '140px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '10px 14px', fontSize: '13px', fontWeight: 700, background: 'rgba(239,68,68,0.12)', border: '1px solid var(--error)', color: '#FF7D7D', borderRadius: 'var(--radius)', cursor: 'pointer' }}
                >
                  <Trash2 size={15} /> Elimina
                </button>
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
                            onClick={() => openCheersList(selectedActivity)}
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
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 1450, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', backdropFilter: 'blur(6px)' }} onClick={() => setShowCheersList(false)}>
          <div className="card" style={{ width: '100%', maxWidth: '420px', maxHeight: '70vh', display: 'flex', flexDirection: 'column', border: '1px solid var(--border-dark)', padding: '0', overflow: 'hidden' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 18px', borderBottom: '1px solid var(--border-dark)' }}>
              <strong style={{ fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Beer size={18} color="var(--primary)" fill="var(--primary)" /> Cheers ({cheersListActivity.cheer_count ?? cheersListActivity.cheers?.length ?? cheersListPeople.length})
              </strong>
              <button onClick={() => setShowCheersList(false)} className="btn btn-secondary" style={{ padding: '4px 10px', borderRadius: '50%', minWidth: '32px', height: '32px' }}>×</button>
            </div>
            <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
              {cheersListLoading ? (
                <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-dark-secondary)' }}>
                  <Loader size={18} style={{ animation: 'spin 1s linear infinite' }} />
                </div>
              ) : cheersListPeople.length === 0 ? (
                <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-dark-secondary)', fontSize: 13 }}>Nessuno per ora.</div>
              ) : cheersListPeople.map((p) => (
                <Link
                  key={p.id}
                  href={`/u/${p.id}`}
                  onClick={() => { setShowCheersList(false); setSelectedActivity(null); }}
                  style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 18px', borderBottom: '1px solid var(--border-dark)', textDecoration: 'none' }}
                >
                  <div className="activity-avatar" style={{ width: 40, height: 40, fontSize: 16, flexShrink: 0 }}>
                    {(p.name || 'A').charAt(0).toUpperCase()}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <strong style={{ fontSize: '14px', color: '#FFF', display: 'block' }}>{p.name}</strong>
                    {p.username && <span style={{ fontSize: '12px', color: 'var(--text-dark-secondary)' }}>@{p.username}</span>}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* MODAL MODIFICA ATTIVITA */}
      {editingActivity && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0, 0, 0, 0.85)', zIndex: 1400, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px', backdropFilter: 'blur(8px)' }} onClick={() => setEditingActivity(null)}>
          <div className="card" style={{ width: '100%', maxWidth: '600px', maxHeight: '90vh', overflowY: 'auto', background: '#0B0A09', border: '2px solid var(--primary)', boxShadow: '0px 0px 30px rgba(255, 32, 0, 0.25)', animation: 'slideUp 0.3s ease', position: 'relative', paddingBottom: 'calc(24px + env(safe-area-inset-bottom, 0px))' }} onClick={(e) => e.stopPropagation()}>
            
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
                      className={`seg-tab ${(editingActivity.location?.share || 'public') === k ? 'active' : ''}`}
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
              <div style={{ marginTop: '12px' }}>
                <BeerPicker onPick={handleAddTaskPresetToEdit} />
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
                        onClick={() => addEditCompanion(`${(p.name_mode === 'alias' && p.alias) || p.display_name || p.username} (@${p.username})`)}
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

      {/* SELETTORE CONDIVISIONE: scheda social (Instagram…) oppure link del live */}
      {shareSheet && (
        <div
          onClick={() => setShareSheet(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 1550, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: '0', backdropFilter: 'blur(6px)' }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ width: '100%', maxWidth: '480px', background: 'var(--bg-card-dark)', border: '1px solid var(--border-dark)', borderRadius: '22px 22px 0 0', padding: '20px', paddingBottom: 'calc(20px + env(safe-area-inset-bottom, 0px))', display: 'flex', flexDirection: 'column', gap: '12px' }}
          >
            <div style={{ width: '40px', height: '4px', borderRadius: '4px', background: 'var(--border-dark)', margin: '0 auto 6px' }} />
            <h3 style={{ fontSize: '17px', fontWeight: 800, color: '#FFF', textAlign: 'center' }}>Come vuoi condividere?</h3>

            <button
              onClick={() => { const id = shareSheet.id; setShareSheet(null); router.push(`/share/${id}`); }}
              className="btn btn-primary lift"
              style={{ width: '100%', padding: '14px', borderRadius: '16px', fontSize: '15px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '12px', justifyContent: 'flex-start', textAlign: 'left' }}
            >
              <Sparkles size={20} style={{ flexShrink: 0 }} />
              <span>Scheda per i social
                <span style={{ display: 'block', fontSize: '12px', fontWeight: 500, opacity: 0.85 }}>Immagine pronta per Instagram, storie e WhatsApp</span>
              </span>
            </button>

            <button
              onClick={() => { const s = shareSheet; setShareSheet(null); shareSessionLink(s.id, s.caption); }}
              className="btn btn-secondary"
              style={{ width: '100%', padding: '14px', borderRadius: '16px', fontSize: '15px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '12px', justifyContent: 'flex-start', textAlign: 'left' }}
            >
              <Share2 size={20} style={{ flexShrink: 0 }} />
              <span>Link del live
                <span style={{ display: 'block', fontSize: '12px', fontWeight: 500, opacity: 0.75 }}>Invia il collegamento alla sessione</span>
              </span>
            </button>

            <button
              onClick={() => setShareSheet(null)}
              className="btn btn-secondary"
              style={{ width: '100%', padding: '11px', borderRadius: '16px', fontSize: '14px', marginTop: '2px' }}
            >
              Annulla
            </button>
          </div>
        </div>
      )}

      {/* MODALE CONGRATULAZIONI: resoconto post-sessione + condivisione social */}
      {completedSession && (
        <div
          onClick={() => setCompletedSession(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)', zIndex: 1500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', backdropFilter: 'blur(8px)' }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="card reveal is-visible"
            style={{ maxWidth: '440px', width: '100%', background: 'linear-gradient(135deg, rgba(255,32,0,0.16) 0%, rgba(22,24,34,0.98) 60%)', border: '1px solid var(--border-dark)', borderRadius: '24px', padding: '28px', textAlign: 'center', position: 'relative', overflow: 'hidden' }}
          >
            <div className="glow-orb" style={{ top: '-50px', left: '50%', width: '200px', height: '200px', background: 'var(--primary)', opacity: 0.3 }} />
            <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ fontSize: '52px', lineHeight: 1 }}>🎉</div>
              <div>
                <h2 style={{ fontSize: '30px', fontWeight: 900, color: '#FFF' }}>Allenamento completato!</h2>
                <p style={{ fontSize: '14px', color: 'var(--text-dark-secondary)', marginTop: '4px' }}>
                  {completedSession.title}{completedSession.locationName ? ` · 📍 ${completedSession.locationName}` : ''}
                </p>
              </div>

              {/* Resoconto */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
                {[
                  { label: 'Durata', value: completedSession.duration >= 60 ? `${Math.floor(completedSession.duration / 60)}h ${completedSession.duration % 60}m` : `${completedSession.duration || 0}m`, color: '#FFF' },
                  { label: 'Drink', value: completedSession.drinkCount, color: 'var(--primary)' },
                  { label: 'Carico', value: `${completedSession.units.toFixed(1)} U.A.`, color: 'var(--secondary)' },
                  { label: 'Picco BAC', value: `${completedSession.peakBac.toFixed(2)} g/l`, color: completedSession.peakBac > 0.5 ? 'var(--error)' : 'var(--success)' },
                ].map((s, i) => (
                  <div key={i} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-dark)', borderRadius: '14px', padding: '14px 10px' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-dark-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>{s.label}</div>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: '26px', color: s.color, marginTop: '2px', lineHeight: 1 }}>{s.value}</div>
                  </div>
                ))}
              </div>

              <div style={{ fontSize: '13px', color: 'var(--text-dark-secondary)' }}>
                Stato finale: <b style={{ color: '#FFF' }}>{completedSession.feeling}</b>
              </div>

              {/* Azioni */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '4px' }}>
                <button
                  onClick={() => { const id = completedSession.id; setCompletedSession(null); router.push(`/share/${id}`); }}
                  className="btn btn-primary lift"
                  style={{ width: '100%', padding: '13px', borderRadius: '30px', fontSize: '15px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                >
                  <Sparkles size={17} /> Crea card e condividi
                </button>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    onClick={() => shareSessionLink(completedSession.id, `Sessione finita su Strabar 🍻 — ${completedSession.units.toFixed(1)} U.A., picco ${completedSession.peakBac.toFixed(2)} g/l!`)}
                    className="btn btn-secondary"
                    style={{ flex: 1, padding: '11px', borderRadius: '30px', fontSize: '14px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                  >
                    <Share2 size={15} /> Condividi link
                  </button>
                  <button
                    onClick={() => setCompletedSession(null)}
                    className="btn btn-secondary"
                    style={{ flex: 1, padding: '11px', borderRadius: '30px', fontSize: '14px' }}
                  >
                    Chiudi
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
