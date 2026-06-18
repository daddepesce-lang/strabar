'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/db';
import { createClient } from '@/utils/supabase/client';
import { Beer, Lock } from 'lucide-react';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [ready, setReady] = useState(false); // sessione di recupero rilevata
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Supabase, arrivando dal link email, crea una sessione di recupero.
    // L'evento PASSWORD_RECOVERY conferma che possiamo impostare la nuova password.
    let supabase;
    try {
      supabase = createClient();
    } catch {
      return;
    }
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') setReady(true);
    });
    // Controllo immediato: se c'è già una sessione valida
    supabase.auth.getSession().then(({ data }) => {
      if (data?.session) setReady(true);
    });
    return () => sub?.subscription?.unsubscribe?.();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (password.length < 6) {
      setError('La password deve avere almeno 6 caratteri.');
      return;
    }
    if (password !== confirm) {
      setError('Le due password non coincidono.');
      return;
    }
    setLoading(true);
    try {
      await db.updatePassword(password);
      setDone(true);
      setTimeout(() => router.push('/'), 1500);
    } catch (err) {
      setError(err.message || 'Impossibile aggiornare la password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 'calc(100vh - 200px)', padding: '20px' }}>
      <div className="card" style={{ width: '100%', maxWidth: '420px', border: '1px solid var(--border-dark)' }}>
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <div style={{ display: 'inline-flex', background: 'rgba(255,94,0,0.1)', padding: '14px', borderRadius: '50%', color: 'var(--primary)', marginBottom: '12px' }}>
            <Lock size={32} />
          </div>
          <h1 style={{ fontSize: '24px', fontWeight: 800 }}>Reimposta la password</h1>
        </div>

        {error && (
          <div style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid var(--error)', color: '#FF7D7D', padding: '12px 16px', borderRadius: 'var(--radius)', fontSize: '14px', marginBottom: '18px' }}>{error}</div>
        )}

        {done ? (
          <div style={{ textAlign: 'center', color: '#6EE7B7', fontWeight: 600 }}>
            <Beer size={28} style={{ marginBottom: '8px' }} /><br />
            Password aggiornata! Ti reindirizzo… 🍻
          </div>
        ) : !ready ? (
          <p style={{ color: 'var(--text-dark-secondary)', fontSize: '14px', textAlign: 'center', lineHeight: 1.5 }}>
            Apri questa pagina dal link che ti abbiamo inviato via email per reimpostare la password.
          </p>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <input
              type="password"
              className="form-control"
              placeholder="Nuova password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <input
              type="password"
              className="form-control"
              placeholder="Conferma password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
            />
            <button type="submit" className="btn btn-primary" style={{ padding: '14px', borderRadius: '30px', fontSize: '16px' }} disabled={loading}>
              {loading ? 'Salvataggio...' : 'Imposta nuova password'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
