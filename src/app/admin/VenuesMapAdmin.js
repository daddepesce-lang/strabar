'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { Loader, MapPin } from 'lucide-react';

// Mappa generale di TUTTE le bevute (tutti i locali geolocalizzati), sezione admin dedicata.
// Dati aggregati lato server da /api/admin/venues → nessun egress client extra.
const RouteMap = dynamic(() => import('@/components/RouteMap'), { ssr: false });

export default function VenuesMapAdmin() {
  const [data, setData] = useState(null);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/admin/venues', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setData({ venues: [] }); });
    return () => { cancelled = true; };
  }, []);

  if (!data) return <div style={{ color: 'var(--text-dark-secondary)' }}><Loader size={16} style={{ animation: 'spin 1s linear infinite' }} /> Carico…</div>;

  const verifiedPoints = (data.venues || [])
    .filter((v) => typeof v.lat === 'number' && typeof v.lng === 'number')
    .map((v) => ({
      name: v.name,
      lat: v.lat,
      lng: v.lng,
      label: v.sessions,
      note: `${v.sessions} presenze · ${v.uniqueUsers} clienti · ${v.units} U.A.`,
    }));

  // Check-in geolocalizzati ma NON verificati (loggati lontano dal locale o senza prova GPS):
  // marker ambra, distinti da quelli verificati (rossi). Non contano per le statistiche di vendita.
  const unverifiedPoints = (data.unverifiedVenues || [])
    .filter((v) => typeof v.lat === 'number' && typeof v.lng === 'number')
    .map((v) => ({
      name: v.name,
      lat: v.lat,
      lng: v.lng,
      label: v.sessions,
      color: '#F5A623',
      note: `⚠︎ non verificata · ${v.sessions} check-in · ${v.uniqueUsers} clienti · ${v.units} U.A.`,
    }));

  // Sessioni libere geolocalizzate (GPS senza locale): marker blu, solo copertura geografica.
  // Non contano per le statistiche di vendita.
  const freeformPoints = (data.freeformVenues || [])
    .filter((v) => typeof v.lat === 'number' && typeof v.lng === 'number')
    .map((v) => ({
      name: v.name,
      lat: v.lat,
      lng: v.lng,
      label: v.sessions,
      color: '#4A90E2',
      note: `📍 sessione libera · ${v.sessions} check-in · ${v.uniqueUsers} utenti · ${v.units} U.A.`,
    }));

  const points = [...verifiedPoints, ...unverifiedPoints, ...freeformPoints];

  return (
    <div className="card" style={{ padding: 16 }}>
      <h3 style={{ fontSize: 15, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 4px' }}>
        <MapPin size={17} color="var(--primary)" /> Mappa delle bevute
      </h3>
      <p style={{ fontSize: 12, color: 'var(--text-dark-secondary)', margin: '0 0 12px' }}>
        Tutti i check-in geolocalizzati. Tocca un punto per presenze, clienti e U.A.
      </p>
      {points.length > 0 ? (
        <>
          <RouteMap waypoints={points} height="480px" connectLine={false} />
          {/* Legenda marker */}
          <div style={{ display: 'flex', gap: 16, marginTop: 10, flexWrap: 'wrap', fontSize: 11, color: 'var(--text-dark-secondary)' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 11, height: 11, borderRadius: '50%', background: '#FF3B2F', border: '2px solid #fff' }} /> Verificata (GPS sul posto)
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 11, height: 11, borderRadius: '50%', background: '#F5A623', border: '2px solid #fff' }} /> Non verificata (lontano / senza GPS)
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 11, height: 11, borderRadius: '50%', background: '#4A90E2', border: '2px solid #fff' }} /> Sessione libera (senza locale)
            </span>
          </div>
          <div style={{ display: 'flex', gap: 24, marginTop: 12, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 26, lineHeight: 1, color: '#fff' }}>{verifiedPoints.length}</div>
              <div style={{ fontSize: 10, color: 'var(--text-dark-tertiary)', textTransform: 'uppercase', letterSpacing: '.05em', marginTop: 3 }}>Locali verificati</div>
            </div>
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 26, lineHeight: 1, color: '#fff' }}>{verifiedPoints.reduce((s, p) => s + p.label, 0)}</div>
              <div style={{ fontSize: 10, color: 'var(--text-dark-tertiary)', textTransform: 'uppercase', letterSpacing: '.05em', marginTop: 3 }}>Presenze verificate</div>
            </div>
            {unverifiedPoints.length > 0 && (
              <div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 26, lineHeight: 1, color: '#F5A623' }}>{unverifiedPoints.length}</div>
                <div style={{ fontSize: 10, color: 'var(--text-dark-tertiary)', textTransform: 'uppercase', letterSpacing: '.05em', marginTop: 3 }}>Locali non verificati</div>
              </div>
            )}
            {freeformPoints.length > 0 && (
              <div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 26, lineHeight: 1, color: '#4A90E2' }}>{freeformPoints.length}</div>
                <div style={{ fontSize: 10, color: 'var(--text-dark-tertiary)', textTransform: 'uppercase', letterSpacing: '.05em', marginTop: 3 }}>Sessioni libere</div>
              </div>
            )}
          </div>
        </>
      ) : (
        <div style={{ textAlign: 'center', padding: '30px 20px', color: 'var(--text-dark-secondary)', fontSize: 13, border: '1px dashed var(--border-dark)', borderRadius: 10 }}>
          Nessun check-in geolocalizzato ancora.
        </div>
      )}
    </div>
  );
}
