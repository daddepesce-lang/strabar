'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/db';
import { useT } from '@/lib/i18n';
import { X, ChevronLeft, ChevronRight, Beer, MapPin, Users } from 'lucide-react';

// Mini-guida di benvenuto: 3 schede skippabili, mostrate UNA volta per dispositivo
// dopo l'onboarding obbligatorio (consenso + patto). Riapribile da "Altro → Come funziona".
const SEEN_KEY = 'strabar_welcome_seen_v1';

const CARDS = [
  { icon: Beer, key: 'card1' },
  { icon: MapPin, key: 'card2' },
  { icon: Users, key: 'card3' },
];

export default function WelcomeGuide() {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [i, setI] = useState(0);

  const maybeShow = async () => {
    try { if (localStorage.getItem(SEEN_KEY)) return; } catch { /* noop */ }
    // Non coprire il check-in via QR di un locale: l'utente ha uno scopo preciso (registrare
    // la bevuta qui). La mini-guida si potrà aprire dopo, dal menu.
    try { if (sessionStorage.getItem('strabar_qr_checkin')) return; } catch { /* noop */ }
    let u = null;
    try { u = await db.getCurrentUser(); } catch { return; }
    if (!u) return;
    // Solo dopo l'onboarding obbligatorio (così non si accavalla con il gate consenso/patto).
    if (!u.consent_version) return;
    if (u.marketing_consent === null || u.marketing_consent === undefined) return;
    setI(0);
    setOpen(true);
  };

  useEffect(() => {
    maybeShow();
    const onAuth = () => maybeShow();
    const onOpen = () => { setI(0); setOpen(true); };
    window.addEventListener('auth-change', onAuth);
    window.addEventListener('strabar:open-guide', onOpen);
    return () => {
      window.removeEventListener('auth-change', onAuth);
      window.removeEventListener('strabar:open-guide', onOpen);
    };

  }, []);

  const close = () => { try { localStorage.setItem(SEEN_KEY, '1'); } catch { /* noop */ } setOpen(false); };
  const finish = () => { close(); router.push('/log'); };

  if (!open) return null;
  const card = CARDS[i];
  const Icon = card.icon;
  const last = i === CARDS.length - 1;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1850, background: 'rgba(8,9,13,0.97)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div className="card" style={{ maxWidth: '420px', width: '100%', border: '1px solid var(--primary)', boxShadow: '0 0 30px rgba(255,59,47,0.2)', position: 'relative', textAlign: 'center' }}>
        <button onClick={close} aria-label={t('welcomeguide.skipAria')} style={{ position: 'absolute', top: '12px', right: '12px', background: 'none', border: 'none', color: 'var(--text-dark-secondary)', cursor: 'pointer' }}><X size={20} /></button>

        <div style={{ display: 'inline-flex', background: 'rgba(255,59,47,0.12)', padding: '16px', borderRadius: '20px', color: 'var(--primary)', marginBottom: '16px', marginTop: '8px' }}>
          <Icon size={34} />
        </div>
        <h2 style={{ fontSize: '22px', fontWeight: 800, marginBottom: '10px' }}>{t(`welcomeguide.${card.key}Title`)}</h2>
        <p style={{ color: 'var(--text-dark-secondary)', fontSize: '15px', lineHeight: 1.55, marginBottom: '20px', minHeight: '66px' }}>{t(`welcomeguide.${card.key}Body`)}</p>

        {/* Pallini */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '7px', marginBottom: '20px' }}>
          {CARDS.map((_, idx) => (
            <span key={idx} style={{ width: idx === i ? 22 : 8, height: 8, borderRadius: 4, background: idx === i ? 'var(--primary)' : 'var(--border-dark)', transition: 'all .2s' }} />
          ))}
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          {i > 0 && (
            <button onClick={() => setI(i - 1)} className="btn btn-secondary" style={{ borderRadius: '20px', padding: '12px', flex: 1 }}>
              <ChevronLeft size={18} /> {t('welcomeguide.back')}
            </button>
          )}
          {last ? (
            <button onClick={finish} className="btn btn-primary" style={{ borderRadius: '20px', padding: '12px', flex: 2, fontWeight: 700 }}>
              {t('welcomeguide.finish')}
            </button>
          ) : (
            <button onClick={() => setI(i + 1)} className="btn btn-primary" style={{ borderRadius: '20px', padding: '12px', flex: 2, fontWeight: 700 }}>
              {t('welcomeguide.next')} <ChevronRight size={18} />
            </button>
          )}
        </div>
        <button onClick={close} style={{ background: 'none', border: 'none', color: 'var(--text-dark-secondary)', fontSize: '13px', cursor: 'pointer', marginTop: '14px', width: '100%' }}>
          {t('welcomeguide.skipGuide')}
        </button>
      </div>
    </div>
  );
}
