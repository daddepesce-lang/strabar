'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { MapPin } from 'lucide-react';

const RouteMap = dynamic(() => import('@/components/RouteMap'), { ssr: false });

// Monta la mappa Leaflet SOLO quando il contenitore entra (o sta per entrare) nel viewport.
// Così nel feed le card mai scrollate non scaricano né il chunk di Leaflet né le tile della
// mappa → meno banda/egress. Prima di entrare in vista mostra un placeholder leggero.
export default function LazyMap({ height = '170px', ...props }) {
  const ref = useRef(null);
  // Se il browser non supporta IntersectionObserver (molto raro), mostra subito la mappa.
  const [show, setShow] = useState(() => typeof IntersectionObserver === 'undefined');

  useEffect(() => {
    const el = ref.current;
    if (!el || show) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) { setShow(true); io.disconnect(); }
      },
      { rootMargin: '250px' } // pre-carica poco prima che sia visibile
    );
    io.observe(el);
    return () => io.disconnect();
  }, [show]);

  return (
    <div ref={ref} style={{ height, width: '100%' }}>
      {show ? (
        <RouteMap height="100%" {...props} />
      ) : (
        <div style={{
          height: '100%', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'var(--bg-input-dark)', color: 'var(--text-dark-secondary)',
          border: '1px solid var(--border-dark)', borderRadius: '16px',
        }}>
          <MapPin size={20} />
        </div>
      )}
    </div>
  );
}
