'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/db';
import { Bell, Beer, MessageSquare, UserPlus, Calendar, Check } from 'lucide-react';

const ICONS = {
  follow: UserPlus,
  cheers: Beer,
  comment: MessageSquare,
  event_invite: Calendar,
  event_rsvp: Check,
};

function timeAgo(ds) {
  const diff = Date.now() - new Date(ds).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'ora';
  if (mins < 60) return `${mins} min fa`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} ore fa`;
  const days = Math.floor(hrs / 24);
  return `${days} ${days === 1 ? 'giorno' : 'giorni'} fa`;
}

export default function NotificationsPage() {
  const router = useRouter();
  const [notifs, setNotifs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [authed, setAuthed] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const user = await db.getCurrentUser();
        if (!user) { setAuthed(false); setLoading(false); return; }
        const list = await db.getNotifications();
        setNotifs(list);
        await db.markNotificationsRead();
      } catch (err) {
        console.error('Errore notifiche:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '50vh' }}>
        <div className="pulse" style={{ color: 'var(--primary)', fontSize: '18px', fontWeight: 'bold' }}>Carico le notifiche...</div>
      </div>
    );
  }

  if (!authed) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '50px 20px' }}>
        <Bell size={36} color="var(--text-dark-secondary)" style={{ marginBottom: '12px' }} />
        <h2 style={{ fontSize: '20px', fontWeight: 800, marginBottom: '10px' }}>Accedi per vedere le notifiche</h2>
        <Link href="/auth" className="btn btn-primary">Accedi</Link>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '680px', margin: '0 auto', width: '100%' }}>
      <h1 style={{ fontSize: '28px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '10px' }}>
        <Bell size={28} color="var(--primary)" /> Notifiche
      </h1>

      {notifs.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '44px', color: 'var(--text-dark-secondary)' }}>
          Nessuna notifica per ora. Quando qualcuno ti segue, mette Cheers o ti invita a un evento, lo vedrai qui. 🍺
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {notifs.map((n) => {
            const Icon = ICONS[n.type] || Bell;
            return (
              <button
                key={n.id}
                onClick={() => n.link && router.push(n.link)}
                className="card"
                style={{ display: 'flex', alignItems: 'center', gap: '14px', textAlign: 'left', cursor: n.link ? 'pointer' : 'default', padding: '16px' }}
              >
                <div style={{ width: 42, height: 42, borderRadius: '50%', background: 'rgba(255,94,0,0.12)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon size={20} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '14px', color: '#FFF', lineHeight: 1.4 }}>{n.message}</div>
                  <span style={{ fontSize: '12px', color: 'var(--text-dark-secondary)' }}>{timeAgo(n.created_at)}</span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
