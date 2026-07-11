'use client';

import { useEffect } from 'react';

// Registra il service worker per rendere Strabar installabile e funzionante offline (PWA).
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    // Registra solo in produzione: in dev il service worker interferisce con l'HMR di Next.
    if (process.env.NODE_ENV !== 'production') return;

    // Se all'avvio c'è già un controller, questo NON è il primo install: un successivo
    // controllerchange = è arrivata una versione nuova → ricarichiamo per eseguirla.
    // (Sul primo install il controller è null → niente reload inutile.)
    const hadController = !!navigator.serviceWorker.controller;
    let refreshing = false;
    const onControllerChange = () => {
      if (refreshing || !hadController) return;
      refreshing = true;
      window.location.reload();
    };

    let reg = null;
    const checkForUpdate = () => { if (reg) reg.update().catch(() => {}); };
    // iOS tiene viva la PWA al resume senza ricaricare: al ritorno in foreground controlliamo
    // se c'è un service worker nuovo (→ install → skipWaiting → controllerchange → reload).
    const onVisibility = () => { if (document.visibilityState === 'visible') checkForUpdate(); };
    let interval = null;

    const onLoad = () => {
      navigator.serviceWorker
        .register('/sw.js')
        .then((registration) => {
          reg = registration;
          checkForUpdate();
          interval = setInterval(checkForUpdate, 60 * 60 * 1000); // ogni ora mentre è aperta
        })
        .catch((err) => console.warn('Registrazione service worker fallita:', err));
    };

    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('load', onLoad);
    return () => {
      window.removeEventListener('load', onLoad);
      document.removeEventListener('visibilitychange', onVisibility);
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      if (interval) clearInterval(interval);
    };
  }, []);

  return null;
}
