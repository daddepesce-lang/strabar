'use client';

import { useState, useRef, useEffect } from 'react';
import { Info } from 'lucide-react';

// Piccola (i) accanto ai valori del tasso alcolico.
// Al tocco/click apre un popover che ricorda che i dati sono solo STIME
// e non hanno alcun valore medico o legale.
export default function BacInfo({ size = 14, color = 'var(--text-dark-secondary)' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
    };
  }, [open]);

  return (
    <span ref={ref} style={{ position: 'relative', display: 'inline-flex', verticalAlign: 'middle' }}>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); e.preventDefault(); setOpen((v) => !v); }}
        aria-label="Informazioni sul calcolo del tasso alcolico"
        title="I valori sono solo stime, senza valore medico o legale"
        style={{ background: 'none', border: 'none', padding: 0, margin: 0, cursor: 'pointer', color, display: 'inline-flex', alignItems: 'center', lineHeight: 0 }}
      >
        <Info size={size} />
      </button>
      {open && (
        <span
          onClick={(e) => { e.stopPropagation(); }}
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '240px',
            maxWidth: '70vw',
            background: '#0D0D0D',
            border: '1px solid var(--border-dark)',
            borderRadius: '10px',
            padding: '10px 12px',
            fontSize: '11px',
            lineHeight: 1.5,
            color: 'var(--text-dark-secondary)',
            fontWeight: 400,
            textTransform: 'none',
            letterSpacing: 0,
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            zIndex: 2000,
            textAlign: 'left',
            whiteSpace: 'normal',
          }}
        >
          ⚠️ Valore <strong style={{ color: '#FFF' }}>solo stimato</strong> con la formula di Widmark, a scopo informativo. <strong style={{ color: '#FFF' }}>Non ha alcun valore medico o legale</strong> e non va usato per decidere se metterti alla guida.
        </span>
      )}
    </span>
  );
}
