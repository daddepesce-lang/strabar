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
  const [info, setInfo] = useState('');
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

    // Mostra un messaggio se il login social è fallito (ritorno dal callback OAuth)
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('error') === 'oauth') {
        setError("Accesso con Google non riuscito. Riprova o usa email e password.");
      }
    }
  }, [router]);

  const handleForgotPassword = async () => {
    setError('');
    setInfo('');
    if (!email) {
      setError('Inserisci la tua email qui sopra, poi clicca di nuovo su "Password dimenticata?".');
      return;
    }
    setLoading(true);
    try {
      await db.resetPassword(email);
      setInfo('📧 Ti abbiamo inviato un\'email per reimpostare la password. Controlla la posta (anche lo spam).');
    } catch (err) {
      setError(err.message || 'Impossibile inviare l\'email di reset.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setInfo('');
    setLoading(true);

    try {
      if (isLogin) {
        await db.login(email, password);
      } else {
        if (!displayName || !username) {
          throw new Error("Tutti i campi sono obbligatori per la registrazione!");
        }
        const result = await db.signup(email, password, displayName, username);

        // Email di benvenuto (best-effort, via Resend) — non blocca la registrazione
        fetch('/api/welcome', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, name: displayName }),
        }).catch(() => {});

        // Se serve la conferma via email non c'è ancora una sessione: non reindirizzare.
        if (result && result.needsEmailConfirmation) {
          setInfo("Registrazione completata! 📧 Ti abbiamo inviato una email di conferma: clicca il link al suo interno e poi accedi.");
          setIsLogin(true);
          setPassword('');
          setLoading(false);
          return;
        }
      }

      // Piccolo timeout per dare tempo al cookie store e a Supabase di sincronizzarsi nel client
      await new Promise((resolve) => setTimeout(resolve, 600));
      // Notifica la navbar dell'avvenuto accesso
      window.dispatchEvent(new Event('auth-change'));
      router.push('/');
      router.refresh();
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
          <div style={{ display: 'inline-flex', background: 'rgba(255, 32, 0, 0.1)', padding: '15px', borderRadius: '50%', color: 'var(--primary)', marginBottom: '15px' }}>
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

        {info && (
          <div style={{ background: 'rgba(16, 185, 129, 0.12)', border: '1px solid #10B981', color: '#6EE7B7', padding: '12px 16px', borderRadius: 'var(--radius)', fontSize: '14px', marginBottom: '20px', fontWeight: '500', lineHeight: '1.5' }}>
            {info}
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

          {isLogin && (
            <div style={{ textAlign: 'center', marginTop: '14px' }}>
              <button type="button" onClick={handleForgotPassword} disabled={loading} style={{ color: 'var(--text-dark-secondary)', fontSize: '13px', cursor: 'pointer', background: 'none', border: 'none' }}>
                Password dimenticata?
              </button>
            </div>
          )}
        </form>

        <div style={{ display: 'flex', alignItems: 'center', margin: '20px 0', color: 'var(--text-dark-secondary)' }}>
          <div style={{ flex: 1, height: '1px', background: 'var(--border-dark)' }}></div>
          <span style={{ padding: '0 10px', fontSize: '12px' }}>oppure</span>
          <div style={{ flex: 1, height: '1px', background: 'var(--border-dark)' }}></div>
        </div>

        <button 
          type="button" 
          onClick={async () => {
            setError('');
            setLoading(true);
            try {
              await db.loginWithGoogle();
              await new Promise((resolve) => setTimeout(resolve, 600));
              window.dispatchEvent(new Event('auth-change'));
              router.push('/');
              router.refresh();
            } catch (err) {
              setError(err.message || "Errore con l'autenticazione Google.");
            } finally {
              setLoading(false);
            }
          }}
          className="btn btn-secondary" 
          style={{ width: '100%', padding: '12px', borderRadius: '30px', fontSize: '15px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', border: '1px solid var(--border-dark)', background: '#FFF', color: '#000' }}
          disabled={loading}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.85z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.85c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          {isLogin ? 'Accedi con Google' : 'Registrati con Google'}
        </button>

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
