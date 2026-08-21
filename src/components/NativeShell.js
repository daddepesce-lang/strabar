'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Attiva i comportamenti nativi (deep link, tasto indietro, safe area, push) SOLO quando
// l'app gira dentro il guscio Capacitor.
//
// Il controllo su `window.Capacitor` è fatto inline, senza import: tutta la logica vive in
// `@/lib/native-shell`, caricata con un import dinamico. Così il chunk nativo NON viene mai
// scaricato dai browser — chi apre strabar.app dal web riceve gli stessi byte di prima.
export default function NativeShell() {
  const router = useRouter();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!window.Capacitor?.isNativePlatform?.()) return;

    let stop = null;
    let cancelled = false;
    import('@/lib/native-shell')
      .then((mod) => {
        if (cancelled) return;
        stop = mod.startNativeShell({ navigate: (path) => router.push(path) });
      })
      .catch((err) => console.warn('Guscio nativo non avviato:', err));

    return () => {
      cancelled = true;
      if (typeof stop === 'function') stop();
    };
  }, [router]);

  return null;
}
