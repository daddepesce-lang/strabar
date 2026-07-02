'use client';

import { useEffect, useState } from 'react';
import { Bell, X } from 'lucide-react';
import { db } from '@/lib/db';
import { ensureNotificationPermission } from '@/lib/notify';

const COUNTER_KEY = 'push_reminder_opens';

// Promemoria "attiva le notifiche" per chi non le ha abilitate.
// Tutta la logica di conteggio è LOCALE (localStorage) → nessun costo Supabase per apertura.
// Si mostra solo se: notifiche non concesse dal browser, utente loggato, non in opt-out,
// promemoria abilitati da admin, e sono passate N aperture (N impostabile da admin).
export default function PushReminderGate() {
  const [visible, setVisible] = useState(false);
  const [user, setUser] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (typeof window === 'undefined' || !('Notification' in window)) return;
        // Già attive su questo dispositivo → niente promemoria (e azzera il contatore).
        if (Notification.permission === 'granted') { try { localStorage.removeItem(COUNTER_KEY); } catch {} return; }

        const u = await db.getCurrentUser();
        if (!u || cancelled) return;
        if (u.notif_prefs?.push_reminder === false) return; // l'utente ha scelto di non vederli più

        const cfg = await db.getAppConfig();
        if (!cfg.push_reminder_enabled) return;
        const every = Math.max(1, parseInt(cfg.push_reminder_every) || 3);

        const count = (parseInt(localStorage.getItem(COUNTER_KEY) || '0', 10) || 0) + 1;
        if (count >= every) {
          localStorage.setItem(COUNTER_KEY, '0');
          if (!cancelled) { setUser(u); setVisible(true); }
        } else {
          localStorage.setItem(COUNTER_KEY, String(count));
        }
      } catch { /* noop */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const enable = async () => {
    setBusy(true);
    try {
      const perm = await ensureNotificationPermission();
      if (perm === 'granted') {
        await db.registerPushSubscription().catch(() => {});
      }
    } finally {
      setBusy(false);
      setVisible(false);
    }
  };

  const stopReminders = async () => {
    setVisible(false);
    try {
      if (user) await db.updateProfile(user.id, { notif_prefs: { ...(user.notif_prefs || {}), push_reminder: false } });
    } catch { /* noop */ }
  };

  if (!visible) return null;

  return (
    <div
      style={{
        position: 'fixed', left: 12, right: 12,
        bottom: 'calc(140px + env(safe-area-inset-bottom, 0px))',
        zIndex: 1250, background: 'rgba(22,24,34,0.98)', border: '1px solid var(--primary)',
        borderRadius: 14, boxShadow: '0 8px 30px rgba(0,0,0,0.5), 0 0 18px rgba(255,59,47,0.25)',
        padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12, maxWidth: 520, margin: '0 auto',
      }}
    >
      <div style={{ background: 'rgba(255,59,47,0.12)', color: 'var(--primary)', width: 42, height: 42, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Bell size={22} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <strong style={{ fontSize: 14, color: '#FFF', display: 'block' }}>Attiva le notifiche 🔔</strong>
        <span style={{ fontSize: 12, color: 'var(--text-dark-secondary)' }}>
          Non perderti cheers, commenti, inviti e i promemoria dell&apos;aperitivo.
        </span>
        <button onClick={stopReminders} style={{ display: 'block', marginTop: 4, background: 'none', border: 'none', padding: 0, color: 'var(--text-dark-secondary)', fontSize: 11, textDecoration: 'underline', cursor: 'pointer' }}>
          Non ricordarmelo più
        </button>
      </div>
      <button onClick={enable} disabled={busy} className="btn btn-primary" style={{ borderRadius: 20, padding: '8px 14px', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
        {busy ? '…' : 'Attiva'}
      </button>
      <button onClick={() => setVisible(false)} aria-label="Chiudi" style={{ color: 'var(--text-dark-secondary)', cursor: 'pointer', flexShrink: 0, padding: 4, background: 'none', border: 'none' }}>
        <X size={18} />
      </button>
    </div>
  );
}
