'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/db';
import { Beer, MapPin, Play, Loader, Search, X, Clock, Plus, Minus, Trash2 } from 'lucide-react';

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

  // Stati per la selezione del locale
  const [showLocaleSelector, setShowLocaleSelector] = useState(false);
  const [localesList, setLocalesList] = useState([]);
  const [localeSearchQuery, setLocaleSearchQuery] = useState('');
  const [selectedLocale, setSelectedLocale] = useState(null);

  // Stati per geofencing GPS
  const [checkingGps, setCheckingGps] = useState(false);
  const [showGeofencingModal, setShowGeofencingModal] = useState(false);
  const [geofencingData, setGeofencingData] = useState({ inside: false, distance: null, error: null });

  // Stati per registrazione a posteriori
  const [showRetroForm, setShowRetroForm] = useState(false);
  const [retroSaving, setRetroSaving] = useState(false);
  const [retroForm, setRetroForm] = useState({
    title: '',
    date: new Date().toISOString().slice(0, 16), // datetime-local format
    duration: 60,
    location: '',
    feeling: 'Allegro',
    description: '',
    drinks: []
  });
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
      const openSelectorDirectly = async () => {
        try {
          const list = await db.getPlaces();
          setLocalesList(list);
          setShowLocaleSelector(true);
        } catch (err) {
          console.error(err);
        }
      };
      openSelectorDirectly();
    }
  }, [router]);

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
      if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
        new Notification("Brindisi Live Avviato! 🔴", {
          body: "Registra i tuoi drink uno alla volta per monitorare il tasso alcolico in tempo reale!"
        });
      }

      router.push('/');
    } catch (err) {
      alert("Errore nell'avvio della sessione libera: " + err.message);
    } finally {
      setStartingSession(false);
    }
  };

  // Clicca opzione check-in locale
  const handleLocaleCheckInClick = async () => {
    if (activeSession) {
      setShowActiveSessionWarning(true);
      return;
    }

    try {
      const list = await db.getPlaces();
      setLocalesList(list);
      setShowLocaleSelector(true);
    } catch (err) {
      alert("Errore nel recupero dei locali: " + err.message);
    }
  };

  // Seleziona un locale e verifica geofencing GPS
  const handleSelectLocale = async (locale) => {
    setSelectedLocale(locale);
    setShowLocaleSelector(false);
    setCheckingGps(true);

    const startSession = async () => {
      try {
        await db.createActivity({
          title: `Brindisi live presso ${locale.name} 🍻`,
          location: {
            name: locale.name,
            address: locale.address,
            lat: locale.lat,
            lng: locale.lng
          },
          drinks: [],
          is_active: true,
          bac_level: 0,
          total_units: 0,
          duration: 1
        });
        
        if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
          new Notification("Brindisi Live Avviato! 🔴", {
            body: `Registra i tuoi drink presso ${locale.name} per monitorare il BAC in tempo reale!`
          });
        }
        router.push('/');
      } catch (err) {
        alert("Errore nell'avvio della sessione geolocalizzata: " + err.message);
      } finally {
        setCheckingGps(false);
      }
    };

    const appendLocaleToActiveSession = async () => {
      try {
        if (!activeSession) throw new Error("Nessuna sessione attiva trovata da aggiornare.");

        let currentSequence = [];
        if (activeSession.location && activeSession.location.sequence && Array.isArray(activeSession.location.sequence)) {
          currentSequence = [...activeSession.location.sequence];
        } else if (activeSession.location) {
          currentSequence = [{
            name: activeSession.location.name,
            address: activeSession.location.address,
            lat: activeSession.location.lat,
            lng: activeSession.location.lng ?? activeSession.location.lon
          }];
        }

        const newWaypoint = {
          name: locale.name,
          address: locale.address,
          lat: locale.lat,
          lng: locale.lng ?? locale.lon,
          visited_at: new Date().toISOString()
        };
        currentSequence.push(newWaypoint);

        const updatedTitle = `Giro dei Bar: ${currentSequence.map(s => s.name).join(' ➔ ')}`;

        const updatedFields = {
          location: {
            name: locale.name,
            address: locale.address,
            lat: locale.lat,
            lng: locale.lng ?? locale.lon,
            sequence: currentSequence
          },
          title: updatedTitle.length > 80 ? updatedTitle.substring(0, 77) + '...' : updatedTitle
        };

        await db.updateActivity(activeSession.id, updatedFields);

        if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
          new Notification("Tappa Aggiunta! 📍", {
            body: `Sei arrivato a ${locale.name}. La tua sessione live è stata aggiornata!`
          });
        }
        router.push('/');
      } catch (err) {
        alert("Errore nell'aggiunta del locale alla sessione: " + err.message);
      } finally {
        setCheckingGps(false);
      }
    };

    if (!navigator.geolocation) {
      setGeofencingData({ inside: false, distance: null, error: "Geolocalizzazione non supportata." });
      setShowGeofencingModal(true);
      setCheckingGps(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const userLat = pos.coords.latitude;
        const userLng = pos.coords.longitude;
        
        const geo = db.checkGeofencing(locale.lat, locale.lng, userLat, userLng);
        if (geo.inside) {
          if (isAppendingToSession) {
            await appendLocaleToActiveSession();
          } else {
            await startSession();
          }
        } else {
          setGeofencingData({ inside: false, distance: geo.distance, error: null });
          setShowGeofencingModal(true);
        }
        setCheckingGps(false);
      },
      (err) => {
        console.warn("Errore geolocalizzazione:", err);
        setGeofencingData({ inside: false, distance: null, error: "Impossibile rilevare la tua posizione GPS. Permesso negato o segnale assente." });
        setShowGeofencingModal(true);
        setCheckingGps(false);
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  // Forza Demo Start per locale selezionato (Bypass range check)
  const handleForceDemoStart = async () => {
    if (!selectedLocale) return;
    setShowGeofencingModal(false);
    setCheckingGps(true);
    try {
      if (isAppendingToSession) {
        if (!activeSession) throw new Error("Nessuna sessione attiva.");
        let currentSequence = [];
        if (activeSession.location && activeSession.location.sequence && Array.isArray(activeSession.location.sequence)) {
          currentSequence = [...activeSession.location.sequence];
        } else if (activeSession.location) {
          currentSequence = [{
            name: activeSession.location.name,
            address: activeSession.location.address,
            lat: activeSession.location.lat,
            lng: activeSession.location.lng ?? activeSession.location.lon
          }];
        }
        currentSequence.push({
          name: selectedLocale.name,
          address: selectedLocale.address,
          lat: selectedLocale.lat,
          lng: selectedLocale.lng,
          visited_at: new Date().toISOString()
        });
        const updatedTitle = `Giro dei Bar: ${currentSequence.map(s => s.name).join(' ➔ ')}`;
        await db.updateActivity(activeSession.id, {
          location: {
            name: selectedLocale.name,
            address: selectedLocale.address,
            lat: selectedLocale.lat,
            lng: selectedLocale.lng,
            sequence: currentSequence
          },
          title: updatedTitle.length > 80 ? updatedTitle.substring(0, 77) + '...' : updatedTitle
        });
        router.push('/');
      } else {
        await db.createActivity({
          title: `Brindisi live presso ${selectedLocale.name} (Demo Mode) 🍻`,
          location: {
            name: selectedLocale.name,
            address: selectedLocale.address,
            lat: selectedLocale.lat,
            lng: selectedLocale.lng
          },
          drinks: [],
          is_active: true,
          bac_level: 0,
          total_units: 0,
          duration: 1
        });
        router.push('/');
      }
    } catch (err) {
      alert("Errore nell'avvio forzato: " + err.message);
    } finally {
      setCheckingGps(false);
    }
  };

  // Filtra locali per ricerca
  const filteredLocales = localesList.filter(loc => 
    loc.name.toLowerCase().includes(localeSearchQuery.toLowerCase()) ||
    (loc.address || '').toLowerCase().includes(localeSearchQuery.toLowerCase())
  );

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
                  onClick={async () => {
                    setIsAppendingToSession(true);
                    setShowActiveSessionWarning(false);
                    try {
                      const list = await db.getPlaces();
                      setLocalesList(list);
                      setShowLocaleSelector(true);
                    } catch (err) {
                      alert("Errore nel recupero dei locali: " + err.message);
                    }
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

      {/* MODAL 2: Selettore Locale */}
      {showLocaleSelector && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999, padding: '20px' }}>
          <div className="card" style={{ maxWidth: '500px', width: '100%', border: '1px solid var(--border-dark)', maxHeight: '80vh', display: 'flex', flexDirection: 'column', padding: '24px', position: 'relative' }}>
            <button 
              onClick={() => setShowLocaleSelector(false)} 
              style={{ position: 'absolute', top: '20px', right: '20px', background: 'none', border: 'none', color: 'var(--text-dark-secondary)', cursor: 'pointer' }}
            >
              <X size={20} />
            </button>
            <h2 style={{ fontSize: '20px', fontWeight: '800', color: '#FFF', marginBottom: '8px' }}>Seleziona Locale 📍</h2>
            <p style={{ fontSize: '13px', color: 'var(--text-dark-secondary)', marginBottom: '15px' }}>Scegli un bar o pub per avviare il brindisi live geolocalizzato.</p>
            
            {/* Input Cerca */}
            <div style={{ position: 'relative', marginBottom: '15px' }}>
              <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dark-secondary)' }} />
              <input 
                type="text" 
                className="form-control" 
                placeholder="Cerca locale per nome o indirizzo..." 
                value={localeSearchQuery}
                onChange={(e) => setLocaleSearchQuery(e.target.value)}
                style={{ paddingLeft: '38px', height: '38px', fontSize: '13px' }}
              />
            </div>

            {/* Lista Locali */}
            <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '8px', paddingRight: '4px' }}>
              {filteredLocales.length === 0 ? (
                <p style={{ color: 'var(--text-dark-secondary)', fontSize: '13px', textAlign: 'center', padding: '20px 0' }}>Nessun locale trovato.</p>
              ) : (
                filteredLocales.map((loc) => (
                  <div 
                    key={loc.key}
                    onClick={() => handleSelectLocale(loc)}
                    style={{ 
                      padding: '12px', 
                      background: 'rgba(255,255,255,0.01)', 
                      border: '1px solid var(--border-dark)', 
                      borderRadius: '8px', 
                      cursor: 'pointer',
                      transition: 'var(--transition)'
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.background = 'rgba(255,94,0,0.02)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-dark)'; e.currentTarget.style.background = 'rgba(255,255,255,0.01)'; }}
                  >
                    <strong style={{ fontSize: '14px', color: '#FFF', display: 'block' }}>{loc.name}</strong>
                    <span style={{ fontSize: '11px', color: 'var(--text-dark-secondary)', display: 'block', marginTop: '2px' }}>{loc.address}</span>
                    <div style={{ display: 'flex', gap: '10px', marginTop: '6px', fontSize: '11px', color: 'var(--text-dark-secondary)' }}>
                      <span>⭐ {loc.avgRating || '0.0'} ({loc.reviewsCount} recensioni)</span>
                      <span>👥 {loc.uniqueDrinkers || 0} atleti</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: Avviso Distanza Geofencing */}
      {showGeofencingModal && selectedLocale && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1001, padding: '20px' }}>
          <div className="card" style={{ maxWidth: '450px', width: '100%', border: '2px solid var(--secondary)', boxShadow: '0 0 25px rgba(255, 176, 0, 0.2)', padding: '24px', position: 'relative' }}>
            <h2 style={{ fontSize: '20px', fontWeight: '800', color: '#FFF', marginBottom: '10px' }}>Sei fuori portata! 📍</h2>
            
            {geofencingData.error ? (
              <p style={{ fontSize: '14px', color: 'var(--text-dark-secondary)', marginBottom: '20px', lineHeight: '1.5' }}>
                {geofencingData.error}
              </p>
            ) : (
              <p style={{ fontSize: '14px', color: 'var(--text-dark-secondary)', marginBottom: '20px', lineHeight: '1.5' }}>
                Ti trovi a circa <strong>{geofencingData.distance} metri</strong> da <strong>{selectedLocale.name}</strong>. Per iniziare un brindisi geolocalizzato reale devi trovarti entro 200m dal locale.
              </p>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button 
                onClick={() => handleSelectLocale(selectedLocale)} 
                className="btn btn-primary" 
                style={{ borderRadius: '20px', padding: '10px', fontSize: '14px', fontWeight: 'bold' }}
              >
                🔄 Riprova GPS
              </button>
              <button 
                onClick={handleForceDemoStart} 
                className="btn btn-secondary" 
                style={{ borderRadius: '20px', padding: '10px', fontSize: '14px', border: '1px dashed var(--secondary)' }}
              >
                🚀 Forza Demo Mode (Bypass GPS)
              </button>
              <button 
                onClick={() => setShowGeofencingModal(false)} 
                className="btn btn-secondary" 
                style={{ borderRadius: '20px', padding: '10px', fontSize: '14px' }}
              >
                Annulla
              </button>
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
