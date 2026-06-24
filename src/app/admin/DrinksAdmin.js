'use client';

import { useEffect, useState } from 'react';
import { QUICK_DRINKS, EXTRA_DRINKS, BEER_FAMILIES } from '@/lib/drinks';
import { db } from '@/lib/db';
import { Calculator, Beer, Search, Plus, Trash2, Save, RotateCcw, Loader, ChevronDown } from 'lucide-react';

// Formule ALLINEATE all'app (src/lib/db.js): 1 U.A. = 8 g, U.A. ≈ litri × gradi%,
// BAC picco = grammi / (peso × r), r = 0,68 (uomo) / 0,55 (donna).
const GRAMS_PER_UA = 8;
const uaFromVolAbv = (ml, abv) => (ml / 1000) * abv;
const gramsFromUA = (ua) => ua * GRAMS_PER_UA;
const peakBac = (ua, weight, r) => (weight > 0 ? gramsFromUA(ua) / (weight * r) : 0);
const bacColor = (b) => (b >= 0.5 ? 'var(--bac-high)' : b >= 0.2 ? 'var(--bac-mid)' : 'var(--bac-low)');

const DEFAULT_CATALOG = () => JSON.parse(JSON.stringify({ quick: QUICK_DRINKS, extra: EXTRA_DRINKS, beerFamilies: BEER_FAMILIES }));

// Nome "pulito" dal label (toglie l'emoji/simbolo iniziale): es. "🍺 Birra Media" → "Birra Media".
const cleanName = (label) => String(label || '').replace(/^[^\p{L}\d]+/u, '').trim();

function Inp({ value, onChange, type = 'text', w = 70, step, placeholder }) {
  return (
    <input
      className="form-control" type={type} value={value ?? ''} step={step} placeholder={placeholder}
      onChange={(e) => onChange(type === 'number' ? (e.target.value === '' ? '' : parseFloat(e.target.value)) : e.target.value)}
      // fontSize 16 = niente zoom automatico su iOS quando tocchi il campo; height 40 = comodo su PWA
      style={{ height: 40, fontSize: 16, padding: '8px 10px', width: w, minWidth: 0, maxWidth: '100%' }}
    />
  );
}

