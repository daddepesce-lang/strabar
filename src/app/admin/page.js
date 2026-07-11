'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { db } from '@/lib/db';
import { Loader, Users, Beer, MapPin, TrendingUp, ShieldCheck, UserPlus, UserCheck, LayoutGrid, Lock, Store, Bell, Megaphone } from 'lucide-react';
import NotificationsAdmin from './NotificationsAdmin';
import BannersAdmin from './BannersAdmin';
import UsersAdmin from './UsersAdmin';
import GdprAdmin from './GdprAdmin';
import DrinksAdmin from './DrinksAdmin';
import VenuesAdmin from './VenuesAdmin';
import VenuesMapAdmin from './VenuesMapAdmin';
import VenuesBusinessAdmin from './VenuesBusinessAdmin';

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', Icon: LayoutGrid },
  { id: 'utenti', label: 'Utenti', Icon: Users },
  { id: 'gdpr', label: 'GDPR', Icon: Lock },
  { id: 'drink', label: 'Drink', Icon: Beer },
  { id: 'locali', label: 'Locali', Icon: MapPin },
  { id: 'mappa', label: 'Mappa bevute', Icon: MapPin },
  { id: 'business', label: 'Area locali', Icon: Store },
  { id: 'notifiche', label: 'Notifiche', Icon: Bell },
  { id: 'banner', label: 'Banner', Icon: Megaphone },
];

/* Layout responsive sidebar/tab: le media query non sono esprimibili inline,
   quindi vivono in questo blocco di stile locale alla pagina admin. */
const ADMIN_LAYOUT_CSS = `
.adm-shell { display: flex; align-items: stretch; gap: 0; max-width: 1240px; margin: 0 auto; width: 100%; }
.adm-sidebar { display: none; }
.adm-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 22px; }
@media (min-width: 900px) {
  .adm-sidebar {
    display: flex;
    flex-direction: column;
    width: 210px;
    flex: 0 0 210px;
    background: #111116;
    border-right: 1px solid var(--border-dark);
    padding: 20px 12px;
    align-self: stretch;
    min-height: calc(100vh - 160px);
    position: sticky;
    top: 90px;
    max-height: calc(100vh - 110px);
    overflow-y: auto;
  }
  .adm-main { padding-left: 26px; }
  .adm-mobile-tabs { display: none; }
}
`;

function SidebarItem({ item, active, onClick }) {
  const { Icon, label } = item;
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, width: '100%',
        padding: '10px 12px', borderRadius: 10, border: 'none', cursor: 'pointer',
        textAlign: 'left',
        background: active ? 'linear-gradient(135deg, rgba(255,59,47,.16), rgba(255,59,47,.05))' : 'transparent',
        color: active ? '#fff' : 'var(--text-dark-secondary)',
        fontSize: 13, fontWeight: active ? 700 : 600, fontFamily: 'inherit',
        transition: 'var(--transition)',
      }}
    >
      <Icon size={16} color={active ? 'var(--primary)' : 'var(--text-dark-secondary)'} style={{ flexShrink: 0 }} />
      {label}
    </button>
  );
}

