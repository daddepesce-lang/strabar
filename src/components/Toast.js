'use client';

import { useEffect, useState } from 'react';

// Toast di conferma a schermo: banner che scende dall'alto, si auto-chiude e si può
// toccare per chiudere subito. Nessuna libreria/egress (solo CSS, keyframe in globals.css).
// Usato per il feedback "ti riconosco: sei qui" al check-in GPS, ma è generico.
//
// Props: { message, variant: 'success'|'warning'|'info', title?, duration?, onClose }
export default function Toast({ message, variant = 'success', title, duration = 2800, onClose }) {
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (!message) return undefined;
    const a = setTimeout(() => setLeaving(true), Math.max(400, duration - 300));
    const b = setTimeout(() => onClose?.(), duration);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, [message, duration, onClose]);

  if (!message) return null;

  const accent = variant === 'warning' ? '#FF9F1C' : variant === 'info' ? 'var(--primary)' : 'var(--success, #10B981)';
  const glow = variant === 'warning' ? 'rgba(255,159,28,0.28)' : variant === 'info' ? 'rgba(255,32,0,0.28)' : 'rgba(16,185,129,0.28)';
  const tint = variant === 'warning' ? 'rgba(255,159,28,0.12)' : variant === 'info' ? 'rgba(255,32,0,0.12)' : 'rgba(16,185,129,0.14)';
  const icon = variant === 'warning' ? '📍' : variant === 'info' ? 'ℹ️' : '✅';

  const dismiss = () => { setLeaving(true); setTimeout(() => onClose?.(), 220); };

  return (
    <div
      style={{
        position: 'fixed',
        top: 'calc(12px + env(safe-area-inset-top, 0px))',
        left: 0, right: 0, zIndex: 2200,
        display: 'flex', justifyContent: 'center',
        padding: '0 14px', pointerEvents: 'none',
      }}
      role="status"
      aria-live="polite"
    >
      <div
        onClick={dismiss}
        style={{
          pointerEvents: 'auto', cursor: 'pointer', maxWidth: 440, width: '100%',
          display: 'flex', alignItems: 'center', gap: 12,
          background: `linear-gradient(135deg, rgba(22,24,34,0.98) 0%, ${tint} 100%)`,
          border: `1px solid ${accent}`, borderRadius: 14, padding: '13px 16px',
          boxShadow: `0 10px 34px rgba(0,0,0,0.5), 0 0 22px ${glow}`,
          animation: leaving ? 'toastOut .22s ease forwards' : 'toastIn .38s cubic-bezier(.2,1.3,.4,1)',
        }}
      >
        <span style={{ fontSize: 26, lineHeight: 1, flexShrink: 0, animation: 'toastPop .5s ease' }}>{icon}</span>
        <span style={{ minWidth: 0 }}>
          {title && (
            <span style={{ display: 'block', fontSize: 13, fontWeight: 900, color: '#FFF', letterSpacing: '.2px' }}>{title}</span>
          )}
          <span style={{ display: 'block', fontSize: title ? 12.5 : 14, fontWeight: title ? 600 : 700, color: title ? 'var(--text-dark-secondary)' : '#FFF', lineHeight: 1.35 }}>
            {message}
          </span>
        </span>
      </div>
    </div>
  );
}