export default function DrinksAdmin() {
  const [weight, setWeight] = useState(70);
  const [sex, setSex] = useState('m');
  const [q, setQ] = useState('');
  const [vol, setVol] = useState(400);
  const [abv, setAbv] = useState(5);

  const [cat, setCat] = useState(null);      // catalogo in editing
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [openFam, setOpenFam] = useState(null);

  const r = sex === 'm' ? 0.68 : 0.55;

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/admin/config', { cache: 'no-store' });
        const j = await res.json();
        const dc = j?.config?.drink_catalog;
        setCat(dc && dc.quick && dc.extra && dc.beerFamilies ? dc : DEFAULT_CATALOG());
      } catch { setCat(DEFAULT_CATALOG()); }
      finally { setLoading(false); }
    })();
  }, []);

  const flash = (type, text) => { setMsg({ type, text }); setTimeout(() => setMsg((m) => (m?.text === text ? null : m)), 5000); };

  // Helpers di mutazione immutabile
  const updItem = (section, i, field, val) => setCat((c) => {
    const arr = [...c[section]]; arr[i] = { ...arr[i], [field]: val }; return { ...c, [section]: arr };
  });
  // Modifica l'etichetta e ricava da essa il "nome" (senza emoji): l'admin scrive un solo campo.
  const updLabel = (section, i, val) => setCat((c) => {
    const arr = [...c[section]]; arr[i] = { ...arr[i], label: val, name: cleanName(val) }; return { ...c, [section]: arr };
  });
  const updSizeLabel = (fi, si, val) => setCat((c) => {
    const f = [...c.beerFamilies]; const sizes = [...f[fi].sizes]; sizes[si] = { ...sizes[si], label: val, name: cleanName(val) }; f[fi] = { ...f[fi], sizes }; return { ...c, beerFamilies: f };
  });
  const delItem = (section, i) => setCat((c) => ({ ...c, [section]: c[section].filter((_, k) => k !== i) }));
  const addItem = (section) => setCat((c) => ({ ...c, [section]: [...c[section], { name: 'Nuovo drink', abv: 0, units: 0, label: '🍸 Nuovo' }] }));

  const updFam = (fi, field, val) => setCat((c) => { const f = [...c.beerFamilies]; f[fi] = { ...f[fi], [field]: val }; return { ...c, beerFamilies: f }; });
  const delFam = (fi) => setCat((c) => ({ ...c, beerFamilies: c.beerFamilies.filter((_, k) => k !== fi) }));
  const addFam = () => setCat((c) => ({ ...c, beerFamilies: [...c.beerFamilies, { key: `fam${Date.now()}`, label: '🍺 Nuova', abv: 5, sizes: [] }] }));
  const updSize = (fi, si, field, val) => setCat((c) => {
    const f = [...c.beerFamilies]; const sizes = [...f[fi].sizes]; sizes[si] = { ...sizes[si], [field]: val }; f[fi] = { ...f[fi], sizes }; return { ...c, beerFamilies: f };
  });
  const delSize = (fi, si) => setCat((c) => { const f = [...c.beerFamilies]; f[fi] = { ...f[fi], sizes: f[fi].sizes.filter((_, k) => k !== si) }; return { ...c, beerFamilies: f }; });
  const addSize = (fi) => setCat((c) => { const f = [...c.beerFamilies]; const fam = f[fi]; f[fi] = { ...fam, sizes: [...fam.sizes, { name: `${fam.label.replace(/^🍺\s*/, '')} Nuova`, abv: fam.abv, units: 1.0, label: '🍺 Nuova', size: 'Media 0,4L' }] }; return { ...c, beerFamilies: f }; });

  const save = async () => {
    // Pulisce i numeri (string vuote → 0).
    const clean = (d) => ({ ...d, abv: Number(d.abv) || 0, units: Number(d.units) || 0 });
    const payload = {
      quick: cat.quick.map(clean),
      extra: cat.extra.map(clean),
      beerFamilies: cat.beerFamilies.map((f) => ({ ...f, abv: Number(f.abv) || 0, sizes: f.sizes.map(clean) })),
    };
    setSaving(true);
    try {
      const res = await fetch('/api/admin/config', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ drink_catalog: payload }) });
      const j = await res.json();
      if (!res.ok) { flash('error', j.error || 'Salvataggio non riuscito'); return; }
      db.clearDrinkCatalogCache?.(); // così le modifiche si vedono subito nell'app (questo browser)
      flash('ok', 'Catalogo salvato. I client lo aggiornano entro 24h (cache).');
    } catch (e) { flash('error', e.message || 'Errore'); }
    finally { setSaving(false); }
  };

  const resetDefault = async () => {
    if (!window.confirm('Ripristinare il catalogo di default (statico)? Le modifiche salvate verranno rimosse.')) return;
    setSaving(true);
    try {
      const res = await fetch('/api/admin/config', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ drink_catalog: null }) });
      if (!res.ok) { const j = await res.json(); flash('error', j.error || 'Errore'); return; }
      db.clearDrinkCatalogCache?.();
      setCat(DEFAULT_CATALOG());
      flash('ok', 'Catalogo ripristinato ai valori di default.');
    } catch (e) { flash('error', e.message || 'Errore'); }
    finally { setSaving(false); }
  };

  const calcUA = uaFromVolAbv(Number(vol) || 0, Number(abv) || 0);
  const calcBac = peakBac(calcUA, Number(weight), r);

  const matches = (d) => !q.trim() || (d.name || '').toLowerCase().includes(q.toLowerCase()) || (d.label || '').toLowerCase().includes(q.toLowerCase());

  if (loading || !cat) return <div style={{ color: 'var(--text-dark-secondary)' }}><Loader size={16} style={{ animation: 'spin 1s linear infinite' }} /> Carico catalogo…</div>;

  const rowBac = (d) => peakBac(Number(d.units) || 0, Number(weight), r);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {msg && (
        <div style={{ padding: '10px 14px', borderRadius: 10, fontSize: 13, fontWeight: 600, position: 'sticky', top: 76, zIndex: 5, background: msg.type === 'error' ? 'rgba(239,68,68,0.14)' : 'rgba(16,185,129,0.14)', color: msg.type === 'error' ? 'var(--error)' : 'var(--success)', border: `1px solid ${msg.type === 'error' ? 'rgba(239,68,68,0.4)' : 'rgba(16,185,129,0.4)'}` }}>{msg.text}</div>
      )}

      {/* Persona riferimento + calcolatore */}
      <div className="card" style={{ padding: 16 }}>
        <h3 style={{ fontSize: 15, fontWeight: 800, margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Beer size={17} color="var(--primary)" /> Gestione drink — U.A. e tasso (formula Widmark)
        </h3>
        <p style={{ fontSize: 12, color: 'var(--text-dark-secondary)', margin: '0 0 12px', lineHeight: 1.5 }}>
          1 U.A. = {GRAMS_PER_UA} g · U.A. ≈ litri × gradi% · BAC picco = grammi / (peso × r). Persona di riferimento per l&apos;anteprima del tasso:
        </p>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label style={{ fontSize: 12, color: 'var(--text-dark-secondary)' }}>Peso (kg)<br /><Inp type="number" value={weight} onChange={setWeight} w={90} /></label>
          <div style={{ fontSize: 12, color: 'var(--text-dark-secondary)' }}>Sesso (r)<br />
            <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
              <button type="button" onClick={() => setSex('m')} className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: 12, borderRadius: 14, border: sex === 'm' ? '1px solid var(--primary)' : '1px solid var(--border-dark)', color: sex === 'm' ? 'var(--primary)' : undefined }}>♂ 0,68</button>
              <button type="button" onClick={() => setSex('f')} className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: 12, borderRadius: 14, border: sex === 'f' ? '1px solid var(--primary)' : '1px solid var(--border-dark)', color: sex === 'f' ? 'var(--primary)' : undefined }}>♀ 0,55</button>
            </div>
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, background: 'var(--bg-input-dark)', borderRadius: 10, padding: '8px 12px', border: '1px solid var(--border-dark)' }}>
            <Calculator size={15} color="var(--secondary)" style={{ marginBottom: 6 }} />
            <label style={{ fontSize: 11, color: 'var(--text-dark-secondary)' }}>ml<br /><Inp type="number" value={vol} onChange={setVol} w={70} /></label>
            <label style={{ fontSize: 11, color: 'var(--text-dark-secondary)' }}>% vol<br /><Inp type="number" step="0.1" value={abv} onChange={setAbv} w={64} /></label>
            <div style={{ fontSize: 11, color: 'var(--text-dark-secondary)' }}>→ <b style={{ color: 'var(--primary)', fontSize: 14 }}>{calcUA.toFixed(2)} U.A.</b> · <b style={{ color: bacColor(calcBac), fontSize: 14 }}>{calcBac.toFixed(2)} g/l</b></div>
          </div>
        </div>
      </div>

      {/* Barra azioni */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <button type="button" onClick={save} disabled={saving} className="btn btn-primary" style={{ padding: '9px 18px', borderRadius: 20, fontSize: 14 }}>
          {saving ? <Loader size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={15} />} Salva catalogo
        </button>
        <button type="button" onClick={resetDefault} disabled={saving} className="btn btn-secondary" style={{ padding: '9px 16px', borderRadius: 20, fontSize: 13 }}>
          <RotateCcw size={14} /> Ripristina default
        </button>
        <div style={{ position: 'relative', flex: '1 1 180px', maxWidth: 260 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dark-secondary)' }} />
          <input className="form-control" placeholder="Filtra drink…" value={q} onChange={(e) => setQ(e.target.value)} style={{ height: 34, fontSize: 13, paddingLeft: 32 }} />
        </div>
      </div>

      {/* Sezioni Quick / Extra */}
      {[['quick', '⚡ Rapidi (1-tap)'], ['extra', '📋 Estesi (altri drink)']].map(([section, title]) => (
        <div key={section} className="card" style={{ padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <h3 style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>{title} ({cat[section].length})</h3>
            <button type="button" onClick={() => addItem(section)} className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: 12, borderRadius: 14 }}><Plus size={13} /> Aggiungi</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {cat[section].map((d, i) => matches(d) && (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 8, borderTop: '1px solid var(--border-dark)', paddingTop: 12 }}>
                <label style={{ fontSize: 11, color: 'var(--text-dark-secondary)', fontWeight: 700 }}>
                  Nome drink
                  <Inp value={d.label} onChange={(v) => updLabel(section, i, v)} w="100%" placeholder="es. 🍷 Vino Rosso" />
                </label>
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                  <label style={{ fontSize: 11, color: 'var(--text-dark-secondary)', fontWeight: 700 }}>Gradi °<br /><Inp type="number" step="0.1" value={d.abv} onChange={(v) => updItem(section, i, 'abv', v)} w={84} /></label>
                  <label style={{ fontSize: 11, color: 'var(--text-dark-secondary)', fontWeight: 700 }}>U.A.<br /><Inp type="number" step="0.1" value={d.units} onChange={(v) => updItem(section, i, 'units', v)} w={84} /></label>
                  <div style={{ fontSize: 11, color: 'var(--text-dark-secondary)', fontWeight: 700 }}>BAC<br /><span style={{ fontSize: 18, fontWeight: 800, color: bacColor(rowBac(d)) }}>{rowBac(d).toFixed(2)}</span></div>
                  <div style={{ flex: 1 }} />
                  <button type="button" onClick={() => delItem(section, i)} title="Elimina" className="btn btn-secondary" style={{ padding: '8px 12px', borderRadius: 12, color: 'var(--error)' }}><Trash2 size={16} /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Sezione Birre (famiglie + taglie) */}
      <div className="card" style={{ padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <h3 style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>🍺 Birre — famiglie e taglie ({cat.beerFamilies.length})</h3>
          <button type="button" onClick={addFam} className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: 12, borderRadius: 14 }}><Plus size={13} /> Famiglia</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {cat.beerFamilies.map((f, fi) => {
            const open = openFam === fi;
            return (
              <div key={fi} style={{ border: '1px solid var(--border-dark)', borderRadius: 10, padding: 10 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <button type="button" onClick={() => setOpenFam(open ? null : fi)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dark-secondary)' }}>
                    <ChevronDown size={16} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
                  </button>
                  <label style={{ fontSize: 10, color: 'var(--text-dark-secondary)' }}>Etichetta<br /><Inp value={f.label} onChange={(v) => updFam(fi, 'label', v)} w={130} /></label>
                  <label style={{ fontSize: 10, color: 'var(--text-dark-secondary)' }}>key<br /><Inp value={f.key} onChange={(v) => updFam(fi, 'key', v)} w={90} /></label>
                  <label style={{ fontSize: 10, color: 'var(--text-dark-secondary)' }}>ABV%<br /><Inp type="number" step="0.1" value={f.abv} onChange={(v) => updFam(fi, 'abv', v)} w={60} /></label>
                  <span style={{ fontSize: 11, color: 'var(--text-dark-secondary)' }}>{f.sizes.length} taglie</span>
                  <div style={{ flex: 1 }} />
                  <button type="button" onClick={() => delFam(fi)} title="Elimina famiglia" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--error)' }}><Trash2 size={15} /></button>
                </div>
                {open && (
                  <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {f.sizes.map((s, si) => (
                      <div key={si} style={{ display: 'flex', flexDirection: 'column', gap: 8, borderTop: '1px solid var(--border-dark)', paddingTop: 10 }}>
                        <label style={{ fontSize: 11, color: 'var(--text-dark-secondary)', fontWeight: 700 }}>Nome taglia<Inp value={s.label} onChange={(v) => updSizeLabel(fi, si, v)} w="100%" placeholder="es. 🍺 Bionda Media 0,4L" /></label>
                        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                          <label style={{ fontSize: 11, color: 'var(--text-dark-secondary)', fontWeight: 700 }}>Taglia<br /><Inp value={s.size} onChange={(v) => updSize(fi, si, 'size', v)} w={120} placeholder="Media 0,4L" /></label>
                          <label style={{ fontSize: 11, color: 'var(--text-dark-secondary)', fontWeight: 700 }}>Gradi °<br /><Inp type="number" step="0.1" value={s.abv} onChange={(v) => updSize(fi, si, 'abv', v)} w={80} /></label>
                          <label style={{ fontSize: 11, color: 'var(--text-dark-secondary)', fontWeight: 700 }}>U.A.<br /><Inp type="number" step="0.1" value={s.units} onChange={(v) => updSize(fi, si, 'units', v)} w={80} /></label>
                          <div style={{ fontSize: 11, color: 'var(--text-dark-secondary)', fontWeight: 700 }}>BAC<br /><span style={{ fontSize: 17, fontWeight: 800, color: bacColor(rowBac(s)) }}>{rowBac(s).toFixed(2)}</span></div>
                          <div style={{ flex: 1 }} />
                          <button type="button" onClick={() => delSize(fi, si)} className="btn btn-secondary" style={{ padding: '8px 12px', borderRadius: 12, color: 'var(--error)' }}><Trash2 size={15} /></button>
                        </div>
                      </div>
                    ))}
                    <button type="button" onClick={() => addSize(fi)} className="btn btn-secondary" style={{ alignSelf: 'flex-start', padding: '5px 10px', fontSize: 12, borderRadius: 12 }}><Plus size={12} /> Taglia</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <p style={{ fontSize: 11, color: 'var(--text-dark-secondary)', lineHeight: 1.5 }}>
        Il BAC mostrato è il <b style={{ color: '#FFF' }}>picco istantaneo</b> per la persona di riferimento (confronto tra drink). Dopo &ldquo;Salva&rdquo;, i dispositivi aggiornano il catalogo entro 24h (cache locale). &ldquo;Ripristina default&rdquo; rimette il catalogo statico dell&apos;app.
      </p>
    </div>
  );
}
