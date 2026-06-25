'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';

// Domini "legacy": chi arriva da qui (o viene rediretto dal middleware con ?legacy=1)
// va avvisato che l'app si è spostata su strabar.app e conviene reinstallarla, perché
// una PWA installata sul vecchio dominio non riceve i link/aggiornamenti del nuovo.
const LEGACY_HOSTS = new Set(['strabar-delta.vercel.app']);
const DISMISS_KEY = 'legacy_migration_dismissed';

export default function LegacyMigrationBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      if (localStorage.getItem(DISMISS_KEY) === '1') return;
    } catch { /* noop */ }
    const fromLegacyParam = new URLSearchParams(window.location.search).get('legacy') === '1';
    const onLegacyHost = LEGACY_HOSTS.has(window.location.hostname);
    if (fromLegacyParam || onLegacyHost) setVisible(true);
  }, []);

  const dismiss = () => {
    setVisible(false);
    try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* noop */ }
  };

  if (!visible) return null;

  return (
    <div
      style={{
        position: 'fixed',
        left: '12px',
        right: '12px',
        top: 'calc(12px + env(safe-area-inset-top, 0px))',
        zIndex: 1300,
        background: 'rgba(22,24,34,0.98)',
        border: '1px solid var(--primary)',
        borderRadius: '14px',
        boxShadow: '0 8px 30px rgba(0,0,0,0.5), 0 0 18px rgba(255, 32, 0,0.25)',
        padding: '12px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        maxWidth: '560px',
        margin: '0 auto',
      }}
    >
      <div style={{ background: 'rgba(255, 32, 0,0.12)', width: 42, height: 42, borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 22 }}>
        📦
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <strong style={{ fontSize: '14px', color: '#FFF', display: 'block' }}>Strabar si è spostata su strabar.app</strong>
        <span style={{ fontSize: '12px', color: 'var(--text-dark-secondary)' }}>
          Se avevi l&apos;app installata col vecchio indirizzo, rimuovila e <strong>reinstallala da qui</strong> per riceverne i link e gli aggiornamenti.
        </span>
      </div>
      <button onClick={dismiss} aria-label="Chiudi" style={{ color: 'var(--text-dark-secondary)', cursor: 'pointer', flexShrink: 0, padding: '4px' }}>
        <X size={18} />
      </button>
    </div>
  );
}
