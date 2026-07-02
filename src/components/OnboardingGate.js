'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { db } from '@/lib/db';
import { CONSENT_VERSION } from '@/lib/consent';
import { ShieldCheck, Scale, Handshake } from 'lucide-react';

// Gate post-login: se nel profilo manca qualcosa di obbligatorio, lo chiede PRIMA
// di usare l'app. Copre tre casi con un'unica soluzione:
//   • utenti registrati prima dell'introduzione del consenso GDPR;
//   • accesso con Google (il trigger non riceve il consenso dai metadati);
//   • profili senza sesso/peso (necessari per stime BAC accurate).
// Il consenso è bloccante (obbligo di legge); sesso/peso si possono rimandare.
const SNOOZE_KEY = 'strabar_profile_setup_snoozed';

// Evita che una chiamata di rete impallata lasci i pulsanti disabilitati (busy) per sempre:
// se non risponde entro ms, rigetta così il finally riabilita i pulsanti e mostra un errore.
const withTimeout = (p, ms = 12000) =>
  Promise.race([
    p,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Connessione lenta: riprova.')), ms)),
  ]);

export default function OnboardingGate() {
  const [user, setUser] = useState(null);
  const [step, setStep] = useState(null); // null | 'consent' | 'marketing' | 'profile'
  const [accepted, setAccepted] = useState(false);
  const [sex, setSex] = useState('');
  const [weight, setWeight] = useState('');
  const [nameMode, setNameMode] = useState('name'); // 'name' | 'username' | 'alias'
  const [alias, setAlias] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const evaluate = (u) => {
    if (!u || !u.id) { setStep(null); return; }
    if (!u.consent_version) { setStep('consent'); return; }
    if (u.marketing_consent === null || u.marketing_consent === undefined) { setStep('marketing'); return; }
    const missingProfile = !u.weight || !u.sex;
    let snoozed = false;
    try { snoozed = sessionStorage.getItem(SNOOZE_KEY) === '1'; } catch { /* noop */ }
    setStep(missingProfile && !snoozed ? 'profile' : null);
  };

  const load = async () => {
    try {
      const u = await db.getCurrentUser();
      setUser(u);
      setSex(u?.sex || '');
      setWeight(u?.weight ? String(u.weight) : '');
      setNameMode(u?.name_mode || (u?.use_username ? 'username' : 'name'));
      setAlias(u?.alias || '');
      evaluate(u);
    } catch {
      setStep(null);
    }
  };

  useEffect(() => {
    load();
    const onAuth = () => load();
    window.addEventListener('auth-change', onAuth);
    return () => window.removeEventListener('auth-change', onAuth);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const acceptMarketing = async (value) => {
    if (!user) return;
    setBusy(true);
    setError('');
    try {
      await withTimeout(db.recordMarketingConsent(user.id, value));
      const u = { ...user, marketing_consent: value };
      setUser(u);
      evaluate(u);
      // Onboarding obbligatorio completato → segnala così la mini-guida può apparire.
      window.dispatchEvent(new Event('auth-change'));
    } catch (err) {
      setError(err.message || 'Errore nel salvataggio. Riprova.');
    } finally {
      setBusy(false);
    }
  };

  const acceptConsent = async () => {
    if (!accepted || !user) return;
    setBusy(true);
    setError('');
    try {
      await withTimeout(db.recordConsent(user.id, CONSENT_VERSION));
      const u = { ...user, consent_version: CONSENT_VERSION };
      setUser(u);
      evaluate(u);
    } catch (err) {
      setError(err.message || 'Errore nel salvataggio. Riprova.');
    } finally {
      setBusy(false);
    }
  };

  const saveProfile = async () => {
    const w = parseInt(weight, 10);
    if (!sex) { setError('Seleziona il sesso biologico.'); return; }
    if (!(w >= 30 && w <= 250)) { setError('Inserisci un peso valido (30–250 kg).'); return; }
    if (nameMode === 'alias' && !alias.trim()) { setError('Scrivi il nome di fantasia o scegli un\'altra opzione.'); return; }
    setBusy(true);
    setError('');
    try {
      await withTimeout(db.updateProfile(user.id, {
        sex, weight: w,
        name_mode: nameMode,
        use_username: nameMode === 'username',
        alias: alias.trim() || null,
      }));
      setStep(null);
      window.dispatchEvent(new Event('auth-change'));
    } catch (err) {
      setError(err.message || 'Errore nel salvataggio. Riprova.');
    } finally {
      setBusy(false);
    }
  };

  const snoozeProfile = () => {
    try { sessionStorage.setItem(SNOOZE_KEY, '1'); } catch { /* noop */ }
    setStep(null);
  };

  if (!step) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1900, background: 'rgba(8, 9, 13, 0.97)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div className="card" style={{ maxWidth: '440px', width: '100%', border: '1px solid var(--primary)', boxShadow: '0 0 30px rgba(255, 59, 47,0.2)' }}>
        {step === 'marketing' ? (
          <>
            <div style={{ display: 'inline-flex', background: 'rgba(255, 59, 47,0.12)', padding: '14px', borderRadius: '18px', color: 'var(--primary)', marginBottom: '14px' }}>
              <Handshake size={32} />
            </div>
            <h2 style={{ fontSize: '21px', fontWeight: 800, marginBottom: '8px' }}>Facciamo un patto? 🤝</h2>
            <p style={{ color: 'var(--text-dark-secondary)', fontSize: '15px', lineHeight: 1.55, marginBottom: '10px' }}>
              Tu ci dai l&apos;ok alle offerte. Noi ti troviamo <strong style={{ color: 'var(--text-dark-primary)' }}>sconti, eventi e le scuse perfette per uscire</strong> nei locali vicino a te. 🍻
            </p>
            <p style={{ color: 'var(--text-dark-secondary)', fontSize: '13px', lineHeight: 1.5, marginBottom: '18px' }}>
              I tuoi dati di consumo restano <strong style={{ color: 'var(--text-dark-primary)' }}>anonimi e aggregati</strong> — niente nome, niente profilo. Cambi idea quando vuoi dalle impostazioni.
            </p>
            {error && <p style={{ color: '#FF7D7D', fontSize: '13px', marginBottom: '12px' }}>{error}</p>}
            <button onClick={() => acceptMarketing(true)} disabled={busy} className="btn btn-primary" style={{ width: '100%', padding: '14px', borderRadius: '30px', fontSize: '16px', fontWeight: 700 }}>
              {busy ? 'Attendi...' : 'Ci sto 🤝'}
            </button>
            <button onClick={() => acceptMarketing(false)} disabled={busy} style={{ background: 'none', border: 'none', color: 'var(--text-dark-secondary)', fontSize: '13px', cursor: 'pointer', marginTop: '12px', width: '100%' }}>
              No grazie
            </button>
          </>
        ) : step === 'consent' ? (
          <>
            <div style={{ display: 'inline-flex', background: 'rgba(255, 59, 47,0.12)', padding: '14px', borderRadius: '18px', color: 'var(--primary)', marginBottom: '14px' }}>
              <ShieldCheck size={32} />
            </div>
            <h2 style={{ fontSize: '21px', fontWeight: 800, marginBottom: '8px' }}>Un ultimo passo</h2>
            <p style={{ color: 'var(--text-dark-secondary)', fontSize: '14px', lineHeight: 1.5, marginBottom: '18px' }}>
              Abbiamo aggiornato i nostri documenti. Per continuare a usare Strabar devi accettare Termini e Privacy.
            </p>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '18px', fontSize: '13px', color: 'var(--text-dark-secondary)', lineHeight: 1.5, cursor: 'pointer', textAlign: 'left' }}>
              <input
                type="checkbox"
                checked={accepted}
                onChange={(e) => setAccepted(e.target.checked)}
                style={{ width: '18px', height: '18px', marginTop: '1px', flexShrink: 0, accentColor: 'var(--primary)', cursor: 'pointer' }}
              />
              <span>
                Ho letto e accetto i{' '}
                <Link href="/terms" target="_blank" style={{ color: 'var(--primary)', fontWeight: 600 }}>Termini di Servizio</Link>
                {' '}e la{' '}
                <Link href="/privacy" target="_blank" style={{ color: 'var(--primary)', fontWeight: 600 }}>Privacy Policy</Link>.
              </span>
            </label>
            {error && <p style={{ color: '#FF7D7D', fontSize: '13px', marginBottom: '12px' }}>{error}</p>}
            <button onClick={acceptConsent} disabled={!accepted || busy} className="btn btn-primary" style={{ width: '100%', padding: '14px', borderRadius: '30px', fontSize: '16px', fontWeight: 700, opacity: !accepted || busy ? 0.6 : 1 }}>
              {busy ? 'Attendi...' : 'Accetto e continuo'}
            </button>
          </>
        ) : (
          <>
            <div style={{ display: 'inline-flex', background: 'rgba(255, 59, 47,0.12)', padding: '14px', borderRadius: '18px', color: 'var(--primary)', marginBottom: '14px' }}>
              <Scale size={32} />
            </div>
            <h2 style={{ fontSize: '21px', fontWeight: 800, marginBottom: '8px' }}>Completa il profilo</h2>
            <p style={{ color: 'var(--text-dark-secondary)', fontSize: '14px', lineHeight: 1.5, marginBottom: '18px' }}>
              Servono per stimare il tuo tasso alcolico in modo accurato (formula di Widmark). Restano privati.
            </p>

            <div style={{ marginBottom: '16px', textAlign: 'left' }}>
              <label className="form-label" style={{ marginBottom: '6px', display: 'block' }}>Sesso biologico</label>
              <div className="seg-tabs" style={{ display: 'flex', gap: '8px' }}>
                <div className={`seg-tab ${sex === 'm' ? 'active' : ''}`} onClick={() => setSex('m')} style={{ flex: 1, cursor: 'pointer', textAlign: 'center', padding: '10px', borderRadius: '10px', border: '1px solid var(--border-dark)', fontWeight: 700 }}>♂ Uomo</div>
                <div className={`seg-tab ${sex === 'f' ? 'active' : ''}`} onClick={() => setSex('f')} style={{ flex: 1, cursor: 'pointer', textAlign: 'center', padding: '10px', borderRadius: '10px', border: '1px solid var(--border-dark)', fontWeight: 700 }}>♀ Donna</div>
              </div>
            </div>

            <div style={{ marginBottom: '18px', textAlign: 'left' }}>
              <label className="form-label" style={{ marginBottom: '6px', display: 'block' }}>Peso (kg)</label>
              <input
                type="number"
                inputMode="numeric"
                min={30}
                max={250}
                className="form-control"
                placeholder="Es. 75"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
              />
            </div>

            <div style={{ marginBottom: '18px', textAlign: 'left' }}>
              <label className="form-label" style={{ marginBottom: '6px', display: 'block' }}>Come vuoi apparire agli altri</label>
              <div style={{ display: 'flex', gap: '6px' }}>
                {[
                  { v: 'name', t: 'Nome' },
                  { v: 'username', t: '@username' },
                  { v: 'alias', t: 'Fantasia' },
                ].map((o) => (
                  <div key={o.v} onClick={() => setNameMode(o.v)} style={{ flex: 1, cursor: 'pointer', textAlign: 'center', padding: '9px 4px', borderRadius: '10px', fontWeight: 700, fontSize: '13px', border: nameMode === o.v ? '1px solid var(--primary)' : '1px solid var(--border-dark)', color: nameMode === o.v ? 'var(--primary)' : 'var(--text-dark-primary)', background: 'var(--bg-input-dark)' }}>{o.t}</div>
                ))}
              </div>
              {nameMode === 'alias' && (
                <input
                  type="text"
                  className="form-control"
                  placeholder="Il tuo nome di fantasia"
                  value={alias}
                  maxLength={40}
                  onChange={(e) => setAlias(e.target.value)}
                  style={{ marginTop: '8px' }}
                />
              )}
            </div>

            {error && <p style={{ color: '#FF7D7D', fontSize: '13px', marginBottom: '12px' }}>{error}</p>}
            <button onClick={saveProfile} disabled={busy} className="btn btn-primary" style={{ width: '100%', padding: '14px', borderRadius: '30px', fontSize: '16px', fontWeight: 700 }}>
              {busy ? 'Attendi...' : 'Salva e continua'}
            </button>
            <button onClick={snoozeProfile} disabled={busy} style={{ background: 'none', border: 'none', color: 'var(--text-dark-secondary)', fontSize: '13px', cursor: 'pointer', marginTop: '12px', width: '100%' }}>
              Imposta più tardi
            </button>
          </>
        )}
      </div>
    </div>
  );
}
