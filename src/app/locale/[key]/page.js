'use client';

import { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { db } from '@/lib/db';
import QRCode from 'qrcode';
import { Trophy, Beer, Share2, Download, MapPin, Loader, ArrowLeft } from 'lucide-react';

// Pagina PUBBLICA della classifica di un locale (niente login). Pensata per il QR che i
// bar espongono: chi scansiona vede la classifica e un invito a unirsi a Strabar.
// I dati arrivano da /api/venue/[key] (aggregato in SQL e messo in cache sul CDN), così
// le scansioni ripetute non aumentano l'egress.
export default function VenuePublicPage({ params }) {
  const { key } = use(params);
  const placeKey = decodeURIComponent(key || '');

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('all'); // 'week' | 'all'
  const [qr, setQr] = useState(null);
  const [pageUrl, setPageUrl] = useState('');
  const [isManager, setIsManager] = useState(false); // gestore approvato di QUESTO locale

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
    let cancelled = false;
    setLoading(true);
    fetch(`/api/venue/${encodeURIComponent(placeKey)}?period=${period}`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setData(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [placeKey, period]);

  const venueName = data?.name || placeKey;
  const board = data?.board || [];

  const share = async () => {
    const text = `🏆 Classifica di ${venueName} su Strabar`;
    try {
      if (navigator.share) { await navigator.share({ title: 'Strabar 🍻', text, url: pageUrl }); return; }
    } catch { return; }
    try { await navigator.clipboard.writeText(`${text} ${pageUrl}`); alert('Link copiato!'); } catch { /* noop */ }
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
          <MapPin size={14} style={{ verticalAlign: '-2px' }} /> Classifica del locale
        </div>
        <h1 style={{ fontSize: '26px', fontWeight: 900, color: '#FFF', lineHeight: 1.1, marginBottom: '8px' }}>{venueName}</h1>
        {data && <p style={{ fontSize: '13px', color: 'var(--text-dark-secondary)' }}>{data.sessionsCount} {data.sessionsCount === 1 ? 'brindisi registrato' : 'brindisi registrati'} 🍻</p>}
      </div>

      {/* Filtro periodo */}
      <div className="seg-tabs" style={{ maxWidth: '320px', margin: '0 auto', width: '100%' }}>
        <div className={`seg-tab ${period === 'week' ? 'active' : ''}`} onClick={() => setPeriod('week')}>Questa settimana</div>
        <div className={`seg-tab ${period === 'all' ? 'active' : ''}`} onClick={() => setPeriod('all')}>Sempre</div>
      </div>

      {/* Classifica */}
      <div className="card" style={{ padding: '14px' }}>
        <h2 style={{ fontSize: '15px', fontWeight: 800, color: '#FFF', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Trophy size={18} style={{ color: 'var(--secondary)' }} /> Top atleti
        </h2>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '24px' }}><Loader size={26} style={{ animation: 'spin 1s linear infinite', color: 'var(--primary)' }} /></div>
        ) : board.length === 0 ? (
          <p style={{ textAlign: 'center', color: 'var(--text-dark-secondary)', fontSize: '14px', padding: '18px 8px' }}>
            Ancora nessuna sessione verificata qui{period === 'week' ? ' questa settimana' : ''}.<br />Sii il primo a comparire! 🍻
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {board.map((r, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', borderRadius: '12px', background: i < 3 ? 'rgba(255,59,47,0.07)' : 'rgba(255,255,255,0.03)', border: `1px solid ${i < 3 ? 'rgba(255,59,47,0.25)' : 'var(--border-dark)'}` }}>
                <span style={{ fontSize: i < 3 ? '20px' : '14px', fontWeight: 800, width: '28px', textAlign: 'center', color: 'var(--text-dark-secondary)' }}>{medals[i] || i + 1}</span>
                <span style={{ flex: 1, minWidth: 0, color: '#FFF', fontWeight: 700, fontSize: '15px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
                <span style={{ textAlign: 'right' }}>
                  <span style={{ display: 'block', color: 'var(--secondary)', fontWeight: 800, fontSize: '15px' }}>{r.units} U.A.</span>
                  <span style={{ display: 'block', color: 'var(--text-dark-secondary)', fontSize: '11px' }}>{r.visits} {r.visits === 1 ? 'visita' : 'visite'}</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* CTA iscrizione */}
      <div className="card" style={{ textAlign: 'center', padding: '24px 20px', border: '1px solid var(--primary)' }}>
        <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#FFF', marginBottom: '8px' }}>🍻 Scala la classifica di {venueName}!</h3>
        <p style={{ fontSize: '13px', color: 'var(--text-dark-secondary)', marginBottom: '16px', lineHeight: 1.45 }}>
          Registra i tuoi brindisi, calcola il tasso alcolico, sfida gli amici e conquista il titolo di <strong>leggenda del locale</strong>.
        </p>
        <Link href="/auth" className="btn btn-primary" style={{ width: '100%', padding: '14px', borderRadius: '30px', fontSize: '16px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
          <Beer size={18} /> Entra su Strabar — è gratis
        </Link>
      </div>

      {/* QR per il locale */}
      {qr && (
        <div className="card" style={{ textAlign: 'center', padding: '20px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 800, color: '#FFF', marginBottom: '4px' }}>📱 QR di questo locale</h3>
          <p style={{ fontSize: '12px', color: 'var(--text-dark-secondary)', marginBottom: '14px' }}>Stampalo ed esponilo: i clienti scansionano e vedono la classifica.</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt="QR del locale" style={{ width: '180px', height: '180px', borderRadius: '12px', background: '#fff', padding: '8px' }} />
          <div style={{ display: 'flex', gap: '10px', marginTop: '14px' }}>
            <button onClick={downloadQr} className="btn btn-secondary" style={{ flex: 1, borderRadius: '16px', padding: '10px', fontSize: '14px' }}><Download size={16} /> Scarica QR</button>
            <button onClick={share} className="btn btn-secondary" style={{ flex: 1, borderRadius: '16px', padding: '10px', fontSize: '14px' }}><Share2 size={16} /> Condividi</button>
          </div>
        </div>
      )}

      {isManager && (
        <Link href={`/locale/${encodeURIComponent(placeKey)}/gestione`} style={{ textAlign: 'center', fontSize: '12px', color: 'var(--secondary)', fontWeight: 600 }}>
          🔧 Area gestione del locale →
        </Link>
      )}

      <p style={{ textAlign: 'center', fontSize: '11px', color: 'var(--text-dark-secondary)', marginBottom: '20px' }}>
        Bevi responsabilmente. Strabar è un gioco sociale, non incoraggia l&apos;abuso di alcol.
      </p>
    </div>
  );
}
