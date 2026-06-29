'use client';

import { useI18n, LOCALES } from '@/lib/i18n';

// Selettore lingua compatto a segmenti. Usato nel menu "Altro" e nelle impostazioni.
// Nessuna richiesta di rete: cambia solo la preferenza locale (localStorage).
export default function LanguageSwitcher({ compact = false }) {
  const { locale, setLocale, t } = useI18n();
  const codes = Object.keys(LOCALES);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', width: '100%' }}>
      {!compact && (
        <span style={{ fontSize: '11px', color: 'var(--text-dark-secondary)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '.4px' }}>{t('lang.label')}</span>
      )}
      <div style={{ display: 'inline-flex', gap: '4px', background: 'var(--bg-input-dark)', border: '1px solid var(--border-dark)', borderRadius: '10px', padding: '3px' }}>
        {codes.map((code) => {
          const active = locale === code;
          return (
            <button
              key={code}
              type="button"
              onClick={() => setLocale(code)}
              aria-pressed={active}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px',
                fontSize: '13px', fontWeight: 700, padding: '6px 12px', borderRadius: '8px',
                border: 'none', cursor: 'pointer',
                background: active ? 'var(--primary)' : 'transparent',
                color: active ? '#fff' : 'var(--text-dark-secondary)',
              }}
            >
              <span style={{ fontSize: '14px', lineHeight: 1 }}>{LOCALES[code].flag}</span>
              {LOCALES[code].label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
