'use client';

import { useEffect, useState, useCallback } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

// Slideshow a tutto schermo per le foto di una sessione. Leggero: monta solo l'immagine
// corrente (le altre non vengono scaricate finché non ci si arriva → egress minimo).
export default function MediaLightbox({ images = [], startIndex = 0, onClose, footer = null }) {
  const [i, setI] = useState(startIndex);
  const n = images.length;

  const prev = useCallback(() => setI((v) => (v - 1 + n) % n), [n]);
  const next = useCallback(() => setI((v) => (v + 1) % n), [n]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
      else if (e.key === 'ArrowLeft') prev();
      else if (e.key === 'ArrowRight') next();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [prev, next, onClose]);

  if (n === 0) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.92)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <button onClick={(e) => { e.stopPropagation(); onClose?.(); }} aria-label="Chiudi"
        style={{ position: 'absolute', top: 'max(16px, env(safe-area-inset-top))', right: 16, background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: '50%', width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FFF', cursor: 'pointer' }}>
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
          <button onClick={(e) => { e.stopPropagation(); prev(); }} aria-label="Precedente"
            style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: '50%', width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FFF', cursor: 'pointer' }}>
            <ChevronLeft size={26} />
          </button>
          <button onClick={(e) => { e.stopPropagation(); next(); }} aria-label="Successiva"
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
