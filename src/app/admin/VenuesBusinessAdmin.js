'use client';

import { useEffect, useState } from 'react';
import { Loader, Check, X, Trash2, Plus } from 'lucide-react';
import AccountPicker from './AccountPicker';

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
  const [picker, setPicker] = useState(null); // { venue_key, venue_name } per collegare un account

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
                  {c.details && (
                    <div style={{ fontSize: 12, color: 'var(--text-dark-secondary)', marginTop: 6, lineHeight: 1.5 }}>
                      {c.details.contact_name && <div>👤 {c.details.contact_name} {c.details.role ? `(${c.details.role})` : ''}</div>}
                      {(c.details.phone || c.details.email) && <div>📞 {[c.details.phone, c.details.email].filter(Boolean).join(' · ')}</div>}
                      {c.details.business_name && <div>🏢 {c.details.business_name}{c.details.vat ? ` · P.IVA ${c.details.vat}` : ''}</div>}
                      {c.details.address && <div>📍 {c.details.address}</div>}
                      {c.details.website && <div>🔗 {c.details.website}</div>}
                    </div>
                  )}
                  {c.note && <p style={{ fontSize: 12, color: 'var(--text-dark-secondary)', marginTop: 6, fontStyle: 'italic' }}>“{c.note}”</p>}
                </div>
                <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', padding: '3px 8px', borderRadius: 20, flexShrink: 0,
                  background: c.status === 'approved' ? 'rgba(16,185,129,0.15)' : c.status === 'pending' ? 'rgba(223,255,0,0.15)' : 'rgba(239,68,68,0.15)',
                  color: c.status === 'approved' ? 'var(--success)' : c.status === 'pending' ? 'var(--secondary)' : 'var(--error)' }}>{c.status}</span>
              </div>
              {c.status === 'pending' && (
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <button onClick={async () => { const r = await post('/api/admin/venue-claims', { id: c.id, action: 'approve' }); if (r) alert(r.linked ? 'Approvata e account collegato ✅' : r.emailedTo ? `Approvata. Email d'invito inviata a ${r.emailedTo} (si collega registrandosi con quella email).` : 'Approvata. Nessuna email nel form: collega l’account a mano.'); }} className="btn btn-primary" style={{ flex: 1, borderRadius: 16, fontSize: 13, padding: 8 }}><Check size={14} /> Approva</button>
                  <button onClick={() => { const n = prompt('Motivo del rifiuto (facoltativo):') || ''; post('/api/admin/venue-claims', { id: c.id, action: 'reject', admin_note: n }); }} className="btn btn-secondary" style={{ flex: 1, borderRadius: 16, fontSize: 13, padding: 8, color: 'var(--error)' }}><X size={14} /> Rifiuta</button>
                </div>
              )}
              {/* Collega un account Strabar (per email) a questo locale → account di tipo "locale" */}
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button
                  onClick={() => setPicker({ venue_key: c.venue_key, venue_name: c.venue_name })}
                  className="btn btn-secondary" style={{ flex: 1, borderRadius: 16, fontSize: 12, padding: 7 }}>
                  🔗 Collega {c.user_id ? '(ricollega)' : 'account'}
                </button>
                {c.status === 'approved' && c.user_id && (
                  <button
                    onClick={() => { if (confirm(`Scollegare l'account dal locale "${c.venue_name}"? Perderà l'accesso all'area gestione.`)) post('/api/admin/venue-claims', { action: 'unlink', id: c.id }); }}
                    className="btn btn-secondary" style={{ flex: 1, borderRadius: 16, fontSize: 12, padding: 7, color: 'var(--error)' }}>
                    ✖ Scollega
                  </button>
                )}
              </div>
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
          <div className="card" style={{ padding: 12, fontSize: 12, color: 'var(--text-dark-secondary)', lineHeight: 1.5 }}>
            Cosa fa un ordine <strong style={{ color: '#FFF' }}>attivo</strong> e <strong>dove si vede</strong>:
            <br />• <strong style={{ color: '#FFF' }}>promo</strong> → crea un <strong>banner nel feed</strong> (lo gestisci anche in <em>Banner</em>) per N giorni.
            <br />• <strong style={{ color: '#FFF' }}>sponsored_event</strong> → mette l&apos;evento <strong>in cima a Eventi</strong> (+ card nel feed se Spotlight).
            <br />• <strong style={{ color: '#FFF' }}>notify</strong> → invia una notifica ai clienti (già inviata all&apos;attivazione).
            <br /><strong style={{ color: 'var(--secondary)' }}>Annulla</strong> ferma subito il banner/sponsor nel feed. <strong style={{ color: 'var(--error)' }}>Elimina</strong> rimuove l&apos;ordine e il suo effetto.
          </div>
          {orders.length === 0 && <p style={{ color: 'var(--text-dark-secondary)', fontSize: 13 }}>Nessun ordine.</p>}
          {orders.map((o) => (
            <div key={o.id} className="card" style={{ padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ minWidth: 0 }}>
                  <strong style={{ color: '#FFF', fontSize: 14 }}>{o.venue_name || o.venue_key}</strong>
                  <div style={{ fontSize: 12, color: 'var(--text-dark-secondary)' }}>{o.service_code} · {euro(o.amount_cents)} · {new Date(o.created_at).toLocaleDateString('it-IT')}</div>
                  {o.ref_id && <div style={{ fontSize: 11, color: 'var(--text-dark-tertiary)' }}>rif: {o.ref_id}</div>}
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, color: o.status === 'active' ? 'var(--success)' : o.status === 'pending' ? 'var(--secondary)' : 'var(--text-dark-secondary)', flexShrink: 0 }}>{o.status}</span>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                {o.status !== 'active' && o.status !== 'canceled' && (
                  <button onClick={() => post('/api/admin/venue-orders', { id: o.id, action: 'activate' })} className="btn btn-primary" style={{ flex: 1, minWidth: 120, borderRadius: 16, fontSize: 13, padding: 8 }}>Attiva (pagato offline)</button>
                )}
                {o.status === 'active' && (
                  <button onClick={() => { if (confirm('Annullare questo ordine? Il banner/sponsor nel feed verrà fermato subito.')) post('/api/admin/venue-orders', { id: o.id, action: 'cancel' }); }} className="btn btn-secondary" style={{ flex: 1, minWidth: 120, borderRadius: 16, fontSize: 13, padding: 8, color: 'var(--secondary)' }}>Annulla (ferma nel feed)</button>
                )}
                {o.status !== 'active' && o.status !== 'canceled' && (
                  <button onClick={() => post('/api/admin/venue-orders', { id: o.id, action: 'cancel' })} className="btn btn-secondary" style={{ flex: 1, minWidth: 100, borderRadius: 16, fontSize: 13, padding: 8, color: 'var(--secondary)' }}>Annulla</button>
                )}
                <button onClick={() => { if (confirm('Eliminare definitivamente questo ordine? Verrà fermato anche il suo effetto (banner/sponsor).')) post('/api/admin/venue-orders', { id: o.id, action: 'delete' }); }} className="btn btn-secondary" style={{ borderRadius: 16, fontSize: 13, padding: '8px 12px', color: 'var(--error)' }}><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {picker && (
        <AccountPicker
          title={`Collega un account a "${picker.venue_name}"`}
          onClose={() => setPicker(null)}
          onPick={async (u) => { setPicker(null); await post('/api/admin/venue-claims', { action: 'link_account', user_id: u.id, venue_key: picker.venue_key, venue_name: picker.venue_name }); }}
        />
      )}
    </div>
  );
}

