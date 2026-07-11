'use client';

import { useEffect, useRef, useState } from 'react';
import { db } from '@/lib/db';
import { useT } from '@/lib/i18n';
import Avatar from '@/components/Avatar';
import { Beer, Reply, Pencil, Trash2, X, Send } from 'lucide-react';

// Sezione commenti condivisa (feed + modale dettaglio). Gestisce:
//  • cheers su ogni commento (mirror dei cheers-sessione, ottimistico, batch "cheerati da me");
//  • risposte a 1 livello (threading client-side su parent_id: la risposta a una risposta
//    resta agganciata al commento radice, stile Instagram);
//  • @menzioni con autocomplete (riusa db.searchProfiles) → notifica all'utente citato.
// Carica i commenti da sé (db.getComments, on-demand → egress trascurabile) e comunica il
// conteggio al genitore via onCountChange (per il badge del feed).
export default function CommentsSection({ activityId, currentUser, formatDate, onCountChange, autoFocus = false }) {
  const t = useT();
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [myCheers, setMyCheers] = useState(() => new Set());
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState(null);      // { rootId, name, username }
  const [editing, setEditing] = useState(null);      // { id, text }
  const [busy, setBusy] = useState(false);
  const [mentionQuery, setMentionQuery] = useState(null); // token dopo @ (o null)
  const [mentionResults, setMentionResults] = useState([]);
  const inputRef = useRef(null);
  const cheerInFlight = useRef(new Set());
  const mentionTimer = useRef(null);

  const notifyCount = (list) => { if (onCountChange) onCountChange(list.length); };

  const load = async () => {
    try {
      const rows = await db.getComments(activityId);
      setComments(rows);
      notifyCount(rows);
      if (currentUser && rows.length) {
        const ids = rows.map((r) => r.id);
        try { setMyCheers(await db.getMyCommentCheers(ids)); } catch { /* noop */ }
      }
    } catch (e) { console.warn('Caricamento commenti fallito:', e?.message || e); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [activityId]);
  useEffect(() => { if (autoFocus && inputRef.current) inputRef.current.focus(); }, [autoFocus]);

  // --- @menzione: rileva un token "@parola" a fine testo e cerca gli utenti ---
  const onTextChange = (val) => {
    setText(val);
    const m = val.match(/@([a-zA-Z0-9_.]{1,})$/);
    const token = m ? m[1] : null;
    setMentionQuery(token);
    if (mentionTimer.current) clearTimeout(mentionTimer.current);
    if (!token) { setMentionResults([]); return; }
    mentionTimer.current = setTimeout(async () => {
      try {
        const res = await db.searchProfiles(token);
        setMentionResults((res || []).slice(0, 6));
      } catch { setMentionResults([]); }
    }, 250);
  };
  const pickMention = (u) => {
    const uname = u.username || '';
    setText((prev) => prev.replace(/@([a-zA-Z0-9_.]{1,})$/, `@${uname} `));
    setMentionResults([]);
    setMentionQuery(null);
    inputRef.current?.focus();
  };

  // --- invio commento / risposta ---
  const submit = async (e) => {
    e?.preventDefault?.();
    const body = text.trim();
    if (!body || busy || !currentUser) return;
    setBusy(true);
    const parentId = replyTo?.rootId || null;
    // Ottimistico
    const temp = {
      id: 'tmp-' + Math.random().toString(36).slice(2),
      user_id: currentUser.id,
      user_name: currentUser.display_name || currentUser.username,
      username: currentUser.username || null,
      avatar_url: currentUser.avatar_url || null,
      text: body, parent_id: parentId, cheer_count: 0,
      created_at: new Date().toISOString(),
    };
    const optimistic = [...comments, temp];
    setComments(optimistic); notifyCount(optimistic);
    setText(''); setReplyTo(null); setMentionResults([]);
    try {
      const saved = await db.addComment(activityId, body, parentId);
      if (saved?.id) {
        setComments((prev) => prev.map((c) => (c.id === temp.id ? { ...temp, id: saved.id } : c)));
      }
    } catch (err) {
      // rollback
      setComments((prev) => { const next = prev.filter((c) => c.id !== temp.id); notifyCount(next); return next; });
      alert(err?.message || 'Errore invio commento');
    } finally { setBusy(false); }
  };

  const startReply = (c) => {
    const rootId = c.parent_id || c.id;      // 1 livello: aggancia sempre alla radice
    setReplyTo({ rootId, name: c.user_name, username: c.username });
    if (c.username) setText((prev) => (prev.startsWith(`@${c.username}`) ? prev : `@${c.username} `));
    inputRef.current?.focus();
  };

  const toggleCheer = async (c) => {
    if (!currentUser || cheerInFlight.current.has(c.id)) return;
    cheerInFlight.current.add(c.id);
    const has = myCheers.has(c.id);
    // ottimistico
    setMyCheers((prev) => { const n = new Set(prev); has ? n.delete(c.id) : n.add(c.id); return n; });
    setComments((prev) => prev.map((x) => (x.id === c.id ? { ...x, cheer_count: Math.max(0, (x.cheer_count || 0) + (has ? -1 : 1)) } : x)));
    try { await db.toggleCommentCheer(c.id); }
    catch {
      setMyCheers((prev) => { const n = new Set(prev); has ? n.add(c.id) : n.delete(c.id); return n; });
      setComments((prev) => prev.map((x) => (x.id === c.id ? { ...x, cheer_count: Math.max(0, (x.cheer_count || 0) + (has ? 1 : -1)) } : x)));
    } finally { cheerInFlight.current.delete(c.id); }
  };

  const saveEdit = async () => {
    if (!editing) return;
    const body = editing.text.trim();
    if (!body) return;
    setComments((prev) => prev.map((c) => (c.id === editing.id ? { ...c, text: body } : c)));
    const id = editing.id; setEditing(null);
    try { await db.updateComment(id, body); } catch (e) { console.warn('Modifica commento fallita:', e?.message || e); }
  };
  const remove = async (c) => {
    if (!confirm('Eliminare il commento?')) return;
    // elimina anche le risposte a questo commento (coerente con ON DELETE CASCADE)
    setComments((prev) => { const next = prev.filter((x) => x.id !== c.id && x.parent_id !== c.id); notifyCount(next); return next; });
    try { await db.deleteComment(c.id); } catch (e) { console.warn('Eliminazione commento fallita:', e?.message || e); }
  };

  // Evidenzia le @menzioni nel testo.
  const renderText = (s) => String(s).split(/(@[a-zA-Z0-9_.]+)/g).map((part, i) =>
    part.startsWith('@')
      ? <span key={i} style={{ color: 'var(--primary)', fontWeight: 600 }}>{part}</span>
      : <span key={i}>{part}</span>
  );

  // Threading: radici + risposte raggruppate per radice.
  const byId = new Map(comments.map((c) => [c.id, c]));
  const rootOf = (c) => { let cur = c; while (cur?.parent_id && byId.get(cur.parent_id)) cur = byId.get(cur.parent_id); return cur.id; };
  const roots = comments.filter((c) => !c.parent_id);
  const repliesByRoot = new Map();
  comments.filter((c) => c.parent_id).forEach((c) => {
    const r = rootOf(c);
    if (!repliesByRoot.has(r)) repliesByRoot.set(r, []);
    repliesByRoot.get(r).push(c);
  });

  // Funzione (NON componente) → nessun confine di componente, così l'input di modifica
  // non viene rimontato a ogni tasto e non perde il focus.
  const renderRow = (c, isReply) => {
    const mine = currentUser && c.user_id === currentUser.id;
    const cheered = myCheers.has(c.id);
    return (
      <div style={{ display: 'flex', gap: '10px', background: 'rgba(255,255,255,0.02)', padding: '10px', borderRadius: '8px', marginLeft: isReply ? '34px' : 0 }}>
        <Avatar src={c.avatar_url} name={c.user_name} size={isReply ? 24 : 28} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', flexWrap: 'wrap' }}>
            <strong style={{ fontSize: '13px' }}>{c.user_name}</strong>
            <span style={{ fontSize: '11px', color: 'var(--text-dark-tertiary)' }}>{formatDate ? formatDate(c.created_at) : ''}</span>
          </div>
          {editing?.id === c.id ? (
            <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
              <input value={editing.text} onChange={(e) => setEditing({ ...editing, text: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && saveEdit()} autoFocus
                style={{ flex: 1, fontSize: '13px', padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--border-dark)', background: 'var(--bg-dark)', color: 'var(--text-dark)' }} />
              <button onClick={saveEdit} style={btn}>{t('feed.saveBtn')}</button>
              <button onClick={() => setEditing(null)} style={btnGhost}>{t('feed.cancel')}</button>
            </div>
          ) : (
            <p style={{ fontSize: '13px', margin: '2px 0 0', wordBreak: 'break-word' }}>{renderText(c.text)}</p>
          )}
          {editing?.id !== c.id && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginTop: '6px' }}>
              <button onClick={() => toggleCheer(c)} disabled={!currentUser} title="Cheers"
                style={{ ...actionBtn, color: cheered ? 'var(--primary)' : 'var(--text-dark-tertiary)' }}>
                <Beer size={14} fill={cheered ? 'var(--primary)' : 'none'} />
                {c.cheer_count > 0 && <span style={{ fontSize: '11px' }}>{c.cheer_count}</span>}
              </button>
              {currentUser && (
                <button onClick={() => startReply(c)} style={actionBtn}><Reply size={14} /><span style={{ fontSize: '11px' }}>{t('feed.replyBtn')}</span></button>
              )}
              {mine && (
                <>
                  <button onClick={() => setEditing({ id: c.id, text: c.text })} style={actionBtn}><Pencil size={13} /></button>
                  <button onClick={() => remove(c)} style={actionBtn}><Trash2 size={13} /></button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
      {loading ? (
        <div style={{ fontSize: '12px', color: 'var(--text-dark-tertiary)', padding: '6px' }}>…</div>
      ) : (
        roots.map((c) => (
          <div key={c.id} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {renderRow(c, false)}
            {(repliesByRoot.get(c.id) || []).map((r) => <div key={r.id}>{renderRow(r, true)}</div>)}
          </div>
        ))
      )}

      {currentUser ? (
        <form onSubmit={submit} style={{ position: 'relative', marginTop: '4px' }}>
          {replyTo && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-dark-secondary)', padding: '2px 4px' }}>
              <span>{t('feed.replyingTo', { name: replyTo.name })}</span>
              <button type="button" onClick={() => setReplyTo(null)} style={{ ...actionBtn }}><X size={13} /></button>
            </div>
          )}
          {mentionResults.length > 0 && (
            <div style={{ position: 'absolute', bottom: '46px', left: 0, right: 0, background: 'var(--bg-dark-elevated, #1c1c22)', border: '1px solid var(--border-dark)', borderRadius: '10px', overflow: 'hidden', zIndex: 30, boxShadow: '0 8px 24px rgba(0,0,0,.4)' }}>
              {mentionResults.map((u) => (
                <button type="button" key={u.id} onClick={() => pickMention(u)}
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '8px 10px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dark)', textAlign: 'left' }}>
                  <Avatar src={u.avatar_url} name={u.display_name || u.username} size={22} />
                  <span style={{ fontSize: '13px' }}>{u.display_name || u.username}</span>
                  <span style={{ fontSize: '11px', color: 'var(--text-dark-tertiary)' }}>@{u.username}</span>
                </button>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              ref={inputRef}
              value={text}
              onChange={(e) => onTextChange(e.target.value)}
              placeholder={t('feed.commentPh')}
              style={{ flex: 1, fontSize: '13px', padding: '9px 12px', borderRadius: '10px', border: '1px solid var(--border-dark)', background: 'var(--bg-dark)', color: 'var(--text-dark)' }}
            />
            <button type="submit" disabled={busy || !text.trim()} style={{ ...btn, opacity: busy || !text.trim() ? 0.5 : 1, display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Send size={14} />{t('feed.sendBtn')}
            </button>
          </div>
        </form>
      ) : (
        <div style={{ fontSize: '12px', color: 'var(--text-dark-tertiary)', padding: '6px' }}>{t('session.loginToComment')}</div>
      )}
    </div>
  );
}

const btn = { fontSize: '12px', fontWeight: 700, padding: '8px 12px', borderRadius: '10px', border: 'none', cursor: 'pointer', background: 'var(--primary)', color: '#fff' };
const btnGhost = { fontSize: '12px', fontWeight: 700, padding: '8px 12px', borderRadius: '10px', border: '1px solid var(--border-dark)', cursor: 'pointer', background: 'transparent', color: 'var(--text-dark-secondary)' };
const actionBtn = { display: 'flex', alignItems: 'center', gap: '4px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dark-tertiary)', padding: 0 };
