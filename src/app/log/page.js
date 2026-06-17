'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/db';
import { Beer, MapPin, Play, Loader, Search, X, Clock, Plus, Minus, Trash2, Camera } from 'lucide-react';
import { notify } from '@/lib/notify';

export default function LogActivityPage() {
  const router = useRouter();
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
  const [manualPlace, setManualPlace] = useState({ name: '', address: '' });

  // Loader a tutto schermo durante l'effettivo avvio della sessione
  const [checkingGps, setCheckingGps] = useState(false);

  // Stati per registrazione a posteriori
  const [showRetroForm, setShowRetroForm] = useState(false);
  const [retroSaving, setRetroSaving] = useState(false);
  const [retroPhotoUploading, setRetroPhotoUploading] = useState(false);
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
      const url = await db.uploadFileToStorage(file);
      setRetroForm((p) => ({ ...p, media: [...p.media, { type: 'image', name: file.name, url }] }));
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
  const DRINK_PRESETS = [
    { name: 'Spritz (Campari/Aperol/Select)', abv: 11, units: 1.3, label: '🍹 Spritz' },
    { name: 'Birra Chiara Media', abv: 5, units: 1.6, label: '🍺 Birra' },
    { name: 'Calice Vino (Rosso/Bianco/Prosecco)', abv: 12.5, units: 1.3, label: '🍷 Vino' },
    { name: 'Shot (Tequila/Rhum/Chupito)', abv: 40, units: 1.3, label: '🥃 Shot' },
    { name: 'Cocktail (Negroni/Mojito/Cosmopolitan)', abv: 15, units: 1.5, label: '🍸 Cocktail' },
    { name: 'Acqua Fresca', abv: 0, units: 0, label: '💧 Acqua' },
  ];
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
      const totalUnits = retroForm.drinks.reduce((acc, d) => acc + d.units * d.qty, 0);
      const bac = db.calculateCurrentBAC(
        retroForm.drinks,
        createdAt,
        retroForm.duration,
        new Date(new Date(retroForm.date).getTime() + retroForm.duration * 60 * 1000).toISOString()
      );
      await db.createActivity({
        title: retroForm.title || `Sessione del ${new Date(retroForm.date).toLocaleDateString('it-IT')}`,
        description: retroForm.description,
        drinks: retroForm.drinks,
        total_units: parseFloat(totalUnits.toFixed(1)),
        duration: retroForm.duration,
        feeling: retroForm.feeling,
        location: retroForm.location ? { name: retroForm.location } : null,
        bac_level: parseFloat(bac.toFixed(2)),
        media: retroForm.media && retroForm.media.length > 0 ? retroForm.media : null,
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  // Richiede la posizione GPS dell'utente (non bloccante: risolve null se negata)
  const requestUserLocation = () =>
    new Promise((resolve) => {
      if (typeof navigator === 'undefined' || !navigator.geolocation) {
        resolve(null);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        (err) => {
          console.warn('Geolocalizzazione non disponibile:', err.message || err);
          resolve(null);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
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
    const coords = await requestUserLocation();
    setUserCoords(coords);
    if (!coords) {
      setGeoError(
        'Posizione GPS non disponibile (permesso negato o segnale assente). Cerca il tuo locale per nome qui sotto.'
      );
    }
    try {
      const { venues, radius, widened } = await db.getCombinedNearbyPlaces(coords?.lat, coords?.lng, 200);
      setNearbyVenues(venues);
      setNearbyRadius(radius);
      if (coords && widened) {
        setGeoError(
          `Nessun locale entro 200m. Ti mostro quelli entro ${radius >= 1000 ? (radius / 1000) + ' km' : radius + ' m'}.`
        );
      } else if (coords && venues.length === 0) {
        setGeoError('Nessun locale rilevato nelle vicinanze. Cercalo per nome o inseriscilo a mano.');
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
      // Annota la distanza se abbiamo il GPS
      const annotated = res.map((v) => ({
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

      await db.createActivity({
        title: 'Brindisi Live 🍻',
        drinks: [],
        is_active: true,
        bac_level: 0,
        total_units: 0,
        duration: 1
      });

      // Notifica PWA
      notify("Brindisi Live Avviato! 🔴", "Registra i tuoi drink uno alla volta per monitorare il tasso alcolico in tempo reale!");

      router.push('/');
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
    setShowLocaleSelector(false);
    setCheckingGps(true);
    try {
      if (isAppendingToSession) {
        if (!activeSession) throw new Error('Nessuna sessione attiva da aggiornare.');
        await db.updateActivity(activeSession.id, buildAppendFields(activeSession, venue));
        notify('Tappa Aggiunta! 📍', `Sei arrivato a ${venue.name}. Sessione aggiornata!`);
      } else {
        await db.createActivity({
          title: `Brindisi live presso ${venue.name} 🍻`,
          location: {
            name: venue.name,
            address: venue.address || '',
            lat: venue.lat ?? null,
            lng: venue.lng ?? null,
          },
          drinks: [],
          is_active: true,
          bac_level: 0,
          total_units: 0,
          duration: 1,
        });
        notify('Brindisi Live Avviato! 🔴', `Registra i tuoi drink presso ${venue.name} per monitorare il BAC in tempo reale!`);
      }
      router.push('/');
    } catch (err) {
      alert("Errore nell'avvio della sessione: " + (err.message || err));
      setCheckingGps(false);
    }
  };

  // Avvia sessione da locale inserito manualmente.
  // Allega la posizione GPS attuale: così il locale diventa geolocalizzato
  // e comparirà tra i locali vicini anche per gli altri utenti.
  const handleManualStart = () => {
    const name = manualPlace.name.trim();
    if (!name) {
      alert('Inserisci almeno il nome del locale!');
      return;
    }
    startSessionAtVenue({
      name,
      address: manualPlace.address.trim(),
      lat: userCoords?.lat ?? null,
      lng: userCoords?.lng ?? null,
    });
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
    <div style={{ maxWidth: '600px', margin: '40px auto', padding: '0 20px', display: 'flex', flexDirection: 'column', gap: '30px' }}>
      <div style={{ textAlign: 'center' }}>
        <span style={{ background: 'rgba(255, 94, 0, 0.1)', color: 'var(--primary)', padding: '6px 14px', borderRadius: '30px', fontSize: '13px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '1px' }}>
          ⏱️ Registrazione in Tempo Reale
        </span>
        <h1 style={{ fontSize: '32px', fontWeight: '900', color: '#FFF', marginTop: '15px' }}>
          Inizia un Brindisi Live 🍻
        </h1>
        <p style={{ color: 'var(--text-dark-secondary)', fontSize: '15px', marginTop: '10px', lineHeight: '1.6' }}>
          Su Strabar non inseriamo più i dati a posteriori come le vecchie app. <br />
          Tracciamo lo sforzo in tempo reale per monitorare il tasso alcolico (BAC) e l&apos;assorbimento fegato minuto per minuto!
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        
        {/* OPZIONE 1: Al locale */}
        <div 
          onClick={handleLocaleCheckInClick}
          className="card" 
          style={{ 
            cursor: 'pointer', 
            background: 'linear-gradient(135deg, rgba(22, 24, 34, 0.95) 0%, rgba(255, 94, 0, 0.05) 100%)', 
            border: '1px solid var(--border-dark)',
            display: 'flex',
            alignItems: 'center',
            gap: '20px',
            padding: '24px',
            transition: 'var(--transition)'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'var(--primary)';
            e.currentTarget.style.transform = 'translateY(-2px)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'var(--border-dark)';
            e.currentTarget.style.transform = 'translateY(0)';
          }}
        >
          <div style={{ background: 'rgba(255, 94, 0, 0.1)', color: 'var(--primary)', padding: '16px', borderRadius: '50%' }}>
            <MapPin size={28} />
          </div>
          <div style={{ flex: 1 }}>
            <h3 style={{ fontSize: '18px', fontWeight: '800', color: '#FFF' }}>Brindisi al Locale (Geolocalizzato)</h3>
            <p style={{ fontSize: '13px', color: 'var(--text-dark-secondary)', marginTop: '4px', lineHeight: '1.4' }}>
              Fai check-in in un pub o bar reale nelle vicinanze. Richiede la prossimità GPS (200m).
            </p>
          </div>
        </div>

        {/* OPZIONE 2: Libera/Roaming */}
        <div 
          onClick={handleStartFreeSession}
          className="card" 
          style={{ 
            cursor: startingSession ? 'not-allowed' : 'pointer', 
            background: 'linear-gradient(135deg, rgba(22, 24, 34, 0.95) 0%, rgba(255, 176, 0, 0.05) 100%)', 
            border: '1px solid var(--border-dark)',
            display: 'flex',
            alignItems: 'center',
            gap: '20px',
            padding: '24px',
            transition: 'var(--transition)'
          }}
          onMouseEnter={(e) => {
            if (!startingSession) {
              e.currentTarget.style.borderColor = 'var(--secondary)';
              e.currentTarget.style.transform = 'translateY(-2px)';
            }
          }}
          onMouseLeave={(e) => {
            if (!startingSession) {
              e.currentTarget.style.borderColor = 'var(--border-dark)';
              e.currentTarget.style.transform = 'translateY(0)';
            }
          }}
        >
          <div style={{ background: 'rgba(255, 176, 0, 0.1)', color: 'var(--secondary)', padding: '16px', borderRadius: '50%' }}>
            {startingSession ? (
              <Loader size={28} style={{ animation: 'spin 1s linear infinite' }} />
            ) : (
              <Play size={28} fill="var(--secondary)" />
            )}
          </div>
          <div style={{ flex: 1 }}>
            <h3 style={{ fontSize: '18px', fontWeight: '800', color: '#FFF' }}>Brindisi Libero / Roaming</h3>
            <p style={{ fontSize: '13px', color: 'var(--text-dark-secondary)', marginTop: '4px', lineHeight: '1.4' }}>
              Inizia una sessione alcolica libera (es. festa a casa, picnic, degustazione itinerante) senza vincoli di posizione.
            </p>
          </div>
        </div>
        {/* OPZIONE 3: Registra a Posteriori */}
        <div
          onClick={() => setShowRetroForm(true)}
          className="card"
          style={{
            cursor: 'pointer',
            background: 'linear-gradient(135deg, rgba(22, 24, 34, 0.95) 0%, rgba(16, 185, 129, 0.04) 100%)',
            border: '1px dashed rgba(16,185,129,0.4)',
            display: 'flex',
            alignItems: 'center',
            gap: '20px',
            padding: '24px',
            transition: 'var(--transition)'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = '#10B981';
            e.currentTarget.style.transform = 'translateY(-2px)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'rgba(16,185,129,0.4)';
            e.currentTarget.style.transform = 'translateY(0)';
          }}
        >
          <div style={{ background: 'rgba(16,185,129,0.1)', color: '#10B981', padding: '16px', borderRadius: '50%', flexShrink: 0 }}>
            <Clock size={28} />
          </div>
          <div style={{ flex: 1 }}>
            <h3 style={{ fontSize: '18px', fontWeight: '800', color: '#FFF' }}>Registra Sessione Passata ⏳</h3>
            <p style={{ fontSize: '13px', color: 'var(--text-dark-secondary)', marginTop: '4px', lineHeight: '1.4' }}>
              Hai dimenticato di avviare il live? Inserisci una serata passata specificando data, drink consumati e locale.
            </p>
          </div>
        </div>

      </div>

      {/* MODAL 1: Avviso Sessione Attiva */}
      {showActiveSessionWarning && activeSession && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div className="card" style={{ maxWidth: '450px', width: '100%', border: '2px solid var(--primary)', boxShadow: '0 0 25px rgba(255, 94, 0, 0.25)', padding: '24px', position: 'relative' }}>
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
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999, padding: '20px' }}>
          <div className="card" style={{ maxWidth: '500px', width: '100%', border: '1px solid var(--border-dark)', maxHeight: '85vh', display: 'flex', flexDirection: 'column', padding: '24px', position: 'relative' }}>
            <button
              onClick={() => setShowLocaleSelector(false)}
              style={{ position: 'absolute', top: '20px', right: '20px', background: 'none', border: 'none', color: 'var(--text-dark-secondary)', cursor: 'pointer' }}
              aria-label="Chiudi"
            >
              <X size={20} />
            </button>
            <h2 style={{ fontSize: '20px', fontWeight: '800', color: '#FFF', marginBottom: '8px' }}>
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
              <div style={{ fontSize: '12px', color: 'var(--secondary)', background: 'rgba(255,176,0,0.08)', border: '1px solid rgba(255,176,0,0.3)', borderRadius: '8px', padding: '8px 12px', marginBottom: '12px', lineHeight: '1.4' }}>
                ⚠️ {geoError}
              </div>
            )}

            {/* Lista Locali */}
            <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '8px', paddingRight: '4px', minHeight: '120px' }}>
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
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.background = 'rgba(255,94,0,0.02)'; }}
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

            {/* Inserimento manuale */}
            <div style={{ borderTop: '1px solid var(--border-dark)', marginTop: '12px', paddingTop: '12px' }}>
              {!showManualEntry ? (
                <button
                  onClick={() => setShowManualEntry(true)}
                  className="btn btn-secondary"
                  style={{ width: '100%', borderRadius: '20px', fontSize: '13px', padding: '8px' }}
                >
                  ✏️ Non trovi il locale? Inseriscilo a mano
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
                    placeholder="Indirizzo / città (opzionale)"
                    value={manualPlace.address}
                    onChange={(e) => setManualPlace((p) => ({ ...p, address: e.target.value }))}
                    style={{ height: '38px', fontSize: '13px', padding: '0 12px' }}
                  />
                  <span style={{ fontSize: '11px', color: userCoords ? 'var(--success)' : 'var(--text-dark-secondary)', lineHeight: '1.4' }}>
                    {userCoords
                      ? '📍 Useremo la tua posizione attuale: il locale sarà visibile agli altri atleti nelle vicinanze.'
                      : 'GPS non disponibile: il locale verrà salvato senza posizione precisa.'}
                  </span>
                  <button
                    onClick={handleManualStart}
                    className="btn btn-primary"
                    style={{ width: '100%', borderRadius: '20px', fontSize: '13px', padding: '8px', fontWeight: 'bold' }}
                  >
                    {isAppendingToSession ? 'Aggiungi questa tappa' : 'Avvia qui il brindisi 🍻'}
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
                    className="form-control"
                    min="1"
                    max="720"
                    value={retroForm.duration}
                    onChange={e => setRetroForm(p => ({ ...p, duration: parseInt(e.target.value) || 60 }))}
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

              {/* Selezione Drink */}
              <div style={{ borderTop: '1px solid var(--border-dark)', paddingTop: '14px' }}>
                <label style={{ fontSize: '11px', color: 'var(--text-dark-secondary)', textTransform: 'uppercase', display: 'block', marginBottom: '10px', fontWeight: '600' }}>
                  Drink Consumati * ({retroForm.drinks.reduce((a, d) => a + d.qty, 0)} totali)
                </label>

                {/* Preset buttons */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
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
