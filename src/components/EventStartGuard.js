'use client';

import { useRouter } from 'next/navigation';
import { Calendar, X } from 'lucide-react';
import { useT } from '@/lib/i18n';

// Guard "intendevi l'evento?": compare quando avvii una sessione/tour normale mentre
// partecipi a un evento in corso (finestra 2h prima → 5h dopo). Evita di registrare
// una live che NON conta per l'evento per sbaglio.
export default function EventStartGuard({ events, kind = 'session', onContinue, onCancel }) {
  const t = useT();
  const router = useRouter();
  if (!events || events.length === 0) return null;
  const what = kind === 'tour' ? t('eventguard.whatTour') : t('eventguard.whatSession');

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(8,9,13,0.92)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1700, padding: '20px' }}>
      <div className="card" style={{ maxWidth: '420px', width: '100%', border: '1px solid var(--primary)', position: 'relative', textAlign: 'center' }}>
        <button onClick={onCancel} aria-label={t('eventguard.cancel')} style={{ position: 'absolute', top: '12px', right: '12px', background: 'none', border: 'none', color: 'var(--text-dark-secondary)', cursor: 'pointer' }}><X size={20} /></button>
        <div style={{ display: 'inline-flex', background: 'rgba(255,59,47,0.12)', padding: '14px', borderRadius: '18px', color: 'var(--primary)', marginBottom: '14px', marginTop: '6px' }}>
          <Calendar size={30} />
        </div>
        <h2 style={{ fontSize: '20px', fontWeight: 800, marginBottom: '8px' }}>{t('eventguard.title')}</h2>
        <p style={{ color: 'var(--text-dark-secondary)', fontSize: '14px', lineHeight: 1.55, marginBottom: '16px' }}>
          {t('eventguard.intro', { what })} <strong>{t('eventguard.normalWord')}</strong>{t('eventguard.afterNormal')} {events.length === 1 ? <>{t('eventguard.singleEventJoin')} <strong style={{ color: 'var(--text-dark-primary)' }}>«{events[0].title}»</strong></> : t('eventguard.multiEvent')} {t('eventguard.afterEvent')} <strong style={{ color: 'var(--text-dark-primary)' }}>{t('eventguard.countLabel')}</strong>{t('eventguard.afterCount')}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {events.map((e) => (
            <button key={e.id} onClick={() => router.push(`/events/${e.id}`)} className="btn btn-primary" style={{ borderRadius: '16px', padding: '12px', fontWeight: 700 }}>
              {t('eventguard.goToEvent', { title: e.title })}
            </button>
          ))}
          <button onClick={onContinue} className="btn btn-secondary" style={{ borderRadius: '16px', padding: '11px' }}>
            {t('eventguard.continueNormal', { what })}
          </button>
          <button onClick={onCancel} style={{ background: 'none', border: 'none', color: 'var(--text-dark-secondary)', fontSize: '13px', cursor: 'pointer', marginTop: '2px' }}>
            {t('eventguard.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}
