'use client';

import { useRouter } from 'next/navigation';
import { Calendar, X } from 'lucide-react';

// Guard "intendevi l'evento?": compare quando avvii una sessione/tour normale mentre
// partecipi a un evento in corso (finestra 2h prima → 5h dopo). Evita di registrare
// una live che NON conta per l'evento per sbaglio.
export default function EventStartGuard({ events, kind = 'session', onContinue, onCancel }) {
  const router = useRouter();
  if (!events || events.length === 0) return null;
  const what = kind === 'tour' ? 'il tour' : 'la sessione';

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(8,9,13,0.92)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1700, padding: '20px' }}>
      <div className="card" style={{ maxWidth: '420px', width: '100%', border: '1px solid var(--primary)', position: 'relative', textAlign: 'center' }}>
        <button onClick={onCancel} aria-label="Annulla" style={{ position: 'absolute', top: '12px', right: '12px', background: 'none', border: 'none', color: 'var(--text-dark-secondary)', cursor: 'pointer' }}><X size={20} /></button>
        <div style={{ display: 'inline-flex', background: 'rgba(255,32,0,0.12)', padding: '14px', borderRadius: '18px', color: 'var(--primary)', marginBottom: '14px', marginTop: '6px' }}>
          <Calendar size={30} />
        </div>
        <h2 style={{ fontSize: '20px', fontWeight: 800, marginBottom: '8px' }}>Hai un evento in corso 🎉</h2>
        <p style={{ color: 'var(--text-dark-secondary)', fontSize: '14px', lineHeight: 1.55, marginBottom: '16px' }}>
          Stai per avviare {what} <strong>normale</strong>, ma partecipi {events.length === 1 ? <>a <strong style={{ color: 'var(--text-dark-primary)' }}>«{events[0].title}»</strong></> : 'a un evento'} proprio adesso. Per farla <strong style={{ color: 'var(--text-dark-primary)' }}>contare nella classifica dell&apos;evento</strong>, avviala dall&apos;evento.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {events.map((e) => (
            <button key={e.id} onClick={() => router.push(`/events/${e.id}`)} className="btn btn-primary" style={{ borderRadius: '16px', padding: '12px', fontWeight: 700 }}>
              📅 Vai a «{e.title}»
            </button>
          ))}
          <button onClick={onContinue} className="btn btn-secondary" style={{ borderRadius: '16px', padding: '11px' }}>
            No, {what} normale
          </button>
          <button onClick={onCancel} style={{ background: 'none', border: 'none', color: 'var(--text-dark-secondary)', fontSize: '13px', cursor: 'pointer', marginTop: '2px' }}>
            Annulla
          </button>
        </div>
      </div>
    </div>
  );
}
