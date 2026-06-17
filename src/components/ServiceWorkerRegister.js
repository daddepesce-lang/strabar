'use client';

import { useEffect } from 'react';

// Registra il service worker per rendere Strabar installabile e funzionante offline (PWA).
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    // Registra solo in produzione: in dev il service worker interferisce con l'HMR di Next.
    if (process.env.NODE_ENV !== 'production') return;

    const onLoad = () => {
      navigator.serviceWorker
        .register('/sw.js')
        .catch((err) => console.warn('Registrazione service worker fallita:', err));
    };
    window.addEventListener('load', onLoad);
    return () => window.removeEventListener('load', onLoad);
  }, []);

  return null;
}
