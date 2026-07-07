'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { db } from '@/lib/db';
import { CONSENT_VERSION } from '@/lib/consent';
import { Beer, Mail, Lock, User, AtSign, Eye, EyeOff } from 'lucide-react';
import { useT, useI18n } from '@/lib/i18n';

export default function AuthPage() {
  const t = useT();
  const { locale } = useI18n();
  const router = useRouter();
  const [isLogin, setIsLogin] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [logoOk, setLogoOk] = useState(true); // logo ufficiale /logo.png, con fallback all'icona
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);

  // Destinazione dopo il login: il parametro ?next= (es. un itinerario condiviso), se è un
  // path interno sicuro; altrimenti il feed. Evita open-redirect verso URL esterni.
  const nextDest = () => {
    if (typeof window === 'undefined') return '/';
    const n = new URLSearchParams(window.location.search).get('next');
    return n && n.startsWith('/') && !n.startsWith('//') ? n : '/';
  };

  useEffect(() => {
    // Se l'utente è già loggato, reindirizza alla destinazione richiesta (o al feed)
    const checkLogged = async () => {
      const user = await db.getCurrentUser();
      if (user) {
        router.push(nextDest());
      }
    };
    checkLogged();

    // Mostra un messaggio se il login social è fallito (ritorno dal callback OAuth)
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('error') === 'oauth') {
        setError(t('authpage.oauthError'));
      }
    }
  }, [router, t]);

  const handleForgotPassword = async () => {
    setError('');
    setInfo('');
    if (!email) {
      setError(t('authpage.enterEmailFirst'));
      return;
    }
    setLoading(true);
    try {
      // Email di reset brandizzata Strabar, generata e inviata dal nostro server (Resend),
      // non dal mailer di Supabase. Link con token_hash → funziona cross-dispositivo.
      const res = await fetch('/api/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, lang: locale }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || t('authpage.resetEmailFailed'));
      }
      setInfo(t('authpage.resetEmailSent'));
    } catch (err) {
      setError(err.message || t('authpage.resetEmailFailed'));
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
          throw new Error(t('authpage.allFieldsRequired'));
        }
        if (!acceptedTerms) {
          throw new Error(t('authpage.mustAcceptTerms'));
        }
        // Niente consenso marketing qui: resta NULL e il banner-patto lo chiede
        // a tutti (nuovi e vecchi) una volta sola, nel gate post-login.
        const result = await db.signup(email, password, displayName, username, CONSENT_VERSION);

        // Email di benvenuto (best-effort, via Resend) — non blocca la registrazione
        fetch('/api/welcome', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, name: displayName, lang: locale }),
        }).catch(() => {});

        // Se serve la conferma via email non c'è ancora una sessione: non reindirizzare.
        if (result && result.needsEmailConfirmation) {
          setInfo(t('authpage.signupComplete'));
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
      router.push(nextDest());
      router.refresh();
    } catch (err) {
      setError(err.message || t('authpage.genericError'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 'calc(100vh - 150px)', padding: '20px' }}>
      <div className="card" style={{ width: '100%', maxWidth: '450px', border: '1px solid var(--border-dark)' }}>
        <div style={{ textAlign: 'center', marginBottom: '30px' }}>
          {logoOk ? (
            // Logo ufficiale (stesso di /logo.png usato nella navbar).
            // eslint-disable-next-line @next/next/no-img-element
            <img src="/logo.png" alt="Strabar" onError={() => setLogoOk(false)} style={{ height: '56px', width: 'auto', display: 'inline-block', marginBottom: '15px' }} />
          ) : (
            <div style={{ display: 'inline-flex', background: 'rgba(255, 59, 47, 0.1)', padding: '15px', borderRadius: '50%', color: 'var(--primary)', marginBottom: '15px' }}>
              <Beer size={40} fill="var(--primary)" />
            </div>
          )}
          <h1 style={{ fontSize: '28px', fontWeight: '800', marginBottom: '8px' }}>
            {isLogin ? t('authpage.loginTitle') : t('authpage.signupTitle')}
          </h1>
          <p style={{ color: 'var(--text-dark-secondary)', fontSize: '14px' }}>
            {isLogin ? t('authpage.loginSubtitle') : t('authpage.signupSubtitle')}
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
                <label className="form-label">{t('authpage.fullNameLabel')}</label>
                <div style={{ position: 'relative' }}>
                  <User size={18} style={{ position: 'absolute', left: '14px', top: '14px', color: 'var(--text-dark-secondary)' }} />
                  <input
                    type="text"
                    name="name"
                    autoComplete="name"
                    className="form-control"
                    placeholder={t('authpage.fullNamePlaceholder')}
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    style={{ paddingLeft: '45px' }}
                    required={!isLogin}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">{t('authpage.usernameLabel')}</label>
                <div style={{ position: 'relative' }}>
                  <AtSign size={18} style={{ position: 'absolute', left: '14px', top: '14px', color: 'var(--text-dark-secondary)' }} />
                  <input
                    type="text"
                    name="username"
                    autoComplete="username"
                    autoCapitalize="none"
                    autoCorrect="off"
                    className="form-control"
                    placeholder={t('authpage.usernamePlaceholder')}
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
            <label className="form-label">{t('authpage.emailLabel')}</label>
            <div style={{ position: 'relative' }}>
              <Mail size={18} style={{ position: 'absolute', left: '14px', top: '14px', color: 'var(--text-dark-secondary)' }} />
              <input
                type="email"
                name="email"
                autoComplete="email"
                inputMode="email"
                autoCapitalize="none"
                autoCorrect="off"
                className="form-control"
                placeholder={t('authpage.emailPlaceholder')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{ paddingLeft: '45px' }}
                required
              />
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: '25px' }}>
            <label className="form-label">{t('authpage.passwordLabel')}</label>
            <div style={{ position: 'relative' }}>
              <Lock size={18} style={{ position: 'absolute', left: '14px', top: '14px', color: 'var(--text-dark-secondary)' }} />
              <input
                type={showPassword ? 'text' : 'password'}
                name="password"
                autoComplete={isLogin ? 'current-password' : 'new-password'}
                className="form-control"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{ paddingLeft: '45px', paddingRight: '45px' }}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? t('authpage.hidePassword') : t('authpage.showPassword')}
                title={showPassword ? t('authpage.hidePassword') : t('authpage.showPassword')}
                style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-dark-secondary)', cursor: 'pointer', padding: '4px', display: 'flex' }}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {!isLogin && (
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '20px', fontSize: '13px', color: 'var(--text-dark-secondary)', lineHeight: '1.5', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={acceptedTerms}
                onChange={(e) => setAcceptedTerms(e.target.checked)}
                required={!isLogin}
                style={{ width: '18px', height: '18px', marginTop: '1px', flexShrink: 0, accentColor: 'var(--primary)', cursor: 'pointer' }}
              />
              <span>
                {t('authpage.consentPrefix')}{' '}
                <Link href="/terms" target="_blank" style={{ color: 'var(--primary)', fontWeight: 600 }}>{t('authpage.termsOfService')}</Link>
                {' '}{t('authpage.consentMiddle')}{' '}
                <Link href="/privacy" target="_blank" style={{ color: 'var(--primary)', fontWeight: 600 }}>{t('authpage.privacyPolicy')}</Link>.
              </span>
            </label>
          )}

          <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '14px', borderRadius: '30px', fontSize: '16px' }} disabled={loading || (!isLogin && !acceptedTerms)}>
            {loading ? t('authpage.loading') : isLogin ? t('authpage.loginButton') : t('authpage.signupButton')}
          </button>

          {isLogin && (
            <div style={{ textAlign: 'center', marginTop: '14px' }}>
              <button type="button" onClick={handleForgotPassword} disabled={loading} style={{ color: 'var(--text-dark-secondary)', fontSize: '13px', cursor: 'pointer', background: 'none', border: 'none' }}>
                {t('authpage.forgotPassword')}
              </button>
            </div>
          )}
        </form>

        <div style={{ display: 'flex', alignItems: 'center', margin: '20px 0', color: 'var(--text-dark-secondary)' }}>
          <div style={{ flex: 1, height: '1px', background: 'var(--border-dark)' }}></div>
          <span style={{ padding: '0 10px', fontSize: '12px' }}>{t('authpage.orDivider')}</span>
          <div style={{ flex: 1, height: '1px', background: 'var(--border-dark)' }}></div>
        </div>

        <button 
          type="button" 
          onClick={async () => {
            setError('');
            // In registrazione, anche l'accesso con Google richiede il consenso a Termini/Privacy.
            if (!isLogin && !acceptedTerms) {
              setError(t('authpage.mustAcceptTerms'));
              return;
            }
            setLoading(true);
            try {
              await db.loginWithGoogle(nextDest());
              await new Promise((resolve) => setTimeout(resolve, 600));
              window.dispatchEvent(new Event('auth-change'));
              router.push(nextDest());
              router.refresh();
            } catch (err) {
              setError(err.message || t('authpage.googleError'));
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
          {isLogin ? t('authpage.loginWithGoogle') : t('authpage.signupWithGoogle')}
        </button>

        <div style={{ textAlign: 'center', marginTop: '25px', borderTop: '1px solid var(--border-dark)', paddingTop: '20px', fontSize: '14px', color: 'var(--text-dark-secondary)' }}>
          {isLogin ? (
            <p>
              {t('authpage.noAccount')}{' '}
              <button onClick={() => setIsLogin(false)} style={{ color: 'var(--primary)', fontWeight: '600', cursor: 'pointer' }}>
                {t('authpage.registerCta')}
              </button>
            </p>
          ) : (
            <p>
              {t('authpage.haveAccount')}{' '}
              <button onClick={() => setIsLogin(true)} style={{ color: 'var(--primary)', fontWeight: '600', cursor: 'pointer' }}>
                {t('authpage.loginCta')}
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
