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
          /* Stampa SOLO la locandina: nascondi tutto il resto (navbar in alto, barra mobile
             in basso, footer — vivono nel layout, fuori da questa pagina) e porta l'A4 in
             cima. La sola display:none su .noprint non bastava: la chrome dell'app restava. */
          html, body { background: #fff !important; }
          body * { visibility: hidden !important; }
          .a4, .a4 * { visibility: visible !important; }
          .a4 { position: absolute !important; left: 0 !important; top: 0 !important; margin: 0 !important; box-shadow: none !important; }
          .noprint { display: none !important; }
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
          boxShadow: '0 8px 40px rgba(0,0,0,0.4)', display: 'flex', flexDirection: 'column', boxSizing: 'border-box', overflow: 'hidden',
        }}
      >
        {/* HEADER brand: fondo scuro (così il logo bianco si vede) + cos'è Strabar */}
        <div style={{ background: '#0A0A0D', color: '#fff', padding: '16mm 16mm 12mm', textAlign: 'center', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
          {logoOk ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src="/logo.png" alt="Strabar" style={{ height: '64px', width: 'auto', margin: '0 auto', display: 'block' }} onError={() => setLogoOk(false)} />
          ) : (
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '64px', lineHeight: 1, letterSpacing: '1px' }}>stra<span style={{ color: '#FF3B2F' }}>bar</span></div>
          )}
          <div style={{ fontSize: '15px', fontWeight: 700, letterSpacing: '.2em', textTransform: 'uppercase', color: '#DFFF00', marginTop: '8mm' }}>
            Il social degli atleti da bar
          </div>
          <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.75)', maxWidth: '150mm', margin: '4mm auto 0', lineHeight: 1.5 }}>
            Traccia le tue bevute, sfida gli amici e conquista la classifica dei locali. 🍻
          </p>
        </div>
        {/* Striscia d'accento */}
        <div style={{ height: '7px', background: 'linear-gradient(90deg, #FF3B2F 0%, #FF3B2F 55%, #DFFF00 100%)', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }} />

        {/* CORPO */}
        <div style={{ flex: 1, padding: '12mm 16mm 14mm', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
          <div style={{ display: 'inline-block', background: 'rgba(255,59,47,0.10)', color: '#FF3B2F', border: '1.5px solid #FF3B2F', borderRadius: '999px', padding: '6px 18px', fontSize: '14px', fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
            🍻 Sei da noi? Registralo!
          </div>

          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '58px', lineHeight: 1.02, margin: '5mm 0 3mm', letterSpacing: '.5px' }}>{name}</h1>
          <p style={{ fontSize: '17px', color: '#333', maxWidth: '150mm', margin: '0 0 8mm', lineHeight: 1.55 }}>
            Inquadra il QR: parte in un attimo una sessione <strong>in questo locale</strong> e
            <strong> scali subito la sua classifica</strong>. Niente attese.
          </p>

          {/* QR */}
          <div style={{ background: '#fff', border: '4px solid #0A0A0D', borderRadius: '20px', padding: '12px', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
            {qr ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qr} alt="QR Strabar" style={{ width: '80mm', height: '80mm', display: 'block' }} />
            ) : (
              <div style={{ width: '80mm', height: '80mm', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999' }}>
                <Loader size={40} style={{ animation: 'spin 1s linear infinite' }} />
              </div>
            )}
          </div>
          <div style={{ fontSize: '16px', fontWeight: 700, color: '#0A0A0D', margin: '5mm 0 9mm' }}>
            📷 Inquadra con la fotocamera del telefono
          </div>

          {/* Come funziona: 3 passi */}
          <div style={{ display: 'flex', gap: '6mm', justifyContent: 'center', width: '100%' }}>
            {[
              { n: '1', t: 'Inquadra il QR', d: 'Con la fotocamera' },
              { n: '2', t: 'Parte la sessione', d: 'In questo locale' },
              { n: '3', t: 'Aggiungi i drink', d: 'E sali in classifica 🏆' },
            ].map((s) => (
              <div key={s.n} style={{ flex: 1, maxWidth: '52mm', background: '#F6F6F7', borderRadius: '14px', padding: '14px 10px' }}>
                <div style={{ width: '38px', height: '38px', borderRadius: '50%', background: '#FF3B2F', color: '#fff', fontFamily: 'var(--font-display)', fontSize: '22px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 8px', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>{s.n}</div>
                <div style={{ fontSize: '14px', fontWeight: 800 }}>{s.t}</div>
                <div style={{ fontSize: '12px', color: '#666', marginTop: '2px' }}>{s.d}</div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 'auto', paddingTop: '10mm', width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontSize: '12px', color: '#999' }}>Bevi responsabilmente · 18+</span>
            <strong style={{ fontFamily: 'var(--font-display)', fontSize: '24px', color: '#0A0A0D', letterSpacing: '.5px' }}>strabar.app</strong>
          </div>
        </div>
      </div>
    </div>
  );
}