function ServiceTypeRow({ t, euro, onSave, onDelete }) {
  const [price, setPrice] = useState(((t.default_price_cents || 0) / 100).toFixed(2));
  const [showPricing, setShowPricing] = useState(false);
  const modelLabel = { flat: 'prezzo fisso', per_day: 'a giornata', audience: 'per pubblico' }[t.pricing?.model || 'flat'];
  return (
    <div style={{ padding: '8px 0', borderBottom: '1px solid var(--border-dark)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 120 }}>
          <strong style={{ color: '#FFF', fontSize: 14 }}>{t.name}</strong>
          <div style={{ fontSize: 11, color: 'var(--text-dark-secondary)' }}>{t.code} · {modelLabel}</div>
        </div>
        <input type="number" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} title="prezzo base/fallback (usato se la config prezzi non lo specifica)" style={{ width: 80, padding: '6px 8px', borderRadius: 8, background: 'var(--bg-input-dark)', border: '1px solid var(--border-dark)', color: '#FFF', fontSize: 13 }} />
        <button onClick={() => onSave({ default_price_cents: Math.round(parseFloat(price || '0') * 100) })} className="btn btn-secondary" style={{ padding: '6px 10px', borderRadius: 8, fontSize: 12 }}>Salva</button>
        <button onClick={() => onSave({ active: !t.active })} className="btn btn-secondary" style={{ padding: '6px 10px', borderRadius: 8, fontSize: 12, color: t.active ? 'var(--success)' : 'var(--error)' }}>{t.active ? 'Attivo' : 'Spento'}</button>
        <button onClick={() => setShowPricing((v) => !v)} className="btn btn-secondary" style={{ padding: '6px 10px', borderRadius: 8, fontSize: 12, color: showPricing ? 'var(--primary)' : undefined }}>⚙︎ Prezzi</button>
        <button onClick={onDelete} className="btn btn-secondary" style={{ padding: '6px 8px', borderRadius: 8 }}><Trash2 size={13} /></button>
      </div>
      {showPricing && (
        <PricingEditor pricing={t.pricing} fallbackCents={t.default_price_cents} euro={euro} onSave={(pricing) => { onSave({ pricing }); setShowPricing(false); }} />
      )}
    </div>
  );
}

// ——— Editor prezzi visuale (niente più JSON a mano) ———
// Tre modelli: prezzo fisso (flat), a giornata (per_day), per pubblico (audience).
// I prezzi si inseriscono in EURO e vengono salvati in centesimi nel campo `pricing`.
const toCents = (eur) => Math.round(parseFloat(String(eur).replace(',', '.') || '0') * 100);
const toEur = (cents) => ((cents || 0) / 100).toFixed(2);

const MODELS = [
  { v: 'flat', label: 'Prezzo fisso', hint: 'Un prezzo unico (con eventuale extra opzionale).' },
  { v: 'per_day', label: 'A giornata', hint: 'Prezzo al giorno × durata scelta, con sconti volume e posizione.' },
  { v: 'audience', label: 'Per pubblico', hint: 'Prezzo diverso in base a quante persone raggiunge.' },
];

const AUDIENCE_ROWS = [
  { key: 'venue', label: 'Clienti del locale' },
  { key: 'recent30', label: 'Clienti ultimi 30 giorni' },
  { key: 'nearby', label: 'Utenti in zona' },
  { key: 'all', label: 'Tutti gli utenti' },
];

function NumField({ label, value, onChange, suffix = '€', step = '0.01', width = 90, hint }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span style={{ fontSize: 11, color: 'var(--text-dark-secondary)' }}>{label}</span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
        <input type="number" step={step} value={value} onChange={(e) => onChange(e.target.value)} style={{ width, padding: '7px 9px', borderRadius: 8, background: 'var(--bg-input-dark)', border: '1px solid var(--border-dark)', color: '#FFF', fontSize: 13 }} />
        <span style={{ fontSize: 12, color: 'var(--text-dark-secondary)' }}>{suffix}</span>
      </span>
      {hint && <span style={{ fontSize: 10, color: 'var(--text-dark-secondary)' }}>{hint}</span>}
    </label>
  );
}

