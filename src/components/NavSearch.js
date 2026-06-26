'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { db } from '@/lib/db';
import { publicName } from '@/lib/names';
import { Search, Loader } from 'lucide-react';

// Lente in navbar: apre una tendina con anteprima risultati; "Vedi tutti" → /search
export default function NavSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const wrapRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    const onClick = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 1) { setResults([]); setSearching(false); return; }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const res = await db.searchProfiles(q);
        setResults((res || []).slice(0, 6));
      } catch { /* noop */ }
      finally { setSearching(false); }
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  const goToFull = () => {
    const q = query.trim();
    setOpen(false);
    router.push(q ? `/search?q=${encodeURIComponent(q)}` : '/search');
  };

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button onClick={() => setOpen((v) => !v)} className={`action-btn ${open ? 'active' : ''}`} title="Cerca atleti">
        <Search size={20} />
      </button>

      {open && (
        <div className="notif-dropdown" style={{ padding: '12px' }}>
          <form
            onSubmit={(e) => { e.preventDefault(); goToFull(); }}
            style={{ position: 'relative', marginBottom: results.length || searching ? '10px' : '0' }}
          >
            <Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dark-secondary)' }} />
            <input
              ref={inputRef}
              type="text"
              className="form-control"
              placeholder="Cerca atleti..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{ height: '40px', fontSize: '14px', paddingLeft: '34px' }}
            />
            {searching && <Loader size={14} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--primary)', animation: 'spin 1s linear infinite' }} />}
          </form>

          {query.trim().length >= 1 && (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {results.length === 0 && !searching ? (
                <span style={{ fontSize: '13px', color: 'var(--text-dark-secondary)', padding: '8px 4px' }}>Nessun atleta trovato.</span>
              ) : (
                results.map((u) => (
                  <Link
                    key={u.id}
                    href={`/u/${u.id}`}
                    onClick={() => setOpen(false)}
                    style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 6px', borderRadius: '8px', textDecoration: 'none' }}
                  >
                    <div className="activity-avatar" style={{ width: 34, height: 34, fontSize: 14, flexShrink: 0 }}>
                      {publicName(u).replace(/^@/, '').charAt(0)?.toUpperCase() || 'U'}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <strong style={{ fontSize: '13px', color: '#FFF', display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{publicName(u)}</strong>
                      <span style={{ fontSize: '11px', color: 'var(--text-dark-secondary)' }}>@{u.username}</span>
                    </div>
                  </Link>
                ))
              )}
              <button
                onClick={goToFull}
                style={{ marginTop: '6px', padding: '8px', borderRadius: '8px', background: 'rgba(255, 32, 0,0.08)', border: '1px solid var(--border-dark)', color: 'var(--primary)', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}
              >
                Vedi tutti i risultati
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
