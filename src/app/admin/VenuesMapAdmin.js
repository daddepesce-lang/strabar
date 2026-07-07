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

  const points = (data.venues || [])
    .filter((v) => typeof v.lat === 'number' && typeof v.lng === 'number')
    .map((v) => ({
      name: v.name,
      lat: v.lat,
      lng: v.lng,
      label: v.sessions,
      note: `${v.sessions} presenze · ${v.uniqueUsers} clienti · ${v.units} U.A.`,
    }));

  return (
    <div className="card" style={{ padding: 16 }}>
      <h3 style={{ fontSize: 15, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 4px' }}>
        <MapPin size={17} color="var(--primary)" /> Mappa delle bevute
      </h3>
      <p style={{ fontSize: 12, color: 'var(--text-dark-secondary)', margin: '0 0 12px' }}>
        Tutti i locali con check-in geolocalizzati. Tocca un punto per presenze, clienti e U.A.
      </p>
      {points.length > 0 ? (
        <>
          <RouteMap waypoints={points} height="480px" connectLine={false} />
          <div style={{ display: 'flex', gap: 24, marginTop: 12, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 26, lineHeight: 1, color: '#fff' }}>{points.length}</div>
              <div style={{ fontSize: 10, color: 'var(--text-dark-tertiary)', textTransform: 'uppercase', letterSpacing: '.05em', marginTop: 3 }}>Locali sulla mappa</div>
            </div>
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 26, lineHeight: 1, color: '#fff' }}>{points.reduce((s, p) => s + p.label, 0)}</div>
              <div style={{ fontSize: 10, color: 'var(--text-dark-tertiary)', textTransform: 'uppercase', letterSpacing: '.05em', marginTop: 3 }}>Presenze totali</div>
            </div>
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
