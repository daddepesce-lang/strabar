'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { db } from '@/lib/db';
import {
  MapPin, Search, Trophy, Beer, Star, X, Crown, TrendingUp, ExternalLink, Loader, Users, Award,
} from 'lucide-react';
import RequireAuth from '@/components/RequireAuth';

const PLACE_SORTS = [
  { key: 'sessions', label: 'Più registrazioni', icon: Beer },
  { key: 'units', label: 'Più U.A.', icon: TrendingUp },
  { key: 'rating', label: 'Più votati', icon: Star },
];

const USER_SORTS = [
  { key: 'units', label: 'Più U.A.', icon: TrendingUp },
  { key: 'sessions', label: 'Più sessioni', icon: Beer },
  { key: 'places', label: 'Più locali', icon: MapPin },
];

function Stars({ value, size = 14, onPick }) {
  return (
    <span style={{ display: 'inline-flex', gap: '2px' }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          size={size}
          className={onPick ? 'star' : undefined}
          onClick={onPick ? () => onPick(n) : undefined}
          fill={n <= Math.round(value) ? 'var(--secondary)' : 'none'}
          color={n <= Math.round(value) ? 'var(--secondary)' : 'var(--text-dark-secondary)'}
        />
      ))}
    </span>
  );
}

const medal = (i) => (i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`);

export default function ClassifichePage() {
  const [tab, setTab] = useState('atleti'); // atleti | locali
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState(null);

  // Atleti
  const [users, setUsers] = useState([]);
  const [userSort, setUserSort] = useState('units');

  // Locali
  const [places, setPlaces] = useState([]);
  const [placeSort, setPlaceSort] = useState('sessions');
  const [query, setQuery] = useState('');

  // Dettaglio locale
  const [selected, setSelected] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [newRating, setNewRating] = useState(5);
  const [newReview, setNewReview] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Geofencing and GPS States
  const [showGeofencingModal, setShowGeofencingModal] = useState(false);
  const [geofencingData, setGeofencingData] = useState(null);
  const [checkingGps, setCheckingGps] = useState(false);

  // Active Session transfer states
  const [activeSession, setActiveSession] = useState(null);
  const [showConfirmCloseModal, setShowConfirmCloseModal] = useState(false);
  const [pendingPlace, setPendingPlace] = useState(null);

  const handleStartBrindisi = async () => {
    if (!currentUser) {
      alert("Devi effettuare l'accesso per iniziare un brindisi!");
      return;
    }

    if (activeSession) {
      setPendingPlace(selected);
      setShowConfirmCloseModal(true);
      return;
    }

    setCheckingGps(true);
    
    const startSession = async () => {
      try {
        const newAct = await db.createActivity({
          title: `Brindisi live presso ${selected.name} 🍻`,
          location: {
            name: selected.name,
            address: selected.address,
            lat: selected.lat,
            lng: selected.lng
          },
          drinks: [],
          is_active: true,
          bac_level: 0,
          total_units: 0,
          duration: 1
        });
        
        window.location.href = '/';
      } catch (err) {
        alert("Errore nell'avvio della sessione: " + err.message);
      }
    };

    if (!navigator.geolocation) {
      setGeofencingData({ inside: false, distance: null, error: "Geolocalizzazione non supportata dal browser." });
      setShowGeofencingModal(true);
      setCheckingGps(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const userLat = pos.coords.latitude;
        const userLng = pos.coords.longitude;
        
        const geo = db.checkGeofencing(selected.lat, selected.lng, userLat, userLng);
        
        if (geo.inside) {
          await startSession();
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

  const handleCloseAndStartNewSession = async () => {
    if (!activeSession || !pendingPlace) return;
    try {
      const diffMs = new Date().getTime() - new Date(activeSession.created_at).getTime();
      const elapsed = Math.max(1, Math.round(diffMs / (60 * 1000)));
      
      // Chiudi sessione precedente
      await db.closeSession(activeSession.id, {
        is_active: false,
        feeling: activeSession.feeling || 'Sobrio',
        description: 'Chiuso per iniziare un nuovo brindisi.',
        duration: elapsed
      });
      
      setActiveSession(null);
      setShowConfirmCloseModal(false);
      setCheckingGps(true);
      
      const startSession = async () => {
        try {
          const newAct = await db.createActivity({
            title: `Brindisi live presso ${pendingPlace.name} 🍻`,
            location: {
              name: pendingPlace.name,
              address: pendingPlace.address,
              lat: pendingPlace.lat,
              lng: pendingPlace.lng
            },
            drinks: [],
            is_active: true,
            bac_level: 0,
            total_units: 0,
            duration: 1
          });
          
          window.location.href = '/';
        } catch (err) {
          alert("Errore nell'avvio della sessione: " + err.message);
        }
      };

      if (!navigator.geolocation) {
        setGeofencingData({ inside: false, distance: null, error: "Geolocalizzazione non supportata dal browser." });
        setShowGeofencingModal(true);
        setCheckingGps(false);
        return;
      }

      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const userLat = pos.coords.latitude;
          const userLng = pos.coords.longitude;
          
          const geo = db.checkGeofencing(pendingPlace.lat, pendingPlace.lng, userLat, userLng);
          
          if (geo.inside) {
            await startSession();
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
    } catch (err) {
      alert("Errore nel completamento dell'operazione: " + err.message);
    }
  };

  const handleForceDemoStart = async () => {
    try {
      const placeToUse = pendingPlace || selected;
      if (!placeToUse) return;

      if (activeSession) {
        const diffMs = new Date().getTime() - new Date(activeSession.created_at).getTime();
        const elapsed = Math.max(1, Math.round(diffMs / (60 * 1000)));
        await db.closeSession(activeSession.id, {
          is_active: false,
          feeling: activeSession.feeling || 'Sobrio',
          description: 'Chiuso per iniziare un nuovo brindisi.',
          duration: elapsed
        });
      }

      const newAct = await db.createActivity({
        title: `Brindisi live presso ${placeToUse.name} (Demo Mode) 🍻`,
        location: {
          name: placeToUse.name,
          address: placeToUse.address,
          lat: placeToUse.lat,
          lng: placeToUse.lng
        },
        drinks: [],
        is_active: true,
        bac_level: 0,
        total_units: 0,
        duration: 1
      });
      
      window.location.href = '/';
    } catch (err) {
      alert("Errore nell'avvio della sessione demo: " + err.message);
    }
  };

  const loadAll = async () => {
    try {
      if (!db || typeof db.getPlaces !== 'function') return;
      const [pl, us, user] = await Promise.all([
        db.getPlaces(),
        db.getUserLeaderboard(),
        db.getCurrentUser(),
      ]);
      setPlaces(pl);
      setUsers(us);
      setCurrentUser(user);
      if (user && typeof db.getActiveSession === 'function') {
        const active = await db.getActiveSession(user.id);
        setActiveSession(active);
      }
    } catch (err) {
      console.error('Errore caricamento classifiche:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('tab') === 'locali' || params.get('action') === 'checkin') {
        setTab('locali');
      }
    }
  }, []);

  const openPlace = async (place) => {
    setSelected(place);
    const [lb, rv] = await Promise.all([
      db.getPlaceLeaderboard(place.key),
      db.getPlaceReviews(place.key),
    ]);
    setLeaderboard(lb.sort((a, b) => b.units - a.units || b.visits - a.visits));
    setReviews(rv);
    setNewRating(5);
    setNewReview('');
  };

  const submitReview = async () => {
    if (!currentUser) return;
    setSubmitting(true);
    try {
      await db.addReview(selected.key, selected.name, newRating, newReview);
      const rv = await db.getPlaceReviews(selected.key);
      setReviews(rv);
      setNewReview('');
      await loadAll();
      const refreshed = (await db.getPlaces()).find((p) => p.key === selected.key);
      if (refreshed) setSelected(refreshed);
    } catch (err) {
      alert(err.message || 'Errore');
    } finally {
      setSubmitting(false);
    }
  };

  const sortedUsers = [...users].sort((a, b) => {
    if (userSort === 'sessions') return b.sessions - a.sessions || b.units - a.units;
    if (userSort === 'places') return b.placesCount - a.placesCount || b.units - a.units;
    return b.units - a.units || b.sessions - a.sessions;
  });

  const sortedPlaces = [...places]
    .filter((p) => p.name.toLowerCase().includes(query.toLowerCase()) || (p.address || '').toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => {
      if (placeSort === 'units') return b.totalUnits - a.totalUnits;
      if (placeSort === 'rating') return b.avgRating - a.avgRating || b.reviewsCount - a.reviewsCount;
      return b.sessionsCount - a.sessionsCount;
    });

  const userMetric = (u) => {
    if (userSort === 'sessions') return `${u.sessions} sessioni`;
    if (userSort === 'places') return `${u.placesCount} locali`;
    return `${u.units} U.A.`;
  };

  if (!loading && !currentUser) {
    return <RequireAuth feature="le classifiche" />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header */}
      <div>
        <h1 style={{ fontSize: '30px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Trophy size={30} color="var(--secondary)" /> Classifiche 🏆
        </h1>
        <p style={{ color: 'var(--text-dark-secondary)', fontSize: '15px', marginTop: '4px' }}>
          Gli atleti e i locali in cima a Strabar. Scala la classifica registrando sessioni e diventa la Leggenda del Locale.
        </p>
      </div>

      {/* Tab Atleti / Locali */}
      <div className="seg-tabs">
        <button onClick={() => setTab('atleti')} className={`seg-tab ${tab === 'atleti' ? 'active' : ''}`}>
          <Users size={16} /> Atleti
        </button>
        <button onClick={() => setTab('locali')} className={`seg-tab ${tab === 'locali' ? 'active' : ''}`}>
          <MapPin size={16} /> Locali
        </button>
      </div>

      {loading ? (
        <div className="card" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-dark-secondary)' }}>
          <Loader size={22} style={{ animation: 'spin 1s linear infinite' }} /> Carico le classifiche...
        </div>
      ) : tab === 'atleti' ? (
        /* ================= ATLETI ================= */
        <>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {USER_SORTS.map(({ key, label, icon: Icon }) => (
              <button key={key} onClick={() => setUserSort(key)}
                className={`btn ${userSort === key ? 'btn-primary' : 'btn-secondary'}`}
                style={{ padding: '8px 14px', fontSize: '13px', borderRadius: '20px' }}>
                <Icon size={14} /> {label}
              </button>
            ))}
          </div>

          {sortedUsers.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '40px' }}>
              <p style={{ color: 'var(--text-dark-secondary)', marginBottom: '16px' }}>
                Nessun atleta in classifica. Registra la prima sessione! 🍺
              </p>
              <Link href="/log" className="btn btn-primary">Registra una sessione</Link>
            </div>
          ) : (
            <>
              {/* Podio top 3 */}
              <div className="podium">
                {[1, 0, 2].map((pos) => {
                  const u = sortedUsers[pos];
                  if (!u) return <div key={pos} />;
                  const isFirst = pos === 0;
                  return (
                    <Link key={u.user_id} href={`/u/${u.user_id}`}
                      className={`podium-col ${isFirst ? 'first' : ''}`}>
                      <div className="podium-medal">{medal(pos)}</div>
                      <div className="activity-avatar podium-avatar">{(u.name || 'U').charAt(0)}</div>
                      <div className="podium-name">{u.name}</div>
                      <div className="podium-metric">{userMetric(u)}</div>
                      <div className={`podium-bar ${isFirst ? 'gold' : ''}`} style={{ height: isFirst ? 60 : pos === 1 ? 44 : 32 }}>
                        {pos + 1}
                      </div>
                    </Link>
                  );
                })}
              </div>

              {/* Resto classifica */}
              <div className="card" style={{ padding: '8px' }}>
                {sortedUsers.map((u, i) => (
                  <Link key={u.user_id} href={`/u/${u.user_id}`} className="rank-row">
                    <span className={`rank-num ${i < 3 ? 'top' : ''}`}>{medal(i)}</span>
                    <div className="activity-avatar" style={{ width: 36, height: 36, fontSize: 15, flexShrink: 0 }}>
                      {(u.name || 'U').charAt(0)}
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <strong style={{ fontSize: '14px', color: '#FFF', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.name}</strong>
                        {u.is_premium && <Award size={12} color="var(--secondary)" style={{ flexShrink: 0 }} />}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-dark-secondary)' }}>
                        {u.sessions} sessioni · {u.placesCount} locali
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <strong style={{ fontSize: '15px', color: 'var(--primary)' }}>{userMetric(u).split(' ')[0]}</strong>
                      <span style={{ display: 'block', fontSize: '10px', color: 'var(--text-dark-secondary)', textTransform: 'uppercase' }}>
                        {userSort === 'units' ? 'U.A.' : userSort === 'sessions' ? 'sessioni' : 'locali'}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </>
          )}
        </>
      ) : (
        /* ================= LOCALI ================= */
        <>
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ position: 'relative' }}>
              <Search size={18} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dark-secondary)' }} />
              <input
                className="form-control"
                placeholder="Cerca un bar, pub o locale per nome o città..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                style={{ paddingLeft: '44px', height: '46px' }}
              />
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {PLACE_SORTS.map(({ key, label, icon: Icon }) => (
                <button key={key} onClick={() => setPlaceSort(key)}
                  className={`btn ${placeSort === key ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ padding: '8px 14px', fontSize: '13px', borderRadius: '20px' }}>
                  <Icon size={14} /> {label}
                </button>
              ))}
            </div>
          </div>

          {sortedPlaces.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '40px' }}>
              <p style={{ color: 'var(--text-dark-secondary)', marginBottom: '16px' }}>
                Nessun locale registrato ancora. Registra una sessione con una posizione per far comparire il primo bar in classifica! 🍺
              </p>
              <Link href="/log" className="btn btn-primary">Registra una sessione</Link>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))', gap: '16px' }}>
              {sortedPlaces.map((place, i) => (
                <button
                  key={place.key}
                  onClick={() => openPlace(place)}
                  className="card"
                  style={{ textAlign: 'left', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '12px' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: '17px', fontWeight: 800, color: '#FFF', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '18px' }}>{medal(i)}</span>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{place.name}</span>
                      </div>
                      {place.address && (
                        <div style={{ fontSize: '12px', color: 'var(--text-dark-secondary)', marginTop: '3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {place.address}
                        </div>
                      )}
                    </div>
                    {place.reviewsCount > 0 && (
                      <div style={{ flexShrink: 0, textAlign: 'right' }}>
                        <Stars value={place.avgRating} />
                        <div style={{ fontSize: '10px', color: 'var(--text-dark-secondary)' }}>{place.reviewsCount} recensioni</div>
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', background: 'var(--bg-input-dark)', borderRadius: '10px', padding: '12px', border: '1px solid var(--border-dark)' }}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--primary)' }}>{place.sessionsCount}</div>
                      <div style={{ fontSize: '10px', color: 'var(--text-dark-secondary)', textTransform: 'uppercase' }}>Sessioni</div>
                    </div>
                    <div style={{ textAlign: 'center', borderLeft: '1px solid var(--border-dark)', borderRight: '1px solid var(--border-dark)' }}>
                      <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--secondary)' }}>{place.totalUnits}</div>
                      <div style={{ fontSize: '10px', color: 'var(--text-dark-secondary)', textTransform: 'uppercase' }}>U.A.</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '18px', fontWeight: 800 }}>{place.uniqueDrinkers}</div>
                      <div style={{ fontSize: '10px', color: 'var(--text-dark-secondary)', textTransform: 'uppercase' }}>Atleti</div>
                    </div>
                  </div>

                  {place.localLegend && place.localLegend.units > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--secondary)' }}>
                      <Crown size={14} /> Leggenda del Locale: <strong>{place.localLegend.name}</strong> ({place.localLegend.units.toFixed(1)} U.A.)
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {/* MODALE DETTAGLIO LOCALE */}
      {selected && (
        <div
          onClick={() => setSelected(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)', zIndex: 1200, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '20px', overflowY: 'auto' }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="card"
            style={{ width: '100%', maxWidth: '620px', border: '2px solid var(--primary)', marginTop: '40px', marginBottom: '40px' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px', marginBottom: '16px' }}>
              <div style={{ minWidth: 0 }}>
                <h2 style={{ fontSize: '22px', fontWeight: 800, color: '#FFF' }}>{selected.name}</h2>
                {selected.address && <p style={{ fontSize: '13px', color: 'var(--text-dark-secondary)' }}>{selected.address}</p>}
              </div>
              <button onClick={() => setSelected(null)} className="btn btn-secondary" style={{ padding: '4px 10px', borderRadius: '50%', minWidth: '34px', height: '34px', flexShrink: 0 }}>
                <X size={16} />
              </button>
            </div>

            <button
              onClick={handleStartBrindisi}
              disabled={checkingGps}
              className="btn btn-primary"
              style={{ width: '100%', marginBottom: '10px', fontSize: '14px', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
            >
              <Beer size={16} />
              {checkingGps ? 'Verifico posizione GPS...' : 'Inizia Brindisi Qui 🍻'}
            </button>

            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selected.name + ' ' + (selected.address || ''))}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-secondary"
              style={{ width: '100%', marginBottom: '18px', fontSize: '13px' }}
            >
              <ExternalLink size={14} /> Apri in Google Maps
            </a>

            {/* Classifica atleti */}
            <h3 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Trophy size={18} color="var(--secondary)" /> Classifica Atleti del Locale
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '24px' }}>
              {leaderboard.map((u, i) => (
                <div key={u.user_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: 'var(--bg-input-dark)', borderRadius: '8px', border: '1px solid var(--border-dark)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontWeight: 800, width: '24px' }}>{medal(i)}</span>
                    <Link href={`/u/${u.user_id}`} onClick={() => setSelected(null)} style={{ fontWeight: 600, fontSize: '14px', color: '#FFF' }}>{u.name}</Link>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <strong style={{ color: 'var(--secondary)', fontSize: '14px' }}>{u.units} U.A.</strong>
                    <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-dark-secondary)' }}>{u.visits} visite</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Recensioni */}
            <h3 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Star size={18} color="var(--secondary)" /> Recensioni ({reviews.length})
              {selected.reviewsCount > 0 && (
                <span style={{ fontSize: '13px', color: 'var(--text-dark-secondary)', fontWeight: 500 }}>
                  • media {selected.avgRating}/5
                </span>
              )}
            </h3>

            {/* Form recensione */}
            {currentUser ? (
              <div style={{ background: 'var(--bg-input-dark)', border: '1px solid var(--border-dark)', borderRadius: '10px', padding: '14px', marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                  <span style={{ fontSize: '13px', color: 'var(--text-dark-secondary)' }}>Il tuo voto:</span>
                  <Stars value={newRating} size={22} onPick={setNewRating} />
                </div>
                <textarea
                  className="form-control"
                  placeholder="Com'era l'atmosfera, i drink, il rapporto qualità/prezzo?"
                  value={newReview}
                  onChange={(e) => setNewReview(e.target.value)}
                  rows={2}
                  style={{ fontSize: '14px', resize: 'vertical', marginBottom: '10px' }}
                />
                <button onClick={submitReview} disabled={submitting} className="btn btn-primary" style={{ width: '100%' }}>
                  {submitting ? 'Invio...' : 'Pubblica recensione'}
                </button>
              </div>
            ) : (
              <p style={{ fontSize: '13px', color: 'var(--text-dark-secondary)', marginBottom: '16px' }}>
                <Link href="/auth" style={{ color: 'var(--primary)', fontWeight: 600 }}>Accedi</Link> per lasciare una recensione.
              </p>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {reviews.length === 0 ? (
                <p style={{ fontSize: '13px', color: 'var(--text-dark-secondary)', textAlign: 'center', padding: '14px' }}>
                  Ancora nessuna recensione. Sii il primo a recensire questo locale!
                </p>
              ) : (
                reviews.map((r) => (
                  <div key={r.id} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-dark)', borderRadius: '8px', padding: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div className="activity-avatar" style={{ width: 28, height: 28, fontSize: 12 }}>{(r.user_name || 'U').charAt(0)}</div>
                        <strong style={{ fontSize: '13px' }}>{r.user_name}</strong>
                      </div>
                      <Stars value={r.rating} />
                    </div>
                    {r.text && <p style={{ fontSize: '13px', color: 'var(--text-dark-primary)' }}>{r.text}</p>}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODALE DI AVVISO GEOFENCING / ANTICHEAT */}
      {showGeofencingModal && geofencingData && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', backdropFilter: 'blur(10px)', zIndex: 1300, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
          <div className="card" style={{ width: '100%', maxWidth: '480px', border: '2px solid var(--primary)', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '20px', animation: 'scaleUp 0.2s ease' }}>
            <div style={{ fontSize: '50px' }}>⚠️</div>
            <h3 style={{ fontSize: '20px', fontWeight: '800', color: '#FFF' }}>Fuori Portata GPS!</h3>
            
            <p style={{ fontSize: '14px', color: 'var(--text-dark-secondary)', lineHeight: '1.6' }}>
              {geofencingData.error ? (
                geofencingData.error
              ) : (
                `Ti trovi a circa ${geofencingData.distance} metri da "${selected?.name}".`
              )}
            </p>
            
            <p style={{ fontSize: '13px', color: 'var(--text-dark-secondary)', lineHeight: '1.5' }}>
              Per garantire l&apos;integrità delle classifiche locali, puoi avviare un brindisi solo se sei entro <strong>200 metri</strong> dal locale.
            </p>

            <div style={{ background: 'rgba(255, 32, 0, 0.05)', border: '1px dashed rgba(255, 32, 0, 0.3)', padding: '12px', borderRadius: '8px', fontSize: '12px', color: 'var(--primary)' }}>
              <strong>Sviluppatore o Tester?</strong> Puoi forzare l&apos;avvio per simulare e testare le funzionalità.
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
              <button
                onClick={() => {
                  setShowGeofencingModal(false);
                  setGeofencingData(null);
                }}
                className="btn btn-secondary"
                style={{ flex: 1 }}
              >
                Annulla
              </button>
              <button
                onClick={() => {
                  setShowGeofencingModal(false);
                  setGeofencingData(null);
                  handleForceDemoStart();
                }}
                className="btn btn-primary"
                style={{ flex: 1.5, fontWeight: 'bold' }}
              >
                Forza Demo Mode 🚀
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODALE DI CONFERMA CHIUSURA SESSIONE ATTIVA */}
      {showConfirmCloseModal && activeSession && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', backdropFilter: 'blur(10px)', zIndex: 1300, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
          <div className="card" style={{ width: '100%', maxWidth: '480px', border: '2px solid var(--primary)', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '20px', animation: 'scaleUp 0.2s ease' }}>
            <div style={{ fontSize: '50px' }}>🚨</div>
            <h3 style={{ fontSize: '20px', fontWeight: '800', color: '#FFF' }}>Sessione Live in Corso!</h3>
            
            <p style={{ fontSize: '14px', color: 'var(--text-dark-secondary)', lineHeight: '1.6' }}>
              Hai già una sessione attiva avviata presso <strong>{activeSession.location ? activeSession.location.name : 'Sessione Libera'}</strong>.
            </p>
            
            <p style={{ fontSize: '13px', color: 'var(--text-dark-secondary)', lineHeight: '1.5' }}>
              Per iniziare un nuovo brindisi presso <strong>{pendingPlace?.name}</strong>, devi chiudere quella precedente. Vuoi procedere?
            </p>

            <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
              <button
                onClick={() => {
                  setShowConfirmCloseModal(false);
                  setPendingPlace(null);
                }}
                className="btn btn-secondary"
                style={{ flex: 1 }}
              >
                Annulla
              </button>
              <button
                onClick={() => {
                  window.location.href = '/';
                }}
                className="btn btn-secondary"
                style={{ flex: 1, border: '1px dashed var(--primary)' }}
              >
                Gestisci Live 🧭
              </button>
              <button
                onClick={handleCloseAndStartNewSession}
                className="btn btn-primary"
                style={{ flex: 1.5, fontWeight: 'bold' }}
              >
                Chiudi e Inizia Qui 🍻
              </button>
            </div>
          </div>
        </div>
      )}



      <style jsx global>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
