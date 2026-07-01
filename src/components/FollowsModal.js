'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { db } from '@/lib/db';
import Avatar from '@/components/Avatar';
import { publicName } from '@/lib/names';
import { Loader, X, Search } from 'lucide-react';

// Modale follower/seguiti caricata ON-DEMAND: la lista viene scaricata solo quando si apre
// (e si cambia scheda), non al caricamento del profilo. Riutilizzabile in u/[id] e profilo.
export default function FollowsModal({ userId, initialTab = 'followers', counts = {}, onClose, onNavigate }) {
  const [tab, setTab] = useState(initialTab);
  const [lists, setLists] = useState({}); // { followers: [...], following: [...] } — cache per scheda
  const [q, setQ] = useState('');

  useEffect(() => {
    let alive = true;
    if (lists[tab] !== undefined) return; // già caricata (anche se vuota)
    const fetcher = tab === 'followers' ? db.getFollowers : db.getFollowing;
    Promise.resolve(typeof fetcher === 'function' ? fetcher.call(db, userId) : [])
      .then((rows) => { if (alive) setLists((p) => ({ ...p, [tab]: rows || [] })); })
      .catch(() => { if (alive) setLists((p) => ({ ...p, [tab]: [] })); });
    return () => { alive = false; };
  }, [tab, userId, lists]);

  // "loading" derivato: finché la scheda non è in cache, stiamo caricando (niente setState).
  const loading = lists[tab] === undefined;
  const current = lists[tab] || [];
  const s = q.toLowerCase().trim();
  // Il filtro cerca sul nome PUBBLICO (rispetta l'alias: chi lo usa è trovabile per alias
  // o @username, non per nome reale) e sullo username.
  const filtered = s ? current.filter((u) => publicName(u, '').toLowerCase().includes(s) || (u.username || '').toLowerCase().includes(s)) : current;

  const tabStyle = (id) => ({ flex: 1, padding: '12px', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 14,
    color: tab === id ? '#FFF' : 'var(--text-dark-secondary)', borderBottom: tab === id ? '2px solid var(--primary)' : '2px solid transparent' });

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(6px)', zIndex: 1500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }} onClick={onClose}>
      <div className="card" style={{ width: '100%', maxWidth: 440, maxHeight: '76vh', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--border-dark)' }}>
          <button type="button" onClick={() => { setTab('followers'); setQ(''); }} style={tabStyle('followers')}>Seguaci{counts.followers != null ? ` (${counts.followers})` : ''}</button>
          <button type="button" onClick={() => { setTab('following'); setQ(''); }} style={tabStyle('following')}>Seguiti{counts.following != null ? ` (${counts.following})` : ''}</button>
          <button onClick={onClose} className="btn btn-secondary" style={{ margin: '0 8px', padding: '4px 10px', borderRadius: '50%', minWidth: 32, height: 32 }}><X size={16} /></button>
        </div>

        <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-dark)', position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: 22, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dark-secondary)' }} />
          <input className="form-control" placeholder="Filtra…" value={q} onChange={(e) => setQ(e.target.value)} style={{ height: 36, fontSize: 14, paddingLeft: 32 }} />
        </div>

        <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          {loading ? (
            <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-dark-secondary)' }}><Loader size={18} style={{ animation: 'spin 1s linear infinite' }} /></div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-dark-secondary)', fontSize: 13 }}>
              {tab === 'followers' ? 'Nessun seguace.' : 'Non segue nessuno.'}
            </div>
          ) : filtered.map((u) => (
            <Link
              key={u.id}
              href={`/u/${u.id}`}
              onClick={() => { onNavigate?.(); onClose?.(); }}
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px', borderBottom: '1px solid var(--border-dark)', textDecoration: 'none' }}
            >
              <Avatar src={u.avatar_url} name={publicName(u)} size={40} />
              <div style={{ minWidth: 0 }}>
                <strong style={{ fontSize: 14, color: '#FFF', display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{publicName(u)}</strong>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