function PricingEditor({ pricing, fallbackCents, euro, onSave }) {
  const init = pricing && Object.keys(pricing).length ? pricing : { model: 'flat' };
  const [model, setModel] = useState(init.model || 'flat');

  // flat
  const [base, setBase] = useState(toEur(init.base_cents ?? fallbackCents));
  const [spotlight, setSpotlight] = useState(toEur(init.spotlight_extra_cents));

  // per_day
  const [perDay, setPerDay] = useState(toEur(init.per_day_cents ?? fallbackCents));
  const [durations, setDurations] = useState((init.durations || [3, 7, 14, 30]).join(', '));
  const [topMult, setTopMult] = useState(String(init.position?.top ?? 1.5));
  const [discounts, setDiscounts] = useState(init.discounts || []);

  // audience
  const [tiers, setTiers] = useState({
    venue: toEur(init.tiers?.venue ?? fallbackCents),
    recent30: toEur(init.tiers?.recent30),
    nearby: toEur(init.tiers?.nearby),
    all: toEur(init.tiers?.all),
  });
  const [nearbyKm, setNearbyKm] = useState(String(init.nearby_km ?? 3));

  const build = () => {
    if (model === 'per_day') {
      const durs = durations.split(',').map((d) => parseInt(d.trim(), 10)).filter((n) => n > 0);
      return {
        model: 'per_day',
        per_day_cents: toCents(perDay),
        durations: durs.length ? durs : [7],
        position: { feed: 1, top: parseFloat(topMult) || 1 },
        discounts: discounts
          .map((d) => ({ minDays: parseInt(d.minDays, 10) || 0, pct: parseInt(d.pct, 10) || 0 }))
          .filter((d) => d.minDays > 0 && d.pct > 0),
      };
    }
    if (model === 'audience') {
      return {
        model: 'audience',
        tiers: {
          venue: toCents(tiers.venue),
          recent30: toCents(tiers.recent30),
          nearby: toCents(tiers.nearby),
          all: toCents(tiers.all),
        },
        nearby_km: parseFloat(nearbyKm) || 3,
      };
    }
    return { model: 'flat', base_cents: toCents(base), spotlight_extra_cents: toCents(spotlight) };
  };

  // Anteprima del prezzo "minimo" che vedrà il locale (orientativo).
  const preview = (() => {
    const p = build();
    if (p.model === 'per_day') return `${euro(p.per_day_cents)}/giorno · es. ${p.durations[0]}gg = ${euro(p.per_day_cents * p.durations[0])}`;
    if (p.model === 'audience') return `da ${euro(Math.min(...Object.values(p.tiers).filter((x) => x > 0)) || 0)} a ${euro(Math.max(...Object.values(p.tiers)))}`;
    return `${euro(p.base_cents)}${p.spotlight_extra_cents ? ` (+${euro(p.spotlight_extra_cents)} extra)` : ''}`;
  })();

  return (
    <div style={{ marginTop: 10, padding: 12, borderRadius: 12, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-dark)', display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Modello */}
      <div>
        <div style={{ fontSize: 11, color: 'var(--text-dark-secondary)', textTransform: 'uppercase', fontWeight: 700, marginBottom: 6 }}>Come si calcola il prezzo</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {MODELS.map((m) => (
            <button key={m.v} onClick={() => setModel(m.v)} className="btn btn-secondary"
              style={{ padding: '7px 12px', borderRadius: 10, fontSize: 12, fontWeight: 700, border: model === m.v ? '1px solid var(--primary)' : '1px solid var(--border-dark)', color: model === m.v ? 'var(--primary)' : undefined }}>
              {m.label}
            </button>
          ))}
        </div>
        <p style={{ fontSize: 11, color: 'var(--text-dark-secondary)', marginTop: 6 }}>{MODELS.find((m) => m.v === model).hint}</p>
      </div>

      {/* Campi per modello */}
      {model === 'flat' && (
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          <NumField label="Prezzo" value={base} onChange={setBase} />
          <NumField label="Extra Spotlight+ (opz.)" value={spotlight} onChange={setSpotlight} hint="0 = nessun extra" />
        </div>
      )}

      {model === 'per_day' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            <NumField label="Prezzo al giorno" value={perDay} onChange={setPerDay} />
            <NumField label="Moltiplicatore 'in cima'" value={topMult} onChange={setTopMult} suffix="×" step="0.1" width={70} hint="es. 1.5 = +50%" />
          </div>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span style={{ fontSize: 11, color: 'var(--text-dark-secondary)' }}>Durate acquistabili (giorni, separati da virgola)</span>
            <input value={durations} onChange={(e) => setDurations(e.target.value)} placeholder="3, 7, 14, 30" style={{ padding: '7px 9px', borderRadius: 8, background: 'var(--bg-input-dark)', border: '1px solid var(--border-dark)', color: '#FFF', fontSize: 13 }} />
          </label>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 11, color: 'var(--text-dark-secondary)' }}>Sconti volume (da X giorni → −Y%)</span>
              <button onClick={() => setDiscounts((d) => [...d, { minDays: '', pct: '' }])} className="btn btn-secondary" style={{ padding: '3px 8px', borderRadius: 8, fontSize: 11 }}><Plus size={12} /> sconto</button>
            </div>
            {discounts.map((d, i) => (
              <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 12, color: 'var(--text-dark-secondary)' }}>da</span>
                <input type="number" value={d.minDays} onChange={(e) => setDiscounts((arr) => arr.map((x, j) => j === i ? { ...x, minDays: e.target.value } : x))} style={{ width: 60, padding: '6px 8px', borderRadius: 8, background: 'var(--bg-input-dark)', border: '1px solid var(--border-dark)', color: '#FFF', fontSize: 13 }} />
                <span style={{ fontSize: 12, color: 'var(--text-dark-secondary)' }}>gg →</span>
                <input type="number" value={d.pct} onChange={(e) => setDiscounts((arr) => arr.map((x, j) => j === i ? { ...x, pct: e.target.value } : x))} style={{ width: 60, padding: '6px 8px', borderRadius: 8, background: 'var(--bg-input-dark)', border: '1px solid var(--border-dark)', color: '#FFF', fontSize: 13 }} />
                <span style={{ fontSize: 12, color: 'var(--text-dark-secondary)' }}>%</span>
                <button onClick={() => setDiscounts((arr) => arr.filter((_, j) => j !== i))} className="btn btn-secondary" style={{ padding: '4px 7px', borderRadius: 8 }}><Trash2 size={12} /></button>
              </div>
            ))}
          </div>
        </div>
      )}

      {model === 'audience' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {AUDIENCE_ROWS.map((r) => (
            <div key={r.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 13, color: '#FFF' }}>{r.label}</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <input type="number" step="0.01" value={tiers[r.key]} onChange={(e) => setTiers((tt) => ({ ...tt, [r.key]: e.target.value }))} style={{ width: 90, padding: '7px 9px', borderRadius: 8, background: 'var(--bg-input-dark)', border: '1px solid var(--border-dark)', color: '#FFF', fontSize: 13 }} />
                <span style={{ fontSize: 12, color: 'var(--text-dark-secondary)' }}>€</span>
              </span>
            </div>
          ))}
          <NumField label="Raggio 'in zona'" value={nearbyKm} onChange={setNearbyKm} suffix="km" step="0.5" width={70} />
        </div>
      )}

      {/* Anteprima + salva */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, borderTop: '1px solid var(--border-dark)', paddingTop: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: 'var(--text-dark-secondary)' }}>Anteprima: <strong style={{ color: 'var(--secondary)' }}>{preview}</strong></span>
        <button onClick={() => onSave(build())} className="btn btn-primary" style={{ padding: '7px 16px', borderRadius: 10, fontSize: 13, fontWeight: 700 }}>Salva prezzi</button>
      </div>
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
