'use client';

import { useEffect, useState } from 'react';
import { Loader, Search, X } from 'lucide-react';

// Selettore account per collegare un locale: mostra la LISTA degli account (ricerca per
// nome/username/email) invece di chiedere un'email a mano. onPick(user) → { id, ... }.
export default function AccountPicker({ title, onPick, onClose }) {
  const [users, setUsers] = useState(null);
  const [q, setQ] = useState('');

  useEffect(() => {
    fetch('/api/admin/users', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => setUsers(d.users || []))
      .catch(() => setUsers([]));
  }, []);

  const s = q.trim().toLowerCase();
  const list = (users || []).filter((u) => !s
    || (u.display_name || '').toLowerCase().includes(s)
    || (u.username || '').toLowerCase().includes(s)
    || (u.email || '').toLowerCase().includes(s)
  ).slice(0, 40);

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 2000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: 0 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 480, background: 'var(--bg-card-dark)', border: '1px solid var(--border-dark)', borderRadius: '22px 22px 0 0', padding: 18, maxHeight: '85dvh', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontSize: 16, fontWeight: 800, color: '#FFF', margin: 0 }}>{title || 'Scegli un account'}</h3>
          <button onClick={onClose} className="btn btn-secondary" style={{ padding: 6, borderRadius: '50%', width: 34, height: 34 }}><X size={16} /></button>
        </div>
        <div style={{ position: 'relative' }}>
          <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dark-secondary)' }} />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca per nome, username o email…" className="form-control" style={{ paddingLeft: 36, fontSize: 14 }} />
        </div>
        <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6, minHeight: 0 }}>
          {users === null && <div style={{ textAlign: 'center', padding: 16 }}><Loader size={18} style={{ animation: 'spin 1s linear infinite' }} /></div>}
          {users && list.length === 0 && <p style={{ textAlign: 'center', color: 'var(--text-dark-secondary)', fontSize: 13, padding: 14 }}>Nessun account.</p>}
          {list.map((u) => (
            <button key={u.id} onClick={() => onPick(u)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2, padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border-dark)', background: 'transparent', cursor: 'pointer', textAlign: 'left', width: '100%' }}>
              <span style={{ color: '#FFF', fontWeight: 600, fontSize: 14 }}>{u.display_name || u.username}</span>
              <span style={{ color: 'var(--text-dark-secondary)', fontSize: 12 }}>{u.email || ''}{u.username ? ` · @${u.username}` : ''}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
