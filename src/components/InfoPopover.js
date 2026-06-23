'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Info } from 'lucide-react';

// Popover informativo generico: una (i) cliccabile che apre un riquadro con contenuto
// libero (children). Stessa logica di posizionamento di BacInfo: renderizzato in un PORTAL
// su document.body e posizionato in `fixed` clampato al viewport, così non viene mai
// tagliato né provoca scroll orizzontale, anche dentro contenitori con backdrop-filter/
// transform (PWA). Per contenuti lunghi il riquadro diventa scrollabile.
export default function InfoPopover({
  children,
  size = 16,
  color = 'var(--primary)',
  maxWidth = 340,
  label = 'Maggiori informazioni',
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null); // { top, left, width }
  const btnRef = useRef(null);
  const popRef = useRef(null);

  const computePos = useCallback(() => {
    const btn = btnRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const margin = 8;
    const vw = window.innerWidth;
    const width = Math.min(maxWidth, vw - margin * 2);
    let left = rect.left + rect.width / 2 - width / 2;
    left = Math.max(margin, Math.min(left, vw - width - margin));
    setPos({ top: rect.bottom + 8, left, width });
  }, [maxWidth]);

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
        aria-label={label}
        title={label}
        style={{ background: 'none', border: 'none', padding: 0, margin: 0, cursor: 'pointer', color, display: 'inline-flex', alignItems: 'center', lineHeight: 0 }}
      >
        <Info size={size} />
      </button>
      {open && pos && typeof document !== 'undefined' && createPortal(
        <span
          ref={popRef}
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'fixed',
            top: pos.top,
            left: pos.left,
            width: pos.width,
            maxHeight: '64vh',
            overflowY: 'auto',
            background: '#0D0D0D',
            border: '1px solid var(--border-dark)',
            borderRadius: '12px',
            padding: '14px 16px',
            fontSize: '12px',
            lineHeight: 1.55,
            color: 'var(--text-dark-secondary)',
            fontWeight: 400,
            textTransform: 'none',
            letterSpacing: 0,
            boxShadow: '0 10px 30px rgba(0,0,0,0.6)',
            zIndex: 5000,
            textAlign: 'left',
            whiteSpace: 'normal',
            display: 'block',
          }}
        >
          {children}
        </span>,
        document.body
      )}
    </span>
  );
}
