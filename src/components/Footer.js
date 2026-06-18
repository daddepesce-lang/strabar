import Link from 'next/link';

export default function Footer() {
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
        🍻 Bevi responsabilmente · Riservato ai maggiorenni (18+) · Se bevi non guidare
      </div>
      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', justifyContent: 'center' }}>
        <Link href="/terms" style={{ color: 'var(--text-dark-secondary)' }}>Termini di Servizio</Link>
        <Link href="/privacy" style={{ color: 'var(--text-dark-secondary)' }}>Privacy</Link>
        <Link href="/install" style={{ color: 'var(--text-dark-secondary)' }}>Installa / Invita</Link>
      </div>
      <div style={{ fontSize: '11px', opacity: 0.7 }}>
        Strabar — progetto indipendente, non affiliato ad alcun altro marchio. Le stime di BAC sono puramente indicative.
      </div>
    </footer>
  );
}
