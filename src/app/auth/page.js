'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/db';
import { Beer, Mail, Lock, User, AtSign } from 'lucide-react';

export default function AuthPage() {
  const router = useRouter();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Se l'utente è già loggato, reindirizza al feed
    const checkLogged = async () => {
      const user = await db.getCurrentUser();
      if (user) {
        router.push('/');
      }
    };
    checkLogged();
  }, [router]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isLogin) {
        await db.login(email, password);
      } else {
        if (!displayName || !username) {
          throw new Error("Tutti i campi sono obbligatori per la registrazione!");
        }
        await db.signup(email, password, displayName, username);
      }
      
      // Notifica la navbar dell'avvenuto accesso
      window.dispatchEvent(new Event('auth-change'));
      router.push('/');
    } catch (err) {
      setError(err.message || "Qualcosa è andato storto. Riprova!");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 'calc(100vh - 150px)', padding: '20px' }}>
      <div className="card" style={{ width: '100%', maxWidth: '450px', border: '1px solid var(--border-dark)' }}>
        <div style={{ textAlign: 'center', marginBottom: '30px' }}>
          <div style={{ display: 'inline-flex', background: 'rgba(255, 94, 0, 0.1)', padding: '15px', borderRadius: '50%', color: 'var(--primary)', marginBottom: '15px' }}>
            <Beer size={40} fill="var(--primary)" />
          </div>
          <h1 style={{ fontSize: '28px', fontWeight: '800', marginBottom: '8px' }}>
            {isLogin ? 'Accedi a Strabar' : 'Registrati a Strabar'}
          </h1>
          <p style={{ color: 'var(--text-dark-secondary)', fontSize: '14px' }}>
            {isLogin ? 'Condividi le tue bevute con gli amici e pianifica bacari' : 'Inizia subito a tracciare la tua attività alcolica'}
          </p>
        </div>

        {error && (
          <div style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid var(--error)', color: '#FF7D7D', padding: '12px 16px', borderRadius: 'var(--radius)', fontSize: '14px', marginBottom: '20px', fontWeight: '500' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {!isLogin && (
            <>
              <div className="form-group">
                <label className="form-label">Nome Completo</label>
                <div style={{ position: 'relative' }}>
                  <User size={18} style={{ position: 'absolute', left: '14px', top: '14px', color: 'var(--text-dark-secondary)' }} />
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Mario Rossi"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    style={{ paddingLeft: '45px' }}
                    required={!isLogin}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Username</label>
                <div style={{ position: 'relative' }}>
                  <AtSign size={18} style={{ position: 'absolute', left: '14px', top: '14px', color: 'var(--text-dark-secondary)' }} />
                  <input
                    type="text"
                    className="form-control"
                    placeholder="mario_rossi"
                    value={username}
                    onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                    style={{ paddingLeft: '45px' }}
                    required={!isLogin}
                  />
                </div>
              </div>
            </>
          )}

          <div className="form-group">
            <label className="form-label">Email</label>
            <div style={{ position: 'relative' }}>
              <Mail size={18} style={{ position: 'absolute', left: '14px', top: '14px', color: 'var(--text-dark-secondary)' }} />
              <input
                type="email"
                className="form-control"
                placeholder="mario.rossi@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{ paddingLeft: '45px' }}
                required
              />
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: '25px' }}>
            <label className="form-label">Password</label>
            <div style={{ position: 'relative' }}>
              <Lock size={18} style={{ position: 'absolute', left: '14px', top: '14px', color: 'var(--text-dark-secondary)' }} />
              <input
                type="password"
                className="form-control"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{ paddingLeft: '45px' }}
                required
              />
            </div>
          </div>

          <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '14px', borderRadius: '30px', fontSize: '16px' }} disabled={loading}>
            {loading ? 'Attendi...' : isLogin ? 'Accedi' : 'Crea Account'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: '25px', borderTop: '1px solid var(--border-dark)', paddingTop: '20px', fontSize: '14px', color: 'var(--text-dark-secondary)' }}>
          {isLogin ? (
            <p>
              Non hai un account?{' '}
              <button onClick={() => setIsLogin(false)} style={{ color: 'var(--primary)', fontWeight: '600', cursor: 'pointer' }}>
                Registrati
              </button>
            </p>
          ) : (
            <p>
              Hai già un account?{' '}
              <button onClick={() => setIsLogin(true)} style={{ color: 'var(--primary)', fontWeight: '600', cursor: 'pointer' }}>
                Accedi
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
