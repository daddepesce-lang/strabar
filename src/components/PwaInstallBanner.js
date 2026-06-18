'use client';

import { useEffect, useState } from 'react';
import { Beer, X, Share, Plus, Download } from 'lucide-react';

// Rileva se l'app è già installata / in modalità standalone
function isStandalone() {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  );
}

function isIos() {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
}

const DISMISS_KEY = 'pwa_banner_dismissed_at';
const DISMISS_DAYS = 7;

export default function PwaInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [visible, setVisible] = useState(false);
  const [showIosHelp, setShowIosHelp] = useState(false);
  const ios = isIos();

  useEffect(() => {
    if (isStandalone()) return; // già installata

    // Rispetta una chiusura recente
    try {
      const dismissedAt = Number(localStorage.getItem(DISMISS_KEY) || 0);
      if (dismissedAt && Date.now() - dismissedAt < DISMISS_DAYS * 86400000) return;
    } catch {
      /* noop */
    }

    // Android / Chrome / Edge: intercetta il prompt nativo
    const onBeforeInstall = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setVisible(true);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);

    // iOS Safari non espone beforeinstallprompt: mostriamo le istruzioni
    if (ios) setVisible(true);

    const onInstalled = () => setVisible(false);
    window.addEventListener('appinstalled', onInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, [ios]);

  const dismiss = () => {
    setVisible(false);
    setShowIosHelp(false);
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      /* noop */
    }
  };

  const handleInstall = async () => {
    if (ios) {
      setShowIosHelp(true);
      return;
    }
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    try {
      await deferredPrompt.userChoice;
    } catch {
      /* noop */
    }
    setDeferredPrompt(null);
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <>
      <div
        style={{
          position: 'fixed',
          left: '12px',
          right: '12px',
          bottom: 'calc(74px + env(safe-area-inset-bottom, 0px))',
          zIndex: 1200,
          background: 'rgba(22,24,34,0.98)',
          border: '1px solid var(--primary)',
          borderRadius: '14px',
          boxShadow: '0 8px 30px rgba(0,0,0,0.5), 0 0 18px rgba(255, 32, 0,0.25)',
          padding: '12px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          maxWidth: '520px',
          margin: '0 auto',
        }}
      >
        <div style={{ background: 'rgba(255, 32, 0,0.12)', color: 'var(--primary)', width: 42, height: 42, borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Beer size={22} fill="var(--primary)" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <strong style={{ fontSize: '14px', color: '#FFF', display: 'block' }}>Installa Strabar</strong>
          <span style={{ fontSize: '12px', color: 'var(--text-dark-secondary)' }}>
            {ios ? 'Aggiungila alla Home in 2 tap' : 'Aprila come una vera app, anche offline'}
          </span>
        </div>
        <button
          onClick={handleInstall}
          className="btn btn-primary"
          style={{ borderRadius: '20px', padding: '8px 14px', fontSize: '13px', fontWeight: 700, flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: '5px' }}
        >
          <Download size={15} /> Installa
        </button>
        <button onClick={dismiss} aria-label="Chiudi" style={{ color: 'var(--text-dark-secondary)', cursor: 'pointer', flexShrink: 0, padding: '4px' }}>
          <X size={18} />
        </button>
      </div>

      {/* Istruzioni iOS */}
      {showIosHelp && (
        <div
          onClick={dismiss}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 1300, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: '0' }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="card"
            style={{ width: '100%', maxWidth: '480px', borderRadius: '18px 18px 0 0', border: '1px solid var(--border-dark)', padding: '24px', paddingBottom: 'calc(24px + env(safe-area-inset-bottom, 0px))' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 800 }}>Installa su iPhone 🍺</h3>
              <button onClick={dismiss} aria-label="Chiudi" style={{ color: 'var(--text-dark-secondary)', cursor: 'pointer' }}><X size={20} /></button>
            </div>
            <ol style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '14px', padding: 0 }}>
              <li style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ background: 'var(--bg-input-dark)', borderRadius: '10px', width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Share size={18} color="var(--primary)" /></span>
                <span style={{ fontSize: '14px' }}>Tocca l&apos;icona <strong>Condividi</strong> nella barra di Safari.</span>
              </li>
              <li style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ background: 'var(--bg-input-dark)', borderRadius: '10px', width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Plus size={18} color="var(--primary)" /></span>
                <span style={{ fontSize: '14px' }}>Scegli <strong>&quot;Aggiungi alla schermata Home&quot;</strong>.</span>
              </li>
              <li style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ background: 'var(--bg-input-dark)', borderRadius: '10px', width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '18px' }}>🍻</span>
                <span style={{ fontSize: '14px' }}>Conferma con <strong>Aggiungi</strong>: Strabar è sulla tua Home!</span>
              </li>
            </ol>
          </div>
        </div>
      )}
    </>
  );
}
