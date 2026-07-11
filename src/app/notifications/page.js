'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/db';
import { useT } from '@/lib/i18n';
import { Bell, Beer, MessageSquare, UserPlus, Calendar, Check, AtSign, Reply } from 'lucide-react';

const ICONS = {
  follow: UserPlus,
  cheers: Beer,
  comment_cheers: Beer,
  comment: MessageSquare,
  comment_reply: Reply,
  mention: AtSign,
  session_tag: AtSign,
  event_invite: Calendar,
  event_rsvp: Check,
};

// Colore accento per tipo di notifica
const TYPE_COLOR = {
  follow: '#3B82F6',
  cheers: 'var(--primary)',
  comment_cheers: 'var(--primary)',
  comment: '#10B981',
  comment_reply: '#10B981',
  mention: '#8B5CF6',
  session_tag: '#8B5CF6',
  event_invite: 'var(--secondary)',
  event_rsvp: '#10B981',
};

function timeAgo(ds, t) {
  const diff = Date.now() - new Date(ds).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return t('notifpage.now');
  if (mins < 60) return t('notifpage.minAgo', { mins });
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return t('notifpage.hoursAgo', { hrs });
  const days = Math.floor(hrs / 24);
  return days === 1 ? t('notifpage.dayAgo', { days }) : t('notifpage.daysAgo', { days });
}

export default function NotificationsPage() {
  const t = useT();
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
        <div className="pulse" style={{ color: 'var(--primary)', fontSize: '18px', fontWeight: 'bold' }}>{t('notifpage.loading')}</div>
      </div>
    );
  }

  if (!authed) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '50px 20px' }}>
        <Bell size={36} color="var(--text-dark-secondary)" style={{ marginBottom: '12px' }} />
        <h2 style={{ fontSize: '20px', fontWeight: 800, marginBottom: '10px' }}>{t('notifpage.loginPrompt')}</h2>
        <Link href="/auth" className="btn btn-primary">{t('notifpage.login')}</Link>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '680px', margin: '0 auto', width: '100%' }}>
      <h1 style={{ fontSize: '28px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '10px' }}>
        <Bell size={28} color="var(--primary)" /> {t('notifpage.title')}
      </h1>

      {notifs.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '44px', color: 'var(--text-dark-secondary)' }}>
          {t('notifpage.empty')}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {notifs.map((n) => {
            const Icon = ICONS[n.type] || Bell;
            const color = TYPE_COLOR[n.type] || 'var(--primary)';
            return (
              <button
                key={n.id}
                onClick={() => n.link && router.push(n.link)}
                className="card"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '14px',
                  textAlign: 'left',
                  cursor: n.link ? 'pointer' : 'default',
                  padding: '14px 16px',
                  background: n.read ? 'var(--bg-card-dark)' : 'rgba(255, 59, 47,0.06)',
                  borderColor: n.read ? 'var(--border-dark)' : 'rgba(255, 59, 47,0.35)',
                }}
              >
                {/* Avatar attore con badge tipo */}
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <div className="activity-avatar" style={{ width: 46, height: 46, fontSize: 18 }}>
                    {(n.actor_name || 'S').charAt(0).toUpperCase()}
                  </div>
                  <div style={{ position: 'absolute', bottom: -2, right: -2, width: 22, height: 22, borderRadius: '50%', background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid var(--bg-card-dark)' }}>
                    <Icon size={12} color="#fff" />
                  </div>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '14px', color: '#FFF', lineHeight: 1.4, overflowWrap: 'anywhere' }}>{n.message}</div>
                  <span style={{ fontSize: '12px', color: 'var(--text-dark-secondary)' }}>{timeAgo(n.created_at, t)}</span>
                </div>
                {!n.read && (
                  <span style={{ width: 9, height: 9, borderRadius: '50%', background: 'var(--primary)', flexShrink: 0 }} />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
