'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Info } from 'lucide-react';

// Piccola (i) accanto ai valori del tasso alcolico.
// Al tocco/click apre un popover che ricorda che i dati sono solo STIME
// e non hanno alcun valore medico o legale.
// Il popover è renderizzato in un PORTAL su document.body e posizionato in
// `fixed` clampato al viewport: così non viene mai tagliato né provoca scroll
// orizzontale, anche dentro contenitori con backdrop-filter/transform (PWA).
export default function BacInfo({ size = 14, color = 'var(--text-dark-secondary)' }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState(null); // { top, left, width }
  const btnRef = useRef(null);
  const popRef = useRef(null);

  useEffect(() => setMounted(true), []);

  const computePos = useCallback(() => {
    const btn = btnRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const margin = 8;
    const vw = window.innerWidth;
    const width = Math.min(240, vw - margin * 2);
    // Centrato sull'icona, ma clampato dentro il viewport.
    let left = rect.left + rect.width / 2 - width / 2;
    left = Math.max(margin, Math.min(left, vw - width - margin));
    setPos({ top: rect.bottom + 8, left, width });
  }, []);

  useEffect(() => {
    if (!open) return;
    computePos();
    const onDown = (e) => {
      if (
        btnRef.current && !btnRef.current.contains(e.target) &&
        popRef.current && !popRef.current.contains(e.target)
      ) {
        setOpen(false);
      }
    };
    const onReflow = () => computePos();
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    window.addEventListener('resize', onReflow);
    window.addEventListener('scroll', onReflow, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      window.removeEventListener('resize', onReflow);
      window.removeEventListener('scroll', onReflow, true);
    };
  }, [open, computePos]);

  return (
    <span style={{ display: 'inline-flex', verticalAlign: 'middle' }}>
      <button
        ref={btnRef}
        type="button"
        onClick={(e) => { e.stopPropagation(); e.preventDefault(); setOpen((v) => !v); }}
        aria-label="Informazioni sul calcolo del tasso alcolico"
        title="I valori sono solo stime, senza valore medico o legale"
        style={{ background: 'none', border: 'none', padding: 0, margin: 0, cursor: 'pointer', color, display: 'inline-flex', alignItems: 'center', lineHeight: 0 }}
      >
        <Info size={size} />
      </button>
      {mounted && open && pos && createPortal(
        <span
          ref={popRef}
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'fixed',
            top: pos.top,
            left: pos.left,
            width: pos.width,
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
            zIndex: 5000,
            textAlign: 'left',
            whiteSpace: 'normal',
          }}
        >
          ⚠️ Valore <strong style={{ color: '#FFF' }}>solo stimato</strong> con la formula di Widmark, a scopo informativo. <strong style={{ color: '#FFF' }}>Non ha alcun valore medico o legale</strong> e non va usato per decidere se metterti alla guida.
        </span>,
        document.body
      )}
    </span>
  );
}
