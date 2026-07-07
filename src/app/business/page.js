'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { db } from '@/lib/db';
import { useT } from '@/lib/i18n';
import { Store, Search, Loader, Star, Megaphone, Bell, ArrowRight, MapPin, Navigation } from 'lucide-react';

const distKm = (aLat, aLng, bLat, bLng) => {
  const R = 6371, toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat), dLng = toRad(bLng - aLng);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
};

// Landing pubblica "Strabar per i locali": spiega l'offerta + FINDER locali (per nome,
// vicino a me, o i più attivi su Strabar) per trovare il proprio locale e richiederne
// la gestione (→ approvazione admin).
export default function BusinessPage() {
  const t = useT();
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [community, setCommunity] = useState([]);
  const [coords, setCoords] = useState(null);
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    db.getPlaces().then((p) => setCommunity(p || [])).catch(() => {});
  }, []);

  const findNearby = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) { alert(t('businesspage.gpsUnavailable')); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => { setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setLocating(false); },
      () => { setLocating(false); alert(t('businesspage.positionUnavailable')); },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 120000 }
    );
  };

  // Lista di default (nessuna ricerca per nome): i locali più attivi su Strabar,
  // oppure — se ho il GPS — quelli vicini ordinati per sessioni registrate.
  const browseList = (() => {
    let list = (community || []).map((c) => ({ key: c.key, name: c.name, address: c.address, verified: c.verified, sessions: c.sessionsCount, lat: c.lat, lng: c.lng }));
    if (coords) {
      list = list
        .filter((c) => typeof c.lat === 'number' && typeof c.lng === 'number')
        .map((c) => ({ ...c, km: distKm(coords.lat, coords.lng, c.lat, c.lng) }))
        .filter((c) => c.km <= 15)
        .sort((a, b) => b.sessions - a.sessions || a.km - b.km);
    } else {
      list = list.sort((a, b) => b.sessions - a.sessions);
    }
    return list.slice(0, 25);
  })();

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setResults([]); return; }
    setSearching(true);
    const h = setTimeout(async () => {
      const norm = (n) => (n || '').trim().toLowerCase().replace(/\s+/g, ' ');
      // Locali già nella community (dalle sessioni) + ricerca OSM.
      const comm = (community || [])
        .filter((c) => c.name.toLowerCase().includes(term.toLowerCase()))
        .map((c) => ({ key: c.key, name: c.name, address: c.address, verified: c.verified }));
      let osm = [];
      try {
        const res = await db.searchVenues(term);
        osm = (res || []).filter((v) => v.isVenue).map((v) => ({ key: norm(v.name), name: v.name, address: v.address }));
      } catch { /* noop */ }
      const seen = new Set(comm.map((c) => c.key));
      const merged = [...comm, ...osm.filter((o) => !seen.has(o.key))].slice(0, 20);
      setResults(merged);
      setSearching(false);
    }, 400);
    return () => clearTimeout(h);
  }, [q, community]);

  const SERVICES = [
    { icon: Star, t: t('businesspage.svcSponsoredTitle'), d: t('businesspage.svcSponsoredDesc') },
    { icon: Megaphone, t: t('businesspage.svcPromoTitle'), d: t('businesspage.svcPromoDesc') },
    { icon: Bell, t: t('businesspage.svcNotifyTitle'), d: t('businesspage.svcNotifyDesc') },
  ];

  return (
    <div style={{ maxWidth: '620px', margin: '0 auto', padding: '0 4px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div className="card" style={{ textAlign: 'center', padding: '28px 20px', border: '1px solid var(--primary)', background: 'linear-gradient(135deg, rgba(22,24,34,1) 0%, rgba(255,59,47,0.08) 100%)' }}>
        <Store size={34} color="var(--primary)" style={{ marginBottom: '8px' }} />
        <h1 style={{ fontSize: '26px', fontWeight: 900, color: '#FFF', marginBottom: '8px' }}>{t('businesspage.heroTitle')}</h1>
        <p style={{ fontSize: '14px', color: 'var(--text-dark-secondary)', lineHeight: 1.5 }}>
          {t('businesspage.heroSubtitle')}
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: '10px' }}>
        {SERVICES.map((s) => (
          <div key={s.t} className="card" style={{ padding: '14px' }}>
            <s.icon size={18} color="var(--secondary)" />
            <div style={{ fontSize: '14px', fontWeight: 700, color: '#FFF', marginTop: '6px' }}>{s.t}</div>
            <div style={{ fontSize: '12px', color: 'var(--text-dark-secondary)', marginTop: '2px', lineHeight: 1.4 }}>{s.d}</div>
          </div>
        ))}
      </div>

      <div className="card" style={{ padding: '18px' }}>
        <h2 style={{ fontSize: '16px', fontWeight: 800, color: '#FFF', marginBottom: '4px' }}>{t('businesspage.findTitle')}</h2>
        <p style={{ fontSize: '12px', color: 'var(--text-dark-secondary)', marginBottom: '12px' }}>{t('businesspage.findSubtitle')}</p>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dark-secondary)' }} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('businesspage.searchPlaceholder')} className="form-control" style={{ paddingLeft: 38, fontSize: 14, width: '100%' }} />
          </div>
          <button onClick={findNearby} className="btn btn-secondary" title={t('businesspage.nearMe')} style={{ borderRadius: 10, padding: '0 12px', flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            {locating ? <Loader size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <Navigation size={15} />} {t('businesspage.near')}
          </button>
        </div>
        {searching && <div style={{ textAlign: 'center', color: 'var(--text-dark-secondary)', fontSize: 13, padding: 8 }}><Loader size={15} style={{ animation: 'spin 1s linear infinite' }} /> {t('businesspage.searching')}</div>}

        {/* Senza ricerca per nome: i locali più attivi su Strabar (o i vicini se ho il GPS). */}
        {q.trim().length < 2 && (
          <>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-dark-secondary)', margin: '4px 0 8px' }}>
              {coords ? t('businesspage.nearbyActiveHeading') : t('businesspage.topActiveHeading')}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {browseList.length === 0 && <p style={{ fontSize: 13, color: 'var(--text-dark-secondary)', textAlign: 'center', padding: 10 }}>{coords ? t('businesspage.noNearbyVenues') : t('businesspage.noVenuesYet')}</p>}
              {browseList.map((r) => (
                <Link key={r.key} href={`/locale/${encodeURIComponent(r.key)}/gestione`} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderRadius: '10px', border: '1px solid var(--border-dark)', textDecoration: 'none' }}>
                  <MapPin size={16} style={{ color: 'var(--secondary)', flexShrink: 0 }} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', color: '#FFF', fontWeight: 600, fontSize: '14px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name} {r.verified ? '✓' : ''}</span>
                    <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-dark-secondary)' }}>{t('businesspage.toastsCount', { n: r.sessions })}{typeof r.km === 'number' ? ` · ${r.km < 1 ? Math.round(r.km * 1000) + ' m' : r.km.toFixed(1) + ' km'}` : ''}</span>
                  </span>
                  <ArrowRight size={16} style={{ color: 'var(--text-dark-secondary)', flexShrink: 0 }} />
                </Link>
              ))}
            </div>
          </>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {results.map((r) => (
            <Link key={r.key} href={`/locale/${encodeURIComponent(r.key)}/gestione`} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderRadius: '10px', border: '1px solid var(--border-dark)', textDecoration: 'none' }}>
              <MapPin size={16} style={{ color: 'var(--secondary)', flexShrink: 0 }} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', color: '#FFF', fontWeight: 600, fontSize: '14px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name} {r.verified ? '✓' : ''}</span>
                {r.address && <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-dark-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.address}</span>}
              </span>
              <ArrowRight size={16} style={{ color: 'var(--text-dark-secondary)', flexShrink: 0 }} />
            </Link>
          ))}
          {q.trim().length >= 2 && !searching && results.length === 0 && (
            <div style={{ textAlign: 'center', padding: 10 }}>
              <p style={{ fontSize: 13, color: 'var(--text-dark-secondary)', marginBottom: 10 }}>{t('businesspage.notFound')}</p>
              <Link href={`/locale/${encodeURIComponent(q.trim().toLowerCase().replace(/\s+/g, ' '))}/gestione`} className="btn btn-primary" style={{ borderRadius: 20, padding: '10px 18px', fontSize: 14, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                {t('businesspage.addAndRequest', { name: q.trim() })} <ArrowRight size={15} />
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
