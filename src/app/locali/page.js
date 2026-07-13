'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useT } from '@/lib/i18n';
import { Search, MapPin, Star, Beer, BadgeCheck, Loader, ArrowLeft, Navigation } from 'lucide-react';

// Directory PUBBLICA dei locali Strabar (niente login): ricerca, ordinamento e scoperta.
// EGRESS: i dati arrivano da /api/venues/directory, aggregati in SQL e messi in cache sul
// CDN. La ricerca e l'ordinamento avvengono lato client su quell'unico payload cacheato,
// così non generiamo una variante di cache per ogni termine cercato.

function Stars({ value, size = 13 }) {
  return (
    <span style={{ display: 'inline-flex', gap: '2px' }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} size={size} fill={n <= Math.round(value) ? 'var(--secondary)' : 'none'} color={n <= Math.round(value) ? 'var(--secondary)' : 'var(--text-dark-secondary)'} />
      ))}
    </span>
  );
}

const haversine = (aLat, aLng, bLat, bLng) => {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
};

export default function LocaliDirectoryPage() {
  const t = useT();
  const [venues, setVenues] = useState(null);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('active'); // active | rating | near
  const [me, setMe] = useState(null); // { lat, lng }
  const [geoBusy, setGeoBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/venues/directory', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setVenues(d.venues || []); })
      .catch(() => { if (!cancelled) setVenues([]); });
    return () => { cancelled = true; };
  }, []);

  const useMyLocation = () => {
    if (!navigator.geolocation) return;
    setGeoBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => { setMe({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setSort('near'); setGeoBusy(false); },
      () => { setGeoBusy(false); },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    let out = (venues || []).filter((v) => !q || v.name.toLowerCase().includes(q) || (v.address || '').toLowerCase().includes(q));
    if (sort === 'near' && me) {
      out = out
        .filter((v) => typeof v.lat === 'number' && typeof v.lng === 'number')
        .map((v) => ({ ...v, _dist: haversine(me.lat, me.lng, v.lat, v.lng) }))
        .sort((a, b) => a._dist - b._dist);
    } else if (sort === 'rating') {
      out = [...out].sort((a, b) => b.avgRating - a.avgRating || b.reviewsCount - a.reviewsCount || b.sessionsCount - a.sessionsCount);
    } else {
      out = [...out].sort((a, b) => b.sessionsCount - a.sessionsCount || b.totalUnits - a.totalUnits);
    }
    return out;
  }, [venues, query, sort, me]);

  const fmtDist = (km) => (km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`);

  return (
    <div style={{ maxWidth: '760px', margin: '0 auto', padding: '0 4px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <Link href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'var(--text-dark-secondary)', fontSize: '13px', marginTop: '8px' }}>
        <ArrowLeft size={16} /> Strabar
      </Link>

      <div>
        <h1 style={{ fontSize: '26px', fontWeight: 900, color: '#FFF', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
          <MapPin size={22} color="var(--primary)" /> {t('directory.title')}
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--text-dark-secondary)' }}>{t('directory.subtitle')}</p>
      </div>

      {/* Ricerca */}
      <div style={{ position: 'relative' }}>
        <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dark-secondary)' }} />
        <input
          className="form-control"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('directory.searchPh')}
          style={{ width: '100%', paddingLeft: '38px' }}
        />
      </div>

      {/* Ordinamenti */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <button type="button" onClick={() => setSort('active')} className={`btn ${sort === 'active' ? 'btn-primary' : 'btn-secondary'}`} style={{ fontSize: '12px', padding: '7px 14px', borderRadius: '20px' }}>
          <Beer size={13} /> {t('directory.sortActive')}
        </button>
        <button type="button" onClick={() => setSort('rating')} className={`btn ${sort === 'rating' ? 'btn-primary' : 'btn-secondary'}`} style={{ fontSize: '12px', padding: '7px 14px', borderRadius: '20px' }}>
          <Star size={13} /> {t('directory.sortRating')}
        </button>
        <button type="button" onClick={useMyLocation} className={`btn ${sort === 'near' ? 'btn-primary' : 'btn-secondary'}`} style={{ fontSize: '12px', padding: '7px 14px', borderRadius: '20px' }}>
          {geoBusy ? <Loader size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Navigation size={13} />} {t('directory.sortNear')}
        </button>
      </div>

      {/* Lista */}
      {venues === null ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}><Loader size={26} style={{ animation: 'spin 1s linear infinite', color: 'var(--primary)' }} /></div>
      ) : list.length === 0 ? (
        <p style={{ textAlign: 'center', color: 'var(--text-dark-secondary)', fontSize: '14px', padding: '30px' }}>{t('directory.empty')}</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 320px), 1fr))', gap: '14px' }}>
          {list.map((v) => (
            <Link
              key={v.key}
              href={`/locale/${encodeURIComponent(v.key)}`}
              className="card"
              style={{ display: 'flex', flexDirection: 'column', gap: '12px', textDecoration: 'none' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '16px', fontWeight: 800, color: '#FFF', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.name}</span>
                    {v.verified && <BadgeCheck size={15} color="var(--secondary)" style={{ flexShrink: 0 }} aria-label={t('directory.verified')} />}
                  </div>
                  {v.address && <div style={{ fontSize: '12px', color: 'var(--text-dark-secondary)', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.address}</div>}
                </div>
                {v.reviewsCount > 0 && (
                  <div style={{ flexShrink: 0, textAlign: 'right' }}>
                    <Stars value={v.avgRating} />
                    <div style={{ fontSize: '10px', color: 'var(--text-dark-secondary)' }}>{t('directory.reviewsN', { n: v.reviewsCount })}</div>
                  </div>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', background: 'var(--bg-input-dark)', borderRadius: '10px', padding: '10px', border: '1px solid var(--border-dark)' }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '17px', fontWeight: 800, color: 'var(--primary)' }}>{v.sessionsCount}</div>
                  <div style={{ fontSize: '9px', color: 'var(--text-dark-secondary)', textTransform: 'uppercase' }}>{t('directory.statVisits')}</div>
                </div>
                <div style={{ textAlign: 'center', borderLeft: '1px solid var(--border-dark)', borderRight: '1px solid var(--border-dark)' }}>
                  <div style={{ fontSize: '17px', fontWeight: 800, color: 'var(--secondary)' }}>{v.totalDrinks}</div>
                  <div style={{ fontSize: '9px', color: 'var(--text-dark-secondary)', textTransform: 'uppercase' }}>{t('directory.statDrinks')}</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '17px', fontWeight: 800 }}>{v.uniqueDrinkers}</div>
                  <div style={{ fontSize: '9px', color: 'var(--text-dark-secondary)', textTransform: 'uppercase' }}>{t('directory.statAthletes')}</div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px' }}>
                {v.topDrink ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', color: 'var(--secondary)', fontWeight: 700, minWidth: 0 }}>
                    <Beer size={13} style={{ flexShrink: 0 }} /> <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.topDrink}</span>
                  </span>
                ) : <span />}
                {sort === 'near' && typeof v._dist === 'number' && (
                  <span style={{ color: 'var(--text-dark-secondary)', flexShrink: 0 }}>{fmtDist(v._dist)}</span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* CTA per i gestori */}
      <Link href="/business" className="card" style={{ textAlign: 'center', padding: '18px', border: '1px solid var(--primary)', textDecoration: 'none', marginTop: '4px', marginBottom: '24px' }}>
        <div style={{ fontSize: '15px', fontWeight: 800, color: '#FFF', marginBottom: '4px' }}>{t('directory.ownerCtaTitle')}</div>
        <div style={{ fontSize: '12px', color: 'var(--text-dark-secondary)' }}>{t('directory.ownerCtaDesc')}</div>
      </Link>
    </div>
  );
}
