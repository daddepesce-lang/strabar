'use client';

import { useEffect, useState } from 'react';
import { Loader, ShieldCheck, Download, FileCheck2, FileWarning, Search } from 'lucide-react';

const fmtDate = (d) => (d ? new Date(d).toLocaleString('it-IT') : '—');

function Kpi({ label, value, color, icon }) {
  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ fontSize: 11, color: 'var(--text-dark-secondary)', fontWeight: 700, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6 }}>{icon}{label}</div>
      <div style={{ fontSize: 28, fontWeight: 800, color: color || '#FFF', marginTop: 4 }}>{value}</div>
    </div>
  );
}

export default function GdprAdmin() {
  const [data, setData] = useState(null);
  const [q, setQ] = useState('');
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/admin/users', { cache: 'no-store' });
        setData(await res.json());
      } catch { setData({ users: [] }); }
    })();
  }, []);

  const flash = (type, text) => { setMsg({ type, text }); setTimeout(() => setMsg((m) => (m?.text === text ? null : m)), 5000); };

  const exportUser = async (u) => {
    setBusy(u.id);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'export_user', userId: u.id }),
      });
      const j = await res.json();
      if (!res.ok) { flash('error', j.error || 'Errore'); return; }
      const blob = new Blob([JSON.stringify(j.export, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `strabar_export_${u.username || u.id}.json`; a.click();
      URL.revokeObjectURL(url);
      flash('ok', 'Dati esportati.');
    } catch (e) { flash('error', e.message || 'Errore'); }
    finally { setBusy(''); }
  };

  if (!data) return <div style={{ color: 'var(--text-dark-secondary)' }}><Loader size={16} style={{ animation: 'spin 1s linear infinite' }} /> Carico…</div>;

  const users = data.users || [];
  const withConsent = data.gdpr?.withConsent ?? users.filter((u) => u.consent).length;
  const without = data.gdpr?.withoutConsent ?? (users.length - withConsent);

  const s = q.toLowerCase().trim();
  const rows = users.filter((u) => {
    if (onlyMissing && u.consent) return false;
    if (!s) return true;
    return (u.username || '').toLowerCase().includes(s) || (u.display_name || '').toLowerCase().includes(s) || (u.email || '').toLowerCase().includes(s);
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {msg && (
        <div style={{ padding: '10px 14px', borderRadius: 10, fontSize: 13, fontWeight: 600, background: msg.type === 'error' ? 'rgba(239,68,68,0.12)' : 'rgba(16,185,129,0.12)', color: msg.type === 'error' ? 'var(--error)' : 'var(--success)', border: `1px solid ${msg.type === 'error' ? 'rgba(239,68,68,0.4)' : 'rgba(16,185,129,0.4)'}` }}>{msg.text}</div>
      )}

      {/* KPI consensi */}
      <div className="r-grid-stat-4" style={{ gap: 12 }}>
        <Kpi label="Utenti totali" value={users.length} icon={<ShieldCheck size={13} />} />
        <Kpi label="Con consenso" value={withConsent} color="var(--success)" icon={<FileCheck2 size={13} />} />
        <Kpi label="Senza consenso" value={without} color={without ? 'var(--error)' : '#FFF'} icon={<FileWarning size={13} />} />
        <Kpi label="Copertura" value={`${users.length ? Math.round((withConsent / users.length) * 100) : 100}%`} color="var(--secondary)" />
      </div>

      {/* Nota informativa sui diritti */}
      <div className="card" style={{ padding: 16, fontSize: 12.5, color: 'var(--text-dark-secondary)', lineHeight: 1.6 }}>
        <strong style={{ color: '#FFF', fontSize: 13 }}>Come gestiamo i diritti GDPR</strong>
        <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
          <li><b style={{ color: '#FFF' }}>Consenso (art. 6/7):</b> registrato alla registrazione con versione delle condizioni e data, mostrati qui sotto.</li>
          <li><b style={{ color: '#FFF' }}>Accesso e portabilità (art. 15/20):</b> &ldquo;Esporta dati&rdquo; genera un JSON con profilo, sessioni e percorsi dell&apos;utente.</li>
          <li><b style={{ color: '#FFF' }}>Oblio (art. 17):</b> l&apos;utente può cancellarsi da Impostazioni; l&apos;admin può eliminare un account dalla scheda <b style={{ color: '#FFF' }}>Utenti</b> (cancella anche le foto su R2).</li>
        </ul>
      </div>

      {/* Registro consensi */}
      <div className="card" style={{ padding: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
          <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>Registro consensi</h3>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button type="button" onClick={() => setOnlyMissing((v) => !v)} className="btn btn-secondary" style={{ padding: '5px 12px', fontSize: 12, borderRadius: 16, border: onlyMissing ? '1px solid var(--error)' : '1px solid var(--border-dark)', color: onlyMissing ? 'var(--error)' : undefined }}>
              Solo senza consenso
            </button>
            <div style={{ position: 'relative', flex: '1 1 180px', maxWidth: 260 }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dark-secondary)' }} />
              <input className="form-control" placeholder="Cerca…" value={q} onChange={(e) => setQ(e.target.value)} style={{ height: 36, fontSize: 13, paddingLeft: 32 }} />
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {rows.map((u) => (
            <div key={u.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--border-dark)' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, color: '#FFF', fontWeight: 600 }}>
                  {u.display_name || u.username}
                  <span style={{ fontSize: 11, color: 'var(--text-dark-secondary)', marginLeft: 6 }}>@{u.username}</span>
                </div>
                <div style={{ fontSize: 11, marginTop: 2 }}>
                  {u.consent
                    ? <span style={{ color: 'var(--success)' }}>✓ Consenso v{u.consent_version} · {fmtDate(u.tos_accepted_at)}</span>
                    : <span style={{ color: 'var(--error)' }}>⚠️ Nessun consenso registrato (iscritto prima del consenso o dato mancante)</span>}
                </div>
              </div>
              <button type="button" disabled={busy === u.id} onClick={() => exportUser(u)} className="btn btn-secondary" style={{ padding: '6px 11px', fontSize: 12, borderRadius: 16, flexShrink: 0 }} title="Esporta dati (GDPR art. 15/20)">
                {busy === u.id ? <Loader size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Download size={13} />}
              </button>
            </div>
          ))}
          {rows.length === 0 && <p style={{ color: 'var(--text-dark-secondary)', fontSize: 13 }}>Nessun utente.</p>}
        </div>
      </div>
    </div>
  );
}
