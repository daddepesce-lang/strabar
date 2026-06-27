'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/db';
import { Beer, MapPin, Play, Loader, Search, X, Clock, Plus, Minus, Trash2, Camera, Info } from 'lucide-react';
import { useDrinkCatalog } from '@/lib/useDrinkCatalog';
import BeerPicker from '@/components/BeerPicker';

export default function LogActivityPage() {
  const router = useRouter();
  // Catalogo drink dinamico (gestito da admin), con fallback statico immediato.
  const { quick: QUICK_DRINKS, extra: EXTRA_DRINKS } = useDrinkCatalog();
  const [currentUser, setCurrentUser] = useState(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [startingSession, setStartingSession] = useState(false);

  // Stati per la gestione della sessione già attiva
  const [activeSession, setActiveSession] = useState(null);
  const [showActiveSessionWarning, setShowActiveSessionWarning] = useState(false);
  const [showCloseActiveForm, setShowCloseActiveForm] = useState(false);
  const [isAppendingToSession, setIsAppendingToSession] = useState(false);

  // Stati per la selezione del locale (ricerca reale OpenStreetMap)
  const [showLocaleSelector, setShowLocaleSelector] = useState(false);
  const [nearbyVenues, setNearbyVenues] = useState([]);
  const [searchResults, setSearchResults] = useState([]);
  const [localeSearchQuery, setLocaleSearchQuery] = useState('');
  const [loadingVenues, setLoadingVenues] = useState(false);
  const [searchingVenues, setSearchingVenues] = useState(false);
  const [userCoords, setUserCoords] = useState(null);
  const [geoError, setGeoError] = useState(null);
  const [nearbyRadius, setNearbyRadius] = useState(200);
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [showInfo, setShowInfo] = useState(false); // popover "come funziona"
  const [manualPlace, setManualPlace] = useState({ name: '', address: '' });
  const [manualGeocoding, setManualGeocoding] = useState(false);

  // Loader a tutto schermo durante l'effettivo avvio della sessione
  const [checkingGps, setCheckingGps] = useState(false);

  // Visibilità della sessione live: chi la vede nel feed e sul radar mentre bevi.
  // 'private' = nascosta a tutti finché è live (riappare nel feed solo a chiusura).
  const [liveShare, setLiveShare] = useState('public'); // 'private' | 'friends' | 'public'
  const [fullStomach, setFullStomach] = useState(false); // stomaco pieno → BAC più preciso
  // Sessione libera: nascondi la posizione (niente GPS → non compari sul radar/mappa).
  const [hideLocation, setHideLocation] = useState(false);

  // Stati per registrazione a posteriori
  const [showRetroForm, setShowRetroForm] = useState(false);
  const [retroSaving, setRetroSaving] = useState(false);
  const [retroPhotoUploading, setRetroPhotoUploading] = useState(false);
  const [showAllRetroDrinks, setShowAllRetroDrinks] = useState(false);
  const [retroForm, setRetroForm] = useState({
    title: '',
    date: new Date().toISOString().slice(0, 16), // datetime-local format
    duration: 60,
    location: '',
    feeling: 'Allegro',
    description: '',
    drinks: [],
    media: []
  });

  const handleRetroAddPhoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert("Seleziona un file immagine valido.");
      return;
    }
    setRetroPhotoUploading(true);
    try {
      const { url, thumb } = await db.uploadImage(file);
      setRetroForm((p) => ({ ...p, media: [...p.media, { type: 'image', name: file.name, url, thumb }] }));
    } catch (err) {
      console.error('Errore upload foto:', err);
      alert("Errore nel caricamento della foto: " + (err.message || err));
    } finally {
      setRetroPhotoUploading(false);
    }
  };
  const handleRetroRemovePhoto = (idx) => {
    setRetroForm((p) => ({ ...p, media: p.media.filter((_, i) => i !== idx) }));
  };
  const DRINK_PRESETS = QUICK_DRINKS;
  const handleRetroAddDrink = (preset) => {
    setRetroForm(prev => {
      const existing = prev.drinks.findIndex(d => d.name === preset.name);
      if (existing >= 0) {
        const updated = [...prev.drinks];
        updated[existing] = { ...updated[existing], qty: updated[existing].qty + 1 };
        return { ...prev, drinks: updated };
      }
      return { ...prev, drinks: [...prev.drinks, { ...preset, qty: 1 }] };
    });
  };
  const handleRetroChangeDrinkQty = (idx, delta) => {
    setRetroForm(prev => {
      const updated = [...prev.drinks];
      updated[idx] = { ...updated[idx], qty: Math.max(0, updated[idx].qty + delta) };
      return { ...prev, drinks: updated.filter(d => d.qty > 0) };
    });
  };
  const handleRetroRemoveDrink = (idx) => {
    setRetroForm(prev => ({ ...prev, drinks: prev.drinks.filter((_, i) => i !== idx) }));
  };
  const handleRetroSubmit = async (e) => {
    e.preventDefault();
    if (retroForm.drinks.length === 0) {
      alert('Aggiungi almeno un drink alla sessione!');
      return;
    }
    setRetroSaving(true);
    try {
      const createdAt = new Date(retroForm.date).toISOString();
      const duration = parseInt(retroForm.duration, 10) > 0 ? parseInt(retroForm.duration, 10) : 60;
      const totalUnits = retroForm.drinks.reduce((acc, d) => acc + d.units * d.qty, 0);
      const bac = db.calculateCurrentBAC(
        retroForm.drinks,
        createdAt,
        duration,
        new Date(new Date(retroForm.date).getTime() + duration * 60 * 1000).toISOString(),
        currentUser?.weight,
        fullStomach,
        currentUser?.sex
      );
      await db.createActivity({
        title: retroForm.title || `Sessione del ${new Date(retroForm.date).toLocaleDateString('it-IT')}`,
        description: retroForm.description,
        drinks: retroForm.drinks,
        total_units: parseFloat(totalUnits.toFixed(1)),
        duration: duration,
        feeling: retroForm.feeling,
        location: retroForm.location ? { name: retroForm.location } : null,
        bac_level: parseFloat(bac.toFixed(2)),
        media: retroForm.media && retroForm.media.length > 0 ? retroForm.media : null,
        full_stomach: fullStomach,
        is_active: false,
        created_at: createdAt,  // data passata dall'utente per sessioni a posteriori
      });
      // Aggiorna il created_at della sessione appena creata se supportato
      // Nota: Supabase permette di passare created_at nell'insert
      alert('✅ Sessione registrata con successo!');
      router.push('/');
    } catch (err) {
      alert('Errore nel salvataggio: ' + err.message);
    } finally {
      setRetroSaving(false);
    }
  };

  useEffect(() => {
    const checkUser = async () => {
      try {
        if (!db || typeof db.getCurrentUser !== 'function') return;
        const user = await db.getCurrentUser();
        if (!user) {
          router.push('/auth');
        } else {
          setCurrentUser(user);
          if (typeof db.getActiveSession === 'function') {
            const active = await db.getActiveSession(user.id);
            if (active) {
              setActiveSession(active);
              
              // Se l'azione NON è append, mostriamo il warning. Se è append, bypassiamo il warning.
              const urlParams = new URLSearchParams(window.location.search);
              if (urlParams.get('action') !== 'append') {
                setShowActiveSessionWarning(true);
              }
            }
          }
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoadingUser(false);
      }
    };
    checkUser();

    // Gestione query parameter ?action=append per aggiungere una tappa direttamente
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('action') === 'append') {
      setIsAppendingToSession(true);
      openVenueSelector();
    }
    // Deep-link da notifica "tag in live": avvia la sessione nello STESSO locale
    // (?venue=&lat=&lng=). Si verifica comunque la posizione GPS per le classifiche.
    const venueName = urlParams.get('venue');
    const vLat = parseFloat(urlParams.get('lat'));
    const vLng = parseFloat(urlParams.get('lng'));
    if (venueName && Number.isFinite(vLat) && Number.isFinite(vLng)) {
      startFromTag({ name: venueName, lat: vLat, lng: vLng });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  // Richiede la posizione GPS. Risolve { coords } oppure { error } con un motivo preciso,
  // così possiamo dire all'utente cosa fare (abilitare il permesso, usare HTTPS, ecc.).
  const requestUserLocation = () =>
    new Promise((resolve) => {
      if (typeof navigator === 'undefined' || !navigator.geolocation) {
        resolve({ error: 'Il tuo browser non supporta la geolocalizzazione.' });
        return;
      }
      // Il GPS richiede una connessione sicura (HTTPS). In HTTP non parte nemmeno la richiesta.
      if (typeof window !== 'undefined' && window.isSecureContext === false) {
        resolve({ error: "Il GPS funziona solo su connessione sicura (https). Apri il sito in HTTPS." });
        return;
      }
      const ok = (pos) => resolve({ coords: { lat: pos.coords.latitude, lng: pos.coords.longitude } });
      const fail = (err) => {
        console.warn('Geolocalizzazione non disponibile:', err.code, err.message || err);
        let error;
        if (err.code === 1) {
          error = 'Permesso GPS negato. Abilita la posizione per Strabar dalle impostazioni del browser e riprova.';
        } else if (err.code === 2) {
          error = 'Posizione non disponibile. Su Mac/PC controlla che i Servizi di Localizzazione di sistema siano attivi per il browser; in alternativa cerca il locale per nome.';
        } else if (err.code === 3) {
          error = 'Tempo scaduto nel rilevare la posizione. Tocca "Riprova GPS".';
        } else {
          error = 'Impossibile rilevare la posizione. Cerca il locale per nome.';
        }
        resolve({ error });
      };
      // 1° tentativo: alta precisione (GPS). Se fallisce (tipico su desktop/Mac),
      // 2° tentativo a bassa precisione (WiFi/IP), spesso risolve.
      navigator.geolocation.getCurrentPosition(
        ok,
        () => navigator.geolocation.getCurrentPosition(ok, fail, { enableHighAccuracy: false, timeout: 12000, maximumAge: 600000 }),
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 120000 }
      );
    });

  // Apre il selettore locali: chiede il GPS e carica i bar reali vicini (OSM + community)
  const openVenueSelector = async () => {
    setShowLocaleSelector(true);
    setShowManualEntry(false);
    setLocaleSearchQuery('');
    setSearchResults([]);
    setGeoError(null);
    setLoadingVenues(true);
    const loc = await requestUserLocation();
    const coords = loc.coords || null;
    setUserCoords(coords);
    if (!coords) {
      setGeoError(loc.error || 'Posizione GPS non disponibile. Cerca il tuo locale per nome qui sotto.');
    }
    try {
      const { venues, widened } = await db.getCombinedNearbyPlaces(coords?.lat, coords?.lng, 200);
      setNearbyVenues(venues);
      setNearbyRadius(200);
      if (coords && venues.length === 0) {
        setGeoError('Nessun locale rilevato nelle vicinanze. Cercalo per nome o inseriscilo a mano.');
      } else if (coords && widened) {
        // Nessuno entro 200 m (raggio che "vale" per le classifiche): mostriamo i più vicini fino a 1 km.
        setGeoError('Nessun locale entro 200 m: ecco i più vicini (oltre i 200 m la sessione non conta per le classifiche).');
      }
    } catch (err) {
      console.error('Errore caricamento locali vicini:', err);
    } finally {
      setLoadingVenues(false);
    }
  };

  // Ricerca locali per nome su OpenStreetMap (debounced)
  useEffect(() => {
    const q = localeSearchQuery.trim();
    if (q.length < 2) {
      setSearchResults([]);
      setSearchingVenues(false);
      return;
    }
    setSearchingVenues(true);
    const handle = setTimeout(async () => {
      const res = await db.searchVenues(q, userCoords);
      // Tieni solo i veri locali: niente paesi, città, vie o regioni.
      // (Un locale non trovato si aggiunge a mano qui sotto.)
      const annotated = res
        .filter((v) => v.isVenue)
        .map((v) => ({
          ...v,
          distance:
            userCoords && v.lat && v.lng
              ? db.checkGeofencing(v.lat, v.lng, userCoords.lat, userCoords.lng, Infinity).distance
              : null,
        }));
      setSearchResults(annotated);
      setSearchingVenues(false);
    }, 450);
    return () => clearTimeout(handle);
  }, [localeSearchQuery, userCoords]);

  // Chiudi sessione corrente per avviare una nuova sessione
  const handleForceNewSession = async () => {
    try {
      if (!activeSession) return;
      const diffMs = new Date().getTime() - new Date(activeSession.created_at).getTime();
      const elapsed = Math.max(1, Math.round(diffMs / (60 * 1000)));
      await db.closeSession(activeSession.id, {
        is_active: false,
        feeling: activeSession.feeling || 'Sobrio',
        description: 'Chiusa per avviare una nuova sessione.',
        duration: elapsed
      });
      setActiveSession(null);
      setShowActiveSessionWarning(false);
      setShowCloseActiveForm(false);
    } catch (err) {
      alert("Errore nella chiusura della sessione precedente: " + err.message);
    }
  };

  // Chiudi e salva la sessione compilando il form
  const handleCloseActiveSession = async (e) => {
    e.preventDefault();
    if (!activeSession) return;
    const formData = new FormData(e.target);
    const feeling = formData.get('feeling');
    const description = formData.get('description');
    
    try {
      const diffMs = new Date().getTime() - new Date(activeSession.created_at).getTime();
      const elapsed = Math.max(1, Math.round(diffMs / (60 * 1000)));
      await db.closeSession(activeSession.id, {
        is_active: false,
        feeling,
        description,
        duration: elapsed
      });
      setActiveSession(null);
      setShowActiveSessionWarning(false);
      setShowCloseActiveForm(false);
    } catch (err) {
      alert("Errore nella chiusura della sessione: " + err.message);
    }
  };

  // Avvia Brindisi Libero / Roaming
  const handleStartFreeSession = async () => {
    if (activeSession) {
      setShowActiveSessionWarning(true);
      return;
    }

    setStartingSession(true);
    try {
      if (!db || typeof db.createActivity !== 'function') return;

      // Visibilità: salviamo sempre lo stato; per Tutti/Amici proviamo a prendere il GPS per il radar
      // freeform: sessione senza locale reale → esclusa da locali/classifiche dei locali.
      const location = { name: 'Sessione Libera', share: liveShare, freeform: true };
      // Niente GPS se la sessione è privata O se l'utente ha scelto di nascondere la posizione:
      // senza coordinate non compare sul radar/mappa.
      if (hideLocation) location.hidden = true;
      if (liveShare !== 'private' && !hideLocation) {
        const loc = await requestUserLocation();
        if (loc.coords) {
          location.lat = loc.coords.lat;
          location.lng = loc.coords.lng;
        }
      }

      await db.createActivity({
        title: 'Brindisi Live 🍻',
        drinks: [],
        location,
        full_stomach: fullStomach,
        is_active: true,
        bac_level: 0,
        total_units: 0,
        duration: 1
      });

      // Notifica PWA

      // Apre direttamente il pannello live per iniziare a registrare i drink.
      router.push('/?live=1');
    } catch (err) {
      alert("Errore nell'avvio della sessione libera: " + err.message);
    } finally {
      setStartingSession(false);
    }
  };

  // Clicca opzione check-in locale
  const handleLocaleCheckInClick = () => {
    if (activeSession) {
      setShowActiveSessionWarning(true);
      return;
    }
    setIsAppendingToSession(false);
    openVenueSelector();
  };

  // Costruisce i campi aggiornati per aggiungere una tappa alla sessione attiva
  const buildAppendFields = (session, venue) => {
    let sequence = [];
    if (session.location?.sequence && Array.isArray(session.location.sequence)) {
      sequence = [...session.location.sequence];
    } else if (session.location?.name) {
      sequence = [{
        name: session.location.name,
        address: session.location.address,
        lat: session.location.lat,
        lng: session.location.lng ?? session.location.lon,
      }];
    }
    sequence.push({
      name: venue.name,
      address: venue.address || '',
      lat: venue.lat ?? null,
      lng: venue.lng ?? null,
      visited_at: new Date().toISOString(),
    });
    const title = `Giro dei Bar: ${sequence.map((s) => s.name).join(' ➔ ')}`;
    return {
      location: {
        name: venue.name,
        address: venue.address || '',
        lat: venue.lat ?? null,
        lng: venue.lng ?? null,
        sequence,
      },
      title: title.length > 80 ? title.substring(0, 77) + '...' : title,
    };
  };

  // Avvia (o estende) una sessione live presso il locale scelto.
  // Nessun blocco GPS rigido: l'utente ha scelto attivamente il locale dalla lista reale.
  const startSessionAtVenue = async (venue) => {
    if (!venue || !venue.name) return;
    // Verifica posizione = serve una prova GPS che tu sia sul posto.
    //  • Sei lontano (>300m): registri lo stesso ma "non verificata" (non conta in classifica).
    //  • Nessuna distanza GPS (GPS negato / locale cercato per nome): NON possiamo verificare
    //    la posizione → registrabile ma "non verificata". Prima poteva contare in classifica
    //    senza alcuna prova: era un buco di integrità.
    let unverified = false;
    if (!isAppendingToSession) {
      if (venue.distance == null) {
        unverified = true;
      } else if (venue.distance > 300) {
        const dist = venue.distance >= 1000 ? `${(venue.distance / 1000).toFixed(1)} km` : `${venue.distance} m`;
        const ok = window.confirm(
          `Sei a circa ${dist} da "${venue.name}".\n\nPuoi registrare comunque, ma la sessione verrà segnata come "non verificata" e NON conterà per le classifiche (del locale e degli atleti).\n\nProcedere?`
        );
        if (!ok) return;
        unverified = true;
      }
    }
    setShowLocaleSelector(false);
    setCheckingGps(true);
    try {
      if (isAppendingToSession) {
        if (!activeSession) throw new Error('Nessuna sessione attiva da aggiornare.');
        await db.updateActivity(activeSession.id, buildAppendFields(activeSession, venue));
      } else {
        await db.createActivity({
          title: `Brindisi live presso ${venue.name} 🍻`,
          location: {
            name: venue.name,
            address: venue.address || '',
            lat: venue.lat ?? null,
            lng: venue.lng ?? null,
            share: liveShare,
            ...(unverified ? { unverified: true } : {}),
          },
          full_stomach: fullStomach,
          drinks: [],
          is_active: true,
          bac_level: 0,
          total_units: 0,
          duration: 1,
        });
      }
      // Apre direttamente il pannello live per iniziare a registrare i drink.
      router.push('/?live=1');
    } catch (err) {
      alert("Errore nell'avvio della sessione: " + (err.message || err));
      setCheckingGps(false);
    }
  };

  // Avvio da deep-link "tag in live": il locale è già noto (dal taggatore). Verifichiamo il GPS
  // per capire se l'utente è davvero sul posto; in caso contrario parte "non verificata" (non
  // conta per le classifiche), gestito da startSessionAtVenue tramite la distanza.
  const startFromTag = async (venue) => {
    if (activeSession) {
      alert('Hai già una sessione live attiva. Chiudila prima di avviarne un\'altra.');
      return;
    }
    const loc = await requestUserLocation();
    const distance = loc.coords && typeof db.checkGeofencing === 'function'
      ? db.checkGeofencing(venue.lat, venue.lng, loc.coords.lat, loc.coords.lng, Infinity).distance
      : 999999; // GPS non disponibile → trattata come "lontano" (non verificata)
    setUserCoords(loc.coords || null);
    startSessionAtVenue({ name: venue.name, lat: venue.lat, lng: venue.lng, distance });
  };

  // Avvia sessione da locale inserito manualmente.
  // Il locale DEVE avere coordinate per finire sulla mappa ed essere trovato dagli altri:
  // usiamo il GPS attuale se disponibile, altrimenti geolocalizziamo l'indirizzo (OpenStreetMap).
  const handleManualStart = async () => {
    const name = manualPlace.name.trim();
    const address = manualPlace.address.trim();
    if (!name) {
      alert('Inserisci almeno il nome del locale!');
      return;
    }

    let lat = userCoords?.lat ?? null;
    let lng = userCoords?.lng ?? null;

    if (lat == null || lng == null) {
      if (!address) {
        alert('Per mettere il locale sulla mappa serve la posizione.\n\nAttiva il GPS oppure inserisci un indirizzo (via e città) così possiamo localizzarlo.');
        return;
      }
      setManualGeocoding(true);
      try {
        let results = await db.searchVenues(`${name} ${address}`.trim());
        if (!results || results.length === 0) results = await db.searchVenues(address);
        const hit = (results || [])[0];
        if (hit && hit.lat && hit.lng) { lat = hit.lat; lng = hit.lng; }
      } catch (err) {
        console.warn('Geocoding indirizzo fallito:', err);
      } finally {
        setManualGeocoding(false);
      }
      if (lat == null || lng == null) {
        alert('Non sono riuscito a trovare la posizione di questo indirizzo.\n\nControlla via e città, oppure avvicinati al locale e attiva il GPS.');
        return;
      }
    }

    startSessionAtVenue({ name, address, lat, lng });
  };

  // Lista visualizzata nel selettore: risultati di ricerca o locali vicini
  const displayedVenues = localeSearchQuery.trim().length >= 2 ? searchResults : nearbyVenues;

  const formatDistance = (m) => {
    if (m == null) return null;
    return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${m} m`;
  };

  if (loadingUser || checkingGps) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <Loader size={36} className="pulse" style={{ color: 'var(--primary)', animation: 'spin 1s linear infinite' }} />
        <div style={{ color: 'var(--primary)', fontSize: '18px', fontWeight: 'bold' }}>
          {checkingGps ? "Agganciando il satellite GPS... 📡" : "Versando una fresca... 🍺"}
        </div>
        <style jsx global>{`
          @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        `}</style>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '22px' }}>
      <div style={{ textAlign: 'center' }}>
        <h1 style={{ fontSize: '28px', fontWeight: '900', color: '#FFF' }}>
          Registra 🍻
        </h1>
        <p style={{ color: 'var(--text-dark-secondary)', fontSize: '14px', marginTop: '8px', lineHeight: '1.5' }}>
          Traccia la serata e il tuo tasso alcolico, minuto per minuto.
        </p>
      </div>

      {/* DUE SCELTE */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {/* Registra sessione (ora) */}
        <div
          onClick={handleLocaleCheckInClick}
          className="card"
          style={{ cursor: 'pointer', background: 'linear-gradient(135deg, rgba(22, 24, 34, 0.95) 0%, rgba(255, 32, 0, 0.06) 100%)', border: '1px solid var(--border-dark)', display: 'flex', alignItems: 'center', gap: '18px', padding: '22px', transition: 'var(--transition)' }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-dark)'; e.currentTarget.style.transform = 'translateY(0)'; }}
        >
          <div style={{ background: 'rgba(255, 32, 0, 0.1)', color: 'var(--primary)', padding: '16px', borderRadius: '50%', flexShrink: 0 }}>
            {startingSession ? <Loader size={26} style={{ animation: 'spin 1s linear infinite' }} /> : <Play size={26} fill="var(--primary)" />}
          </div>
          <div style={{ flex: 1 }}>
            <h3 style={{ fontSize: '18px', fontWeight: '800', color: '#FFF' }}>Registra sessione</h3>
            <p style={{ fontSize: '13px', color: 'var(--text-dark-secondary)', marginTop: '4px', lineHeight: '1.4' }}>
              Adesso, in tempo reale. Scegli il locale dove sei o vai libera.
            </p>
          </div>
        </div>

        {/* Sessione passata */}
        <div
          onClick={() => setShowRetroForm(true)}
          className="card"
          style={{ cursor: 'pointer', background: 'linear-gradient(135deg, rgba(22, 24, 34, 0.95) 0%, rgba(16, 185, 129, 0.04) 100%)', border: '1px solid var(--border-dark)', display: 'flex', alignItems: 'center', gap: '18px', padding: '22px', transition: 'var(--transition)' }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#10B981'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-dark)'; e.currentTarget.style.transform = 'translateY(0)'; }}
        >
          <div style={{ background: 'rgba(16,185,129,0.1)', color: '#10B981', padding: '16px', borderRadius: '50%', flexShrink: 0 }}>
            <Clock size={26} />
          </div>
          <div style={{ flex: 1 }}>
            <h3 style={{ fontSize: '18px', fontWeight: '800', color: '#FFF' }}>Sessione passata</h3>
            <p style={{ fontSize: '13px', color: 'var(--text-dark-secondary)', marginTop: '4px', lineHeight: '1.4' }}>
              Inserisci una serata già conclusa: data, drink e locale.
            </p>
          </div>
        </div>
      </div>

      {/* Come funziona (i) — spiegazione breve della regola classifiche */}
      <div style={{ textAlign: 'center' }}>
        <button
          type="button"
          onClick={() => setShowInfo((v) => !v)}
          style={{ background: 'none', border: 'none', color: 'var(--text-dark-secondary)', fontSize: '13px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
        >
          <Info size={14} /> Come funziona per le classifiche
        </button>
        {showInfo && (
          <div className="card" style={{ textAlign: 'left', marginTop: '10px', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px', lineHeight: 1.4 }}>
            <div>📍 <strong>In un locale dove sei</strong> (GPS attivo) → vale per le classifiche.</div>
            <div>🚶 <strong>Locale ma sei lontano</strong> → registrata, ma non conta.</div>
            <div>🍸 <strong>Nessun locale</strong> → sessione libera (festa a casa, picnic…).</div>
          </div>
        )}
      </div>

      {/* Opzioni avanzate: privacy + stomaco (default sensati, qui solo se vuoi cambiarli) */}
      <details className="card" style={{ padding: '14px 16px' }}>
        <summary style={{ cursor: 'pointer', fontWeight: 700, fontSize: '14px', listStyle: 'none' }}>⚙️ Opzioni (privacy, stomaco)</summary>
        <div style={{ marginTop: '14px' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-dark-secondary)', display: 'block', marginBottom: '6px' }}>👀 Chi vede la tua sessione live?</span>
          <div className="seg-tabs">
            <div className={`seg-tab ${liveShare === 'public' ? 'active' : ''}`} onClick={() => setLiveShare('public')}>🌍 Tutti</div>
            <div className={`seg-tab ${liveShare === 'friends' ? 'active' : ''}`} onClick={() => setLiveShare('friends')}>👥 Amici</div>
            <div className={`seg-tab ${liveShare === 'private' ? 'active' : ''}`} onClick={() => setLiveShare('private')}>🔒 Privata</div>
          </div>

          {/* Sessione libera: nascondi posizione (no GPS → niente radar/mappa) */}
          <div style={{ marginTop: '12px' }}>
            <button
              type="button"
              onClick={() => setHideLocation((v) => !v)}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', width: '100%', background: 'var(--bg-input-dark)', border: '1px solid var(--border-dark)', borderRadius: '10px', padding: '10px 12px', cursor: 'pointer', color: 'var(--text-dark-primary)' }}
            >
              <span style={{ textAlign: 'left' }}>
                <span style={{ display: 'block', fontSize: '13px', fontWeight: 700 }}>📍 Nascondi la mia posizione</span>
                <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-dark-secondary)' }}>Sessione libera: non comparirai sul radar/mappa</span>
              </span>
              <span style={{ width: 44, height: 24, borderRadius: 12, flexShrink: 0, position: 'relative', background: hideLocation ? 'var(--primary)' : 'rgba(255,255,255,0.15)', transition: 'background .2s' }}>
                <span style={{ position: 'absolute', top: 2, left: hideLocation ? 22 : 2, width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'left .2s' }} />
              </span>
            </button>
          </div>

          <div style={{ marginTop: '12px' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-dark-secondary)', display: 'block', marginBottom: '6px' }}>🍽️ Hai mangiato? (stima BAC più precisa)</span>
            <div className="seg-tabs">
              <div className={`seg-tab ${!fullStomach ? 'active' : ''}`} onClick={() => setFullStomach(false)}>Stomaco vuoto</div>
              <div className={`seg-tab ${fullStomach ? 'active' : ''}`} onClick={() => setFullStomach(true)}>🍝 Stomaco pieno</div>
            </div>
          </div>
        </div>
      </details>

      {/* MODAL 1: Avviso Sessione Attiva */}
      {showActiveSessionWarning && activeSession && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1500, padding: '20px' }}>
          <div className="card" style={{ maxWidth: '450px', width: '100%', border: '2px solid var(--primary)', boxShadow: '0 0 25px rgba(255, 32, 0, 0.25)', padding: '24px', position: 'relative' }}>
            <h2 style={{ fontSize: '20px', fontWeight: '800', color: '#FFF', marginBottom: '10px' }}>Sessione Live Attiva! 🚨</h2>
            <p style={{ fontSize: '14px', color: 'var(--text-dark-secondary)', marginBottom: '20px', lineHeight: '1.5' }}>
              Hai già un brindisi live attivo presso <strong>{activeSession.location ? activeSession.location.name : 'Sessione Libera'}</strong> (durata: {Math.max(1, Math.round((new Date().getTime() - new Date(activeSession.created_at).getTime()) / 60000))} min).
            </p>

            {!showCloseActiveForm ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <button
                  onClick={() => {
                    setIsAppendingToSession(true);
                    setShowActiveSessionWarning(false);
                    openVenueSelector();
                  }}
                  className="btn btn-primary"
                  style={{ borderRadius: '20px', padding: '10px', fontSize: '14px', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}
                >
                  📍 Aggiungi Tappa / Cambia Bar
                </button>
                <button 
                  onClick={() => router.push('/')} 
                  className="btn btn-secondary" 
                  style={{ borderRadius: '20px', padding: '10px', fontSize: '14px' }}
                >
                  Continua Sessione Attiva 🍻
                </button>
                <button 
                  onClick={() => setShowCloseActiveForm(true)} 
                  className="btn btn-secondary" 
                  style={{ borderRadius: '20px', padding: '10px', fontSize: '14px' }}
                >
                  Termina e Salva Sessione Corrente 🏁
                </button>
                <button 
                  onClick={handleForceNewSession} 
                  className="btn btn-secondary" 
                  style={{ borderRadius: '20px', padding: '10px', fontSize: '14px', color: 'var(--error)' }}
                >
                  Chiudi e Avvia Nuova Sessione 🚀
                </button>
              </div>
            ) : (
              <form onSubmit={handleCloseActiveSession} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                <div>
                  <label style={{ fontSize: '11px', color: 'var(--text-dark-secondary)', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>Stato d&apos;animo finale</label>
                  <select name="feeling" className="form-control" style={{ height: '38px', fontSize: '13px' }}>
                    <option value="Sobrio">Sobrio</option>
                    <option value="Allegro">Allegro</option>
                    <option value="Brillo Felice">Brillo Felice</option>
                    <option value="Intenditore">Intenditore</option>
                    <option value="Molto Caldo">Molto Caldo 🔥</option>
                    <option value="Pieno Raso">Pieno Raso 💀</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '11px', color: 'var(--text-dark-secondary)', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>Note di chiusura</label>
                  <textarea name="description" className="form-control" placeholder="Com'è andata la serata? Racconta..." rows={2} style={{ fontSize: '13px', resize: 'none' }} />
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button type="button" onClick={() => setShowCloseActiveForm(false)} className="btn btn-secondary" style={{ flex: 1, borderRadius: '20px', fontSize: '13px' }}>
                    Indietro
                  </button>
                  <button type="submit" className="btn btn-primary" style={{ flex: 2, borderRadius: '20px', fontSize: '13px', fontWeight: 'bold' }}>
                    Salva e Chiudi
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* MODAL 2: Selettore Locale (ricerca reale OpenStreetMap) */}
      {showLocaleSelector && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1500, padding: '20px' }}>
          <div className="card" style={{ maxWidth: '500px', width: '100%', border: '1px solid var(--border-dark)', maxHeight: '85dvh', display: 'flex', flexDirection: 'column', padding: '24px', position: 'relative' }}>
            <button
              onClick={() => setShowLocaleSelector(false)}
              style={{ position: 'absolute', top: '10px', right: '10px', zIndex: 2, background: 'rgba(255,255,255,0.06)', borderRadius: '50%', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', color: 'var(--text-dark-secondary)', cursor: 'pointer' }}
              aria-label="Chiudi"
            >
              <X size={22} />
            </button>
            <h2 style={{ fontSize: '20px', fontWeight: '800', color: '#FFF', marginBottom: '8px', paddingRight: '36px' }}>
              {isAppendingToSession ? 'Aggiungi Tappa 📍' : 'Dove stai bevendo? 📍'}
            </h2>
            <p style={{ fontSize: '13px', color: 'var(--text-dark-secondary)', marginBottom: '15px' }}>
              {localeSearchQuery.trim().length >= 2
                ? 'Risultati della ricerca su mappa.'
                : userCoords
                ? `Bar e locali reali nel raggio di ${nearbyRadius >= 1000 ? (nearbyRadius / 1000) + ' km' : nearbyRadius + ' m'} da te. Non lo trovi? Cercalo per nome.`
                : 'Cerca il tuo locale per nome oppure inseriscilo manualmente.'}
            </p>

            {/* Input Cerca */}
            <div style={{ position: 'relative', marginBottom: '12px' }}>
              <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dark-secondary)' }} />
              <input
                type="text"
                className="form-control"
                placeholder="Cerca un locale per nome o città..."
                value={localeSearchQuery}
                onChange={(e) => setLocaleSearchQuery(e.target.value)}
                style={{ paddingLeft: '38px', height: '40px', fontSize: '14px' }}
              />
              {searchingVenues && (
                <Loader size={15} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--primary)', animation: 'spin 1s linear infinite' }} />
              )}
            </div>

            {geoError && localeSearchQuery.trim().length < 2 && (
              <div style={{ fontSize: '12px', color: 'var(--secondary)', background: 'rgba(223, 255, 0,0.08)', border: '1px solid rgba(223, 255, 0,0.3)', borderRadius: '8px', padding: '10px 12px', marginBottom: '12px', lineHeight: '1.4', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <span>⚠️ {geoError}</span>
                {!userCoords && (
                  <button
                    onClick={openVenueSelector}
                    disabled={loadingVenues}
                    className="btn btn-secondary"
                    style={{ borderRadius: '16px', fontSize: '12px', padding: '7px 12px', fontWeight: 700, alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: '6px', border: '1px solid var(--secondary)' }}
                  >
                    <MapPin size={13} /> Attiva / Riprova GPS
                  </button>
                )}
              </div>
            )}

            {/* Auto-rilevamento: se sei già DENTRO/vicino a un locale, proponilo con un tap */}
            {!isAppendingToSession && userCoords && localeSearchQuery.trim().length < 2 && !showManualEntry
              && displayedVenues[0] && displayedVenues[0].distance != null && displayedVenues[0].distance <= 100 && (
              <div
                onClick={() => startSessionAtVenue(displayedVenues[0])}
                style={{ cursor: 'pointer', marginBottom: '12px', padding: '14px 16px', borderRadius: '12px', border: '1px solid var(--primary)', background: 'rgba(255,32,0,0.08)', display: 'flex', alignItems: 'center', gap: '12px' }}
              >
                <MapPin size={22} color="var(--primary)" style={{ flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '14px', color: '#FFF', fontWeight: 700 }}>Sei da {displayedVenues[0].name}?</div>
                  <span style={{ fontSize: '12px', color: 'var(--text-dark-secondary)' }}>Tocca per registrare qui — vale per le classifiche 🏆</span>
                </div>
                <span className="btn btn-primary" style={{ borderRadius: '16px', padding: '6px 12px', fontSize: '12px', flexShrink: 0 }}>Conferma</span>
              </div>
            )}

            {/* Lista Locali */}
            <div style={{ overflowY: 'auto', WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain', flex: '1 1 0%', minHeight: 0, display: 'flex', flexDirection: 'column', gap: '8px', paddingRight: '4px' }}>
              {loadingVenues && localeSearchQuery.trim().length < 2 ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', padding: '30px 0', color: 'var(--text-dark-secondary)', fontSize: '13px' }}>
                  <Loader size={26} style={{ color: 'var(--primary)', animation: 'spin 1s linear infinite' }} />
                  Sto cercando i locali vicino a te... 📡
                </div>
              ) : displayedVenues.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '24px 8px', color: 'var(--text-dark-secondary)', fontSize: '13px', lineHeight: '1.5' }}>
                  {localeSearchQuery.trim().length >= 2
                    ? (searchingVenues ? 'Ricerca in corso...' : 'Nessun locale trovato con questo nome.')
                    : 'Nessun locale rilevato nelle vicinanze. Prova a cercarlo per nome qui sopra, oppure inseriscilo manualmente.'}
                </div>
              ) : (
                displayedVenues.map((loc) => (
                  <div
                    key={loc.key}
                    onClick={() => startSessionAtVenue(loc)}
                    style={{ padding: '12px', background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-dark)', borderRadius: '8px', cursor: 'pointer', transition: 'var(--transition)' }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.background = 'rgba(255, 32, 0,0.02)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-dark)'; e.currentTarget.style.background = 'rgba(255,255,255,0.01)'; }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                      <strong style={{ fontSize: '14px', color: '#FFF' }}>{loc.name}</strong>
                      {formatDistance(loc.distance) && (
                        <span style={{ fontSize: '11px', color: 'var(--primary)', fontWeight: '700', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                          <MapPin size={11} /> {formatDistance(loc.distance)}
                        </span>
                      )}
                    </div>
                    {loc.address && (
                      <span style={{ fontSize: '11px', color: 'var(--text-dark-secondary)', display: 'block', marginTop: '2px' }}>{loc.address}</span>
                    )}
                    <div style={{ display: 'flex', gap: '10px', marginTop: '6px', fontSize: '11px', color: 'var(--text-dark-secondary)', flexWrap: 'wrap' }}>
                      {loc.source === 'community' || loc.sessionsCount > 0 ? (
                        <>
                          <span>⭐ {loc.avgRating || '0.0'} ({loc.reviewsCount || 0} recensioni)</span>
                          <span>👥 {loc.uniqueDrinkers || 0} atleti</span>
                        </>
                      ) : (
                        <span style={{ color: 'var(--secondary)' }}>📍 Locale reale da OpenStreetMap</span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Nessun locale → sessione libera (resta nel flusso unico) */}
            {!isAppendingToSession && (
              <button
                onClick={() => { setShowLocaleSelector(false); handleStartFreeSession(); }}
                disabled={startingSession}
                className="btn btn-secondary"
                style={{ width: '100%', borderRadius: '20px', fontSize: '13px', padding: '10px', marginTop: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
              >
                🍸 Non sono in un locale — Sessione libera
              </button>
            )}

            {/* Inserimento manuale */}
            <div style={{ borderTop: '1px solid var(--border-dark)', marginTop: '12px', paddingTop: '12px' }}>
              {!showManualEntry ? (
                <button
                  onClick={() => setShowManualEntry(true)}
                  className="btn btn-secondary"
                  style={{ width: '100%', borderRadius: '20px', fontSize: '13px', padding: '8px' }}
                >
                  ✏️ Locale non in lista o non su OpenStreetMap? Aggiungilo
                </button>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Nome del locale *"
                    value={manualPlace.name}
                    onChange={(e) => setManualPlace((p) => ({ ...p, name: e.target.value }))}
                    style={{ height: '38px', fontSize: '13px', padding: '0 12px' }}
                  />
                  <input
                    type="text"
                    className="form-control"
                    placeholder={userCoords ? 'Indirizzo / città (opzionale)' : 'Indirizzo: via e città *'}
                    value={manualPlace.address}
                    onChange={(e) => setManualPlace((p) => ({ ...p, address: e.target.value }))}
                    style={{ height: '38px', fontSize: '13px', padding: '0 12px' }}
                  />
                  <span style={{ fontSize: '11px', color: userCoords ? 'var(--success)' : 'var(--secondary)', lineHeight: '1.4' }}>
                    {userCoords
                      ? '📍 Useremo la tua posizione attuale (anche se il locale non è su OpenStreetMap): finirà sulla mappa e sarà trovabile dagli altri atleti.'
                      : '🛰️ GPS non disponibile: inserisci l\'indirizzo (via e città) — lo localizziamo sulla mappa così altri potranno trovarlo.'}
                  </span>
                  <button
                    onClick={handleManualStart}
                    disabled={manualGeocoding}
                    className="btn btn-primary"
                    style={{ width: '100%', borderRadius: '20px', fontSize: '13px', padding: '8px', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                  >
                    {manualGeocoding
                      ? (<><Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> Localizzo l&apos;indirizzo…</>)
                      : (isAppendingToSession ? 'Aggiungi questa tappa' : 'Avvia qui il brindisi 🍻')}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>

      {/* MODAL 4: Form Registrazione a Posteriori */}
      {showRetroForm && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.9)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 1100, padding: '20px', overflowY: 'auto' }}>
          <div className="card" style={{ maxWidth: '520px', width: '100%', border: '1px solid rgba(16,185,129,0.4)', boxShadow: '0 0 30px rgba(16,185,129,0.1)', padding: '28px', position: 'relative', marginTop: '20px', marginBottom: '20px' }}>
            <button onClick={() => setShowRetroForm(false)} style={{ position: 'absolute', top: '18px', right: '18px', background: 'none', border: 'none', color: 'var(--text-dark-secondary)', cursor: 'pointer', fontSize: '22px' }}>×</button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px', borderBottom: '1px solid var(--border-dark)', paddingBottom: '16px' }}>
              <Clock size={20} color="#10B981" />
              <h2 style={{ fontSize: '20px', fontWeight: '800', color: '#FFF' }}>Registra Sessione Passata</h2>
            </div>

            <form onSubmit={handleRetroSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

              {/* Titolo */}
              <div>
                <label style={{ fontSize: '11px', color: 'var(--text-dark-secondary)', textTransform: 'uppercase', display: 'block', marginBottom: '4px', fontWeight: '600' }}>Titolo (opzionale)</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="Es: Aperitivo con amici, Cena di laurea..."
                  value={retroForm.title}
                  onChange={e => setRetroForm(p => ({ ...p, title: e.target.value }))}
                  style={{ height: '40px', padding: '0 12px', fontSize: '14px' }}
                />
              </div>

              {/* Data e ora */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '11px', color: 'var(--text-dark-secondary)', textTransform: 'uppercase', display: 'block', marginBottom: '4px', fontWeight: '600' }}>Data e Ora Inizio *</label>
                  <input
                    type="datetime-local"
                    className="form-control"
                    required
                    value={retroForm.date}
                    max={new Date().toISOString().slice(0, 16)}
                    onChange={e => setRetroForm(p => ({ ...p, date: e.target.value }))}
                    style={{ height: '40px', padding: '0 10px', fontSize: '13px' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '11px', color: 'var(--text-dark-secondary)', textTransform: 'uppercase', display: 'block', marginBottom: '4px', fontWeight: '600' }}>Durata (min)</label>
                  <input
                    type="number"
                    inputMode="numeric"
                    className="form-control"
                    min="1"
                    max="720"
                    placeholder="60"
                    value={retroForm.duration}
                    onChange={e => {
                      // Permetti il campo vuoto mentre si digita; accetta solo cifre
                      const v = e.target.value.replace(/[^0-9]/g, '');
                      setRetroForm(p => ({ ...p, duration: v }));
                    }}
                    onBlur={e => {
                      // Alla perdita del focus, se vuoto o 0 reimposta a 60
                      const n = parseInt(e.target.value, 10);
                      setRetroForm(p => ({ ...p, duration: n > 0 ? n : 60 }));
                    }}
                    style={{ height: '40px', padding: '0 12px', fontSize: '14px' }}
                  />
                </div>
              </div>

              {/* Locale */}
              <div>
                <label style={{ fontSize: '11px', color: 'var(--text-dark-secondary)', textTransform: 'uppercase', display: 'block', marginBottom: '4px', fontWeight: '600' }}>Locale / Luogo (opzionale)</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="Es: Momi's Pub, Casa di Marco, Spiaggia..."
                  value={retroForm.location}
                  onChange={e => setRetroForm(p => ({ ...p, location: e.target.value }))}
                  style={{ height: '40px', padding: '0 12px', fontSize: '14px' }}
                />
              </div>

              {/* Stato */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '11px', color: 'var(--text-dark-secondary)', textTransform: 'uppercase', display: 'block', marginBottom: '4px', fontWeight: '600' }}>Come ti sentivi?</label>
                  <select className="form-control" value={retroForm.feeling} onChange={e => setRetroForm(p => ({ ...p, feeling: e.target.value }))} style={{ height: '40px', padding: '0 10px', fontSize: '13px' }}>
                    <option value="Sobrio">Sobrio</option>
                    <option value="Allegro">Allegro</option>
                    <option value="Brillo Felice">Brillo Felice</option>
                    <option value="Intenditore">Intenditore</option>
                    <option value="Molto Caldo">Molto Caldo 🔥</option>
                    <option value="Pieno Raso">Pieno Raso 💀</option>
                    <option value="Postumi Assicurati">Postumi Assicurati 🤕</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '11px', color: 'var(--text-dark-secondary)', textTransform: 'uppercase', display: 'block', marginBottom: '4px', fontWeight: '600' }}>Note</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Note brevi..."
                    value={retroForm.description}
                    onChange={e => setRetroForm(p => ({ ...p, description: e.target.value }))}
                    style={{ height: '40px', padding: '0 12px', fontSize: '13px' }}
                  />
                </div>
              </div>

              {/* Stomaco pieno/vuoto */}
              <div>
                <label style={{ fontSize: '11px', color: 'var(--text-dark-secondary)', textTransform: 'uppercase', display: 'block', marginBottom: '6px', fontWeight: '600' }}>🍽️ Stomaco</label>
                <div className="seg-tabs">
                  <div className={`seg-tab ${!fullStomach ? 'active' : ''}`} onClick={() => setFullStomach(false)}>Vuoto</div>
                  <div className={`seg-tab ${fullStomach ? 'active' : ''}`} onClick={() => setFullStomach(true)}>🍝 Pieno</div>
                </div>
              </div>

              {/* Selezione Drink */}
              <div style={{ borderTop: '1px solid var(--border-dark)', paddingTop: '14px' }}>
                <label style={{ fontSize: '11px', color: 'var(--text-dark-secondary)', textTransform: 'uppercase', display: 'block', marginBottom: '10px', fontWeight: '600' }}>
                  Drink Consumati * ({retroForm.drinks.reduce((a, d) => a + d.qty, 0)} totali)
                </label>

                {/* Preset buttons (rapidi) */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '10px' }}>
                  {DRINK_PRESETS.map((preset, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleRetroAddDrink(preset)}
                      className="btn btn-secondary"
                      style={{ padding: '6px 12px', fontSize: '12px', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.15)' }}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>

                {/* Birre con scelta di tipo e taglia */}
                <div style={{ marginBottom: '10px' }}>
                  <BeerPicker onPick={handleRetroAddDrink} />
                </div>

                {/* Catalogo esteso */}
                <button
                  type="button"
                  onClick={() => setShowAllRetroDrinks((v) => !v)}
                  style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontSize: '12px', fontWeight: 700, marginBottom: '10px' }}
                >
                  {showAllRetroDrinks ? '▲ Nascondi altri drink' : '▾ Altri drink (cocktail, distillati, birre…)'}
                </button>
                {showAllRetroDrinks && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
                    {EXTRA_DRINKS.map((preset, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handleRetroAddDrink(preset)}
                        className="btn btn-secondary"
                        style={{ padding: '6px 12px', fontSize: '12px', borderRadius: '20px', border: '1px solid var(--border-dark)' }}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                )}

                {/* Lista drink aggiunti */}
                {retroForm.drinks.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '200px', overflowY: 'auto' }}>
                    {retroForm.drinks.map((d, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.2)', padding: '8px 12px', borderRadius: '8px' }}>
                        <div>
                          <strong style={{ fontSize: '13px', color: '#FFF' }}>{d.name}</strong>
                          <span style={{ display: 'block', fontSize: '10px', color: 'var(--text-dark-secondary)' }}>{(d.units * d.qty).toFixed(1)} U.A. · {d.abv}%</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <button type="button" onClick={() => handleRetroChangeDrinkQty(i, -1)} style={{ cursor: 'pointer', background: 'rgba(255,255,255,0.05)', width: '26px', height: '26px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border-dark)', color: '#FFF' }}>−</button>
                          <strong style={{ fontSize: '15px', minWidth: '18px', textAlign: 'center' }}>{d.qty}</strong>
                          <button type="button" onClick={() => handleRetroChangeDrinkQty(i, 1)} style={{ cursor: 'pointer', background: 'rgba(255,255,255,0.05)', width: '26px', height: '26px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border-dark)', color: '#FFF' }}>+</button>
                          <button type="button" onClick={() => handleRetroRemoveDrink(i)} style={{ color: 'var(--error)', marginLeft: '6px', cursor: 'pointer', background: 'none', border: 'none' }}><Trash2 size={14} /></button>
                        </div>
                      </div>
                    ))}
                    <div style={{ fontSize: '12px', color: '#10B981', fontWeight: '700', textAlign: 'right', marginTop: '4px' }}>
                      Totale: {retroForm.drinks.reduce((a, d) => a + d.units * d.qty, 0).toFixed(1)} U.A.
                    </div>
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', padding: '16px', color: 'var(--text-dark-secondary)', fontSize: '13px', border: '1px dashed var(--border-dark)', borderRadius: '8px' }}>
                    Clicca sui preset sopra per aggiungere i drink 🍺
                  </div>
                )}
              </div>

              {/* Foto */}
              <div style={{ borderTop: '1px solid var(--border-dark)', paddingTop: '14px' }}>
                <label style={{ fontSize: '11px', color: 'var(--text-dark-secondary)', textTransform: 'uppercase', display: 'block', marginBottom: '10px', fontWeight: '600' }}>
                  Foto della serata (opzionale)
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                  {retroForm.media.map((med, idx) => (
                    <div key={idx} style={{ position: 'relative', width: '64px', height: '64px', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border-dark)' }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={med.url} alt={med.name || 'foto'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      <button
                        type="button"
                        onClick={() => handleRetroRemovePhoto(idx)}
                        style={{ position: 'absolute', top: '2px', right: '2px', background: 'rgba(0,0,0,0.6)', color: '#FFF', border: 'none', borderRadius: '50%', width: '18px', height: '18px', fontSize: '12px', cursor: 'pointer', lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  <label style={{ width: '64px', height: '64px', borderRadius: '8px', border: '1px dashed var(--border-dark)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: retroPhotoUploading ? 'wait' : 'pointer', color: 'var(--text-dark-secondary)', gap: '2px' }}>
                    {retroPhotoUploading ? (
                      <Loader size={18} style={{ animation: 'spin 1s linear infinite', color: '#10B981' }} />
                    ) : (
                      <>
                        <Camera size={18} />
                        <span style={{ fontSize: '9px' }}>Aggiungi</span>
                      </>
                    )}
                    <input type="file" accept="image/*" onChange={handleRetroAddPhoto} disabled={retroPhotoUploading} style={{ display: 'none' }} />
                  </label>
                </div>
              </div>

              {/* Submit */}
              <div style={{ display: 'flex', gap: '10px', paddingTop: '10px' }}>
                <button type="button" onClick={() => setShowRetroForm(false)} className="btn btn-secondary" style={{ flex: 1, borderRadius: '20px' }}>Annulla</button>
                <button
                  type="submit"
                  disabled={retroSaving || retroForm.drinks.length === 0}
                  className="btn btn-primary"
                  style={{ flex: 2, borderRadius: '20px', fontWeight: '800', background: '#10B981', opacity: retroSaving || retroForm.drinks.length === 0 ? 0.5 : 1 }}
                >
                  {retroSaving ? 'Salvataggio...' : '✅ Salva Sessione Passata'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
