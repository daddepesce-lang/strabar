'use client';

import { useEffect, useState } from 'react';
import { Loader, Check, X, Trash2, Plus } from 'lucide-react';

// Pannello admin "Area locali": richieste di gestione, catalogo servizi (prezzi/attivazione,
// anche per-locale) e ordini (attivazione manuale per pagamenti offline).
export default function VenuesBusinessAdmin() {
  const [section, setSection] = useState('claims');
  const [loading, setLoading] = useState(true);
  const [claims, setClaims] = useState([]);
  const [types, setTypes] = useState([]);
  const [overrides, setOverrides] = useState([]);
  const [orders, setOrders] = useState([]);
  const [busy, setBusy] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [c, s, o] = await Promise.all([
        fetch('/api/admin/venue-claims', { cache: 'no-store' }).then((r) => r.json()),
        fetch('/api/admin/venue-services', { cache: 'no-store' }).then((r) => r.json()),
        fetch('/api/admin/venue-orders', { cache: 'no-store' }).then((r) => r.json()),
      ]);
      setClaims(c.claims || []);
      setTypes(s.types || []);
      setOverrides(s.overrides || []);
      setOrders(o.orders || []);
    } catch { /* noop */ } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const post = async (url, body) => {
    setBusy(JSON.stringify(body));
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const d = await res.json();
      if (!res.ok) { alert(d.error || 'Errore'); return false; }
      await load();
      return true;
    } finally { setBusy(null); }
  };
  const del = async (url) => { if (!confirm('Eliminare?')) return; await fetch(url, { method: 'DELETE' }); await load(); };

  const euro = (c) => `€${((c || 0) / 100).toFixed(2).replace('.', ',')}`;

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Loader size={24} style={{ animation: 'spin 1s linear infinite' }} /></div>;

  const pendingClaims = claims.filter((c) => c.status === 'pending');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="seg-tabs admin-tabs">
        <button onClick={() => setSection('claims')} className={`seg-tab ${section === 'claims' ? 'active' : ''}`}>Richieste {pendingClaims.length ? `(${pendingClaims.length})` : ''}</button>
        <button onClick={() => setSection('services')} className={`seg-tab ${section === 'services' ? 'active' : ''}`}>Servizi</button>
        <button onClick={() => setSection('orders')} className={`seg-tab ${section === 'orders' ? 'active' : ''}`}>Ordini</button>
      </div>

      {section === 'claims' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {claims.length === 0 && <p style={{ color: 'var(--text-dark-secondary)', fontSize: 13 }}>Nessuna richiesta.</p>}
          {claims.map((c) => (
            <div key={c.id} className="card" style={{ padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                <div style={{ minWidth: 0 }}>
                  <strong style={{ color: '#FFF', fontSize: 15 }}>{c.venue_name}</strong>
                  <div style={{ fontSize: 12, color: 'var(--text-dark-secondary)' }}>
                    {c.requester?.display_name || c.requester?.username || c.user_id?.slice(0, 8)} · {new Date(c.created_at).toLocaleDateString('it-IT')}
                  </div>
                  {c.note && <p style={{ fontSize: 12, color: 'var(--text-dark-secondary)', marginTop: 6, fontStyle: 'italic' }}>“{c.note}”</p>}
                </div>
                <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', padding: '3px 8px', borderRadius: 20, flexShrink: 0,
                  background: c.status === 'approved' ? 'rgba(16,185,129,0.15)' : c.status === 'pending' ? 'rgba(223,255,0,0.15)' : 'rgba(239,68,68,0.15)',
                  color: c.status === 'approved' ? 'var(--success)' : c.status === 'pending' ? 'var(--secondary)' : 'var(--error)' }}>{c.status}</span>
              </div>
              {c.status === 'pending' && (
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <button onClick={() => post('/api/admin/venue-claims', { id: c.id, action: 'approve' })} className="btn btn-primary" style={{ flex: 1, borderRadius: 16, fontSize: 13, padding: 8 }}><Check size={14} /> Approva</button>
                  <button onClick={() => { const n = prompt('Motivo del rifiuto (facoltativo):') || ''; post('/api/admin/venue-claims', { id: c.id, action: 'reject', admin_note: n }); }} className="btn btn-secondary" style={{ flex: 1, borderRadius: 16, fontSize: 13, padding: 8, color: 'var(--error)' }}><X size={14} /> Rifiuta</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {section === 'services' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Catalogo */}
          <div className="card" style={{ padding: 14 }}>
            <h3 style={{ fontSize: 15, fontWeight: 800, marginBottom: 12 }}>Catalogo servizi</h3>
            {types.map((t) => (
              <ServiceTypeRow key={t.id} t={t} euro={euro} onSave={(patch) => post('/api/admin/venue-services', { id: t.id, ...patch })} onDelete={() => del(`/api/admin/venue-services?kind=type&id=${t.id}`)} busy={busy} />
            ))}
            <NewServiceType onCreate={(b) => post('/api/admin/venue-services', b)} />
          </div>

          {/* Override per-locale */}
          <div className="card" style={{ padding: 14 }}>
            <h3 style={{ fontSize: 15, fontWeight: 800, marginBottom: 4 }}>Prezzi/disponibilità per locale</h3>
            <p style={{ fontSize: 12, color: 'var(--text-dark-secondary)', marginBottom: 12 }}>Sovrascrivi prezzo o disattiva un servizio per un singolo locale (chiave = nome in minuscolo).</p>
            <NewOverride types={types} onCreate={(b) => post('/api/admin/venue-services', { kind: 'override', ...b })} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 12 }}>
              {overrides.map((o) => {
                const t = types.find((x) => x.id === o.service_type_id);
                return (
                  <div key={o.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-dark)', fontSize: 13 }}>
                    <span style={{ color: '#FFF', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.venue_key} · {t?.name || '?'}</span>
                    <span style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                      <span style={{ color: 'var(--text-dark-secondary)' }}>{o.price_cents != null ? euro(o.price_cents) : 'prezzo std'} · {o.enabled === false ? 'OFF' : o.enabled === true ? 'ON' : 'std'}</span>
                      <button onClick={() => del(`/api/admin/venue-services?kind=override&id=${o.id}`)} className="btn btn-secondary" style={{ padding: '2px 6px', borderRadius: 8 }}><Trash2 size={13} /></button>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {section === 'orders' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {orders.length === 0 && <p style={{ color: 'var(--text-dark-secondary)', fontSize: 13 }}>Nessun ordine.</p>}
          {orders.map((o) => (
            <div key={o.id} className="card" style={{ padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ minWidth: 0 }}>
                  <strong style={{ color: '#FFF', fontSize: 14 }}>{o.venue_name || o.venue_key}</strong>
                  <div style={{ fontSize: 12, color: 'var(--text-dark-secondary)' }}>{o.service_code} · {euro(o.amount_cents)} · {new Date(o.created_at).toLocaleDateString('it-IT')}</div>
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, color: o.status === 'active' ? 'var(--success)' : o.status === 'pending' ? 'var(--secondary)' : 'var(--text-dark-secondary)', flexShrink: 0 }}>{o.status}</span>
              </div>
              {o.status !== 'active' && o.status !== 'canceled' && (
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button onClick={() => post('/api/admin/venue-orders', { id: o.id, action: 'activate' })} className="btn btn-primary" style={{ flex: 1, borderRadius: 16, fontSize: 13, padding: 8 }}>Attiva (pagato offline)</button>
                  <button onClick={() => post('/api/admin/venue-orders', { id: o.id, action: 'cancel' })} className="btn btn-secondary" style={{ flex: 1, borderRadius: 16, fontSize: 13, padding: 8, color: 'var(--error)' }}>Annulla</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ServiceTypeRow({ t, euro, onSave, onDelete }) {
  const [price, setPrice] = useState(((t.default_price_cents || 0) / 100).toFixed(2));
  const [showPricing, setShowPricing] = useState(false);
  const [pricingTxt, setPricingTxt] = useState(JSON.stringify(t.pricing || {}, null, 2));
  const savePricing = () => {
    let parsed;
    try { parsed = JSON.parse(pricingTxt); } catch { alert('JSON non valido'); return; }
    onSave({ pricing: parsed });
  };
  return (
    <div style={{ padding: '8px 0', borderBottom: '1px solid var(--border-dark)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 120 }}>
          <strong style={{ color: '#FFF', fontSize: 14 }}>{t.name}</strong>
          <div style={{ fontSize: 11, color: 'var(--text-dark-secondary)' }}>{t.code} · {t.pricing?.model || 'flat'}</div>
        </div>
        <input type="number" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} title="prezzo base/fallback" style={{ width: 80, padding: '6px 8px', borderRadius: 8, background: 'var(--bg-input-dark)', border: '1px solid var(--border-dark)', color: '#FFF', fontSize: 13 }} />
        <button onClick={() => onSave({ default_price_cents: Math.round(parseFloat(price || '0') * 100) })} className="btn btn-secondary" style={{ padding: '6px 10px', borderRadius: 8, fontSize: 12 }}>Salva</button>
        <button onClick={() => onSave({ active: !t.active })} className="btn btn-secondary" style={{ padding: '6px 10px', borderRadius: 8, fontSize: 12, color: t.active ? 'var(--success)' : 'var(--error)' }}>{t.active ? 'Attivo' : 'Spento'}</button>
        <button onClick={() => setShowPricing((v) => !v)} className="btn btn-secondary" style={{ padding: '6px 10px', borderRadius: 8, fontSize: 12 }}>⚙︎ Prezzi</button>
        <button onClick={onDelete} className="btn btn-secondary" style={{ padding: '6px 8px', borderRadius: 8 }}><Trash2 size={13} /></button>
      </div>
      {showPricing && (
        <div style={{ marginTop: 8 }}>
          <p style={{ fontSize: 11, color: 'var(--text-dark-secondary)', marginBottom: 4 }}>Config prezzi (centesimi). per_day: per_day_cents, durations, position{'{feed,top}'}, discounts[{'{minDays,pct}'}]. audience: tiers{'{venue,recent30,nearby,all}'}. flat: base_cents, spotlight_extra_cents.</p>
          <textarea value={pricingTxt} onChange={(e) => setPricingTxt(e.target.value)} rows={7} className="form-control" style={{ fontSize: 12, fontFamily: 'monospace', resize: 'vertical' }} />
          <button onClick={savePricing} className="btn btn-primary" style={{ marginTop: 6, padding: '6px 12px', borderRadius: 8, fontSize: 12 }}>Salva prezzi</button>
        </div>
      )}
    </div>
  );
}

function NewServiceType({ onCreate }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ code: '', name: '', price: '' });
  if (!open) return <button onClick={() => setOpen(true)} className="btn btn-secondary" style={{ marginTop: 10, borderRadius: 12, fontSize: 13, padding: 8 }}><Plus size={14} /> Nuovo servizio</button>;
  return (
    <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <input placeholder="codice (es. spotlight)" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} className="form-control" style={{ fontSize: 13 }} />
      <input placeholder="nome visibile" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className="form-control" style={{ fontSize: 13 }} />
      <input type="number" step="0.01" placeholder="prezzo €" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} className="form-control" style={{ fontSize: 13 }} />
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={async () => { const ok = await onCreate({ code: f.code.trim(), name: f.name.trim(), default_price_cents: Math.round(parseFloat(f.price || '0') * 100) }); if (ok) { setOpen(false); setF({ code: '', name: '', price: '' }); } }} className="btn btn-primary" style={{ flex: 1, borderRadius: 12, fontSize: 13, padding: 8 }}>Crea</button>
        <button onClick={() => setOpen(false)} className="btn btn-secondary" style={{ flex: 1, borderRadius: 12, fontSize: 13, padding: 8 }}>Annulla</button>
      </div>
    </div>
  );
}

function NewOverride({ types, onCreate }) {
  const [f, setF] = useState({ venue_key: '', service_type_id: '', price: '', enabled: 'std' });
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <input placeholder="chiave locale (es. momi's pub)" value={f.venue_key} onChange={(e) => setF({ ...f, venue_key: e.target.value })} className="form-control" style={{ fontSize: 13 }} />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <select value={f.service_type_id} onChange={(e) => setF({ ...f, service_type_id: e.target.value })} className="form-control" style={{ fontSize: 13, flex: 1, minWidth: 120 }}>
          <option value="">servizio…</option>
          {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <input type="number" step="0.01" placeholder="prezzo € (vuoto=std)" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} className="form-control" style={{ fontSize: 13, width: 130 }} />
        <select value={f.enabled} onChange={(e) => setF({ ...f, enabled: e.target.value })} className="form-control" style={{ fontSize: 13, width: 100 }}>
          <option value="std">std</option>
          <option value="on">ON</option>
          <option value="off">OFF</option>
        </select>
      </div>
      <button onClick={async () => {
        if (!f.venue_key.trim() || !f.service_type_id) { alert('Chiave locale e servizio obbligatori'); return; }
        const ok = await onCreate({
          venue_key: f.venue_key, service_type_id: f.service_type_id,
          price_cents: f.price === '' ? null : Math.round(parseFloat(f.price) * 100),
          enabled: f.enabled === 'std' ? null : f.enabled === 'on',
        });
        if (ok) setF({ venue_key: '', service_type_id: '', price: '', enabled: 'std' });
      }} className="btn btn-primary" style={{ borderRadius: 12, fontSize: 13, padding: 8 }}>Imposta override</button>
    </div>
  );
}
