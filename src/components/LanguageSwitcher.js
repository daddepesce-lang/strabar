'use client';

import { useI18n, LOCALES } from '@/lib/i18n';
import { db } from '@/lib/db';

// Selettore lingua a TENDINA (native select): compatto e affidabile su PWA e desktop
// anche con molte lingue. Cambia la preferenza locale (localStorage) e, se sei loggato,
// la salva sul profilo (serve per inviare le email nella tua lingua).
export default function LanguageSwitcher({ compact = false }) {
  const { locale, setLocale, t } = useI18n();
  const codes = Object.keys(LOCALES);

  const change = (code) => {
    setLocale(code);
    try { db.setMyLang?.(code); } catch { /* best-effort */ }
  };

  const selectStyle = {
    appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none',
    background: 'var(--bg-input-dark)', color: '#fff', border: '1px solid var(--border-dark)',
    borderRadius: '8px', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600,
    // spazio a destra per la freccia disegnata via background
    backgroundImage: 'url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'10\' height=\'6\' viewBox=\'0 0 10 6\'><path d=\'M1 1l4 4 4-4\' stroke=\'%23999\' stroke-width=\'1.5\' fill=\'none\'/></svg>")',
    backgroundRepeat: 'no-repeat',
  };

  if (compact) {
    // Mostra bandiera + freccia; testo lingua nascosto per stare stretto nella navbar.
    return (
      <select
        value={locale}
        onChange={(e) => change(e.target.value)}
        aria-label={t('lang.label')}
        title={LOCALES[locale]?.label}
        style={{ ...selectStyle, fontSize: '15px', padding: '5px 20px 5px 8px', backgroundPosition: 'right 6px center' }}
      >
        {codes.map((code) => (
          <option key={code} value={code}>{LOCALES[code].flag} {code.toUpperCase()}</option>
        ))}
      </select>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', width: '100%' }}>
      <span style={{ fontSize: '11px', color: 'var(--text-dark-secondary)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '.4px' }}>{t('lang.label')}</span>
      <select
        value={locale}
        onChange={(e) => change(e.target.value)}
        aria-label={t('lang.label')}
        style={{ ...selectStyle, fontSize: '14px', padding: '10px 32px 10px 12px', backgroundPosition: 'right 12px center', width: '100%' }}
      >
        {codes.map((code) => (
          <option key={code} value={code}>{LOCALES[code].flag} {LOCALES[code].label}</option>
        ))}
      </select>
    </div>
  );
}
