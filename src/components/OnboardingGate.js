'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { db } from '@/lib/db';
import { CONSENT_VERSION } from '@/lib/consent';
import { useT } from '@/lib/i18n';
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
  const t = useT();
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
      setError(err.message || t('onboarding.errSave'));
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
      setError(err.message || t('onboarding.errSave'));
    } finally {
      setBusy(false);
    }
  };

  const saveProfile = async () => {
    const w = parseInt(weight, 10);
    if (!sex) { setError(t('onboarding.errSex')); return; }
    if (!(w >= 30 && w <= 250)) { setError(t('onboarding.errWeight')); return; }
    if (nameMode === 'alias' && !alias.trim()) { setError(t('onboarding.errAlias')); return; }
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
      setError(err.message || t('onboarding.errSave'));
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
            <h2 style={{ fontSize: '21px', fontWeight: 800, marginBottom: '8px' }}>{t('onboarding.pactTitle')}</h2>
            <p style={{ color: 'var(--text-dark-secondary)', fontSize: '15px', lineHeight: 1.55, marginBottom: '10px' }}>
              {t('onboarding.pactBody1')}<strong style={{ color: 'var(--text-dark-primary)' }}>{t('onboarding.pactBodyStrong')}</strong>{t('onboarding.pactBody2')}
            </p>
            <p style={{ color: 'var(--text-dark-secondary)', fontSize: '13px', lineHeight: 1.5, marginBottom: '18px' }}>
              {t('onboarding.pactPrivacy1')}<strong style={{ color: 'var(--text-dark-primary)' }}>{t('onboarding.pactPrivacyStrong')}</strong>{t('onboarding.pactPrivacy2')}
            </p>
            {error && <p style={{ color: '#FF7D7D', fontSize: '13px', marginBottom: '12px' }}>{error}</p>}
            <button onClick={() => acceptMarketing(true)} disabled={busy} className="btn btn-primary" style={{ width: '100%', padding: '14px', borderRadius: '30px', fontSize: '16px', fontWeight: 700 }}>
              {busy ? t('onboarding.waiting') : t('onboarding.pactAccept')}
            </button>
            <button onClick={() => acceptMarketing(false)} disabled={busy} style={{ background: 'none', border: 'none', color: 'var(--text-dark-secondary)', fontSize: '13px', cursor: 'pointer', marginTop: '12px', width: '100%' }}>
              {t('onboarding.pactDecline')}
            </button>
          </>
        ) : step === 'consent' ? (
          <>
            <div style={{ display: 'inline-flex', background: 'rgba(255, 59, 47,0.12)', padding: '14px', borderRadius: '18px', color: 'var(--primary)', marginBottom: '14px' }}>
              <ShieldCheck size={32} />
            </div>
            <h2 style={{ fontSize: '21px', fontWeight: 800, marginBottom: '8px' }}>{t('onboarding.consentTitle')}</h2>
            <p style={{ color: 'var(--text-dark-secondary)', fontSize: '14px', lineHeight: 1.5, marginBottom: '18px' }}>
              {t('onboarding.consentIntro')}
            </p>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '18px', fontSize: '13px', color: 'var(--text-dark-secondary)', lineHeight: 1.5, cursor: 'pointer', textAlign: 'left' }}>
              <input
                type="checkbox"
                checked={accepted}
                onChange={(e) => setAccepted(e.target.checked)}
                style={{ width: '18px', height: '18px', marginTop: '1px', flexShrink: 0, accentColor: 'var(--primary)', cursor: 'pointer' }}
              />
              <span>
                {t('onboarding.consentCheckboxPre')}{' '}
                <Link href="/terms" target="_blank" style={{ color: 'var(--primary)', fontWeight: 600 }}>{t('onboarding.consentTermsLink')}</Link>
                {' '}{t('onboarding.consentCheckboxMid')}{' '}
                <Link href="/privacy" target="_blank" style={{ color: 'var(--primary)', fontWeight: 600 }}>{t('onboarding.consentPrivacyLink')}</Link>.
              </span>
            </label>
            {error && <p style={{ color: '#FF7D7D', fontSize: '13px', marginBottom: '12px' }}>{error}</p>}
            <button onClick={acceptConsent} disabled={!accepted || busy} className="btn btn-primary" style={{ width: '100%', padding: '14px', borderRadius: '30px', fontSize: '16px', fontWeight: 700, opacity: !accepted || busy ? 0.6 : 1 }}>
              {busy ? t('onboarding.waiting') : t('onboarding.consentSubmit')}
            </button>
          </>
        ) : (
          <>
            <div style={{ display: 'inline-flex', background: 'rgba(255, 59, 47,0.12)', padding: '14px', borderRadius: '18px', color: 'var(--primary)', marginBottom: '14px' }}>
              <Scale size={32} />
            </div>
            <h2 style={{ fontSize: '21px', fontWeight: 800, marginBottom: '8px' }}>{t('onboarding.profileTitle')}</h2>
            <p style={{ color: 'var(--text-dark-secondary)', fontSize: '14px', lineHeight: 1.5, marginBottom: '18px' }}>
              {t('onboarding.profileIntro')}
            </p>

            <div style={{ marginBottom: '16px', textAlign: 'left' }}>
              <label className="form-label" style={{ marginBottom: '6px', display: 'block' }}>{t('onboarding.sexLabel')}</label>
              <div className="seg-tabs" style={{ display: 'flex', gap: '8px' }}>
                <div className={`seg-tab ${sex === 'm' ? 'active' : ''}`} onClick={() => setSex('m')} style={{ flex: 1, cursor: 'pointer', textAlign: 'center', padding: '10px', borderRadius: '10px', border: '1px solid var(--border-dark)', fontWeight: 700 }}>{t('onboarding.sexMale')}</div>
                <div className={`seg-tab ${sex === 'f' ? 'active' : ''}`} onClick={() => setSex('f')} style={{ flex: 1, cursor: 'pointer', textAlign: 'center', padding: '10px', borderRadius: '10px', border: '1px solid var(--border-dark)', fontWeight: 700 }}>{t('onboarding.sexFemale')}</div>
              </div>
            </div>

            <div style={{ marginBottom: '18px', textAlign: 'left' }}>
              <label className="form-label" style={{ marginBottom: '6px', display: 'block' }}>{t('onboarding.weightLabel')}</label>
              <input
                type="number"
                inputMode="numeric"
                min={30}
                max={250}
                className="form-control"
                placeholder={t('onboarding.weightPlaceholder')}
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
              />
            </div>

            <div style={{ marginBottom: '18px', textAlign: 'left' }}>
              <label className="form-label" style={{ marginBottom: '6px', display: 'block' }}>{t('onboarding.nameModeLabel')}</label>
              <div style={{ display: 'flex', gap: '6px' }}>
                {[
                  { v: 'name', t: t('onboarding.nameModeName') },
                  { v: 'username', t: t('onboarding.nameModeUsername') },
                  { v: 'alias', t: t('onboarding.nameModeAlias') },
                ].map((o) => (
                  <div key={o.v} onClick={() => setNameMode(o.v)} style={{ flex: 1, cursor: 'pointer', textAlign: 'center', padding: '9px 4px', borderRadius: '10px', fontWeight: 700, fontSize: '13px', border: nameMode === o.v ? '1px solid var(--primary)' : '1px solid var(--border-dark)', color: nameMode === o.v ? 'var(--primary)' : 'var(--text-dark-primary)', background: 'var(--bg-input-dark)' }}>{o.t}</div>
                ))}
              </div>
              {nameMode === 'alias' && (
                <input
                  type="text"
                  className="form-control"
                  placeholder={t('onboarding.aliasPlaceholder')}
                  value={alias}
                  maxLength={40}
                  onChange={(e) => setAlias(e.target.value)}
                  style={{ marginTop: '8px' }}
                />
              )}
            </div>

            {error && <p style={{ color: '#FF7D7D', fontSize: '13px', marginBottom: '12px' }}>{error}</p>}
            <button onClick={saveProfile} disabled={busy} className="btn btn-primary" style={{ width: '100%', padding: '14px', borderRadius: '30px', fontSize: '16px', fontWeight: 700 }}>
              {busy ? t('onboarding.waiting') : t('onboarding.profileSubmit')}
            </button>
            <button onClick={snoozeProfile} disabled={busy} style={{ background: 'none', border: 'none', color: 'var(--text-dark-secondary)', fontSize: '13px', cursor: 'pointer', marginTop: '12px', width: '100%' }}>
              {t('onboarding.profileLater')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
