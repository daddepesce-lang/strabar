'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Loader, Search, Radar, MapPin, ShieldCheck, ShieldOff, Crown, KeyRound,
  Trash2, Download, ChevronDown, ExternalLink, AlertTriangle,
} from 'lucide-react';

function ago(d) {
  if (!d) return '—';
  const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
  if (m < 1) return 'ora';
  if (m < 60) return `${m}m fa`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h fa`;
  return `${Math.floor(h / 24)}g fa`;
}

const fmtDate = (d) => (d ? new Date(d).toLocaleString('it-IT') : '—');

export default function UsersAdmin() {
  const [data, setData] = useState(null);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all'); // all | admin | premium | noconsent
  const [expanded, setExpanded] = useState(null);
  const [busy, setBusy] = useState(''); // `${userId}:${action}`
  const [msg, setMsg] = useState(null); // { type, text }

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/users', { cache: 'no-store' });
      setData(await res.json());
    } catch { setData({ users: [], live: [] }); }
  }, []);

  // Caricamento iniziale (fetch inline per non far scattare la regola set-state-in-effect).
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/admin/users', { cache: 'no-store' });
        setData(await res.json());
      } catch { setData({ users: [], live: [] }); }
    })();
  }, []);

  const flash = (type, text) => { setMsg({ type, text }); setTimeout(() => setMsg((m) => (m?.text === text ? null : m)), 5000); };

  const act = async (action, user, opts = {}) => {
    const key = `${user.id}:${action}`;
    setBusy(key);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, userId: user.id, value: opts.value }),
      });
      const j = await res.json();
      if (!res.ok) { flash('error', j.error || 'Azione non riuscita'); return; }

      if (action === 'export_user' && j.export) {
        // Scarica il bundle dati GDPR come file JSON.
        const blob = new Blob([JSON.stringify(j.export, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `strabar_export_${user.username || user.id}.json`;
        a.click();
        URL.revokeObjectURL(url);
        flash('ok', 'Dati esportati (download avviato).');
        return;
      }

      flash('ok', j.message || 'Fatto.');
      // Le mutazioni cambiano lo stato: ricarica la lista.
      if (action !== 'reset_password') await load();
    } catch (e) {
      flash('error', e.message || 'Errore di rete');
    } finally {
      setBusy('');
    }
  };

  const confirmDelete = (user) => {
    if (!window.confirm(`Eliminare DEFINITIVAMENTE l'account di ${user.display_name || user.username}?\n\nVengono cancellati profilo, sessioni, percorsi, foto e ogni dato collegato (GDPR art. 17 — diritto all'oblio). Operazione irreversibile.`)) return;
    if (!window.confirm('Conferma definitiva: procedo con la cancellazione?')) return;
    act('delete_user', user);
  };

  if (!data) return <div style={{ color: 'var(--text-dark-secondary)' }}><Loader size={16} style={{ animation: 'spin 1s linear infinite' }} /> Carico…</div>;

  const s = q.toLowerCase().trim();
  const filtered = (data.users || []).filter((u) => {
    if (filter === 'admin' && !u.admin) return false;
    if (filter === 'premium' && !u.premium) return false;
    if (filter === 'noconsent' && u.consent) return false;
    if (!s) return true;
    return (u.username || '').toLowerCase().includes(s)
      || (u.display_name || '').toLowerCase().includes(s)
      || (u.email || '').toLowerCase().includes(s);
  });

  const isBusy = (id, a) => busy === `${id}:${a}`;
  const adminCount = (data.users || []).filter((u) => u.admin).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Feedback */}
      {msg && (
        <div style={{
          padding: '10px 14px', borderRadius: 10, fontSize: 13, fontWeight: 600,
          background: msg.type === 'error' ? 'rgba(239,68,68,0.12)' : 'rgba(16,185,129,0.12)',
          color: msg.type === 'error' ? 'var(--error)' : 'var(--success)',
          border: `1px solid ${msg.type === 'error' ? 'rgba(239,68,68,0.4)' : 'rgba(16,185,129,0.4)'}`,
        }}>
          {msg.text}
        </div>
      )}

      {/* Live ora */}
      <div className="card" style={{ padding: 18 }}>
        <h3 style={{ fontSize: 16, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 12px' }}>
          <Radar size={17} color="var(--success)" /> Live ora ({data.liveCount || 0})
        </h3>
        {(data.live || []).length === 0 ? (
          <p style={{ color: 'var(--text-dark-secondary)', fontSize: 13, margin: 0 }}>Nessuna sessione live in questo momento.</p>
        ) : data.live.map((sess) => (
          <div key={sess.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: '1px solid var(--border-dark)' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, color: '#FFF', fontWeight: 600 }}>
                <span style={{ color: 'var(--success)' }}>● </span>{sess.user}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-dark-secondary)', display: 'flex', alignItems: 'center', gap: 4 }}>
                {sess.geo && <MapPin size={11} />}{sess.place} · {ago(sess.started)}
              </div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <strong style={{ fontSize: 14, color: 'var(--primary)' }}>{sess.units} U.A.</strong>
              <div style={{ fontSize: 10, color: 'var(--text-dark-secondary)' }}>{sess.drinks} drink</div>
            </div>
          </div>
        ))}
      </div>

      {/* Utenti */}
      <div className="card" style={{ padding: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
          <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>Utenti ({data.total || 0}) · {adminCount} admin</h3>
          <div style={{ position: 'relative', flex: '1 1 200px', maxWidth: 280 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dark-secondary)' }} />
            <input className="form-control" placeholder="Cerca nome, username o email…" value={q} onChange={(e) => setQ(e.target.value)} style={{ height: 36, fontSize: 13, paddingLeft: 32 }} />
          </div>
        </div>

        {/* Filtri rapidi */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          {[
            ['all', `Tutti (${data.total || 0})`],
            ['admin', `Admin (${adminCount})`],
            ['premium', 'Premium'],
            ['noconsent', `Senza consenso (${data.gdpr?.withoutConsent ?? 0})`],
          ].map(([key, label]) => (
            <button key={key} type="button" onClick={() => setFilter(key)}
              className="btn btn-secondary"
              style={{ padding: '5px 12px', fontSize: 12, borderRadius: 16, border: filter === key ? '1px solid var(--primary)' : '1px solid var(--border-dark)', color: filter === key ? 'var(--primary)' : undefined, fontWeight: filter === key ? 700 : 500 }}>
              {label}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {filtered.map((u) => {
            const open = expanded === u.id;
            return (
              <div key={u.id} style={{ borderBottom: '1px solid var(--border-dark)' }}>
                {/* Riga */}
                <button type="button" onClick={() => setExpanded(open ? null : u.id)}
                  style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '11px 0', textAlign: 'left', fontFamily: 'inherit' }}>
                  <div style={{ minWidth: 0 }}>
                    <span style={{ fontSize: 13, color: '#FFF', fontWeight: 600 }}>{u.display_name || u.username}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-dark-secondary)', marginLeft: 6 }}>@{u.username}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                    {u.admin && <span style={{ fontSize: 9, fontWeight: 800, color: 'var(--primary)', border: '1px solid var(--primary)', borderRadius: 6, padding: '1px 5px' }}>ADMIN</span>}
                    {u.premium && <span style={{ fontSize: 9, fontWeight: 800, color: 'var(--secondary)' }}>PRO</span>}
                    {!u.consent && <span title="Consenso GDPR non registrato" style={{ fontSize: 11 }}>⚠️</span>}
                    <span style={{ fontSize: 11, color: 'var(--text-dark-secondary)' }}>{ago(u.created_at)}</span>
                    <ChevronDown size={15} style={{ color: 'var(--text-dark-secondary)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                  </div>
                </button>

                {/* Pannello azioni */}
                {open && (
                  <div style={{ padding: '6px 0 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {/* Dettagli */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8, background: 'var(--bg-input-dark)', borderRadius: 10, padding: 12, fontSize: 12 }}>
                      <div><span style={{ color: 'var(--text-dark-secondary)' }}>Email</span><br /><span style={{ color: '#FFF', wordBreak: 'break-all' }}>{u.email || '— (login social)'}</span></div>
                      <div><span style={{ color: 'var(--text-dark-secondary)' }}>Iscritto</span><br /><span style={{ color: '#FFF' }}>{fmtDate(u.created_at)}</span></div>
                      <div><span style={{ color: 'var(--text-dark-secondary)' }}>Ultimo accesso</span><br /><span style={{ color: '#FFF' }}>{u.last_sign_in_at ? fmtDate(u.last_sign_in_at) : '—'}</span></div>
                      <div>
                        <span style={{ color: 'var(--text-dark-secondary)' }}>Consenso GDPR</span><br />
                        {u.consent
                          ? <span style={{ color: 'var(--success)' }}>✓ v{u.consent_version} · {fmtDate(u.tos_accepted_at)}</span>
                          : <span style={{ color: 'var(--error)' }}>Non registrato</span>}
                      </div>
                    </div>

                    {/* Azioni */}
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <Link href={`/u/${u.id}`} className="btn btn-secondary" style={{ padding: '7px 12px', fontSize: 12, borderRadius: 16 }}>
                        <ExternalLink size={13} /> Profilo
                      </Link>

                      {u.admin ? (
                        <button type="button" disabled={u.protected || isBusy(u.id, 'set_admin')} onClick={() => act('set_admin', u, { value: false })}
                          className="btn btn-secondary" style={{ padding: '7px 12px', fontSize: 12, borderRadius: 16, opacity: u.protected ? 0.5 : 1 }}
                          title={u.protected ? 'Account fondatore: non retrocedibile' : 'Rimuovi i privilegi admin'}>
                          {isBusy(u.id, 'set_admin') ? <Loader size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <ShieldOff size={13} />} Rimuovi admin
                        </button>
                      ) : (
                        <button type="button" disabled={isBusy(u.id, 'set_admin')} onClick={() => act('set_admin', u, { value: true })}
                          className="btn btn-secondary" style={{ padding: '7px 12px', fontSize: 12, borderRadius: 16, color: 'var(--primary)', borderColor: 'var(--primary)' }}>
                          {isBusy(u.id, 'set_admin') ? <Loader size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <ShieldCheck size={13} />} Rendi admin
                        </button>
                      )}

                      <button type="button" disabled={isBusy(u.id, 'set_premium')} onClick={() => act('set_premium', u, { value: !u.premium })}
                        className="btn btn-secondary" style={{ padding: '7px 12px', fontSize: 12, borderRadius: 16 }}>
                        {isBusy(u.id, 'set_premium') ? <Loader size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Crown size={13} />} {u.premium ? 'Togli premium' : 'Rendi premium'}
                      </button>

                      <button type="button" disabled={!u.email || isBusy(u.id, 'reset_password')} onClick={() => act('reset_password', u)}
                        className="btn btn-secondary" style={{ padding: '7px 12px', fontSize: 12, borderRadius: 16, opacity: u.email ? 1 : 0.5 }}
                        title={u.email ? 'Invia email di reset password' : 'Utente senza email'}>
                        {isBusy(u.id, 'reset_password') ? <Loader size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <KeyRound size={13} />} Reset password
                      </button>

                      <button type="button" disabled={isBusy(u.id, 'export_user')} onClick={() => act('export_user', u)}
                        className="btn btn-secondary" style={{ padding: '7px 12px', fontSize: 12, borderRadius: 16 }}
                        title="Esporta tutti i dati dell'utente (GDPR art. 15/20)">
                        {isBusy(u.id, 'export_user') ? <Loader size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Download size={13} />} Esporta dati
                      </button>

                      <button type="button" disabled={u.protected || isBusy(u.id, 'delete_user')} onClick={() => confirmDelete(u)}
                        className="btn" style={{ padding: '7px 12px', fontSize: 12, borderRadius: 16, background: 'rgba(239,68,68,0.12)', color: 'var(--error)', border: '1px solid rgba(239,68,68,0.4)', opacity: u.protected ? 0.5 : 1 }}
                        title={u.protected ? 'Account fondatore: non eliminabile' : 'Elimina account (diritto all\'oblio)'}>
                        {isBusy(u.id, 'delete_user') ? <Loader size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Trash2 size={13} />} Elimina
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {filtered.length === 0 && <p style={{ color: 'var(--text-dark-secondary)', fontSize: 13 }}>Nessun utente trovato.</p>}
        </div>

        {/* Legenda */}
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border-dark)', fontSize: 11, color: 'var(--text-dark-secondary)' }}>
          <span><span style={{ color: 'var(--primary)', fontWeight: 800 }}>ADMIN</span> = amministratore</span>
          <span><span style={{ color: 'var(--secondary)', fontWeight: 800 }}>PRO</span> = premium</span>
          <span>⚠️ = consenso GDPR non registrato</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><AlertTriangle size={11} /> Tocca un utente per le azioni</span>
        </div>
      </div>
    </div>
  );
}
