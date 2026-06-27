'use client';

import { useEffect, useState, use as usePromise } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/db';
import { siteUrl } from '@/lib/site';
import {
  Users, Crown, Shield, Lock, Globe, Share2, LogOut, Trash2, Plus, X, ChevronLeft,
  Calendar, Trophy, UserPlus, UserMinus, PlusCircle, Search,
} from 'lucide-react';

import { publicName } from '@/lib/names';

const PERIODS = [
  { k: 'week', l: '📅 Settimana' },
  { k: 'weekend', l: '🎉 Weekend' },
  { k: 'all', l: '♾️ Sempre' },
];

export default function GroupDetailPage({ params }) {
  const { id } = usePromise(params);
  const router = useRouter();
  const [token, setToken] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [group, setGroup] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('board');
  const [period, setPeriod] = useState('week');
  const [board, setBoard] = useState([]);
  const [members, setMembers] = useState([]);
  const [events, setEvents] = useState([]);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  // creazione evento gruppo
  const [showEvent, setShowEvent] = useState(false);
  const [evTitle, setEvTitle] = useState('');
  const [evDate, setEvDate] = useState('');
  const [evDesc, setEvDesc] = useState('');
  // aggiunta membri (admin)
  const [addQ, setAddQ] = useState('');
  const [addResults, setAddResults] = useState([]);

  useEffect(() => {
    if (typeof window !== 'undefined') setToken(new URLSearchParams(window.location.search).get('t'));
  }, []);

  const loadAll = async () => {
    const g = await db.getGroup(id);
    setGroup(g);
    if (g && g.myRole) {
      const [m, e] = await Promise.all([db.getGroupMembers(id), db.getGroupEvents(id)]);
      setMembers(m); setEvents(e);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        setCurrentUser(await db.getCurrentUser());
        await loadAll();
      } finally { setLoading(false); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Ricarica classifica al cambio periodo (solo se membro)
  useEffect(() => {
    if (group?.myRole) db.getGroupBoard(id, period).then(setBoard).catch(() => {});
  }, [group?.myRole, period, id]);

  const isMember = !!group?.myRole;
  const canAdmin = group?.myRole === 'owner' || group?.myRole === 'admin';
  const isOwner = group?.myRole === 'owner';

  // Ricerca utenti da aggiungere (solo admin): esclude chi è già membro.
  useEffect(() => {
    if (!canAdmin) { setAddResults([]); return; }
    const h = setTimeout(() => {
      if (!addQ.trim()) { setAddResults([]); return; }
      db.searchProfiles(addQ).then((r) => {
        const ids = new Set(members.map((m) => m.user_id));
        setAddResults((r || []).filter((p) => !ids.has(p.id)).slice(0, 6));
      }).catch(() => {});
    }, 250);
    return () => clearTimeout(h);
  }, [addQ, canAdmin, members]);

  const addMember = async (uid) => {
    try {
      await db.addGroupMember(id, uid);
      setAddQ(''); setAddResults([]);
      setMembers(await db.getGroupMembers(id));
    } catch (e) { alert(e.message || 'Errore'); }
  };

  const handleJoin = async () => {
    setBusy(true);
    try {
      await db.joinGroup(id, token);
      await loadAll();
    } catch (e) { alert(e.message || 'Errore'); }
    finally { setBusy(false); }
  };

  const handleLeave = async () => {
    if (!confirm('Vuoi lasciare la lega?')) return;
    try { await db.leaveGroup(id); router.push('/groups'); }
    catch (e) { alert(e.message || 'Errore'); }
  };

  const handleDelete = async () => {
    if (!confirm('Eliminare la lega per tutti? Operazione irreversibile.')) return;
    try { await db.deleteGroup(id); router.push('/groups'); }
    catch (e) { alert(e.message || 'Errore'); }
  };

  const inviteUrl = () => siteUrl(`/groups/${id}${group?.share_token ? `?t=${group.share_token}` : ''}`);
  const copyInvite = async () => {
    try { await navigator.clipboard.writeText(inviteUrl()); setCopied(true); setTimeout(() => setCopied(false), 1800); }
    catch { /* noop */ }
  };

  const changeRole = async (uid, role) => {
    try { await db.setGroupRole(id, uid, role); setMembers(await db.getGroupMembers(id)); }
    catch (e) { alert(e.message || 'Errore'); }
  };
  const removeMember = async (uid) => {
    if (!confirm('Rimuovere questo membro dalla lega?')) return;
    try { await db.removeGroupMember(id, uid); setMembers(await db.getGroupMembers(id)); }
    catch (e) { alert(e.message || 'Errore'); }
  };

  const createGroupEvent = async () => {
    if (!evTitle.trim() || !evDate) { alert('Titolo e data sono obbligatori.'); return; }
    setBusy(true);
    try {
      await db.createEvent({ title: evTitle, date: evDate, description: evDesc, group_id: id, visibility: 'private', link_sharing: false });
      setShowEvent(false); setEvTitle(''); setEvDate(''); setEvDesc('');
      setEvents(await db.getGroupEvents(id));
    } catch (e) { alert(e.message || 'Errore'); }
    finally { setBusy(false); }
  };

  if (loading) return <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-dark-secondary)' }}>Caricamento…</div>;

  // Invitato (link) ma non ancora membro, oppure gruppo non accessibile
  if (!isMember) {
    return (
      <div style={{ maxWidth: '480px', margin: '0 auto' }}>
        <Link href="/groups" style={{ color: 'var(--text-dark-secondary)', fontSize: '14px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}><ChevronLeft size={16} /> Leghe</Link>
        <div className="card" style={{ textAlign: 'center', padding: '32px', marginTop: '16px' }}>
          <Users size={40} color="var(--primary)" style={{ margin: '0 auto 12px' }} />
          {group ? (
            <>
              <h2 style={{ fontSize: '20px', fontWeight: 800 }}>{group.name}</h2>
              {group.description && <p style={{ color: 'var(--text-dark-secondary)', fontSize: '14px', margin: '8px 0' }}>{group.description}</p>}
              <button onClick={handleJoin} disabled={busy || !currentUser} className="btn btn-primary" style={{ borderRadius: '20px', padding: '12px 24px', marginTop: '12px', fontWeight: 700 }}>
                {currentUser ? (busy ? 'Attendi…' : 'Unisciti alla lega') : 'Accedi per unirti'}
              </button>
              {!currentUser && (
                <button onClick={() => router.push(`/auth?next=${encodeURIComponent(`/groups/${id}${token ? `?t=${token}` : ''}`)}`)} className="btn btn-secondary" style={{ borderRadius: '20px', padding: '10px 20px', marginTop: '10px' }}>Accedi / Registrati</button>
              )}
            </>
          ) : token ? (
            <>
              <h2 style={{ fontSize: '18px', fontWeight: 800 }}>Sei stato invitato a una lega 🏆</h2>
              <p style={{ color: 'var(--text-dark-secondary)', fontSize: '14px', margin: '8px 0 16px' }}>Unisciti per vedere classifica ed eventi.</p>
              <button onClick={currentUser ? handleJoin : () => router.push(`/auth?next=${encodeURIComponent(`/groups/${id}?t=${token}`)}`)} disabled={busy} className="btn btn-primary" style={{ borderRadius: '20px', padding: '12px 24px', fontWeight: 700 }}>
                {currentUser ? (busy ? 'Attendi…' : 'Unisciti alla lega') : 'Accedi e unisciti'}
              </button>
            </>
          ) : (
            <p style={{ color: 'var(--text-dark-secondary)' }}>Lega non trovata o privata. Serve un invito.</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      <div>
        <Link href="/groups" style={{ color: 'var(--text-dark-secondary)', fontSize: '14px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}><ChevronLeft size={16} /> Leghe</Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginTop: '10px' }}>
          <div className="activity-avatar" style={{ width: 56, height: 56, fontSize: 22, flexShrink: 0, background: 'rgba(255,32,0,0.12)', color: 'var(--primary)' }}>{(group.name || 'G').charAt(0).toUpperCase()}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ fontSize: '24px', fontWeight: 800, lineHeight: 1.1 }}>{group.name}</h1>
            <span style={{ fontSize: '12px', color: 'var(--text-dark-secondary)', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
              {group.visibility === 'public' ? <><Globe size={12} /> Pubblico</> : <><Lock size={12} /> Privato</>}
              · {members.length} membri · {group.myRole === 'owner' ? 'Proprietario' : group.myRole === 'admin' ? 'Admin' : 'Membro'}
            </span>
          </div>
        </div>
        {group.description && <p style={{ color: 'var(--text-dark-secondary)', fontSize: '14px', marginTop: '10px' }}>{group.description}</p>}

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '14px' }}>
          <button onClick={() => router.push(`/log?group=${id}&groupName=${encodeURIComponent(group.name)}`)} className="btn btn-primary" style={{ borderRadius: '18px', padding: '9px 14px', fontSize: '13px', fontWeight: 700 }}>
            <PlusCircle size={16} /> Brinda con la lega
          </button>
          <button onClick={copyInvite} className="btn btn-secondary" style={{ borderRadius: '18px', padding: '9px 14px', fontSize: '13px' }}>
            <Share2 size={16} /> {copied ? 'Link copiato!' : 'Invita'}
          </button>
          {!isOwner && (
            <button onClick={handleLeave} className="btn btn-secondary" style={{ borderRadius: '18px', padding: '9px 14px', fontSize: '13px', color: 'var(--error)' }}>
              <LogOut size={16} /> Lascia
            </button>
          )}
        </div>
      </div>

      <div className="seg-tabs">
        <button onClick={() => setTab('board')} className={`seg-tab ${tab === 'board' ? 'active' : ''}`}><Trophy size={15} /> Classifica</button>
        <button onClick={() => setTab('events')} className={`seg-tab ${tab === 'events' ? 'active' : ''}`}><Calendar size={15} /> Eventi</button>
        <button onClick={() => setTab('members')} className={`seg-tab ${tab === 'members' ? 'active' : ''}`}><Users size={15} /> Membri</button>
      </div>

      {tab === 'board' && (
        <>
          <div className="seg-tabs feed-filter-tabs" style={{ maxWidth: '420px' }}>
            {PERIODS.map((p) => (
              <div key={p.k} className={`seg-tab ${period === p.k ? 'active' : ''}`} onClick={() => setPeriod(p.k)}>{p.l}</div>
            ))}
          </div>
          {board.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '32px', color: 'var(--text-dark-secondary)', fontSize: '14px' }}>
              Nessuna sessione della lega {period === 'week' ? 'questa settimana' : period === 'weekend' ? 'nel weekend' : 'finora'}.<br />
              Tocca <strong>“Brinda con la lega”</strong> per aprire la gara! 🍻
            </div>
          ) : (
            <div className="card" style={{ padding: '8px' }}>
              {board.map((u, i) => (
                <div key={u.user_id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 8px', borderBottom: i < board.length - 1 ? '1px solid var(--border-dark)' : 'none' }}>
                  <span style={{ width: 24, textAlign: 'center', fontWeight: 800, color: i === 0 ? 'var(--secondary)' : 'var(--text-dark-secondary)' }}>{i + 1}</span>
                  <Link href={`/u/${u.user_id}`} className="activity-avatar" style={{ width: 36, height: 36, fontSize: 14, flexShrink: 0, textDecoration: 'none' }}>{(u.name || 'A').charAt(0).replace('@', '').toUpperCase()}</Link>
                  <span style={{ flex: 1, minWidth: 0, color: '#FFF', fontWeight: 600, fontSize: '14px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.name}</span>
                  <span style={{ fontWeight: 800, color: 'var(--primary)' }}>{u.units} <span style={{ fontSize: '11px', color: 'var(--text-dark-secondary)' }}>U.A.</span></span>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'events' && (
        <>
          {canAdmin && (
            <button onClick={() => setShowEvent(true)} className="btn btn-secondary" style={{ borderRadius: '18px', padding: '10px', alignSelf: 'flex-start' }}>
              <Plus size={16} /> Crea evento della lega
            </button>
          )}
          {events.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '32px', color: 'var(--text-dark-secondary)', fontSize: '14px' }}>Nessun evento della lega.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {events.map((e) => (
                <Link key={e.id} href={`/events/${e.id}`} className="card" style={{ textDecoration: 'none', padding: '14px 16px' }}>
                  <strong style={{ color: '#FFF', fontSize: '15px' }}>{e.title}</strong>
                  <div style={{ fontSize: '12px', color: 'var(--text-dark-secondary)', marginTop: '3px' }}>
                    {e.date ? new Date(e.date).toLocaleString('it-IT', { dateStyle: 'medium', timeStyle: 'short' }) : ''}{e.location_name ? ` · ${e.location_name}` : ''}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'members' && canAdmin && (
        <div className="card" style={{ padding: '12px' }}>
          <label className="form-label" style={{ marginBottom: '6px', display: 'block' }}><UserPlus size={14} style={{ verticalAlign: '-2px' }} /> Aggiungi un membro</label>
          <div style={{ position: 'relative' }}>
            <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dark-secondary)' }} />
            <input className="form-control" placeholder="Cerca per nome o @username…" value={addQ} onChange={(e) => setAddQ(e.target.value)} style={{ paddingLeft: '34px' }} />
          </div>
          {addResults.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '8px' }}>
              {addResults.map((p) => (
                <button key={p.id} type="button" onClick={() => addMember(p.id)} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px', borderRadius: '8px', border: '1px solid var(--border-dark)', background: 'transparent', cursor: 'pointer', textAlign: 'left' }}>
                  <span className="activity-avatar" style={{ width: 30, height: 30, fontSize: 13, flexShrink: 0 }}>{publicName(p).charAt(0).replace('@', '').toUpperCase()}</span>
                  <span style={{ flex: 1, minWidth: 0, color: '#FFF', fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{publicName(p)}</span>
                  <Plus size={16} color="var(--primary)" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'members' && (
        <div className="card" style={{ padding: '8px' }}>
          {members.map((m, i) => (
            <div key={m.user_id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 8px', borderBottom: i < members.length - 1 ? '1px solid var(--border-dark)' : 'none' }}>
              <Link href={`/u/${m.user_id}`} className="activity-avatar" style={{ width: 36, height: 36, fontSize: 14, flexShrink: 0, textDecoration: 'none' }}>{(m.name || 'A').charAt(0).replace('@', '').toUpperCase()}</Link>
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ color: '#FFF', fontWeight: 600, fontSize: '14px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                  {m.name}
                  {m.role === 'owner' && <Crown size={13} color="var(--secondary)" />}
                  {m.role === 'admin' && <Shield size={12} color="var(--primary)" />}
                </span>
                <span style={{ fontSize: '11px', color: 'var(--text-dark-secondary)' }}>{m.role === 'owner' ? 'Proprietario' : m.role === 'admin' ? 'Admin' : 'Membro'}</span>
              </div>
              {canAdmin && m.role !== 'owner' && m.user_id !== currentUser?.id && (
                <div style={{ display: 'flex', gap: '6px' }}>
                  {m.role === 'member' ? (
                    <button onClick={() => changeRole(m.user_id, 'admin')} title="Promuovi admin" className="action-btn"><UserPlus size={16} /></button>
                  ) : (
                    <button onClick={() => changeRole(m.user_id, 'member')} title="Rimuovi admin" className="action-btn"><UserMinus size={16} /></button>
                  )}
                  <button onClick={() => removeMember(m.user_id)} title="Rimuovi dalla lega" className="action-btn" style={{ color: 'var(--error)' }}><X size={16} /></button>
                </div>
              )}
            </div>
          ))}
          {isOwner && (
            <button onClick={handleDelete} className="btn btn-secondary" style={{ width: '100%', marginTop: '10px', borderRadius: '14px', color: 'var(--error)' }}>
              <Trash2 size={16} /> Elimina lega
            </button>
          )}
        </div>
      )}

      {showEvent && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1500, padding: '20px' }}>
          <div className="card" style={{ maxWidth: '440px', width: '100%', position: 'relative', maxHeight: '85dvh', overflowY: 'auto' }}>
            <button onClick={() => setShowEvent(false)} aria-label="Chiudi" style={{ position: 'absolute', top: '10px', right: '10px', background: 'rgba(255,255,255,0.06)', borderRadius: '50%', width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', color: 'var(--text-dark-secondary)', cursor: 'pointer' }}><X size={22} /></button>
            <h2 style={{ fontSize: '19px', fontWeight: 800, marginBottom: '14px', paddingRight: '36px' }}>Evento della lega</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <input className="form-control" placeholder="Titolo *" value={evTitle} onChange={(e) => setEvTitle(e.target.value)} />
              <input type="datetime-local" className="form-control" value={evDate} onChange={(e) => setEvDate(e.target.value)} />
              <textarea className="form-control" rows={2} placeholder="Descrizione (opzionale)" value={evDesc} onChange={(e) => setEvDesc(e.target.value)} style={{ resize: 'none' }} />
              <button onClick={createGroupEvent} disabled={busy} className="btn btn-primary" style={{ borderRadius: '18px', padding: '11px', fontWeight: 700 }}>{busy ? 'Attendi…' : 'Crea evento'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
