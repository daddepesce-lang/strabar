'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { db } from '@/lib/db';
import { Search, UserPlus, UserMinus, Loader, Users } from 'lucide-react';
import RequireAuth from '@/components/RequireAuth';

export default function SearchPage() {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [followingIds, setFollowingIds] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [busy, setBusy] = useState({});
  const inputRef = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const user = await db.getCurrentUser();
        setCurrentUser(user);
        if (user) {
          const [following, sugg] = await Promise.all([
            db.getFollowing(user.id).catch(() => []),
            db.getSuggestedProfiles(user.id).catch(() => []),
          ]);
          setFollowingIds((following || []).map((f) => f.id));
          setSuggestions(sugg || []);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Prefill dalla query ?q (es. arrivando dalla tendina in navbar)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const q = new URLSearchParams(window.location.search).get('q');
    if (q) setQuery(q);
  }, []);

  // Autofocus sull'input appena pronto
  useEffect(() => {
    if (!loading && currentUser && inputRef.current) inputRef.current.focus();
  }, [loading, currentUser]);

  // Ricerca debounced
  useEffect(() => {
    const q = query.trim();
    if (q.length < 1) { setResults([]); setSearching(false); return; }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const res = await db.searchProfiles(q);
        setResults((res || []).filter((u) => u.id !== currentUser?.id));
      } catch (err) {
        console.error(err);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [query, currentUser]);

  const toggleFollow = async (user) => {
    if (!currentUser) return;
    const isFollowing = followingIds.includes(user.id);
    setBusy((b) => ({ ...b, [user.id]: true }));
    setFollowingIds((prev) => (isFollowing ? prev.filter((id) => id !== user.id) : [...prev, user.id]));
    try {
      if (isFollowing) await db.unfollowUser(user.id);
      else await db.followUser(user.id);
    } catch (err) {
      setFollowingIds((prev) => (isFollowing ? [...prev, user.id] : prev.filter((id) => id !== user.id)));
      alert(err.message || 'Operazione non riuscita');
    } finally {
      setBusy((b) => ({ ...b, [user.id]: false }));
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '50vh' }}>
        <Loader size={28} style={{ color: 'var(--primary)', animation: 'spin 1s linear infinite' }} />
      </div>
    );
  }
  if (!currentUser) return <RequireAuth feature="la ricerca atleti" />;

  const renderPersonRow = (user, subtitle) => {
    const isFollowing = followingIds.includes(user.id);
    return (
      <div key={user.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px', background: 'var(--bg-input-dark)', border: '1px solid var(--border-dark)', borderRadius: '12px' }}>
        <Link href={`/u/${user.id}`} style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0, flex: 1, textDecoration: 'none' }}>
          <div className="activity-avatar" style={{ width: '42px', height: '42px', fontSize: '17px', flexShrink: 0 }}>
            {user.display_name?.charAt(0)?.toUpperCase() || 'U'}
          </div>
          <div style={{ minWidth: 0 }}>
            <strong style={{ fontSize: '14px', color: '#FFF', display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.display_name}</strong>
            <span style={{ fontSize: '12px', color: 'var(--text-dark-secondary)' }}>{subtitle || `@${user.username}`}</span>
          </div>
        </Link>
        <button
          onClick={() => toggleFollow(user)}
          disabled={busy[user.id]}
          className={`btn ${isFollowing ? 'btn-secondary' : 'btn-primary'}`}
          style={{ padding: '6px 12px', fontSize: '12px', borderRadius: '20px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '4px' }}
        >
          {isFollowing ? <><UserMinus size={12} /> Segui già</> : <><UserPlus size={12} /> Segui</>}
        </button>
      </div>
    );
  };

  const q = query.trim();

  return (
    <div style={{ maxWidth: '640px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '18px' }}>
      <h1 style={{ fontSize: '26px', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '10px' }}>
        <Search size={26} color="var(--primary)" /> Cerca atleti
      </h1>

      <div style={{ position: 'relative' }}>
        <Search size={18} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dark-secondary)' }} />
        <input
          ref={inputRef}
          type="text"
          className="form-control"
          placeholder="Cerca per nome o @username..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ paddingLeft: '44px', height: '48px', fontSize: '15px' }}
        />
        {searching && <Loader size={16} style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--primary)', animation: 'spin 1s linear infinite' }} />}
      </div>

      {q.length >= 1 ? (
        results.length === 0 && !searching ? (
          <p style={{ color: 'var(--text-dark-secondary)', fontSize: '14px', textAlign: 'center', padding: '20px' }}>Nessun atleta trovato per &quot;{q}&quot;.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {results.map((u) => renderPersonRow(u))}
          </div>
        )
      ) : (
        suggestions.length > 0 && (
          <div>
            <h3 style={{ fontSize: '15px', fontWeight: 800, marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Users size={16} color="var(--primary)" /> Potresti conoscere
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--text-dark-secondary)', marginBottom: '12px' }}>Atleti che non segui ancora.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {suggestions.map((u) => renderPersonRow(u, u.mutualCount > 0 ? `${u.mutualCount} ${u.mutualCount === 1 ? 'amico' : 'amici'} in comune` : `@${u.username}`))}
            </div>
          </div>
        )
      )}
    </div>
  );
}