function Kpi({ label, value, sub, delta, valueColor, Icon, tint, tintColor, live }) {
  return (
    <div style={{
      background: live ? 'linear-gradient(135deg, rgba(46,213,115,.1), #141419)' : '#141419',
      border: `1px solid ${live ? 'rgba(46,213,115,.25)' : 'var(--border-dark)'}`,
      borderRadius: 16, padding: '16px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <div style={{ fontSize: '11px', color: 'var(--text-dark-secondary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</div>
        {live ? (
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--bac-low)', boxShadow: '0 0 10px rgba(46,213,115,.8)', flexShrink: 0 }} />
        ) : Icon ? (
          <span style={{ width: 30, height: 30, borderRadius: 9, background: tint || 'rgba(255,255,255,.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Icon size={15} color={tintColor || 'var(--text-dark-secondary)'} />
          </span>
        ) : null}
      </div>
      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: '38px', lineHeight: 1.05, color: valueColor || (live ? 'var(--bac-low)' : '#FFF'), marginTop: '8px' }}>{value}</div>
      {delta != null ? (
        <div style={{ fontSize: '12px', color: '#2ED573', fontWeight: 700, marginTop: '4px' }}>▲ +{delta} questa settimana</div>
      ) : sub ? (
        <div style={{ fontSize: '12px', color: 'var(--text-dark-secondary)', marginTop: '4px' }}>{sub}</div>
      ) : null}
    </div>
  );
}

function TopList({ rows, emptyText, renderRight }) {
  if (rows.length === 0) {
    return <p style={{ color: 'var(--text-dark-secondary)', fontSize: 13 }}>{emptyText}</p>;
  }
  return rows.map((row, i) => (
    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: i < rows.length - 1 ? '1px solid rgba(255,255,255,.05)' : 'none' }}>
      <span style={{ fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: 18, lineHeight: 1, width: 22, flexShrink: 0, color: i === 0 ? 'var(--secondary)' : 'var(--text-dark-tertiary)' }}>{i + 1}</span>
      <span style={{ fontSize: 13, color: '#FFF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>{row.name}</span>
      {renderRight(row)}
    </div>
  ));
}

export default function AdminPage() {
  const [state, setState] = useState('loading'); // loading | denied | ready | error
  const [stats, setStats] = useState(null);
  const [me, setMe] = useState(null);
  const [errMsg, setErrMsg] = useState('');
  const [tab, setTab] = useState('dashboard'); // dashboard | notifiche | banner

  useEffect(() => {
    (async () => {
      try {
        const user = await db.getCurrentUser();
        if (!user) { setState('denied'); return; }
        setMe(user);
        const res = await fetch('/api/admin/stats', { cache: 'no-store' });
        if (res.status === 401 || res.status === 403) { setState('denied'); return; }
        if (!res.ok) { const j = await res.json().catch(() => ({})); setErrMsg(j.error || 'Errore'); setState('error'); return; }
        setStats(await res.json());
        setState('ready');
      } catch (err) {
        setErrMsg(err.message || 'Errore');
        setState('error');
      }
    })();
  }, []);

  if (state === 'loading') {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh', color: 'var(--text-dark-secondary)' }}>
        <Loader size={22} style={{ animation: 'spin 1s linear infinite' }} /> &nbsp;Carico la dashboard…
      </div>
    );
  }

  if (state === 'denied') {
    return (
      <div className="card" style={{ maxWidth: 520, margin: '60px auto', textAlign: 'center', padding: '40px' }}>
        <ShieldCheck size={40} color="var(--primary)" style={{ marginBottom: 12 }} />
        <h2 style={{ fontSize: 22, fontWeight: 800 }}>Area riservata</h2>
        <p style={{ color: 'var(--text-dark-secondary)', marginTop: 8 }}>Questa sezione è accessibile solo agli amministratori di Strabar.</p>
        <Link href="/" className="btn btn-primary" style={{ marginTop: 16, borderRadius: 20 }}>← Torna a Strabar</Link>
      </div>
    );
  }

  if (state === 'error') {
    return <div className="card" style={{ maxWidth: 520, margin: '60px auto', textAlign: 'center', padding: '30px', color: 'var(--error)' }}>Errore: {errMsg}</div>;
  }

  const activeItem = NAV_ITEMS.find((n) => n.id === tab) || NAV_ITEMS[0];
  const meName = me?.display_name || me?.username || '';

  // Resa area+linea per una serie {label,count}: ritorna { line, area, n }.
  // Usata sia dalle iscrizioni sia dalle sessioni giornaliere → stesso stile visivo.
  const CHART_W = 100;
  const CHART_H = 40;
  const buildChart = (series) => {
    const data = series || [];
    const n = data.length;
    const max = Math.max(1, ...data.map((s) => s.count));
    const pts = data.map((s, i) => [
      n > 1 ? (i * CHART_W) / (n - 1) : 0,
      CHART_H - 2 - (s.count / max) * (CHART_H - 6),
    ]);
    return {
      n,
      line: pts.map((p) => `${p[0]},${p[1]}`).join(' '),
      area: n > 0
        ? `M ${pts[0][0]},${CHART_H} L ${pts.map((p) => `${p[0]},${p[1]}`).join(' L ')} L ${pts[n - 1][0]},${CHART_H} Z`
        : '',
    };
  };
  const signupChart = buildChart(stats.signups);
  const sessionsChart = buildChart(stats.dailySessions);
  const nPts = signupChart.n;
  const chartLine = signupChart.line;
  const chartArea = signupChart.area;

  return (
    <div className="adm-shell">
      <style>{ADMIN_LAYOUT_CSS}</style>

      {/* Sidebar desktop */}
      <aside className="adm-sidebar">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '0 12px 18px' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Strabar" style={{ height: 22, width: 'auto', alignSelf: 'flex-start' }} />
          <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '1.5px', color: 'var(--text-dark-tertiary)', fontWeight: 700 }}>Console admin</div>
        </div>
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {NAV_ITEMS.map((item) => (
            <SidebarItem key={item.id} item={item} active={tab === item.id} onClick={() => setTab(item.id)} />
          ))}
        </nav>
        {meName && (
          <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 10, borderTop: '1px solid var(--border-dark)', marginLeft: 4, marginRight: 4, padding: '18px 4px 2px 8px' }}>
            <span style={{ width: 34, height: 34, borderRadius: '50%', padding: 2, background: 'linear-gradient(135deg, var(--primary), var(--secondary))', display: 'flex', flexShrink: 0 }}>
              <span style={{ width: '100%', height: '100%', borderRadius: '50%', background: '#141419', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: '#FFF' }}>
                {meName.charAt(0).toUpperCase()}
              </span>
            </span>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#FFF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{meName}</span>
              <span style={{ display: 'block', fontSize: 10, fontWeight: 800, letterSpacing: '1px', color: 'var(--primary)' }}>ADMIN</span>
            </span>
          </div>
        )}
      </aside>

      <div className="adm-main">
        <div>
          <h1 style={{ fontSize: 40, lineHeight: 1 }}>{activeItem.label.toUpperCase()}</h1>
          <p style={{ color: 'var(--text-dark-secondary)', fontSize: 14, marginTop: 6 }}>
            Aggiornato al {new Date(stats.generatedAt).toLocaleString('it-IT')}
          </p>
        </div>

        {/* Navigazione mobile (<900px): tendina (prima era una barra a scorrimento
            orizzontale poco evidente → non si capiva si potesse scorrere). */}
        <div className="adm-mobile-tabs">
          <label style={{ display: 'block', fontSize: 11, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text-dark-tertiary)', fontWeight: 700, marginBottom: 6 }}>Sezione</label>
          <select
            className="form-control"
            value={tab}
            onChange={(e) => setTab(e.target.value)}
            style={{ width: '100%', height: 46, fontSize: 15, fontWeight: 600, background: 'var(--bg-card-dark)', border: '1px solid var(--border-dark)' }}
          >
            {NAV_ITEMS.map((item) => (
              <option key={item.id} value={item.id}>{item.label}</option>
            ))}
          </select>
        </div>

        {tab === 'utenti' && <UsersAdmin />}
        {tab === 'gdpr' && <GdprAdmin />}
        {tab === 'drink' && <DrinksAdmin />}
        {tab === 'locali' && <VenuesAdmin />}
        {tab === 'mappa' && <VenuesMapAdmin />}
        {tab === 'business' && <VenuesBusinessAdmin />}
        {tab === 'notifiche' && <NotificationsAdmin />}
        {tab === 'banner' && <BannersAdmin />}

        {tab === 'dashboard' && (<>
        {/* KPI Utenti */}
        <div>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-dark-secondary)', textTransform: 'uppercase', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Users size={15} /> Utenti
          </h3>
          <div className="r-grid-stat-4" style={{ gap: 12 }}>
            <Kpi label="Totali" value={stats.users.total} Icon={Users} tint="rgba(255,59,47,.14)" tintColor="var(--primary)" delta={stats.users.new7d} />
            <Kpi label="Nuovi (7gg)" value={stats.users.new7d} Icon={UserPlus} tint="rgba(255,59,47,.14)" tintColor="var(--primary)" sub={`${stats.users.new30d} negli ultimi 30gg`} />
            <Kpi label="Con consenso" value={stats.users.withConsent} Icon={ShieldCheck} sub="GDPR accettato" />
            <Kpi label="Profilo completo" value={stats.users.withProfile} Icon={UserCheck} sub="sesso/peso impostati" />
          </div>
        </div>

        {/* KPI Attività */}
        <div>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-dark-secondary)', textTransform: 'uppercase', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Beer size={15} /> Attività
          </h3>
          <div className="r-grid-stat-4" style={{ gap: 12 }}>
            <Kpi label="Sessioni" value={stats.sessions.total} Icon={TrendingUp} delta={stats.sessions.last7d} />
            <Kpi label="Live ora" value={stats.sessions.active} live />
            <Kpi label="U.A. totali" value={stats.sessions.totalUnits} Icon={Beer} tint="rgba(223,255,0,.14)" tintColor="var(--secondary)" valueColor="var(--secondary)" sub={`${stats.sessions.totalDrinks} drink`} />
            <Kpi label="Check-in geo" value={stats.sessions.geoCheckins} Icon={MapPin} sub="contano per le classifiche" />
          </div>
        </div>

        {/* Iscrizioni: area chart sugli stessi dati */}
        <div className="card" style={{ padding: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
            <h3 style={{ fontSize: 15, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 6 }}>
              <TrendingUp size={16} color="var(--primary)" /> Iscrizioni
            </h3>
            <span style={{ fontSize: 11, color: 'var(--text-dark-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 700 }}>ultimi {nPts} giorni</span>
          </div>
          <svg
            viewBox={`0 0 ${CHART_W} ${CHART_H}`}
            preserveAspectRatio="none"
            style={{ display: 'block', width: '100%', height: 120 }}
            aria-hidden="true"
          >
            <defs>
              <linearGradient id="admSignupGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgba(255,59,47,.35)" />
                <stop offset="100%" stopColor="rgba(255,59,47,0)" />
              </linearGradient>
            </defs>
            <path d={chartArea} fill="url(#admSignupGrad)" />
            <polyline points={chartLine} fill="none" stroke="#FF3B2F" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          </svg>
          <div style={{ display: 'flex', marginTop: 8 }}>
            {stats.signups.map((s, i) => (
              <div key={i} style={{ flex: 1, textAlign: 'center', fontSize: 9, color: 'var(--text-dark-tertiary)' }}>{s.label}</div>
            ))}
          </div>
        </div>

        {/* Sessioni giornaliere: stessa resa area/linea delle iscrizioni */}
        {stats.dailySessions && (
          <div className="card" style={{ padding: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
              <h3 style={{ fontSize: 15, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Beer size={16} color="#10B981" /> Sessioni giornaliere
              </h3>
              <span style={{ fontSize: 11, color: 'var(--text-dark-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 700 }}>ultimi {sessionsChart.n} giorni</span>
            </div>
            <svg
              viewBox={`0 0 ${CHART_W} ${CHART_H}`}
              preserveAspectRatio="none"
              style={{ display: 'block', width: '100%', height: 120 }}
              aria-hidden="true"
            >
              <defs>
                <linearGradient id="admSessionsGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="rgba(16,185,129,.35)" />
                  <stop offset="100%" stopColor="rgba(16,185,129,0)" />
                </linearGradient>
              </defs>
              <path d={sessionsChart.area} fill="url(#admSessionsGrad)" />
              <polyline points={sessionsChart.line} fill="none" stroke="#10B981" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            </svg>
            <div style={{ display: 'flex', marginTop: 8 }}>
              {stats.dailySessions.map((s, i) => (
                <div key={i} style={{ flex: 1, textAlign: 'center', fontSize: 9, color: 'var(--text-dark-tertiary)' }}>{s.label}</div>
              ))}
            </div>
          </div>
        )}

        <div className="r-grid-2" style={{ gap: 18 }}>
          {/* Top locali */}
          <div style={{ background: '#141419', border: '1px solid var(--border-dark)', borderRadius: 16, padding: 18 }}>
            <h3 style={{ fontSize: 15, fontWeight: 800, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
              <MapPin size={16} color="var(--primary)" /> Top locali
            </h3>
            <TopList
              rows={stats.topVenues}
              emptyText="Ancora nessun check-in geolocalizzato."
              renderRight={(v) => (
                <span style={{ fontSize: 12, color: 'var(--text-dark-secondary)', flexShrink: 0, marginLeft: 8 }}>{v.sessions} sess · {v.units} U.A.</span>
              )}
            />
          </div>

          {/* Top atleti */}
          <div style={{ background: '#141419', border: '1px solid var(--border-dark)', borderRadius: 16, padding: 18 }}>
            <h3 style={{ fontSize: 15, fontWeight: 800, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Users size={16} color="var(--secondary)" /> Top atleti (U.A.)
            </h3>
            <TopList
              rows={stats.topUsers}
              emptyText="Ancora nessun dato."
              renderRight={(u) => (
                <span style={{ fontSize: 12, color: 'var(--secondary)', flexShrink: 0, marginLeft: 8, fontWeight: 700 }}>{u.units} U.A.</span>
              )}
            />
          </div>
        </div>

        {/* Ultimi iscritti */}
        <div style={{ background: '#141419', border: '1px solid var(--border-dark)', borderRadius: 16, padding: 18 }}>
          <h3 style={{ fontSize: 15, fontWeight: 800, marginBottom: 14 }}>Ultimi iscritti</h3>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {stats.recentUsers.map((u, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: i < stats.recentUsers.length - 1 ? '1px solid rgba(255,255,255,.05)' : 'none', gap: 8 }}>
                <div style={{ minWidth: 0 }}>
                  <span style={{ fontSize: 13, color: '#FFF', fontWeight: 600 }}>{u.display_name || u.username}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-dark-secondary)', marginLeft: 6 }}>@{u.username}</span>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                  {u.admin && <span style={{ fontSize: 9, fontWeight: 800, color: 'var(--primary)', border: '1px solid var(--primary)', borderRadius: 6, padding: '1px 5px' }}>ADMIN</span>}
                  {u.premium && <span style={{ fontSize: 9, fontWeight: 800, color: 'var(--secondary)' }}>PRO</span>}
                  {!u.consent && <span title="Consenso GDPR non registrato" style={{ fontSize: 11 }}>⚠️</span>}
                  <span style={{ fontSize: 11, color: 'var(--text-dark-secondary)' }}>{new Date(u.created_at).toLocaleDateString('it-IT')}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
        </>)}
      </div>
    </div>
  );
}
