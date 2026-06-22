'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader, Search, Radar, MapPin } from 'lucide-react';

function ago(d) {
  const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
  if (m < 1) return 'ora';
  if (m < 60) return `${m}m fa`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h fa`;
  return `${Math.floor(h / 24)}g fa`;
}

export default function UsersAdmin() {
  const [data, setData] = useState(null);
  const [q, setQ] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/admin/users', { cache: 'no-store' });
        setData(await res.json());
      } catch { setData({ users: [], live: [] }); }
    })();
  }, []);

  if (!data) return <div style={{ color: 'var(--text-dark-secondary)' }}><Loader size={16} style={{ animation: 'spin 1s linear infinite' }} /> Carico…</div>;

  const filtered = (data.users || []).filter((u) => {
    const s = q.toLowerCase().trim();
    if (!s) return true;
    return (u.username || '').toLowerCase().includes(s) || (u.display_name || '').toLowerCase().includes(s);
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Live ora */}
      <div className="card" style={{ padding: 18 }}>
        <h3 style={{ fontSize: 16, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 12px' }}>
          <Radar size={17} color="var(--success)" /> Live ora ({data.liveCount || 0})
        </h3>
        {(data.live || []).length === 0 ? (
          <p style={{ color: 'var(--text-dark-secondary)', fontSize: 13, margin: 0 }}>Nessuna sessione live in questo momento.</p>
        ) : data.live.map((s) => (
          <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: '1px solid var(--border-dark)' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, color: '#FFF', fontWeight: 600 }}>
                <span style={{ color: 'var(--success)' }}>● </span>{s.user}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-dark-secondary)', display: 'flex', alignItems: 'center', gap: 4 }}>
                {s.geo && <MapPin size={11} />}{s.place} · {ago(s.started)}
              </div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <strong style={{ fontSize: 14, color: 'var(--primary)' }}>{s.units} U.A.</strong>
              <div style={{ fontSize: 10, color: 'var(--text-dark-secondary)' }}>{s.drinks} drink</div>
            </div>
          </div>
        ))}
      </div>

      {/* Utenti */}
      <div className="card" style={{ padding: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
          <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>Utenti ({data.total || 0})</h3>
          <div style={{ position: 'relative', flex: '1 1 200px', maxWidth: 280 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dark-secondary)' }} />
            <input className="form-control" placeholder="Cerca per nome o username…" value={q} onChange={(e) => setQ(e.target.value)} style={{ height: 36, fontSize: 13, paddingLeft: 32 }} />
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {filtered.map((u) => (
            <Link key={u.id} href={`/u/${u.id}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: '1px solid var(--border-dark)' }}>
              <div style={{ minWidth: 0 }}>
                <span style={{ fontSize: 13, color: '#FFF', fontWeight: 600 }}>{u.display_name || u.username}</span>
                <span style={{ fontSize: 11, color: 'var(--text-dark-secondary)', marginLeft: 6 }}>@{u.username}</span>
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                {u.admin && <span style={{ fontSize: 9, fontWeight: 800, color: 'var(--primary)', border: '1px solid var(--primary)', borderRadius: 6, padding: '1px 5px' }}>ADMIN</span>}
                {u.premium && <span style={{ fontSize: 9, fontWeight: 800, color: 'var(--secondary)' }}>PRO</span>}
                {!u.consent && <span title="Consenso GDPR non registrato" style={{ fontSize: 11 }}>⚠️</span>}
                <span style={{ fontSize: 11, color: 'var(--text-dark-secondary)' }}>{ago(u.created_at)}</span>
              </div>
            </Link>
          ))}
          {filtered.length === 0 && <p style={{ color: 'var(--text-dark-secondary)', fontSize: 13 }}>Nessun utente trovato.</p>}
        </div>
      </div>
    </div>
  );
}
