'use client';

import { useEffect, useState } from 'react';
import { X, Download } from 'lucide-react';
import { useT } from '@/lib/i18n';

// Link assoluto al nuovo dominio: se il banner compare ancora sul vecchio host,
// un link relativo resterebbe lì. Forziamo strabar.app.
const INSTALL_URL = `${process.env.NEXT_PUBLIC_SITE_URL || 'https://strabar.app'}/install`;

// Domini "legacy": chi arriva da qui (o viene rediretto dal middleware con ?legacy=1)
// va avvisato che l'app si è spostata su strabar.app e conviene reinstallarla, perché
// una PWA installata sul vecchio dominio non riceve i link/aggiornamenti del nuovo.
const LEGACY_HOSTS = new Set(['strabar-delta.vercel.app']);
const DISMISS_KEY = 'legacy_migration_dismissed';

export default function LegacyMigrationBanner() {
  const t = useT();
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
        boxShadow: '0 8px 30px rgba(0,0,0,0.5), 0 0 18px rgba(255, 59, 47,0.25)',
        padding: '12px 14px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        maxWidth: '560px',
        margin: '0 auto',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
        <div style={{ background: 'rgba(255, 59, 47,0.12)', width: 42, height: 42, borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 22 }}>
          📦
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <strong style={{ fontSize: '14px', color: '#FFF', display: 'block', marginBottom: 2 }}>{t('legacybanner.title')}</strong>
          <span style={{ fontSize: '12px', color: 'var(--text-dark-secondary)', lineHeight: 1.45 }}>
            {t('legacybanner.bodyPre')} <strong>strabar.app</strong>{t('legacybanner.bodyMid')} <strong>{t('legacybanner.notificationsWord')}</strong> {t('legacybanner.bodyPost')}
          </span>
        </div>
        <button onClick={dismiss} aria-label={t('legacybanner.close')} style={{ color: 'var(--text-dark-secondary)', cursor: 'pointer', flexShrink: 0, padding: '4px', background: 'none', border: 'none' }}>
          <X size={18} />
        </button>
      </div>
      <a
        href={INSTALL_URL}
        className="btn btn-primary"
        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px', width: '100%', padding: '11px', borderRadius: '24px', fontWeight: 700, fontSize: '14px', textDecoration: 'none' }}
      >
        <Download size={16} /> {t('legacybanner.reinstall')}
      </a>
    </div>
  );
}
