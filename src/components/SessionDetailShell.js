'use client';

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

// Fuori dal feed: nessun blur/transform degli antenati può alterare il viewport fixed.
export default function SessionDetailShell({ children, header, onClose, suspended = false }) {
  const panelRef = useRef(null);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);

  useEffect(() => {
    const opener = document.activeElement;
    const y = window.scrollY;
    const body = document.body;
    const saved = Object.fromEntries(['position', 'top', 'width', 'overflow'].map((key) => [key, body.style[key]]));
    Object.assign(body.style, { position: 'fixed', top: `-${y}px`, width: '100%', overflow: 'hidden' });
    panelRef.current?.querySelector('[data-session-close]')?.focus({ preventScroll: true });
    return () => {
      Object.assign(body.style, saved);
      window.scrollTo({ top: y, behavior: 'instant' });
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    if (suspended) return;
    const onKey = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeRef.current();
      }
      if (event.key !== 'Tab') return;
      const items = [...panelRef.current.querySelectorAll('a[href], button:not([disabled]), input, textarea, select, summary, [tabindex="0"]')]
        .filter((el) => el.getClientRects().length && el.tabIndex >= 0);
      const first = items[0];
      const last = items.at(-1);
      if (event.shiftKey && (document.activeElement === first || !panelRef.current.contains(document.activeElement))) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !panelRef.current.contains(document.activeElement))) {
        event.preventDefault(); first?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [suspended]);

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="session-detail-layer" onClick={(event) => { if (event.target === event.currentTarget && !suspended) onClose(); }}>
      <section ref={panelRef} className="session-detail" role="dialog" aria-modal="true" aria-labelledby="session-detail-title">
        <header className="session-detail-header">{header}</header>
        <div className="session-detail-scroll">{children}</div>
      </section>
    </div>,
    document.body,
  );
}
