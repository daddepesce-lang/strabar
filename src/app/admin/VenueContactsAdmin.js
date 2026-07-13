'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader, Mail, Download, RefreshCw, Trash2, Search, Sparkles, Check, BadgeCheck } from 'lucide-react';

// CRM contatti locali per l'outreach (tester, locandine, passaparola).
// Tutto passa dall'API admin (/api/admin/venue-contacts) via service role.

const STATUSES = [
  { key: 'da_contattare', label: 'Da contattare', color: '#8A8F98' },
  { key: 'contattato', label: 'Contattato', color: '#3B82F6' },
  { key: 'interessato', label: 'Interessato', color: '#F5A623' },
  { key: 'tester', label: 'Tester', color: '#22C55E' },
  { key: 'rifiutato', label: 'Rifiutato', color: '#EF4444' },
];
const statusColor = (s) => (STATUSES.find((x) => x.key === s) || STATUSES[0]).color;

function csvCell(v) {
  const s = (v ?? '').toString();
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export default function VenueContactsAdmin() {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [edits, setEdits] = useState({}); // key -> patch
  const [rowBusy, setRowBusy] = useState(null);

  const load = () => {
    fetch('/api/admin/venue-contacts', { cache: 'no-store' })
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData({ contacts: [], missing: [] }));
  };
  useEffect(() => { load(); }, []);

  const post = async (bodyObj) => {
    const res = await fetch('/api/admin/venue-contacts', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(bodyObj),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j.error || 'Errore');
    return j;
  };

  const seed = async () => {
    setBusy(true);
    try { const j = await post({ action: 'seed' }); load(); alert(`Aggiunti ${j.added} locali al CRM.`); }
    catch (e) { alert(e.message); } finally { setBusy(false); }
  };

  const field = (key, f, orig) => (edits[key]?.[f] !== undefined ? edits[key][f] : orig);
  const setField = (key, f, v) => setEdits((p) => ({ ...p, [key]: { ...p[key], [f]: v } }));

  const saveRow = async (c) => {
    const patch = edits[c.key];
    if (!patch) return;
    setRowBusy(c.key);
    try {
      await post({ action: 'update', key: c.key, name: c.name, ...patch });
      setEdits((p) => { const n = { ...p }; delete n[c.key]; return n; });
      load();
    } catch (e) { alert(e.message); } finally { setRowBusy(null); }
  };

  const enrich = async (c) => {
    setRowBusy(c.key);
    try {
      const j = await post({ action: 'enrich', key: c.key, name: c.name, lat: c.lat, lng: c.lng });
      if (!j.found) alert('Nessun risultato Google per questo locale.');
      load();
    } catch (e) { alert(e.message); } finally { setRowBusy(null); }
  };

  const del = async (c) => {
    if (!confirm(`Rimuovere ${c.name} dal CRM?`)) return;
    setRowBusy(c.key);
    try { await post({ action: 'delete', key: c.key }); load(); }
    catch (e) { alert(e.message); } finally { setRowBusy(null); }
  };

  const contacts = data?.contacts || [];
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return contacts.filter((c) =>
      (filter === 'all' || c.status === filter) &&
      (!q || c.name.toLowerCase().includes(q) || (c.email || '').toLowerCase().includes(q) || (c.address || '').toLowerCase().includes(q))
    );
  }, [contacts, query, filter]);

  const exportCsv = () => {
    const cols = ['name', 'email', 'phone', 'instagram', 'website', 'address', 'status', 'notes'];
    const header = cols.join(',');
    const rows = filtered.map((c) => cols.map((k) => csvCell(c[k])).join(','));
    const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'strabar-contatti-locali.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (!data) return <div style={{ color: 'var(--text-dark-secondary)' }}><Loader size={16} style={{ animation: 'spin 1s linear infinite' }} /> Carico…</div>;

  const counts = STATUSES.map((s) => ({ ...s, n: contacts.filter((c) => c.status === s.key).length }));

  return (
    <div className="card" style={{ padding: 16 }}>
      <h3 style={{ fontSize: 15, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 4px' }}>
        <Mail size={17} color="var(--primary)" /> Contatti locali (CRM outreach)
      </h3>
      <p style={{ fontSize: 12, color: 'var(--text-dark-secondary)', margin: '0 0 14px' }}>
        Contatta i locali per proporre Strabar (tester, locandine, passaparola). Popola dai locali attivi,
        arricchisci telefono/sito da Google, esporta in CSV per il mail-merge.
      </p>

      {/* Azioni */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <button onClick={seed} disabled={busy} className="btn btn-primary" style={{ fontSize: 12, padding: '8px 14px' }}>
          {busy ? <Loader size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <RefreshCw size={13} />} Popola dai locali {data.missing?.length ? `(${data.missing.length} nuovi)` : ''}
        </button>
        <button onClick={exportCsv} className="btn btn-secondary" style={{ fontSize: 12, padding: '8px 14px' }}>
          <Download size={13} /> Esporta CSV ({filtered.length})
        </button>
      </div>

      {/* Riepilogo stati */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <button onClick={() => setFilter('all')} className={`btn ${filter === 'all' ? 'btn-primary' : 'btn-secondary'}`} style={{ fontSize: 11, padding: '5px 10px', borderRadius: 16 }}>Tutti ({contacts.length})</button>
        {counts.map((s) => (
          <button key={s.key} onClick={() => setFilter(s.key)} className={`btn ${filter === s.key ? 'btn-primary' : 'btn-secondary'}`} style={{ fontSize: 11, padding: '5px 10px', borderRadius: 16 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.color, display: 'inline-block', marginRight: 5 }} />{s.label} ({s.n})
          </button>
        ))}
      </div>

      {/* Ricerca */}
      <div style={{ position: 'relative', marginBottom: 12 }}>
        <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dark-secondary)' }} />
        <input className="form-control" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cerca per nome, email, indirizzo…" style={{ width: '100%', paddingLeft: 32, fontSize: 13 }} />
      </div>

      {contacts.length === 0 ? (
        <p style={{ textAlign: 'center', color: 'var(--text-dark-secondary)', fontSize: 13, padding: '24px' }}>
          CRM vuoto. Premi <strong>Popola dai locali</strong> per importare i locali attivi su Strabar.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map((c) => {
            const dirty = !!edits[c.key];
            const rb = rowBusy === c.key;
            return (
              <div key={c.key} style={{ background: 'var(--bg-input-dark)', border: '1px solid var(--border-dark)', borderRadius: 10, padding: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: '#fff', display: 'flex', alignItems: 'center', gap: 6 }}>
                      {c.name}
                      {c.verified && <BadgeCheck size={14} color="var(--secondary)" />}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-dark-secondary)' }}>{c.sessions || 0} presenze su Strabar</div>
                  </div>
                  <select
                    value={field(c.key, 'status', c.status)}
                    onChange={(e) => setField(c.key, 'status', e.target.value)}
                    style={{ fontSize: 11, padding: '4px 8px', borderRadius: 8, background: 'var(--bg-dark)', color: statusColor(field(c.key, 'status', c.status)), border: `1px solid ${statusColor(field(c.key, 'status', c.status))}`, fontWeight: 700 }}
                  >
                    {STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                  </select>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8 }}>
                  {[['email', 'Email'], ['phone', 'Telefono'], ['instagram', 'Instagram'], ['website', 'Sito']].map(([f, label]) => (
                    <input key={f} className="form-control" placeholder={label} value={field(c.key, f, c[f]) || ''} onChange={(e) => setField(c.key, f, e.target.value)} style={{ fontSize: 12, padding: '6px 8px' }} />
                  ))}
                </div>
                <textarea className="form-control" placeholder="Note (chi hai sentito, esito, prossimi passi…)" value={field(c.key, 'notes', c.notes) || ''} onChange={(e) => setField(c.key, 'notes', e.target.value)} rows={1} style={{ fontSize: 12, padding: '6px 8px', marginTop: 8, resize: 'vertical', width: '100%' }} />

                <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                  <button onClick={() => saveRow(c)} disabled={!dirty || rb} className="btn btn-primary" style={{ fontSize: 11, padding: '6px 12px' }}>
                    {rb ? <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={12} />} Salva
                  </button>
                  {data.googleEnabled && (
                    <button onClick={() => enrich(c)} disabled={rb} className="btn btn-secondary" style={{ fontSize: 11, padding: '6px 12px' }}>
                      <Sparkles size={12} /> Arricchisci da Google
                    </button>
                  )}
                  {c.website && <a href={c.website} target="_blank" rel="noopener noreferrer" className="btn btn-secondary" style={{ fontSize: 11, padding: '6px 12px' }}>Sito ↗</a>}
                  <button onClick={() => del(c)} disabled={rb} className="btn btn-secondary" style={{ fontSize: 11, padding: '6px 12px', marginLeft: 'auto', color: 'var(--error)' }}>
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
