'use client';

import { useEffect, useState, use } from 'react';
import Link from 'next/link';
import QRCode from 'qrcode';
import { ArrowLeft, Printer, Loader } from 'lucide-react';

// LOCANDINA A4 stampabile per il locale: QR che avvia una registrazione VELOCISSIMA della
// bevuta direttamente in questo locale (scansione = prova di presenza, niente GPS).
// Il manager la apre dall'area gestione e la stampa / salva come PDF (Stampa → Salva PDF).
export default function VenuePosterPage({ params }) {
  const { key } = use(params);
  const placeKey = decodeURIComponent(key || '');

  const [name, setName] = useState(placeKey);
  const [qr, setQr] = useState(null);
  const [loading, setLoading] = useState(true);
  const [logoOk, setLogoOk] = useState(true);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let cancelled = false;
    (async () => {
      let vName = placeKey;
      let lat = null;
      let lng = null;
      try {
        const d = await fetch(`/api/venue/${encodeURIComponent(placeKey)}?period=all`).then((r) => r.json());
        if (d?.name) vName = d.name;
        if (d?.lat != null) lat = d.lat;
        if (d?.lng != null) lng = d.lng;
      } catch { /* usa i valori di default */ }
      if (cancelled) return;
      setName(vName);
      // URL del QR: avvio VERIFICATO immediato in questo locale (src=qr).
      const origin = window.location.origin;
      const parts = [`src=qr`, `venue=${encodeURIComponent(vName)}`];
      if (lat != null && lng != null) { parts.push(`lat=${lat}`, `lng=${lng}`); }
      const url = `${origin}/log?${parts.join('&')}`;
      try {
        const dataUrl = await QRCode.toDataURL(url, { margin: 1, width: 900, errorCorrectionLevel: 'M', color: { dark: '#0A0A0D', light: '#FFFFFF' } });
        if (!cancelled) setQr(dataUrl);
      } catch { /* noop */ }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [placeKey]);

  return (
    <div style={{ background: '#4b4b52', minHeight: '100vh', padding: '20px 0' }}>
      {/* Stampa: nascondi tutto tranne .a4, imposta pagina A4 senza margini */}
      <style>{`
        @page { size: A4 portrait; margin: 0; }
        @media print {
          body { background: #fff !important; }
          .noprint { display: none !important; }
          .a4 { box-shadow: none !important; margin: 0 !important; }
        }
      `}</style>

      {/* Barra azioni (non stampata) */}
      <div className="noprint" style={{ maxWidth: '210mm', margin: '0 auto 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', padding: '0 12px' }}>
        <Link href={`/locale/${encodeURIComponent(placeKey)}/gestione`} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#fff', fontSize: '14px', fontWeight: 600 }}>
          <ArrowLeft size={16} /> Torna alla gestione
        </Link>
        <button
          type="button"
          onClick={() => window.print()}
          disabled={loading}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: '#FF3B2F', color: '#fff', border: 'none', borderRadius: '10px', padding: '10px 18px', fontSize: '14px', fontWeight: 700, cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.6 : 1 }}
        >
          <Printer size={16} /> Stampa / Salva PDF
        </button>
      </div>

      {/* FOGLIO A4 */}
      <div
        className="a4"
        style={{
          width: '210mm', minHeight: '297mm', background: '#FFFFFF', color: '#0A0A0D', margin: '0 auto',
          boxShadow: '0 8px 40px rgba(0,0,0,0.4)', padding: '18mm 16mm', display: 'flex', flexDirection: 'column',
          alignItems: 'center', textAlign: 'center', boxSizing: 'border-box',
        }}
      >
        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6mm' }}>
          {logoOk ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src="/logo.png" alt="Strabar" style={{ height: '52px', width: 'auto' }} onError={() => setLogoOk(false)} />
          ) : (
            <span style={{ fontSize: '40px', fontWeight: 900, letterSpacing: '.5px' }}>stra<span style={{ color: '#FF3B2F' }}>bar</span></span>
          )}
        </div>

        <div style={{ fontSize: '15px', fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', color: '#FF3B2F', marginBottom: '4mm' }}>
          🍻 Registra la tua bevuta qui
        </div>

        <h1 style={{ fontSize: '46px', fontWeight: 900, lineHeight: 1.05, margin: '0 0 3mm' }}>{name}</h1>
        <p style={{ fontSize: '17px', color: '#444', maxWidth: '150mm', margin: '0 0 8mm', lineHeight: 1.5 }}>
          Inquadra il QR con la fotocamera: parte una registrazione <strong>velocissima</strong> della tua
          sessione <strong>in questo locale</strong>. Niente GPS, niente attese — e scali subito la classifica del bar!
        </p>

        {/* QR */}
        <div style={{ background: '#fff', border: '3px solid #0A0A0D', borderRadius: '18px', padding: '10px', marginBottom: '9mm' }}>
          {qr ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qr} alt="QR Strabar" style={{ width: '78mm', height: '78mm', display: 'block' }} />
          ) : (
            <div style={{ width: '78mm', height: '78mm', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999' }}>
              <Loader size={40} className="spin" />
            </div>
          )}
        </div>

        {/* Come funziona: 3 passi */}
        <div style={{ display: 'flex', gap: '8mm', justifyContent: 'center', marginBottom: '9mm', flexWrap: 'wrap' }}>
          {[
            { n: '1', t: 'Inquadra il QR', d: 'Con la fotocamera del telefono' },
            { n: '2', t: 'Parte la sessione', d: 'Registrata in questo locale' },
            { n: '3', t: 'Aggiungi i drink', d: 'E sali in classifica 🏆' },
          ].map((s) => (
            <div key={s.n} style={{ width: '48mm' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#FF3B2F', color: '#fff', fontSize: '20px', fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 8px' }}>{s.n}</div>
              <div style={{ fontSize: '15px', fontWeight: 800 }}>{s.t}</div>
              <div style={{ fontSize: '13px', color: '#666', marginTop: '2px' }}>{s.d}</div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 'auto', paddingTop: '6mm', borderTop: '2px solid #eee', width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px', color: '#888' }}>
          <span>Il Social Network degli Atleti da Bar</span>
          <strong style={{ color: '#0A0A0D' }}>strabar.app</strong>
        </div>
        <div style={{ fontSize: '11px', color: '#aaa', marginTop: '3mm' }}>
          Bevi responsabilmente · Vietato ai minori di 18 anni
        </div>
      </div>
    </div>
  );
}
