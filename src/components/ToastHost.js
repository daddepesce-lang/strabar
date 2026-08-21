'use client';

import { useEffect, useState } from 'react';
import Toast from '@/components/Toast';
import { attachToastHost } from '@/lib/toast';

// Punto unico di rendering dei toast, montato in layout.js sopra a tutte le pagine.
// Sta qui (e non nelle singole pagine) per due motivi:
//  • un toast emesso subito prima di un router.push() non viene smontato a metà;
//  • ogni pagina può chiamare showToast() senza duplicare stato e markup.
// Un toast alla volta: se ne arriva un altro sostituisce il precedente (l'ultimo messaggio
// è sempre quello che conta) e la `key` fa ripartire l'animazione di entrata.
export default function ToastHost() {
  const [toast, setToast] = useState(null);
  const [seq, setSeq] = useState(0);

  useEffect(() => attachToastHost((detail) => {
    setToast(detail);
    setSeq((n) => n + 1);
  }), []);

  if (!toast) return null;
  return <Toast key={seq} {...toast} onClose={() => setToast(null)} />;
}
