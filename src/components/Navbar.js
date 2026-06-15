'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { db } from '@/lib/db';
import {
  Beer, Map, Trophy, Calendar, PlusCircle, User, Award, LogOut, LogIn, Bell,
} from 'lucide-react';

function timeAgo(dateString) {
  const diff = Date.now() - new Date(dateString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'ora';
  if (mins < 60) return `${mins}m fa`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h fa`;
  return `${Math.floor(hrs / 24)}g fa`;
}

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [notifs, setNotifs] = useState([]);
  const [unread, setUnread] = useState(0);
  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef(null);

  useEffect(() => {
    const checkUser = async () => {
      try {
        const currentUser = await db.getCurrentUser();
        setUser(currentUser);
      } catch (err) {
        console.error("Errore nel caricamento dell'utente:", err);
      }
    };
    checkUser();

    const handleAuthChange = () => checkUser();
    window.addEventListener('auth-change', handleAuthChange);
    return () => window.removeEventListener('auth-change', handleAuthChange);
  }, [pathname]);

  // Notifiche
  useEffect(() => {
    const loadNotifs = async () => {
      try {
        const count = await db.getUnreadCount();
        setUnread(count);
      } catch {
        /* noop */
      }
    };
    loadNotifs();
    const handler = () => loadNotifs();
    window.addEventListener('notifications-change', handler);
    window.addEventListener('auth-change', handler);
    return () => {
      window.removeEventListener('notifications-change', handler);
      window.removeEventListener('auth-change', handler);
    };
  }, [user?.id, pathname]);

  // Chiudi dropdown cliccando fuori
  useEffect(() => {
    const onClick = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target)) {
        setNotifOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const toggleNotifs = async () => {
    const next = !notifOpen;
    setNotifOpen(next);
    if (next) {
      const list = await db.getNotifications();
      setNotifs(list);
      await db.markNotificationsRead();
      setUnread(0);
    }
  };

  const handleNotifClick = (n) => {
    setNotifOpen(false);
    if (n.link) router.push(n.link);
  };

  const handleLogout = async () => {
    await db.logout();
    setUser(null);
    window.dispatchEvent(new Event('auth-change'));
    router.push('/auth');
  };

  const navItems = [
    { href: '/', label: 'Feed', icon: Beer },
    { href: '/routes', label: 'Percorsi', icon: Map },
    { href: '/places', label: 'Classifiche', icon: Trophy },
    { href: '/events', label: 'Eventi', icon: Calendar },
    { href: '/log', label: 'Registra', icon: PlusCircle },
    { href: '/profile', label: 'Profilo', icon: User },
  ];

  const isActive = (href) => (href === '/' ? pathname === '/' : pathname.startsWith(href));

  return (
    <>
      <nav className="navbar">
        <Link href="/" className="nav-brand">
          <Beer size={28} fill="#FF5E00" color="#FF5E00" />
          STRA<span>BAR</span>
        </Link>

        <div className="nav-links">
          {navItems.map(({ href, label, icon: Icon }) => {
            const isReg = href === '/log';
            return (
              <Link
                key={href}
                href={href}
                className={isReg ? `nav-link-register` : `nav-link ${isActive(href) ? 'active' : ''}`}
              >
                <Icon size={18} />
                {label}
              </Link>
            );
          })}
        </div>

        <div className="nav-actions">
          {/* Eventi: raggiungibile dalla barra superiore su mobile */}
          <Link href="/events" className={`action-btn nav-action-mobile ${isActive('/events') ? 'active' : ''}`} title="Eventi">
            <Calendar size={20} />
          </Link>

          {user && (
            <div className="notif-wrapper" ref={notifRef}>
              <button onClick={toggleNotifs} className="action-btn" title="Notifiche" style={{ position: 'relative' }}>
                <Bell size={20} />
                {unread > 0 && <span className="notif-badge">{unread > 9 ? '9+' : unread}</span>}
              </button>

              {notifOpen && (
                <div className="notif-dropdown">
                  <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-dark)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong style={{ fontSize: '14px' }}>Notifiche</strong>
                    <Link href="/notifications" onClick={() => setNotifOpen(false)} style={{ fontSize: '12px', color: 'var(--primary)', fontWeight: 600 }}>
                      Vedi tutte
                    </Link>
                  </div>
                  {notifs.length === 0 ? (
                    <div style={{ padding: '30px 16px', textAlign: 'center', color: 'var(--text-dark-secondary)', fontSize: '13px' }}>
                      Nessuna notifica per ora 🍺
                    </div>
                  ) : (
                    notifs.slice(0, 8).map((n) => (
                      <button
                        key={n.id}
                        onClick={() => handleNotifClick(n)}
                        style={{
                          width: '100%', textAlign: 'left', padding: '12px 16px',
                          borderBottom: '1px solid var(--border-dark)', cursor: 'pointer',
                          display: 'flex', gap: '10px', alignItems: 'flex-start',
                          background: n.read ? 'transparent' : 'rgba(255,94,0,0.06)',
                        }}
                      >
                        <div className="activity-avatar" style={{ width: 32, height: 32, fontSize: 13, flexShrink: 0 }}>
                          {(n.actor_name || 'S').charAt(0)}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: '13px', color: '#FFF', lineHeight: 1.35 }}>{n.message}</div>
                          <span style={{ fontSize: '11px', color: 'var(--text-dark-secondary)' }}>{timeAgo(n.created_at)}</span>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          )}

          {user ? (
            <>
              {user.is_premium ? (
                <span className="badge-premium">
                  <Award size={12} />
                  Premium
                </span>
              ) : (
                <Link href="/premium" className="btn btn-premium btn-sm" style={{ padding: '6px 14px', fontSize: '12px' }}>
                  Passa a Premium
                </Link>
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span className="nav-user-name" style={{ fontSize: '14px', fontWeight: '500', color: '#FFF' }}>
                  {user.display_name}
                </span>
                <button onClick={handleLogout} className="action-btn" title="Esci">
                  <LogOut size={18} />
                </button>
              </div>
            </>
          ) : (
            <Link href="/auth" className="btn btn-primary" style={{ padding: '8px 16px', fontSize: '14px', borderRadius: '20px' }}>
              <LogIn size={16} />
              Accedi
            </Link>
          )}
        </div>
      </nav>

      {/* Bottom navigation per mobile */}
      <nav className="mobile-nav">
        <Link href="/" className={isActive('/') ? 'active' : ''}>
          <Beer size={20} />
          Feed
        </Link>
        <Link href="/routes" className={isActive('/routes') ? 'active' : ''}>
          <Map size={20} />
          Percorsi
        </Link>
        <Link href="/log" className={`mn-register ${isActive('/log') ? 'active' : ''}`}>
          <PlusCircle size={24} />
          Registra
        </Link>
        <Link href="/places" className={isActive('/places') ? 'active' : ''}>
          <Trophy size={20} />
          Classifiche
        </Link>
        <Link href="/profile" className={isActive('/profile') ? 'active' : ''}>
          <User size={20} />
          Profilo
        </Link>
      </nav>
    </>
  );
}
