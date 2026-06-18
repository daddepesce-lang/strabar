'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { db } from '@/lib/db';
import { Radar, MapPin, Loader, Beer, RefreshCw } from 'lucide-react';
import RequireAuth from '@/components/RequireAuth';

const RouteMap = dynamic(() => import('@/components/RouteMap'), { ssr: false });

const fmtDist = (m) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${m} m`);

export default function LiveRadarPage() {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [coords, setCoords] = useState(null);
  const [geoError, setGeoError] = useState(null);
  const [all, setAll] = useState([]); // tutti i live trovati (entro raggio massimo)
  const [radius, setRadius] = useState(1000); // metri (slider)
  const [scanning, setScanning] = useState(false);

  const requestLocation = () =>
    new Promise((resolve) => {
      if (typeof navigator === 'undefined' || !navigator.geolocation) { resolve(null); return; }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
      );
    });

  const scan = async (user, c) => {
    if (!c) return;
    setScanning(true);
    try {
      // Prendiamo tutti i live entro un raggio ampio, poi filtriamo con lo slider lato client
      const list = await db.getLiveDrinkers(c.lat, c.lng, 50000, user?.id);
      setAll(list);
    } catch (err) {
      console.error('Errore radar live:', err);
    } finally {
      setScanning(false);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const user = await db.getCurrentUser();
        setCurrentUser(user);
        if (!user) return;
        const c = await requestLocation();
        setCoords(c);
        if (!c) {
          setGeoError('Posizione GPS non disponibile. Attiva la localizzazione per usare il radar.');
        } else {
          await scan(user, c);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '50vh' }}>
        <Loader size={28} style={{ color: 'var(--primary)', animation: 'spin 1s linear infinite' }} />
      </div>
    );
  }

  if (!currentUser) return <RequireAuth feature="il radar live" />;

  const visible = all.filter((d) => d.distance <= radius);
  const waypoints = visible.map((d) => ({
    name: d.name,
    lat: d.lat,
    lng: d.lng,
    note: `${d.place} · ${fmtDist(d.distance)}`,
    label: (d.name || 'A').charAt(0).toUpperCase(),
  }));

  return (
    <div style={{ maxWidth: '760px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '18px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Radar size={28} color="var(--primary)" /> Radar Live
          </h1>
          <p style={{ color: 'var(--text-dark-secondary)', fontSize: '14px', marginTop: '2px' }}>
            Chi sta bevendo (live) vicino a te in questo momento.
          </p>
        </div>
        <button
          onClick={() => scan(currentUser, coords)}
          disabled={scanning || !coords}
          className="btn btn-secondary"
          style={{ borderRadius: '20px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
        >
          <RefreshCw size={15} style={scanning ? { animation: 'spin 1s linear infinite' } : undefined} /> Aggiorna
        </button>
      </div>

      {geoError ? (
        <div className="card" style={{ textAlign: 'center', padding: '30px', color: 'var(--text-dark-secondary)' }}>
          <MapPin size={28} color="var(--secondary)" style={{ marginBottom: '10px' }} />
          <p style={{ marginBottom: '14px' }}>{geoError}</p>
          <button
            onClick={async () => {
              setGeoError(null);
              const c = await requestLocation();
              setCoords(c);
              if (c) scan(currentUser, c); else setGeoError('Ancora nessuna posizione. Controlla i permessi del browser.');
            }}
            className="btn btn-primary"
            style={{ borderRadius: '20px' }}
          >
            📡 Attiva GPS e scansiona
          </button>
        </div>
      ) : (
        <>
          {/* Slider raggio */}
          <div className="card" style={{ padding: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '13px', fontWeight: 700 }}>Raggio di ricerca</span>
              <span style={{ fontSize: '13px', color: 'var(--primary)', fontWeight: 800 }}>{fmtDist(radius)}</span>
            </div>
            <input
              type="range"
              min="200"
              max="20000"
              step="100"
              value={radius}
              onChange={(e) => setRadius(parseInt(e.target.value, 10))}
              style={{ width: '100%', accentColor: 'var(--primary)' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-dark-secondary)', marginTop: '2px' }}>
              <span>200 m</span><span>20 km</span>
            </div>
          </div>

          {/* Mappa con cerchio del raggio */}
          {coords && (
            <RouteMap
              waypoints={waypoints}
              height="340px"
              connectLine={false}
              center={coords}
              radiusMeters={radius}
            />
          )}

          {/* Lista */}
          {visible.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '34px', color: 'var(--text-dark-secondary)' }}>
              Nessun atleta live nel raggio di {fmtDist(radius)}. Allarga il raggio o riprova più tardi! 🍻
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <span style={{ fontSize: '13px', color: 'var(--text-dark-secondary)' }}>{visible.length} atleti live vicino a te:</span>
              {visible.map((d) => (
                <Link key={d.id} href={`/u/${d.user_id}`} className="card" style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '14px', textDecoration: 'none' }}>
                  <div className="activity-avatar" style={{ width: 44, height: 44, fontSize: 18, flexShrink: 0, position: 'relative' }}>
                    {(d.name || 'A').charAt(0).toUpperCase()}
                    <span className="pulse" style={{ position: 'absolute', bottom: -2, right: -2, width: 12, height: 12, borderRadius: '50%', background: 'var(--primary)', border: '2px solid var(--bg-card-dark)' }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <strong style={{ fontSize: '15px', color: '#FFF', display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.name}</strong>
                    <span style={{ fontSize: '12px', color: 'var(--text-dark-secondary)', display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      📍 {d.place} {d.share === 'friends' && '· 👥'}
                    </span>
                    <span style={{ fontSize: '12px', color: 'var(--secondary)', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                      <Beer size={11} /> {d.drinks} drink · {d.bac.toFixed(2)} g/l
                    </span>
                  </div>
                  <span style={{ fontSize: '13px', color: 'var(--primary)', fontWeight: 800, whiteSpace: 'nowrap' }}>{fmtDist(d.distance)}</span>
                </Link>
              ))}
            </div>
          )}

          <p style={{ fontSize: '11px', color: 'var(--text-dark-secondary)', textAlign: 'center', lineHeight: 1.5 }}>
            Vedi solo chi ha scelto di condividere la posizione live (con tutti o con gli amici). Attiva la condivisione quando avvii un brindisi per comparire qui.
          </p>
        </>
      )}
    </div>
  );
}
