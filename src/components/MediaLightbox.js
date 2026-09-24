'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useT } from '@/lib/i18n';

// Slideshow a tutto schermo per le foto di una sessione. Leggero: monta solo l'immagine
// corrente (le altre non vengono scaricate finché non ci si arriva → egress minimo).
export default function MediaLightbox({ images = [], startIndex = 0, onClose, footer = null }) {
  const t = useT();
  const boxRef = useRef(null);
  const [i, setI] = useState(startIndex);
  const n = images.length;

  const prev = useCallback(() => setI((v) => (v - 1 + n) % n), [n]);
  const next = useCallback(() => setI((v) => (v + 1) % n), [n]);

  useEffect(() => {
    const opener = document.activeElement;
    boxRef.current?.querySelector('button')?.focus({ preventScroll: true });
    return () => { if (opener?.isConnected) opener.focus({ preventScroll: true }); };
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
      else if (e.key === 'ArrowLeft') prev();
      else if (e.key === 'ArrowRight') next();
      else if (e.key === 'Tab') {
        const buttons = [...boxRef.current.querySelectorAll('button, a[href], [tabindex="0"]')];
        const first = buttons[0];
        const last = buttons.at(-1);
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [prev, next, onClose]);

  if (n === 0) return null;

  return (
    <div
      ref={boxRef}
      className="media-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={t('feed.photoBadge')}
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 3000, background: 'rgba(0,0,0,0.92)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <button onClick={(e) => { e.stopPropagation(); onClose?.(); }} aria-label={t('common.close')}
        style={{ position: 'absolute', top: 'calc(12px + var(--sa-top))', right: 'max(16px, var(--sa-right))', background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: '50%', width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FFF', cursor: 'pointer' }}>
        <X size={22} />
      </button>

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={images[i]}
        alt={`Foto ${i + 1} di ${n}`}
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '100%', maxHeight: '85vh', objectFit: 'contain', borderRadius: 12 }}
      />

      {n > 1 && (
        <>
          <button onClick={(e) => { e.stopPropagation(); prev(); }} aria-label={t('session.previousPhoto')}
            style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: '50%', width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FFF', cursor: 'pointer' }}>
            <ChevronLeft size={26} />
          </button>
          <button onClick={(e) => { e.stopPropagation(); next(); }} aria-label={t('session.nextPhoto')}
            style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: '50%', width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FFF', cursor: 'pointer' }}>
            <ChevronRight size={26} />
          </button>
          <div style={{ position: 'absolute', bottom: footer ? 'max(64px, calc(env(safe-area-inset-bottom) + 56px))' : 'max(20px, env(safe-area-inset-bottom))', left: 0, right: 0, textAlign: 'center', color: '#FFF', fontSize: 13, fontWeight: 600 }}>
            {i + 1} / {n}
          </div>
        </>
      )}

      {footer && (
        <div onClick={(e) => e.stopPropagation()} style={{ position: 'absolute', bottom: 'max(16px, env(safe-area-inset-bottom))', left: 0, right: 0, display: 'flex', justifyContent: 'center' }}>
          {footer}
        </div>
      )}
    </div>
  );
}
