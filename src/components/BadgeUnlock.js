'use client';

import { useEffect, useState } from 'react';
import { useT } from '@/lib/i18n';
import { BADGE_ICON } from '@/lib/badges';

// Celebrazione a schermo quando si sblocca un badge durante la sessione.
// Coriandoli leggeri (CSS, nessuna libreria/egress), auto-chiusura dopo qualche secondo.
const CONFETTI = ['#FF2000', '#DFFF00', '#10B981', '#3B82F6', '#FF9F1C', '#FFFFFF'];

export default function BadgeUnlock({ badgeId, onClose }) {
  const t = useT();
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const a = setTimeout(() => setLeaving(true), 4200);
    const b = setTimeout(() => onClose?.(), 4600);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, [badgeId, onClose]);

  if (!badgeId) return null;
  const icon = BADGE_ICON[badgeId] || '🏅';

  return (
    <div
      onClick={() => { setLeaving(true); setTimeout(() => onClose?.(), 250); }}
      style={{ position: 'fixed', inset: 0, zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)', animation: leaving ? 'buFade .25s ease forwards' : 'buFade .25s ease reverse', padding: 20 }}
    >
      {/* Coriandoli */}
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
        {Array.from({ length: 28 }).map((_, i) => (
          <span
            key={i}
            style={{
              position: 'absolute', top: '-10px', left: `${(i * 37) % 100}%`,
              width: 8, height: 12, borderRadius: 2,
              background: CONFETTI[i % CONFETTI.length],
              animation: `buConfetti ${1.8 + (i % 5) * 0.35}s linear ${(i % 7) * 0.18}s infinite`,
              opacity: 0.9,
            }}
          />
        ))}
      </div>

      <div
        onClick={(e) => e.stopPropagation()}
        style={{ position: 'relative', width: '100%', maxWidth: 340, textAlign: 'center', background: 'linear-gradient(135deg, rgba(22,24,34,1) 0%, rgba(223,255,0,0.10) 100%)', border: '1px solid rgba(223,255,0,0.45)', borderRadius: 22, padding: '28px 24px', boxShadow: '0 0 40px rgba(223,255,0,0.25)', animation: 'buPop .45s cubic-bezier(.2,1.4,.4,1)' }}
      >
        <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--secondary)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 10 }}>
          {t('badge.unlocked')}
        </div>
        <div style={{ fontSize: 72, lineHeight: 1, marginBottom: 12, animation: 'buBounce 1.2s ease-in-out infinite' }}>{icon}</div>
        <div style={{ fontSize: 22, fontWeight: 900, color: '#FFF', marginBottom: 6 }}>{t(`profile.bdg.${badgeId}.t`)}</div>
        <div style={{ fontSize: 13, color: 'var(--text-dark-secondary)', lineHeight: 1.45, marginBottom: 18 }}>{t(`profile.bdg.${badgeId}.d`)}</div>
        <button
          onClick={() => { setLeaving(true); setTimeout(() => onClose?.(), 250); }}
          className="btn btn-primary"
          style={{ borderRadius: 24, padding: '10px 28px', fontSize: 14, fontWeight: 700 }}
        >
          {t('badge.nice')}
        </button>
      </div>

      <style jsx>{`
        @keyframes buFade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes buPop { 0% { transform: scale(.7); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
        @keyframes buBounce { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
        @keyframes buConfetti { 0% { transform: translateY(-10px) rotate(0deg); } 100% { transform: translateY(105vh) rotate(540deg); } }
      `}</style>
    </div>
  );
}
