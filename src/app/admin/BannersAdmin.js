'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader, Plus, Trash2, Image as ImageIcon, Search, MapPin, Upload, X } from 'lucide-react';
import { db } from '@/lib/db';

const CATEGORIES = [
  { key: 'locale', label: '🍸 Locale' },
  { key: 'taxi', label: '🚕 Taxi' },
  { key: 'ncc', label: '🚗 NCC' },
  { key: 'altro', label: '📦 Altro' },
];

const EMPTY = { title: '', body: '', image_url: '', link_url: '', cta: 'Scopri', partner: '', category: 'locale', priority: 0, active: true, starts_at: '', ends_at: '' };

export default function BannersAdmin() {
  const [banners, setBanners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [form, setForm] = useState(EMPTY);
  const [venueQ, setVenueQ] = useState('');
  const [venueRes, setVenueRes] = useState([]);
  const [venueSearching, setVenueSearching] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

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

  // Upload immagine del banner: comprime e carica su Storage (stesso bucket delle foto
  // sessione), poi salva la URL pubblica in image_url. Niente base64 → banner leggeri.
  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { setMsg('Errore: seleziona un file immagine.'); return; }
    setUploading(true); setMsg('');
    try {
      const url = await db.uploadFileToStorage(file);
      set('image_url', url);
    } catch (err) {
      setMsg('Errore upload: ' + (err.message || err));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  // Ricerca locale (geocoding): collega il banner a un locale reale precompilando
  // partner, link a Google Maps e titolo.
  const searchVenue = async () => {
    if (!venueQ.trim()) return;
    setVenueSearching(true); setVenueRes([]);
    try {
      const r = await db.searchVenues(venueQ.trim());
      setVenueRes((r || []).slice(0, 6));
    } catch { setVenueRes([]); } finally { setVenueSearching(false); }
  };
  const pickVenue = (v) => {
    const name = v.name || v.display_name?.split(',')[0] || venueQ;
    const maps = v.lat && v.lng ? `https://www.google.com/maps/search/?api=1&query=${v.lat},${v.lng}` : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}`;
    setForm((f) => ({ ...f, partner: name, link_url: maps, title: f.title || name, category: f.category === 'altro' ? 'locale' : f.category }));
    setVenueRes([]); setVenueQ('');
  };

  const create = async () => {
    if (!form.title.trim()) { setMsg('Titolo obbligatorio.'); return; }
    setBusy(true); setMsg('');
    try {
      const payload = {
        ...form,
        priority: parseInt(form.priority) || 0,
        starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : null,
        ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null,
      };
      const res = await fetch('/api/admin/banners', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
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

        {/* Ricerca locale: collega il banner a un locale reale (riempie partner + link mappe) */}
        <div>
          <label className="form-label" style={{ fontSize: 10 }}>Collega un locale (opzionale)</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="form-control" style={{ ...inputStyle, flex: 1 }} placeholder="Cerca un locale per nome/indirizzo…" value={venueQ}
              onChange={(e) => setVenueQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); searchVenue(); } }} />
            <button type="button" onClick={searchVenue} className="btn btn-secondary" style={{ borderRadius: 10, padding: '0 14px' }}>
              {venueSearching ? <Loader size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <Search size={15} />}
            </button>
          </div>
          {venueRes.length > 0 && (
            <div style={{ background: 'var(--bg-input-dark)', border: '1px solid var(--border-dark)', borderRadius: 8, marginTop: 6, overflow: 'hidden' }}>
              {venueRes.map((v, i) => (
                <button key={i} type="button" onClick={() => pickVenue(v)} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', background: 'transparent', border: 'none', borderBottom: i < venueRes.length - 1 ? '1px solid var(--border-dark)' : 'none', padding: '8px 10px', cursor: 'pointer', color: '#FFF' }}>
                  <MapPin size={12} color="var(--primary)" style={{ flexShrink: 0 }} />
                  <span style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.name || v.display_name}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <input className="form-control" style={inputStyle} placeholder="Titolo (es. Taxi Venezia 24h)" value={form.title} onChange={(e) => set('title', e.target.value)} />
        <textarea className="form-control" placeholder="Testo (es. Prenota il rientro sicuro con un tocco)" rows={2} value={form.body} onChange={(e) => set('body', e.target.value)} style={{ fontSize: 14, resize: 'vertical' }} />
        {/* Immagine del banner: carica un file (consigliato) oppure incolla una URL */}
        <div>
          <label className="form-label" style={{ fontSize: 10 }}>Immagine del banner (opzionale)</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'stretch', flexWrap: 'wrap' }}>
            <input className="form-control" style={{ ...inputStyle, flex: '1 1 200px' }} placeholder="Incolla una URL oppure carica →" value={form.image_url} onChange={(e) => set('image_url', e.target.value)} />
            <input ref={fileRef} type="file" accept="image/*" onChange={handleUpload} style={{ display: 'none' }} />
            <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} className="btn btn-secondary" style={{ borderRadius: 10, padding: '0 14px', gap: 6, whiteSpace: 'nowrap' }}>
              {uploading ? <Loader size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <Upload size={15} />} Carica
            </button>
          </div>
          {form.image_url && (
            <div style={{ position: 'relative', marginTop: 8, width: 'fit-content' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={form.image_url} alt="anteprima banner" style={{ maxHeight: 110, maxWidth: '100%', borderRadius: 10, border: '1px solid var(--border-dark)', display: 'block' }} />
              <button type="button" onClick={() => set('image_url', '')} title="Rimuovi immagine" style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(0,0,0,0.6)', border: 'none', borderRadius: '50%', width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#FFF' }}><X size={14} /></button>
            </div>
          )}
        </div>
        <input className="form-control" style={inputStyle} placeholder="Link (es. https://… o tel:+39…)" value={form.link_url} onChange={(e) => set('link_url', e.target.value)} />
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <input className="form-control" style={{ ...inputStyle, flex: '1 1 140px' }} placeholder="Partner" value={form.partner} onChange={(e) => set('partner', e.target.value)} />
          <input className="form-control" style={{ ...inputStyle, flex: '1 1 100px' }} placeholder="CTA" value={form.cta} onChange={(e) => set('cta', e.target.value)} />
          <select className="form-control" style={{ ...inputStyle, flex: '1 1 120px' }} value={form.category} onChange={(e) => set('category', e.target.value)}>
            {CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
          <input type="number" className="form-control" style={{ ...inputStyle, flex: '0 0 90px' }} placeholder="Priorità" value={form.priority} onChange={(e) => set('priority', e.target.value)} title="Priorità (più alto = mostrato prima)" />
        </div>
        {/* Durata: da quando a quando mostrarlo (vuoto = sempre / nessuna scadenza) */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 200px' }}>
            <label className="form-label" style={{ fontSize: 10 }}>Mostra da (opzionale)</label>
            <input type="datetime-local" className="form-control" style={inputStyle} value={form.starts_at} onChange={(e) => set('starts_at', e.target.value)} />
          </div>
          <div style={{ flex: '1 1 200px' }}>
            <label className="form-label" style={{ fontSize: 10 }}>Scadenza / fine (opzionale)</label>
            <input type="datetime-local" className="form-control" style={inputStyle} value={form.ends_at} onChange={(e) => set('ends_at', e.target.value)} />
          </div>
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
                {b.ends_at ? ` · scade ${new Date(b.ends_at).toLocaleDateString('it-IT')}` : ''}
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
