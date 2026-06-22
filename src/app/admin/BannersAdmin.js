'use client';

import { useEffect, useState } from 'react';
import { Loader, Plus, Trash2, Image as ImageIcon } from 'lucide-react';

const CATEGORIES = [
  { key: 'locale', label: '🍸 Locale' },
  { key: 'taxi', label: '🚕 Taxi' },
  { key: 'ncc', label: '🚗 NCC' },
  { key: 'altro', label: '📦 Altro' },
];

const EMPTY = { title: '', body: '', image_url: '', link_url: '', cta: 'Scopri', partner: '', category: 'locale', priority: 0, active: true };

export default function BannersAdmin() {
  const [banners, setBanners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [form, setForm] = useState(EMPTY);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/banners', { cache: 'no-store' });
      const j = await res.json();
      setBanners(j.banners || []);
    } catch { /* noop */ } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const create = async () => {
    if (!form.title.trim()) { setMsg('Titolo obbligatorio.'); return; }
    setBusy(true); setMsg('');
    try {
      const res = await fetch('/api/admin/banners', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, priority: parseInt(form.priority) || 0 }) });
      const j = await res.json();
      if (!res.ok) { setMsg('Errore: ' + (j.error || '')); return; }
      setForm(EMPTY); load();
    } catch (err) { setMsg('Errore: ' + (err.message || err)); } finally { setBusy(false); }
  };

  const toggle = async (b) => {
    await fetch('/api/admin/banners', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: b.id, active: !b.active }) });
    load();
  };
  const remove = async (id) => {
    if (!window.confirm('Eliminare questo banner?')) return;
    await fetch(`/api/admin/banners?id=${id}`, { method: 'DELETE' });
    load();
  };

  const inputStyle = { width: '100%', height: 40, fontSize: 14 };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h3 style={{ fontSize: 16, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
          <ImageIcon size={17} color="var(--primary)" /> Nuovo banner
        </h3>
        <input className="form-control" style={inputStyle} placeholder="Titolo (es. Taxi Venezia 24h)" value={form.title} onChange={(e) => set('title', e.target.value)} />
        <textarea className="form-control" placeholder="Testo (es. Prenota il rientro sicuro con un tocco)" rows={2} value={form.body} onChange={(e) => set('body', e.target.value)} style={{ fontSize: 14, resize: 'vertical' }} />
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <input className="form-control" style={{ ...inputStyle, flex: '1 1 220px' }} placeholder="URL immagine (opzionale)" value={form.image_url} onChange={(e) => set('image_url', e.target.value)} />
          <input className="form-control" style={{ ...inputStyle, flex: '1 1 220px' }} placeholder="Link (es. https://… o tel:+39…)" value={form.link_url} onChange={(e) => set('link_url', e.target.value)} />
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <input className="form-control" style={{ ...inputStyle, flex: '1 1 140px' }} placeholder="Partner" value={form.partner} onChange={(e) => set('partner', e.target.value)} />
          <input className="form-control" style={{ ...inputStyle, flex: '1 1 100px' }} placeholder="CTA" value={form.cta} onChange={(e) => set('cta', e.target.value)} />
          <select className="form-control" style={{ ...inputStyle, flex: '1 1 120px' }} value={form.category} onChange={(e) => set('category', e.target.value)}>
            {CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
          <input type="number" className="form-control" style={{ ...inputStyle, flex: '0 0 90px' }} placeholder="Priorità" value={form.priority} onChange={(e) => set('priority', e.target.value)} title="Priorità (più alto = mostrato prima)" />
        </div>
        {msg && <div style={{ fontSize: 13, color: msg.startsWith('Errore') ? 'var(--error)' : 'var(--success)' }}>{msg}</div>}
        <button onClick={create} disabled={busy} className="btn btn-primary" style={{ borderRadius: 14, justifyContent: 'center', gap: 6 }}>
          {busy ? <Loader size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <Plus size={15} />} Crea banner
        </button>
      </div>

      <div className="card" style={{ padding: 18 }}>
        <h3 style={{ fontSize: 15, fontWeight: 800, marginBottom: 12 }}>Banner attivi e in archivio</h3>
        {loading ? (
          <div style={{ color: 'var(--text-dark-secondary)' }}><Loader size={16} style={{ animation: 'spin 1s linear infinite' }} /> Carico…</div>
        ) : banners.length === 0 ? (
          <p style={{ color: 'var(--text-dark-secondary)', fontSize: 13 }}>Nessun banner ancora.</p>
        ) : banners.map((b) => (
          <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--border-dark)' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, color: '#FFF', fontWeight: 600 }}>
                {b.title} {b.partner && <span style={{ color: 'var(--text-dark-secondary)', fontWeight: 400 }}>· {b.partner}</span>}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-dark-secondary)', marginTop: 2 }}>
                {CATEGORIES.find((c) => c.key === b.category)?.label || b.category} · priorità {b.priority}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <button onClick={() => toggle(b)} className="btn btn-secondary" style={{ fontSize: 11, padding: '4px 10px', borderRadius: 12, color: b.active ? 'var(--success)' : 'var(--text-dark-secondary)' }}>
                {b.active ? '● Attivo' : '○ Spento'}
              </button>
              <button onClick={() => remove(b.id)} className="action-btn" title="Elimina" style={{ color: 'var(--error)' }}><Trash2 size={16} /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
