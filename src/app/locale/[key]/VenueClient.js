'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { db } from '@/lib/db';
import { useT } from '@/lib/i18n';
import QRCode from 'qrcode';
import dynamic from 'next/dynamic';
import { Trophy, Beer, Share2, Download, MapPin, Loader, ArrowLeft, Star, BadgeCheck, BarChart3, Heart, Crown, Camera, Swords } from 'lucide-react';
import { showToast, showError } from '@/lib/toast';

const MediaLightbox = dynamic(() => import('@/components/MediaLightbox'), { ssr: false });

// Stelle recensione (lettura o selezione).
function Stars({ value, size = 15, onPick }) {
  return (
    <span style={{ display: 'inline-flex', gap: '2px' }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          size={size}
          onClick={onPick ? () => onPick(n) : undefined}
          style={onPick ? { cursor: 'pointer' } : undefined}
          fill={n <= Math.round(value) ? 'var(--secondary)' : 'none'}
          color={n <= Math.round(value) ? 'var(--secondary)' : 'var(--text-dark-secondary)'}
        />
      ))}
    </span>
  );
}

// Parte INTERATTIVA della pagina pubblica del locale (classifica, recensioni, QR).
// La pagina server (page.js) le passa `initial`: la classifica "di sempre" gia' letta lato
// server e messa in cache per un'ora. Due vantaggi: il contenuto e' nell'HTML (Google lo
// indicizza, prima era invisibile perche' caricato dal browser) e la prima visita non fa
// alcuna chiamata di rete. Il fetch client resta solo per il cambio periodo.
export default function VenueClient({ placeKey, initial = null, address = '', city = '', citySlug = '' }) {
  const t = useT();

  const [data, setData] = useState(initial);
  const [loading, setLoading] = useState(!initial);
  // La classifica "di sempre" del primo render arriva gia' dal server: non rifarla.
  const skipFirstFetch = useRef(!!initial);
  const [period, setPeriod] = useState('all'); // 'week' | 'all'
  const [qr, setQr] = useState(null);
  const [pageUrl, setPageUrl] = useState('');
  const [isManager, setIsManager] = useState(false); // gestore approvato di QUESTO locale

  // Recensioni
  const [reviews, setReviews] = useState([]);
  const [reviewMeta, setReviewMeta] = useState({ avgRating: 0, count: 0 });
  const [currentUser, setCurrentUser] = useState(null);
  const [canReview, setCanReview] = useState(false);
  const [newRating, setNewRating] = useState(5);
  const [newReview, setNewReview] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Comunità del locale: follow, re della settimana, muro delle foto.
  // Il conteggio follower arriva dentro `data` (payload già in cache): per chi non è
  // loggato non facciamo NESSUNA chiamata in più. Solo a chi ha un account chiediamo al
  // DB se segue già questo locale.
  const [follow, setFollow] = useState({ following: false, followers: null });
  const [followBusy, setFollowBusy] = useState(false);
  const [photoIdx, setPhotoIdx] = useState(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = window.location.origin + window.location.pathname;
    setPageUrl(url);
    QRCode.toDataURL(url, { margin: 1, width: 480, color: { dark: '#000000', light: '#FFFFFF' } })
      .then(setQr)
      .catch(() => {});
  }, []);

  // Solo un gestore APPROVATO di questo locale vede l'ingresso all'area riservata:
  // l'area gestione/servizi non è esposta ai visitatori qualsiasi.
  useEffect(() => {
    let cancelled = false;
    db.isVenueManager(placeKey).then((m) => { if (!cancelled) setIsManager(!!m); }).catch(() => {});
    return () => { cancelled = true; };
  }, [placeKey]);

  useEffect(() => {
    if (skipFirstFetch.current) { skipFirstFetch.current = false; return; }
    let cancelled = false;
    setLoading(true);
    fetch(`/api/venue/${encodeURIComponent(placeKey)}?period=${period}`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setData(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [placeKey, period]);

  // Recensioni (lettura pubblica, cache CDN) + se posso scriverne una.
  const loadReviews = () => {
    fetch(`/api/venue/${encodeURIComponent(placeKey)}/reviews`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => { setReviews(d.reviews || []); setReviewMeta({ avgRating: d.avgRating || 0, count: d.count || 0 }); })
      .catch(() => {});
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadReviews(); }, [placeKey]);

  useEffect(() => {
    let cancelled = false;
    db.getCurrentUser().then((u) => {
      if (cancelled) return;
      setCurrentUser(u);
      if (u) db.canReviewVenue(placeKey).then((c) => { if (!cancelled) setCanReview(!!c); }).catch(() => {});
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [placeKey]);

  // Seguo già questo locale? Domanda che ha senso solo da loggati.
  useEffect(() => {
    if (!currentUser) return;
    let cancelled = false;
    db.getVenueFollow(placeKey)
      .then((f) => { if (!cancelled && f) setFollow((prev) => ({ ...prev, ...f })); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [currentUser, placeKey]);

  const toggleFollow = async () => {
    if (!currentUser) { window.location.href = `/auth?next=${encodeURIComponent(`/locale/${placeKey}`)}`; return; }
    if (followBusy) return;
    setFollowBusy(true);
    try {
      const res = await db.toggleVenueFollow(placeKey, venueName);
      setFollow(res);
      showToast(res.following ? t('venuepublic.followedToast', { venue: venueName }) : t('venuepublic.unfollowedToast'), {
        variant: res.following ? 'success' : undefined,
      });
    } catch (err) {
      showError(err?.message || t('feedback.genericError'), err);
    } finally {
      setFollowBusy(false);
    }
  };

  const submitReview = async () => {
    if (!currentUser || submitting) return;
    setSubmitting(true);
    try {
      await db.addReview(placeKey, venueName, newRating, newReview);
      setNewReview('');
      loadReviews();
    } catch (err) {
      showError(err?.message || t('feedback.genericError'), err);
    } finally { setSubmitting(false); }
  };

  const venueName = data?.name || placeKey;
  const board = data?.board || [];

  const share = async () => {
    const text = t('venuepublic.shareText', { venue: venueName });
    try {
      if (navigator.share) { await navigator.share({ title: t('venuepublic.shareTitle'), text, url: pageUrl }); return; }
    } catch { return; }
    try { await navigator.clipboard.writeText(`${text} ${pageUrl}`); showToast(t('venuepublic.shareCopied')); } catch { /* noop */ }
  };

  const downloadQr = () => {
    if (!qr) return;
    const a = document.createElement('a');
    a.href = qr;
    a.download = `strabar-qr-${placeKey.replace(/[^a-z0-9]+/gi, '-')}.png`;
    a.click();
  };

  const medals = ['🥇', '🥈', '🥉'];

  return (
    <div style={{ maxWidth: '560px', margin: '0 auto', padding: '0 4px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
      <Link href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'var(--text-dark-secondary)', fontSize: '13px', marginTop: '8px' }}>
        <ArrowLeft size={16} /> Strabar
      </Link>

      {/* Intestazione locale */}
      <div className="card" style={{ textAlign: 'center', padding: '24px 20px', border: '1px solid var(--primary)', background: 'linear-gradient(135deg, rgba(22,24,34,1) 0%, rgba(255,59,47,0.08) 100%)' }}>
        <div style={{ fontSize: '13px', color: 'var(--secondary)', fontWeight: 700, letterSpacing: '.5px', textTransform: 'uppercase', marginBottom: '6px' }}>
          <MapPin size={14} style={{ verticalAlign: '-2px' }} /> {t('venuepublic.venueLeaderboard')}
        </div>
        <h1 style={{ fontSize: '26px', fontWeight: 900, color: '#FFF', lineHeight: 1.1, marginBottom: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
          {venueName}
          {data?.verified && <BadgeCheck size={20} color="var(--secondary)" style={{ flexShrink: 0 }} aria-label={t('venuepublic.verified')} />}
        </h1>
        {address && (
          <p style={{ fontSize: '12px', color: 'var(--text-dark-secondary)', marginBottom: '4px' }}>{address}</p>
        )}
        {data && <p style={{ fontSize: '13px', color: 'var(--text-dark-secondary)' }}>{data.sessionsCount === 1 ? t('venuepublic.cheersOne', { n: data.sessionsCount }) : t('venuepublic.cheersMany', { n: data.sessionsCount })}</p>}
        {city && citySlug && (
          /* Link interno alla pagina citta': tiene insieme i locali della stessa zona,
             per chi naviga e per Google (che cosi' scopre tutte le schede partendo da una). */
          <Link href={`/locali/${citySlug}`} style={{ display: 'inline-block', marginTop: '10px', fontSize: '12px', color: 'var(--secondary)', fontWeight: 700 }}>
            {t('venuepublic.moreInCity', { city })}
          </Link>
        )}
        {reviewMeta.count > 0 && (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', marginTop: '8px' }}>
            <Stars value={reviewMeta.avgRating} size={14} />
            <span style={{ fontSize: '12px', color: 'var(--text-dark-secondary)' }}>{reviewMeta.avgRating} · {t('venuepublic.reviewsCount', { n: reviewMeta.count })}</span>
          </div>
        )}
      </div>

      {/* SEGUI IL LOCALE — gratis. Compare solo dopo la migrazione della comunità:
          finché `followersCount` non esiste nel payload, la funzione non c'è ancora. */}
      {data && typeof data.followersCount === 'number' && (
        <div className="card" style={{ padding: '14px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            type="button"
            onClick={toggleFollow}
            disabled={followBusy}
            className={follow.following ? 'btn btn-secondary' : 'btn btn-primary'}
            style={{ borderRadius: '20px', padding: '10px 16px', fontSize: '14px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}
          >
            <Heart size={16} fill={follow.following ? 'currentColor' : 'none'} />
            {follow.following ? t('venuepublic.following') : t('venuepublic.follow')}
          </button>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '13px', color: '#FFF', fontWeight: 700 }}>
              {t('venuepublic.followersCount', { n: follow.followers ?? data.followersCount })}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-dark-secondary)', lineHeight: 1.4 }}>
              {t('venuepublic.followDesc')}
            </div>
          </div>
        </div>
      )}

      {/* RE DELLA SETTIMANA: il motivo per tornarci martedì invece che tra un mese. */}
      {data?.weekKing?.name && (
        <div className="card" style={{ padding: '16px', border: '1px solid var(--secondary)', background: 'linear-gradient(135deg, rgba(20,20,25,1) 0%, rgba(223,255,0,0.07) 100%)', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <Crown size={26} color="var(--secondary)" style={{ flexShrink: 0 }} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: '11px', color: 'var(--secondary)', textTransform: 'uppercase', letterSpacing: '.5px', fontWeight: 700 }}>
              {t('venuepublic.weekKingTitle')}
            </div>
            <div style={{ fontSize: '16px', color: '#FFF', fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {data.weekKing.name}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-dark-secondary)' }}>
              {t('venuepublic.weekKingUnits', { n: data.weekKing.units })}
            </div>
          </div>
          <Link href="/log" className="btn btn-secondary" style={{ borderRadius: '16px', padding: '8px 12px', fontSize: '12px', fontWeight: 700, flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <Swords size={14} /> {t('venuepublic.dethrone')}
          </Link>
        </div>
      )}

      {/* Statistiche del locale */}
      {data && (data.totalDrinks > 0 || (data.board && data.board.length > 0)) && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
          <div className="card" style={{ textAlign: 'center', padding: '14px 8px' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '24px', color: 'var(--secondary)', lineHeight: 1 }}>{data.totalDrinks || 0}</div>
            <div style={{ fontSize: '10px', color: 'var(--text-dark-secondary)', textTransform: 'uppercase', marginTop: '4px' }}>{t('venuepublic.statDrinks')}</div>
          </div>
          <div className="card" style={{ textAlign: 'center', padding: '14px 8px' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '24px', color: '#FFF', lineHeight: 1 }}>{data.totalUnits || 0}</div>
            <div style={{ fontSize: '10px', color: 'var(--text-dark-secondary)', textTransform: 'uppercase', marginTop: '4px' }}>{t('venuepublic.statUnits')}</div>
          </div>
          <div className="card" style={{ textAlign: 'center', padding: '14px 8px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--primary)', lineHeight: 1.1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{data.topDrink || '—'}</div>
            <div style={{ fontSize: '10px', color: 'var(--text-dark-secondary)', textTransform: 'uppercase', marginTop: '4px' }}>{t('venuepublic.statTopDrink')}</div>
          </div>
          {/* TASSO STIMATO: media dei picchi di fine serata di chi ha bevuto qui.
              Non è "quanto sei ubriaco adesso": è quanto si arriva a bere in questo
              locale. Con il colore giusto è anche un avviso, non solo un vanto. */}
          {data.avgBac != null && (
            <div className="card" style={{ textAlign: 'center', padding: '14px 8px', gridColumn: 'span 3' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: '8px' }}>
                <span style={{ fontFamily: 'var(--font-display)', fontSize: '26px', lineHeight: 1, color: data.avgBac >= 0.5 ? 'var(--primary)' : 'var(--secondary)' }}>
                  {String(data.avgBac).replace('.', ',')}
                </span>
                <span style={{ fontSize: '12px', color: 'var(--text-dark-secondary)' }}>g/l</span>
                {data.peakBac != null && (
                  <span style={{ fontSize: '11px', color: 'var(--text-dark-secondary)' }}>
                    {t('venuepublic.peakBac', { n: String(data.peakBac).replace('.', ',') })}
                  </span>
                )}
              </div>
              <div style={{ fontSize: '10px', color: 'var(--text-dark-secondary)', textTransform: 'uppercase', marginTop: '4px' }}>{t('venuepublic.statAvgBac')}</div>
              <div style={{ fontSize: '11px', color: 'var(--text-dark-secondary)', marginTop: '6px', lineHeight: 1.4 }}>
                {data.avgBac >= 0.5 ? t('venuepublic.bacWarn') : t('venuepublic.bacNote')}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Filtro periodo */}
      <div className="seg-tabs" style={{ maxWidth: '320px', margin: '0 auto', width: '100%' }}>
        <button type="button" aria-pressed={!!(period === 'week')} className={`seg-tab ${period === 'week' ? 'active' : ''}`} onClick={() => setPeriod('week')}>{t('venuepublic.thisWeek')}</button>
        <button type="button" aria-pressed={!!(period === 'all')} className={`seg-tab ${period === 'all' ? 'active' : ''}`} onClick={() => setPeriod('all')}>{t('venuepublic.allTime')}</button>
      </div>

      {/* Classifica */}
      <div className="card" style={{ padding: '14px' }}>
        <h2 style={{ fontSize: '15px', fontWeight: 800, color: '#FFF', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Trophy size={18} style={{ color: 'var(--secondary)' }} /> {t('venuepublic.topAthletes')}
        </h2>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '24px' }}><Loader size={26} style={{ animation: 'spin 1s linear infinite', color: 'var(--primary)' }} /></div>
        ) : board.length === 0 ? (
          <p style={{ textAlign: 'center', color: 'var(--text-dark-secondary)', fontSize: '14px', padding: '18px 8px' }}>
            {period === 'week' ? t('venuepublic.emptyWeek') : t('venuepublic.emptyAll')}<br />{t('venuepublic.beFirst')}
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {board.map((r, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', borderRadius: '12px', background: i < 3 ? 'rgba(255,59,47,0.07)' : 'rgba(255,255,255,0.03)', border: `1px solid ${i < 3 ? 'rgba(255,59,47,0.25)' : 'var(--border-dark)'}` }}>
                <span style={{ fontSize: i < 3 ? '20px' : '14px', fontWeight: 800, width: '28px', textAlign: 'center', color: 'var(--text-dark-secondary)' }}>{medals[i] || i + 1}</span>
                <span style={{ flex: 1, minWidth: 0, color: '#FFF', fontWeight: 700, fontSize: '15px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
                <span style={{ textAlign: 'right' }}>
                  <span style={{ display: 'block', color: 'var(--secondary)', fontWeight: 800, fontSize: '15px' }}>{t('venuepublic.units', { n: r.units })}</span>
                  <span style={{ display: 'block', color: 'var(--text-dark-secondary)', fontSize: '11px' }}>{r.visits === 1 ? t('venuepublic.visitOne', { n: r.visits }) : t('venuepublic.visitMany', { n: r.visits })}</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* MURO DELLE FOTO — le foto delle sessioni pubbliche fatte qui.
          Stanno su R2: mostrarle non consuma egress Supabase né transfer Vercel,
          quindi è la feature "social" che costa zero e fa sembrare vivo il locale. */}
      {Array.isArray(data?.photos) && data.photos.length > 0 && (
        <div className="card" style={{ padding: '14px' }}>
          <h2 style={{ fontSize: '15px', fontWeight: 800, color: '#FFF', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Camera size={18} style={{ color: 'var(--secondary)' }} /> {t('venuepublic.photoWall')}
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
            {data.photos.map((ph, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setPhotoIdx(i)}
                style={{ padding: 0, border: 'none', background: 'none', cursor: 'pointer', aspectRatio: '1 / 1', borderRadius: '8px', overflow: 'hidden' }}
                aria-label={t('venuepublic.photoAlt', { n: i + 1 })}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={ph.thumb || ph.url}
                  alt={t('venuepublic.photoAlt', { n: i + 1 })}
                  loading="lazy"
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                />
              </button>
            ))}
          </div>
        </div>
      )}

      {photoIdx != null && Array.isArray(data?.photos) && (
        <MediaLightbox
          images={data.photos.map((ph) => ph.url)}
          startIndex={photoIdx}
          onClose={() => setPhotoIdx(null)}
        />
      )}

      {/* Recensioni */}
      <div className="card" style={{ padding: '14px' }}>
        <h2 style={{ fontSize: '15px', fontWeight: 800, color: '#FFF', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Star size={18} style={{ color: 'var(--secondary)' }} /> {t('venuepublic.reviewsTitle')}
          {reviewMeta.count > 0 && <span style={{ fontSize: '13px', color: 'var(--text-dark-secondary)', fontWeight: 500 }}>{reviewMeta.avgRating} ({reviewMeta.count})</span>}
        </h2>

        {/* Form: solo chi ha un check-in verificato qui */}
        {currentUser && canReview && (
          <div style={{ background: 'var(--bg-input-dark)', border: '1px solid var(--border-dark)', borderRadius: '10px', padding: '14px', marginBottom: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
              <span style={{ fontSize: '13px', color: 'var(--text-dark-secondary)' }}>{t('venuepublic.yourRating')}</span>
              <Stars value={newRating} size={22} onPick={setNewRating} />
            </div>
            <textarea
              className="form-control"
              placeholder={t('venuepublic.reviewPh')}
              value={newReview}
              onChange={(e) => setNewReview(e.target.value)}
              rows={2}
              style={{ fontSize: '14px', resize: 'vertical', marginBottom: '10px', width: '100%' }}
            />
            <button onClick={submitReview} disabled={submitting} className="btn btn-primary" style={{ width: '100%' }}>
              {submitting ? t('venuepublic.submitting') : t('venuepublic.submitReview')}
            </button>
          </div>
        )}
        {currentUser && !canReview && (
          <p style={{ fontSize: '12px', color: 'var(--text-dark-secondary)', marginBottom: '14px', background: 'rgba(255,255,255,0.02)', border: '1px dashed var(--border-dark)', borderRadius: '10px', padding: '10px' }}>
            {t('venuepublic.reviewGate')}
          </p>
        )}

        {reviews.length === 0 ? (
          <p style={{ textAlign: 'center', color: 'var(--text-dark-secondary)', fontSize: '13px', padding: '14px 8px' }}>{t('venuepublic.emptyReviews')}</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {reviews.map((r, i) => (
              <div key={i} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-dark)', borderRadius: '8px', padding: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: r.text ? '6px' : 0 }}>
                  <strong style={{ fontSize: '13px', color: '#FFF' }}>{r.name}</strong>
                  <Stars value={r.rating} size={13} />
                </div>
                {r.text && <p style={{ fontSize: '13px', color: 'var(--text-dark-secondary)' }}>{r.text}</p>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* CTA iscrizione */}
      <div className="card" style={{ textAlign: 'center', padding: '24px 20px', border: '1px solid var(--primary)' }}>
        <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#FFF', marginBottom: '8px' }}>{t('venuepublic.climbLeaderboard', { venue: venueName })}</h3>
        <p style={{ fontSize: '13px', color: 'var(--text-dark-secondary)', marginBottom: '16px', lineHeight: 1.45 }}>
          {t('venuepublic.ctaDescPre')}<strong>{t('venuepublic.ctaDescStrong')}</strong>{t('venuepublic.ctaDescPost')}
        </p>
        <Link href="/auth" className="btn btn-primary" style={{ width: '100%', padding: '14px', borderRadius: '30px', fontSize: '16px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
          <Beer size={18} /> {t('venuepublic.joinFree')}
        </Link>
      </div>

      {/* QR per il locale */}
      {qr && (
        <div className="card" style={{ textAlign: 'center', padding: '20px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 800, color: '#FFF', marginBottom: '4px' }}>{t('venuepublic.qrTitle')}</h3>
          <p style={{ fontSize: '12px', color: 'var(--text-dark-secondary)', marginBottom: '14px' }}>{t('venuepublic.qrDesc')}</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt={t('venuepublic.qrAlt')} style={{ width: '180px', height: '180px', borderRadius: '12px', background: '#fff', padding: '8px' }} />
          <div style={{ display: 'flex', gap: '10px', marginTop: '14px' }}>
            <button onClick={downloadQr} className="btn btn-secondary" style={{ flex: 1, borderRadius: '16px', padding: '10px', fontSize: '14px' }}><Download size={16} /> {t('venuepublic.downloadQr')}</button>
            <button onClick={share} className="btn btn-secondary" style={{ flex: 1, borderRadius: '16px', padding: '10px', fontSize: '14px' }}><Share2 size={16} /> {t('venuepublic.shareBtn')}</button>
          </div>
        </div>
      )}

      {isManager ? (
        <Link href={`/locale/${encodeURIComponent(placeKey)}/gestione`} style={{ textAlign: 'center', fontSize: '12px', color: 'var(--secondary)', fontWeight: 600 }}>
          {t('venuepublic.managerArea')}
        </Link>
      ) : (
        /* CTA business: invoglia il gestore a portare il locale su Strabar (stat avanzate a pagamento) */
        <Link href="/business" className="card" style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '16px', border: '1px solid var(--border-dark)', textAlign: 'left', textDecoration: 'none' }}>
          <div style={{ width: 40, height: 40, borderRadius: '10px', background: 'rgba(223,255,0,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <BarChart3 size={20} color="var(--secondary)" />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '14px', fontWeight: 800, color: '#FFF' }}>{t('venuepublic.ownerCtaTitle')}</div>
            <div style={{ fontSize: '12px', color: 'var(--text-dark-secondary)' }}>{t('venuepublic.ownerCtaDesc')}</div>
          </div>
        </Link>
      )}

      <p style={{ textAlign: 'center', fontSize: '11px', color: 'var(--text-dark-secondary)', marginBottom: '20px' }}>
        {t('venuepublic.drinkResponsibly')}
      </p>
    </div>
  );
}
