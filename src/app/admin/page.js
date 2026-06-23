'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { db } from '@/lib/db';
import { Loader, Users, Beer, MapPin, TrendingUp, ShieldCheck, Crown } from 'lucide-react';
import NotificationsAdmin from './NotificationsAdmin';
import BannersAdmin from './BannersAdmin';
import UsersAdmin from './UsersAdmin';
import GdprAdmin from './GdprAdmin';

function Kpi({ label, value, sub, color }) {
  return (
    <div className="card" style={{ padding: '16px' }}>
      <div style={{ fontSize: '11px', color: 'var(--text-dark-secondary)', fontWeight: 700, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: '28px', fontWeight: 800, color: color || '#FFF', marginTop: '4px' }}>{value}</div>
      {sub && <div style={{ fontSize: '12px', color: 'var(--text-dark-secondary)', marginTop: '2px' }}>{sub}</div>}
    </div>
  );
}

export default function AdminPage() {
  const [state, setState] = useState('loading'); // loading | denied | ready | error
  const [stats, setStats] = useState(null);
  const [errMsg, setErrMsg] = useState('');
  const [tab, setTab] = useState('dashboard'); // dashboard | notifiche | banner

  useEffect(() => {
    (async () => {
      try {
        const user = await db.getCurrentUser();
        if (!user) { setState('denied'); return; }
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

  const maxSignup = Math.max(1, ...stats.signups.map((s) => s.count));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '22px', maxWidth: 1100, margin: '0 auto' }}>
      <div>
        <h1 style={{ fontSize: 30, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 10 }}>
          <ShieldCheck size={28} color="var(--primary)" /> Admin Strabar
        </h1>
        <p style={{ color: 'var(--text-dark-secondary)', fontSize: 14, marginTop: 4 }}>
          Panoramica utenti e attività. Dati letti lato server, aggiornati al {new Date(stats.generatedAt).toLocaleString('it-IT')}.
        </p>
      </div>

      {/* Schede */}
      <div className="seg-tabs">
        <button onClick={() => setTab('dashboard')} className={`seg-tab ${tab === 'dashboard' ? 'active' : ''}`}>📊 Dashboard</button>
        <button onClick={() => setTab('utenti')} className={`seg-tab ${tab === 'utenti' ? 'active' : ''}`}>👥 Utenti</button>
        <button onClick={() => setTab('gdpr')} className={`seg-tab ${tab === 'gdpr' ? 'active' : ''}`}>🔐 GDPR</button>
        <button onClick={() => setTab('notifiche')} className={`seg-tab ${tab === 'notifiche' ? 'active' : ''}`}>🔔 Notifiche</button>
        <button onClick={() => setTab('banner')} className={`seg-tab ${tab === 'banner' ? 'active' : ''}`}>📢 Banner</button>
      </div>

      {tab === 'utenti' && <UsersAdmin />}
      {tab === 'gdpr' && <GdprAdmin />}
      {tab === 'notifiche' && <NotificationsAdmin />}
      {tab === 'banner' && <BannersAdmin />}

      {tab === 'dashboard' && (<>
      {/* KPI Utenti */}
      <div>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-dark-secondary)', textTransform: 'uppercase', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Users size={15} /> Utenti
        </h3>
        <div className="r-grid-stat-4" style={{ gap: 12 }}>
          <Kpi label="Totali" value={stats.users.total} color="var(--primary)" />
          <Kpi label="Nuovi (7gg)" value={stats.users.new7d} sub={`${stats.users.new30d} negli ultimi 30gg`} />
          <Kpi label="Con consenso" value={stats.users.withConsent} sub="GDPR accettato" />
          <Kpi label="Profilo completo" value={stats.users.withProfile} sub="sesso/peso impostati" />
        </div>
      </div>

      {/* KPI Attività */}
      <div>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-dark-secondary)', textTransform: 'uppercase', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Beer size={15} /> Attività
        </h3>
        <div className="r-grid-stat-4" style={{ gap: 12 }}>
          <Kpi label="Sessioni" value={stats.sessions.total} sub={`${stats.sessions.last7d} negli ultimi 7gg`} />
          <Kpi label="Live ora" value={stats.sessions.active} color="var(--success)" />
          <Kpi label="U.A. totali" value={stats.sessions.totalUnits} sub={`${stats.sessions.totalDrinks} drink`} color="var(--secondary)" />
          <Kpi label="Check-in geo" value={stats.sessions.geoCheckins} sub="contano per le classifiche" />
        </div>
      </div>

      {/* Iscrizioni ultimi 14 giorni */}
      <div className="card" style={{ padding: 18 }}>
        <h3 style={{ fontSize: 15, fontWeight: 800, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
          <TrendingUp size={16} color="var(--primary)" /> Iscrizioni (ultimi 14 giorni)
        </h3>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 120 }}>
          {stats.signups.map((s, i) => (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div style={{ fontSize: 10, color: 'var(--text-dark-secondary)' }}>{s.count || ''}</div>
              <div style={{ width: '100%', height: `${(s.count / maxSignup) * 90}px`, minHeight: s.count ? 4 : 0, background: 'var(--primary)', borderRadius: '4px 4px 0 0' }} />
              <div style={{ fontSize: 9, color: 'var(--text-dark-secondary)' }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="r-grid-2" style={{ gap: 18 }}>
        {/* Top locali */}
        <div className="card" style={{ padding: 18 }}>
          <h3 style={{ fontSize: 15, fontWeight: 800, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
            <MapPin size={16} color="var(--primary)" /> Top locali
          </h3>
          {stats.topVenues.length === 0 ? (
            <p style={{ color: 'var(--text-dark-secondary)', fontSize: 13 }}>Ancora nessun check-in geolocalizzato.</p>
          ) : stats.topVenues.map((v, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: i < stats.topVenues.length - 1 ? '1px solid var(--border-dark)' : 'none' }}>
              <span style={{ fontSize: 13, color: '#FFF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i + 1}. {v.name}</span>
              <span style={{ fontSize: 12, color: 'var(--text-dark-secondary)', flexShrink: 0, marginLeft: 8 }}>{v.sessions} sess · {v.units} U.A.</span>
            </div>
          ))}
        </div>

        {/* Top atleti */}
        <div className="card" style={{ padding: 18 }}>
          <h3 style={{ fontSize: 15, fontWeight: 800, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Crown size={16} color="var(--secondary)" /> Top atleti (U.A.)
          </h3>
          {stats.topUsers.length === 0 ? (
            <p style={{ color: 'var(--text-dark-secondary)', fontSize: 13 }}>Ancora nessun dato.</p>
          ) : stats.topUsers.map((u, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: i < stats.topUsers.length - 1 ? '1px solid var(--border-dark)' : 'none' }}>
              <span style={{ fontSize: 13, color: '#FFF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i + 1}. {u.name}</span>
              <span style={{ fontSize: 12, color: 'var(--secondary)', flexShrink: 0, marginLeft: 8, fontWeight: 700 }}>{u.units} U.A.</span>
            </div>
          ))}
        </div>
      </div>

      {/* Ultimi iscritti */}
      <div className="card" style={{ padding: 18 }}>
        <h3 style={{ fontSize: 15, fontWeight: 800, marginBottom: 14 }}>Ultimi iscritti</h3>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {stats.recentUsers.map((u, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: i < stats.recentUsers.length - 1 ? '1px solid var(--border-dark)' : 'none', gap: 8 }}>
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
  );
}
