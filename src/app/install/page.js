'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Download, Share, Plus, Check, Wifi, Bell, ShieldCheck } from 'lucide-react';
import ShareAppButton from '@/components/ShareAppButton';

function isStandalone() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}
function isIos() {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
}

export default function InstallPage() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [installed, setInstalled] = useState(false);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    setIos(isIos());
    setInstalled(isStandalone());
    const onBeforeInstall = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    try {
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') setInstalled(true);
    } catch {
      /* noop */
    }
    setDeferredPrompt(null);
  };

  return (
    <div style={{ maxWidth: '560px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px', textAlign: 'center' }}>
      <div>
        {/* Icona reale dell'app (la stessa che finisce sulla Home una volta installata) */}
        <img
          src="/icon-512.png"
          alt="Strabar"
          width={96}
          height={96}
          style={{ borderRadius: '22px', marginBottom: '16px', boxShadow: '0 10px 28px rgba(255, 32, 0,0.28)' }}
        />
        <h1 style={{ fontSize: '30px', fontWeight: 900 }}>Installa Strabar 🍻</h1>
        <p style={{ color: 'var(--text-dark-secondary)', fontSize: '15px', marginTop: '8px', lineHeight: 1.5 }}>
          Aggiungi Strabar alla schermata Home: si apre come una vera app, a schermo intero, con notifiche e supporto offline.
        </p>
      </div>

      {/* Vantaggi */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '14px', textAlign: 'left' }}>
        {[
          { icon: Download, t: 'Accesso immediato', d: 'Icona sulla Home, niente barra del browser.' },
          { icon: Bell, t: 'Notifiche', d: 'Ricevi Cheers, commenti e inviti in tempo reale.' },
          { icon: Wifi, t: 'Funziona offline', d: 'Le pagine viste restano disponibili senza rete.' },
        ].map(({ icon: Icon, t, d }, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ background: 'rgba(255, 32, 0,0.1)', color: 'var(--primary)', width: 40, height: 40, borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon size={20} />
            </span>
            <div>
              <strong style={{ fontSize: '14px', display: 'block' }}>{t}</strong>
              <span style={{ fontSize: '13px', color: 'var(--text-dark-secondary)' }}>{d}</span>
            </div>
          </div>
        ))}
      </div>

      {installed ? (
        <div className="card" style={{ border: '1px solid var(--success)', background: 'rgba(16,185,129,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', color: '#6EE7B7', fontWeight: 700 }}>
          <Check size={20} /> Strabar è già installata su questo dispositivo!
        </div>
      ) : ios ? (
        <div className="card" style={{ textAlign: 'left' }}>
          <h3 style={{ fontSize: '17px', fontWeight: 800, marginBottom: '14px' }}>Su iPhone / iPad (Safari)</h3>
          <ol style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '14px', padding: 0 }}>
            <li style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ background: 'var(--bg-input-dark)', borderRadius: '10px', width: 38, height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Share size={18} color="var(--primary)" /></span>
              <span style={{ fontSize: '14px' }}>Tocca <strong>Condividi</strong> nella barra di Safari.</span>
            </li>
            <li style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ background: 'var(--bg-input-dark)', borderRadius: '10px', width: 38, height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Plus size={18} color="var(--primary)" /></span>
              <span style={{ fontSize: '14px' }}>Scegli <strong>&quot;Aggiungi alla schermata Home&quot;</strong> e conferma.</span>
            </li>
          </ol>
          <p style={{ fontSize: '12px', color: 'var(--text-dark-secondary)', marginTop: '14px' }}>
            Su iPhone l&apos;installazione automatica non è consentita da Apple: bastano questi 2 tap.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <button
            onClick={handleInstall}
            disabled={!deferredPrompt}
            className="btn btn-primary"
            style={{ padding: '16px', borderRadius: '30px', fontSize: '17px', fontWeight: 800, opacity: deferredPrompt ? 1 : 0.6 }}
          >
            <Download size={20} /> {deferredPrompt ? 'Installa adesso (1 tap)' : 'Preparazione…'}
          </button>
          {!deferredPrompt && (
            <p style={{ fontSize: '13px', color: 'var(--text-dark-secondary)', lineHeight: 1.5 }}>
              Se il pulsante resta in attesa, apri il menu <strong>⋮</strong> del browser e scegli <strong>&quot;Installa app&quot;</strong> / <strong>&quot;Aggiungi a schermata Home&quot;</strong>.
            </p>
          )}

          {/* Avviso Play Protect: capita con alcuni browser, l'app è sicura. Spieghiamo come superarlo. */}
          <div className="card" style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', textAlign: 'left', background: 'rgba(255,255,255,0.03)', padding: '12px 14px' }}>
            <span style={{ color: 'var(--secondary)', flexShrink: 0, marginTop: '1px' }}><ShieldCheck size={18} /></span>
            <p style={{ fontSize: '12px', color: 'var(--text-dark-secondary)', margin: 0, lineHeight: 1.5 }}>
              Se compare <strong>&quot;App non sicura bloccata&quot;</strong> di Google Play Protect, niente paura: controlla solo l&apos;<em>involucro</em> di installazione, non Strabar. Tocca <strong>&quot;Altri dettagli&quot; → &quot;Installa comunque&quot;</strong>. Per non vederlo affatto, installa da <strong>Google Chrome</strong>.
            </p>
          </div>
        </div>
      )}

      <div style={{ borderTop: '1px solid var(--border-dark)', paddingTop: '18px' }}>
        <p style={{ fontSize: '13px', color: 'var(--text-dark-secondary)', marginBottom: '10px' }}>
          Conosci qualcuno a cui piacerebbe? Mandagli il link! 🍻
        </p>
        <ShareAppButton style={{ width: '100%', borderRadius: '24px', padding: '12px' }} label="Condividi Strabar" className="btn btn-secondary" />
      </div>

      <Link href="/" style={{ color: 'var(--text-dark-secondary)', fontSize: '14px', marginTop: '4px' }}>
        ← Torna a Strabar
      </Link>
    </div>
  );
}
