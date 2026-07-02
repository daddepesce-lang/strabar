'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { db } from '@/lib/db';
import { useT } from '@/lib/i18n';
import RequireAuth from '@/components/RequireAuth';
import { Users, Plus, Lock, Globe, Search, X, Crown } from 'lucide-react';

export default function GroupsPage() {
  const t = useT();
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('mine'); // 'mine' | 'discover'
  const [mine, setMine] = useState([]);
  const [discover, setDiscover] = useState([]);
  const [dq, setDq] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState('private');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const loadMine = async () => {
    try { setMine(await db.getMyGroups()); } catch { /* noop */ }
  };

  useEffect(() => {
    (async () => {
      try {
        setCurrentUser(await db.getCurrentUser());
        await loadMine();
      } finally { setLoading(false); }
    })();
  }, []);

  useEffect(() => {
    if (tab !== 'discover') return;
    const h = setTimeout(() => { db.discoverGroups(dq).then(setDiscover).catch(() => {}); }, 250);
    return () => clearTimeout(h);
  }, [tab, dq]);

  const handleCreate = async () => {
    if (!name.trim()) { setErr(t('groups.nameRequired')); return; }
    setBusy(true); setErr('');
    try {
      const g = await db.createGroup({ name, description, visibility });
      setShowCreate(false);
      setName(''); setDescription(''); setVisibility('private');
      await loadMine();
      if (g?.id && typeof window !== 'undefined') window.location.href = `/groups/${g.id}`;
    } catch (e) {
      setErr(e.message || t('groups.createError'));
    } finally { setBusy(false); }
  };

  if (!loading && !currentUser) return <RequireAuth feature={t('groups.requireFeature')} />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '30px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Users size={30} color="var(--primary)" /> {t('groups.title')}
          </h1>
          <p style={{ color: 'var(--text-dark-secondary)', fontSize: '15px', marginTop: '4px' }}>
            {t('groups.subtitle')}
          </p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn btn-primary" style={{ borderRadius: '20px', padding: '10px 16px', whiteSpace: 'nowrap', flexShrink: 0 }}>
          <Plus size={18} /> {t('groups.create')}
        </button>
      </div>

      <div className="seg-tabs">
        <button onClick={() => setTab('mine')} className={`seg-tab ${tab === 'mine' ? 'active' : ''}`}>{t('groups.tabMine')}</button>
        <button onClick={() => setTab('discover')} className={`seg-tab ${tab === 'discover' ? 'active' : ''}`}>{t('groups.tabDiscover')}</button>
      </div>

      {tab === 'mine' ? (
        mine.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '40px' }}>
            <p style={{ color: 'var(--text-dark-secondary)', marginBottom: '16px' }}>
              {t('groups.emptyMine')}
            </p>
            <button onClick={() => setShowCreate(true)} className="btn btn-primary" style={{ borderRadius: '20px' }}>
              <Plus size={18} /> {t('groups.createFirst')}
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {mine.map((g) => <GroupCard key={g.id} g={g} role={g.myRole} />)}
          </div>
        )
      ) : (
        <>
          <div style={{ position: 'relative' }}>
            <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dark-secondary)' }} />
            <input className="form-control" placeholder={t('groups.searchPublic')} value={dq} onChange={(e) => setDq(e.target.value)} style={{ paddingLeft: '38px', height: '42px' }} />
          </div>
          {discover.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '30px', color: 'var(--text-dark-secondary)', fontSize: '14px' }}>
              {t('groups.noPublic')}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {discover.map((g) => <GroupCard key={g.id} g={g} />)}
            </div>
          )}
        </>
      )}

      {showCreate && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1500, padding: '20px' }}>
          <div className="card" style={{ maxWidth: '460px', width: '100%', border: '1px solid var(--border-dark)', position: 'relative', maxHeight: '85dvh', overflowY: 'auto' }}>
            <button onClick={() => setShowCreate(false)} aria-label="Chiudi" style={{ position: 'absolute', top: '10px', right: '10px', background: 'rgba(255,255,255,0.06)', borderRadius: '50%', width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', color: 'var(--text-dark-secondary)', cursor: 'pointer' }}><X size={22} /></button>
            <h2 style={{ fontSize: '20px', fontWeight: 800, marginBottom: '16px', paddingRight: '36px' }}>{t('groups.newLeague')}</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label className="form-label">{t('groups.name')}</label>
                <input className="form-control" placeholder={t('groups.namePlaceholder')} value={name} maxLength={50} onChange={(e) => setName(e.target.value)} />
              </div>
              <div>
                <label className="form-label">{t('groups.descOptional')}</label>
                <textarea className="form-control" rows={2} placeholder={t('groups.descPlaceholder')} value={description} maxLength={200} onChange={(e) => setDescription(e.target.value)} style={{ resize: 'none' }} />
              </div>
              <div>
                <label className="form-label">{t('groups.visibility')}</label>
                <div className="seg-tabs" style={{ display: 'flex', gap: '6px' }}>
                  <div className={`seg-tab ${visibility === 'private' ? 'active' : ''}`} onClick={() => setVisibility('private')} style={{ flex: 1, textAlign: 'center', cursor: 'pointer' }}>{t('groups.private')}</div>
                  <div className={`seg-tab ${visibility === 'public' ? 'active' : ''}`} onClick={() => setVisibility('public')} style={{ flex: 1, textAlign: 'center', cursor: 'pointer' }}>{t('groups.public')}</div>
                </div>
                <p style={{ fontSize: '12px', color: 'var(--text-dark-secondary)', marginTop: '8px', lineHeight: 1.5 }}>
                  {visibility === 'private' ? t('groups.privateHint') : t('groups.publicHint')}
                </p>
              </div>
              {err && <p style={{ color: '#FF7D7D', fontSize: '13px' }}>{err}</p>}
              <button onClick={handleCreate} disabled={busy} className="btn btn-primary" style={{ borderRadius: '20px', padding: '12px', fontWeight: 700 }}>
                {busy ? t('groups.creating') : t('groups.createLeague')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function GroupCard({ g, role }) {
  const t = useT();
  return (
    <Link href={`/groups/${g.id}`} className="card" style={{ display: 'flex', alignItems: 'center', gap: '12px', textDecoration: 'none', padding: '14px 16px' }}>
      <div className="activity-avatar" style={{ width: 46, height: 46, fontSize: 18, flexShrink: 0, background: 'rgba(255,59,47,0.12)', color: 'var(--primary)' }}>
        {(g.name || 'G').charAt(0).toUpperCase()}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <strong style={{ fontSize: '15px', color: '#FFF', display: 'flex', alignItems: 'center', gap: '6px' }}>
          {g.name}
          {role === 'owner' && <Crown size={13} color="var(--secondary)" />}
        </strong>
        {g.description && <div style={{ fontSize: '12px', color: 'var(--text-dark-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.description}</div>}
        <span style={{ fontSize: '11px', color: 'var(--text-dark-secondary)', display: 'inline-flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
          {g.visibility === 'public' ? <><Globe size={11} /> {t('groups.publicLabel')}</> : <><Lock size={11} /> {t('groups.privateLabel')}</>}
          {role && <> · {role === 'owner' ? t('groups.roleOwner') : role === 'admin' ? t('groups.roleAdmin') : t('groups.roleMember')}</>}
        </span>
      </div>
    </Link>
  );
}
