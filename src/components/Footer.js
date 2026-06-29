'use client';

import Link from 'next/link';
import { useT } from '@/lib/i18n';

export default function Footer() {
  const t = useT();
  return (
    <footer
      style={{
        borderTop: '1px solid var(--border-dark)',
        marginTop: '40px',
        padding: '24px 20px',
        // Spazio extra in basso per non finire sotto la bottom-nav mobile
        paddingBottom: 'calc(24px + 80px + env(safe-area-inset-bottom, 0px))',
        textAlign: 'center',
        color: 'var(--text-dark-secondary)',
        fontSize: '13px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '10px',
      }}
    >
      <div style={{ fontWeight: 700, color: 'var(--secondary)' }}>
        {t('footer.responsible')}
      </div>
      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', justifyContent: 'center' }}>
        <Link href="/terms" style={{ color: 'var(--text-dark-secondary)' }}>{t('footer.terms')}</Link>
        <Link href="/privacy" style={{ color: 'var(--text-dark-secondary)' }}>{t('footer.privacy')}</Link>
        <Link href="/install" style={{ color: 'var(--text-dark-secondary)' }}>{t('footer.install')}</Link>
      </div>
      <div style={{ fontSize: '11px', opacity: 0.7 }}>
        {t('footer.disclaimer')}
      </div>
    </footer>
  );
}
