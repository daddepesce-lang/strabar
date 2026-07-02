'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Beer, Lock } from 'lucide-react';

// Schermata mostrata quando una sezione richiede la registrazione.
export default function RequireAuth({ feature = 'questa sezione' }) {
  // Ricorda la pagina corrente (es. un itinerario condiviso) così dopo il login si torna qui.
  const [authHref, setAuthHref] = useState('/auth');
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const next = window.location.pathname + window.location.search;
    if (next && next !== '/') setAuthHref(`/auth?next=${encodeURIComponent(next)}`);
  }, []);

  return (
    <div style={{ maxWidth: '480px', margin: '0 auto', textAlign: 'center' }}>
      <div className="card" style={{ border: '1px solid var(--primary)', background: 'linear-gradient(135deg, rgba(22,24,34,1) 0%, rgba(255, 59, 47,0.08) 100%)', padding: '40px 28px' }}>
        <div style={{ display: 'inline-flex', position: 'relative', background: 'rgba(255, 59, 47,0.12)', padding: '18px', borderRadius: '20px', color: 'var(--primary)', marginBottom: '16px' }}>
          <Beer size={40} fill="var(--primary)" />
          <span style={{ position: 'absolute', bottom: -6, right: -6, background: 'var(--bg-card-dark)', borderRadius: '50%', padding: '4px', border: '1px solid var(--border-dark)' }}>
            <Lock size={16} color="var(--secondary)" />
          </span>
        </div>
        <h1 style={{ fontSize: '24px', fontWeight: 900, marginBottom: '10px' }}>
          Registrati per vedere {feature}
        </h1>
        <p style={{ color: 'var(--text-dark-secondary)', fontSize: '15px', lineHeight: 1.5, marginBottom: '24px' }}>
          {feature.charAt(0).toUpperCase() + feature.slice(1)} è riservata agli atleti di Strabar.
          Crea un account gratuito per tracciare le bevute, sfidare gli amici e scalare le classifiche! 🍻
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <Link href={authHref} className="btn btn-primary" style={{ padding: '14px', borderRadius: '30px', fontSize: '16px', fontWeight: 700 }}>
            Crea un account gratuito
          </Link>
          <Link href={authHref} className="btn btn-secondary" style={{ padding: '12px', borderRadius: '30px', fontSize: '14px' }}>
            Ho già un account · Accedi
          </Link>
        </div>
      </div>
    </div>
  );
}
