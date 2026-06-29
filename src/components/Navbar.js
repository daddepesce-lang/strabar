'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { db } from '@/lib/db';
import { useT } from '@/lib/i18n';
import NavSearch from '@/components/NavSearch';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import {
  Beer, Map, Trophy, Calendar, PlusCircle, Plus, User, Award, LogOut, LogIn, Bell, Share2, Radar, Menu, X, ShieldCheck, Bug, Users, HelpCircle, Store,
} from 'lucide-react';

// Email per le segnalazioni bug (stessa del contatto privacy).
const BUG_EMAIL = 'pesce.davide1995@gmail.com';

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
  const t = useT();
  const [user, setUser] = useState(null);
  const [logoOk, setLogoOk] = useState(true); // mostra /logo.png se presente, altrimenti fallback inline
  const [notifs, setNotifs] = useState([]);
  const [unread, setUnread] = useState(0);
  const [liveCount, setLiveCount] = useState(0);
  const [myLive, setMyLive] = useState(false); // l'utente corrente ha una sessione live attiva?
  const [myVenues, setMyVenues] = useState([]); // locali che gestisco (claim approvati)
  const [notifOpen, setNotifOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false); // foglio "Altro" su mobile
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

  // Badge "X live ora": DISATTIVATO per ora. Il radar parte solo su richiesta
  // dell'utente (dalla pagina Radar), così non genera carico DB in background.
  useEffect(() => {
    setLiveCount(0);
  }, [user?.id, pathname]);

  // La MIA sessione live attiva (per l'indicatore animato nel menu/logo).
  useEffect(() => {
    if (!user) { setMyLive(false); return; }
    let cancelled = false;
    const check = () => {
      if (typeof db.getActiveSession !== 'function') return;
      db.getActiveSession(user.id).then((s) => { if (!cancelled) setMyLive(!!s); }).catch(() => {});
    };
    check();
    const onChange = () => check();
    window.addEventListener('strabar:live-changed', onChange);
    return () => { cancelled = true; window.removeEventListener('strabar:live-changed', onChange); };
  }, [user?.id, pathname]);

  // Locale gestito: se ho un claim approvato, mostro "Il mio locale" nel menu (extra,
  // SENZA togliere nulla dell'esperienza utente normale).
  useEffect(() => {
    if (!user || typeof db.getMyVenueClaims !== 'function') { setMyVenues([]); return; }
    let cancelled = false;
    db.getMyVenueClaims().then((cs) => {
      if (cancelled) return;
      // Tutti i locali APPROVATI (un account può gestirne più di uno).
      const appr = (cs || []).filter((c) => c.status === 'approved');
      const seen = new Set();
      const list = [];
      appr.forEach((c) => { if (!seen.has(c.venue_key)) { seen.add(c.venue_key); list.push({ key: c.venue_key, name: c.venue_name || c.venue_key }); } });
      setMyVenues(list);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [user?.id]);

  const openMyLive = () => {
    if (pathname === '/') window.dispatchEvent(new Event('strabar:open-live'));
    else router.push('/?live=1');
  };

  // Chiudi il foglio "Altro" quando cambia pagina
  useEffect(() => { setMoreOpen(false); }, [pathname]);

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
    if (!n.link) return;
    const m = n.link.match(/activity=([^&]+)/);
    if (m) {
      const id = m[1];
      if (pathname === '/') {
        // Già sulla home: apri il modale senza ricaricare
        window.dispatchEvent(new CustomEvent('strabar:open-activity', { detail: id }));
      } else {
        router.push(`/?activity=${id}`);
      }
    } else {
      router.push(n.link);
    }
  };

  const handleLogout = async () => {
    await db.logout();
    setUser(null);
    window.dispatchEvent(new Event('auth-change'));
    router.push('/auth');
  };

  const navItems = [
    { href: '/', label: t('nav.feed'), icon: Beer },
    { href: '/routes', label: t('nav.routes'), icon: Map },
    { href: '/places', label: t('nav.leaderboards'), icon: Trophy },
    { href: '/groups', label: t('nav.leagues'), icon: Users },
    { href: '/events', label: t('nav.events'), icon: Calendar },
    { href: '/live', label: t('nav.radar'), icon: Radar },
    { href: '/log', label: t('nav.register'), icon: PlusCircle },
    { href: '/profile', label: t('nav.profile'), icon: User },
  ];

  const isActive = (href) => (href === '/' ? pathname === '/' : pathname.startsWith(href));

  // Voce "locale" nel menu: un solo locale → link diretto alla gestione; più locali → pagina elenco.
  const venueHref = myVenues.length === 1 ? `/locale/${encodeURIComponent(myVenues[0].key)}/gestione` : '/locale';
  const venueLabel = myVenues.length > 1 ? t('nav.myVenues') : t('nav.myVenue');

  return (
    <>
      <nav className="navbar">
        <Link href="/" className="nav-brand" aria-label="Strabar — home">
          {logoOk ? (
            // Logo ufficiale (wordmark). Salva il file in public/logo.png.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src="/logo.png"
              alt="Strabar"
              className="nav-logo-img"
              style={{ height: '30px', width: 'auto', display: 'block' }}
              onError={() => setLogoOk(false)}
            />
          ) : (
            // Fallback pulito finché il file non c'è: mark rosso + testo.
            <>
              <svg className="nav-logo-mark" viewBox="0 0 512 512" aria-hidden="true">
                <rect width="512" height="512" rx="120" fill="#FF2000" />
                <g fill="none" stroke="#0D0D0D" strokeWidth="72" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M368 182 C368 130 306 120 256 142 C194 169 194 232 268 254" />
                  <path d="M144 330 C144 382 206 392 256 370 C318 343 318 280 244 258" />
                </g>
              </svg>
              stra<span>bar</span>
            </>
          )}
        </Link>

        {/* Indicatore "in diretta": piccolo pallino pulsante accanto al logo.
            Appare se TU hai una diretta in corso. Tocca per aprire il pannello live. */}
        {myLive && (
          <button
            type="button"
            onClick={openMyLive}
            aria-label="Apri la tua diretta"
            title="Sei in diretta"
            className="pulse"
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginLeft: '6px', padding: 0, width: '12px', height: '12px', borderRadius: '50%', border: 'none', background: 'var(--primary)', boxShadow: '0 0 8px rgba(255,32,0,0.7)', cursor: 'pointer', flexShrink: 0 }}
          />
        )}

        {/* Menu app completo solo per utenti loggati. Sulla landing (visitatore)
            la barra resta pulita: logo + Accedi/Registrati. */}
        {user && (
          <div className="nav-links">
            {navItems.map(({ href, label, icon: Icon }) => {
              const isReg = href === '/log';
              return (
                <Link
                  key={href}
                  href={href}
                  prefetch={false}
                  className={isReg ? `nav-link-register` : `nav-link ${isActive(href) ? 'active' : ''}`}
                >
                  <Icon size={18} />
                  {label}
                </Link>
              );
            })}
            {myVenues.length > 0 && (
              <Link href={venueHref} prefetch={false} className={`nav-link ${pathname.startsWith('/locale') ? 'active' : ''}`}>
                <Store size={18} />
                {venueLabel}
              </Link>
            )}
          </div>
        )}

        <div className="nav-actions">
          {/* Cerca atleti: tendina con anteprima + pagina /search */}
          {user && <NavSearch />}

          {/* Invita amici: sempre raggiungibile dalla barra in alto */}
          <Link href="/install" prefetch={false} className={`action-btn ${isActive('/install') ? 'active' : ''}`} title="Invita amici / Installa app">
            <Share2 size={20} />
          </Link>

          {/* Admin: visibile solo agli amministratori */}
          {user?.is_admin && (
            <Link href="/admin" prefetch={false} className={`action-btn ${isActive('/admin') ? 'active' : ''}`} title="Dashboard amministratore">
              <ShieldCheck size={20} />
            </Link>
          )}

          {user && (
            <div className="notif-wrapper" ref={notifRef}>
              <button onClick={toggleNotifs} className="action-btn" title="Notifiche" style={{ position: 'relative' }}>
                <Bell size={20} />
                {unread > 0 && <span className="notif-badge">{unread > 9 ? '9+' : unread}</span>}
              </button>

              {notifOpen && (
                <div className="notif-dropdown">
                  <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-dark)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong style={{ fontSize: '14px' }}>{t('nav.notifications')}</strong>
                    <Link href="/notifications" onClick={() => setNotifOpen(false)} style={{ fontSize: '12px', color: 'var(--primary)', fontWeight: 600 }}>
                      {t('nav.seeAll')}
                    </Link>
                  </div>
                  {notifs.length === 0 ? (
                    <div style={{ padding: '30px 16px', textAlign: 'center', color: 'var(--text-dark-secondary)', fontSize: '13px' }}>
                      {t('nav.noNotifs')}
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
                          background: n.read ? 'transparent' : 'rgba(255, 32, 0,0.06)',
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

          <LanguageSwitcher compact />

          {user ? (
            <>
              {user.is_premium ? (
                <span className="badge-premium">
                  <Award size={12} />
                  <span className="badge-premium-label">{t('nav.premiumBadge')}</span>
                </span>
              ) : (
                <Link href="/premium" className="btn btn-premium btn-sm" style={{ padding: '6px 14px', fontSize: '12px' }}>
                  {t('nav.goPremium')}
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
            <>
              <Link href="/auth" className="nav-link" style={{ fontWeight: 600 }}>
                <LogIn size={16} />
                {t('nav.login')}
              </Link>
              <Link href="/auth" className="btn btn-primary" style={{ padding: '8px 18px', fontSize: '14px', borderRadius: '20px' }}>
                {t('nav.signup')}
              </Link>
            </>
          )}
        </div>
      </nav>

      {/* Bottom navigation per mobile — 5 slot (i meno usati nel foglio "Altro").
          Nascosta se non loggato o su accesso/installazione. */}
      {user && !pathname.startsWith('/auth') && !pathname.startsWith('/install') && (
      <>
      <nav className="mobile-nav">
        <Link
          href="/"
          className={isActive('/') ? 'active' : ''}
          onClick={(e) => {
            // Se sei già sul feed: torna in cima e aggiorna (non ricaricare la rotta).
            if (pathname === '/') {
              e.preventDefault();
              window.scrollTo({ top: 0, behavior: 'smooth' });
              window.dispatchEvent(new Event('strabar:feed-refresh'));
            }
          }}
        >
          <Beer size={20} />
          {t('nav.feed')}
        </Link>
        <Link href="/places" className={isActive('/places') ? 'active' : ''}>
          <Trophy size={20} />
          {t('nav.leaderboards')}
        </Link>
        <Link href="/log" aria-label={t('nav.register')} className={`mn-register ${isActive('/log') ? 'active' : ''} ${myLive ? 'live' : ''}`}>
          <span className="mn-register-fab"><Plus size={26} strokeWidth={2.6} /></span>
          <span className="mn-register-label">{t('nav.register')}</span>
        </Link>
        <Link href="/routes" className={isActive('/routes') ? 'active' : ''}>
          <Map size={20} />
          {t('nav.routes')}
        </Link>
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          className={['/events', '/live', '/premium', '/profile', '/groups'].some((p) => pathname.startsWith(p)) ? 'active' : ''}
        >
          <Menu size={20} />
          {t('nav.more')}
        </button>
      </nav>

      {/* Foglio "Altro": destinazioni secondarie + azioni account */}
      {moreOpen && (
        <div className="more-sheet-backdrop" onClick={() => setMoreOpen(false)}>
          <div className="more-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="more-sheet-handle" />
            <div className="more-sheet-head">
              <strong>{t('nav.menu')}</strong>
              <button type="button" onClick={() => setMoreOpen(false)} aria-label="Chiudi"><X size={20} /></button>
            </div>
            <div className="more-sheet-grid">
              <Link href="/profile" className={isActive('/profile') ? 'active' : ''}><User size={22} /><span>{t('nav.profile')}</span></Link>
              <Link href="/groups" className={isActive('/groups') ? 'active' : ''}><Users size={22} /><span>{t('nav.leagues')}</span></Link>
              <Link href="/live" className={isActive('/live') ? 'active' : ''}><Radar size={22} /><span>{t('nav.radar')}</span></Link>
              <Link href="/events" className={isActive('/events') ? 'active' : ''}><Calendar size={22} /><span>{t('nav.events')}</span></Link>
              <Link href="/install" className={isActive('/install') ? 'active' : ''}><Share2 size={22} /><span>{t('nav.invite')}</span></Link>
              {!user.is_premium && (
                <Link href="/premium" className={isActive('/premium') ? 'active' : ''}><Award size={22} /><span>{t('nav.premiumBadge')}</span></Link>
              )}
              {user.is_admin && (
                <Link href="/admin" className={isActive('/admin') ? 'active' : ''}><ShieldCheck size={22} /><span>{t('nav.admin')}</span></Link>
              )}
              <button type="button" onClick={() => { setMoreOpen(false); window.dispatchEvent(new Event('strabar:open-guide')); }}><HelpCircle size={22} /><span>{t('nav.howItWorks')}</span></button>
              <a href={`mailto:${BUG_EMAIL}?subject=${encodeURIComponent('Strabar — Segnalazione bug')}&body=${encodeURIComponent('Descrivi il problema (cosa facevi, cosa è successo):\n\n\n— Dispositivo/browser:\n')}`}><Bug size={22} /><span>{t('nav.reportBug')}</span></a>
              {myVenues.length > 0
                ? <Link href={venueHref} className={isActive('/locale') ? 'active' : ''}><Store size={22} /><span>{venueLabel}</span></Link>
                : <Link href="/business" className={isActive('/business') ? 'active' : ''}><Store size={22} /><span>{t('nav.areYouVenue')}</span></Link>}
              <button type="button" onClick={handleLogout}><LogOut size={22} /><span>{t('nav.logout')}</span></button>
            </div>
            <div style={{ padding: '14px 16px 4px' }}>
              <LanguageSwitcher />
            </div>
          </div>
        </div>
      )}
      </>
      )}
    </>
  );
}
