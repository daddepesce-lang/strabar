'use client';

import { useEffect, useState } from 'react';
import { Beer } from 'lucide-react';

const KEY = 'strabar_age_ok';

// Conferma 18+ mostrata una sola volta (memorizzata in localStorage).
// Trattandosi di contenuti legati all'alcol, è una buona prassi di conformità.
export default function AgeGate() {
  const [status, setStatus] = useState('loading'); // loading | show | ok | denied

  useEffect(() => {
    try {
      setStatus(localStorage.getItem(KEY) === '1' ? 'ok' : 'show');
    } catch {
      setStatus('show');
    }
  }, []);

  const confirm = () => {
    try {
      localStorage.setItem(KEY, '1');
    } catch {
      /* noop */
    }
    setStatus('ok');
  };

  if (status === 'loading' || status === 'ok') return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2000,
        background: 'rgba(8, 9, 13, 0.97)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      }}
    >
      <div
        className="card"
        style={{
          maxWidth: '420px',
          width: '100%',
          textAlign: 'center',
          border: '1px solid var(--primary)',
          boxShadow: '0 0 30px rgba(255,94,0,0.2)',
        }}
      >
        <div style={{ display: 'inline-flex', background: 'rgba(255,94,0,0.12)', padding: '16px', borderRadius: '20px', color: 'var(--primary)', marginBottom: '14px' }}>
          <Beer size={36} fill="var(--primary)" />
        </div>

        {status === 'denied' ? (
          <>
            <h2 style={{ fontSize: '22px', fontWeight: 800, marginBottom: '10px' }}>Spiacenti 🚫</h2>
            <p style={{ color: 'var(--text-dark-secondary)', fontSize: '14px', lineHeight: 1.5 }}>
              Strabar tratta contenuti legati al consumo di alcol ed è riservato ai maggiorenni (18+). Torna a trovarci quando avrai l&apos;età.
            </p>
          </>
        ) : (
          <>
            <h2 style={{ fontSize: '22px', fontWeight: 800, marginBottom: '8px' }}>Hai almeno 18 anni?</h2>
            <p style={{ color: 'var(--text-dark-secondary)', fontSize: '14px', lineHeight: 1.5, marginBottom: '22px' }}>
              Strabar contiene riferimenti al consumo di alcol ed è riservato ai maggiorenni. Confermando dichiari di avere 18 anni o più.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button onClick={confirm} className="btn btn-primary" style={{ width: '100%', padding: '14px', borderRadius: '30px', fontSize: '16px', fontWeight: 700 }}>
                Sì, ho 18 anni o più 🍻
              </button>
              <button onClick={() => setStatus('denied')} className="btn btn-secondary" style={{ width: '100%', padding: '12px', borderRadius: '30px', fontSize: '14px' }}>
                No, sono minorenne
              </button>
            </div>
            <p style={{ fontSize: '11px', color: 'var(--text-dark-secondary)', marginTop: '16px' }}>
              Bevi responsabilmente. Se bevi, non guidare.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
