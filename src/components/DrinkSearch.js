'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X, Check, Plus } from 'lucide-react';
import { useDrinkCatalog } from '@/lib/useDrinkCatalog';
import { useT } from '@/lib/i18n';

// Normalizza per la ricerca: minuscolo + niente accenti, così "però" ≈ "pero".
const norm = (s = '') => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// Emoji del drink: usa quella già nel label; altrimenti la deduce dal NOME. I drink
// aggiunti da admin (incluse le birre "Bionda Media 0,5L", "Lattina"…) non hanno emoji
// nel label → prima finivano col fallback 🍸 sbagliato. Ora le birre mostrano 🍺.
function pillEmoji(d) {
  const m = (d.label || '').match(/^\p{Emoji}/u)?.[0];
  if (m) return m;
  const n = `${d.name || ''} ${d._family || ''}`.toLowerCase();
  if (/birr|bionda|rossa|scura|ambrat|malto|\bipa\b|lager|weiss|blanche|stout|pils|artigian|lattina|analcolic/.test(n)) return '🍺';
  if (/vino|wine|prosecco|spuman|bollicin|bianco|rosso|passito|bellini|mimosa/.test(n)) return '🍷';
  if (/spritz|aperol|campari|negroni|americano|hugo/.test(n)) return '🍹';
  if (/gin|vodka|\brum\b|whisky|whiskey|tequila|shot|amaro|grappa|limoncello|sambuca|cocktail|mojito|margarita|cosmopolitan|martini|sidro/.test(n)) return '🍸';
  if (/acqua|water|coca|cola|soda|succo|\bte\b|caff/.test(n)) return '🥤';
  return '🍹';
}

// Foglio a tutto schermo per registrare i drink in live: una barra di ricerca usabile +
// categorie ordinate, un tap per aggiungere (anche più di uno). Sostituisce il muro di
// bottoni. `venueDrinks` (opz.) sono i drink propri del locale, mostrati in cima.
// `scope` = 'session' | 'stop' cambia solo l'etichetta del contatore.
export default function DrinkSearch({ onPick, onRemove, onClose, venueDrinks = [], scope = 'session' }) {
  const t = useT();
  const { quick, extra, beerFamilies } = useDrinkCatalog();
  const [q, setQ] = useState('');
  const [openBeer, setOpenBeer] = useState(null);
  const [addedCounts, setAddedCounts] = useState({}); // { name: quantità aggiunta in questo foglio }
  const [lastAdded, setLastAdded] = useState(null); // nome dell'ultimo aggiunto (per il flash ✓)
  const [showPacing, setShowPacing] = useState(false); // avviso "non loggarli tutti insieme"
  const lastAddTs = useRef(0);
  const inputRef = useRef(null);

  const addedTotal = Object.values(addedCounts).reduce((s, n) => s + n, 0);

  useEffect(() => {
    // Autofocus dopo il montaggio (così la tastiera si apre subito su mobile).
    const id = setTimeout(() => inputRef.current?.focus(), 120);
    return () => clearTimeout(id);
  }, []);

  // Chiudi con ESC.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const add = (preset) => {
    onPick?.(preset);
    setAddedCounts((m) => ({ ...m, [preset.name]: (m[preset.name] || 0) + 1 }));
    setLastAdded(preset.name);
    setTimeout(() => setLastAdded((cur) => (cur === preset.name ? null : cur)), 900);
    // Pacing: due drink entro 60s → suggerisci di registrarli quando li bevi davvero.
    const now = Date.now();
    if (lastAddTs.current && now - lastAddTs.current < 60000) setShowPacing(true);
    lastAddTs.current = now;
  };

  const remove = (preset) => {
    if (!(addedCounts[preset.name] > 0)) return;
    onRemove?.(preset.name);
    setAddedCounts((m) => {
      const n = (m[preset.name] || 0) - 1;
      const next = { ...m };
      if (n > 0) next[preset.name] = n; else delete next[preset.name];
      return next;
    });
  };

  // Tutte le taglie birra "appiattite" per la ricerca testuale.
  const beerFlat = useMemo(
    () => beerFamilies.flatMap((f) => f.sizes.map((s) => ({ ...s, _family: f.label }))),
    [beerFamilies]
  );

  const venue = useMemo(
    () => (venueDrinks || []).filter((d) => d && d.name),
    [venueDrinks]
  );

  // Risultati di ricerca (query attiva): filtro su nome + etichetta, in tutte le liste.
  const results = useMemo(() => {
    const nq = norm(q.trim());
    if (!nq) return null;
    const match = (d) => norm(`${d.name} ${d.label || ''}`).includes(nq);
    const seen = new Set();
    const out = [];
    [...venue, ...quick, ...beerFlat, ...extra].forEach((d) => {
      if (!match(d)) return;
      const key = d.name;
      if (seen.has(key)) return;
      seen.add(key);
      out.push(d);
    });
    return out;
  }, [q, venue, quick, beerFlat, extra]);

  const Pill = ({ d }) => {
    const count = addedCounts[d.name] || 0;
    const just = lastAdded === d.name;
    const active = count > 0;
    return (
      <div
        style={{
          display: 'inline-flex', alignItems: 'stretch', borderRadius: '14px', overflow: 'hidden',
          border: just ? '1px solid var(--success)' : active ? '1px solid rgba(16,185,129,0.6)' : '1px solid var(--border-dark)',
          background: active ? 'rgba(16,185,129,0.10)' : 'var(--bg-input-dark)',
          transition: 'background .15s, border-color .15s',
        }}
      >
        <button
          type="button"
          onClick={() => add(d)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '9px 12px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
        >
          <span style={{ fontSize: '15px', lineHeight: 1 }}>{pillEmoji(d)}</span>
          <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <span style={{ color: '#FFF', fontWeight: 600, fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '160px' }}>
              {(d.label || d.name).replace(/^\p{Emoji}\s*/u, '')}
            </span>
            <span style={{ fontSize: '10px', color: 'var(--text-dark-secondary)' }}>
              {d.abv > 0 ? t('drink.perUnit', { abv: d.abv, units: (d.units || 0).toFixed(1) }) : t('drink.analc')}
            </span>
          </span>
          {count > 0 ? (
            <span style={{ marginLeft: '6px', flexShrink: 0, background: 'var(--success)', color: '#06281b', fontWeight: 800, fontSize: '11px', borderRadius: '10px', padding: '2px 7px', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
              {just && <Check size={11} />}×{count}
            </span>
          ) : (
            <Plus size={14} style={{ marginLeft: '4px', flexShrink: 0, opacity: 0.6 }} />
          )}
        </button>
        {count > 0 && (
          <button
            type="button"
            onClick={() => remove(d)}
            title={t('drink.removeOne')}
            aria-label={t('drink.removeOne')}
            style={{ flexShrink: 0, width: '34px', border: 'none', borderLeft: '1px solid rgba(255,255,255,0.08)', background: 'rgba(239,68,68,0.12)', color: '#EF4444', cursor: 'pointer', fontSize: '18px', lineHeight: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
          >−</button>
        )}
      </div>
    );
  };

  const Section = ({ label, children }) => (
    <div style={{ marginBottom: '18px' }}>
      <div style={{ fontSize: '11px', color: 'var(--text-dark-secondary)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '.4px', marginBottom: '10px' }}>{label}</div>
      {children}
    </div>
  );

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', backdropFilter: 'blur(10px)', zIndex: 1600, display: 'flex', justifyContent: 'center', alignItems: 'flex-start' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: '100%', maxWidth: '560px', height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--surface-dark, #0B0A09)' }}
      >
        {/* Header con ricerca */}
        <div style={{ padding: 'calc(14px + env(safe-area-inset-top, 0px)) 16px 12px', borderBottom: '1px solid var(--border-dark)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#FFF', flex: 1 }}>{t('drink.title')}</h2>
            <button onClick={onClose} aria-label={t('drink.done')} className="btn btn-secondary" style={{ borderRadius: '50%', width: 36, height: 36, padding: 0, fontSize: 20, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
          </div>
          <div style={{ position: 'relative' }}>
            <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dark-secondary)' }} />
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('drink.placeholder')}
              className="form-control"
              style={{ paddingLeft: 38, paddingRight: q ? 38 : 14, height: 44, fontSize: 15, borderRadius: 14 }}
            />
            {q && (
              <button onClick={() => setQ('')} aria-label="clear" style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-dark-secondary)', cursor: 'pointer', padding: 4 }}>
                <X size={16} />
              </button>
            )}
          </div>
          <p style={{ fontSize: 11, color: 'var(--text-dark-secondary)', margin: '8px 2px 0' }}>{t('drink.tapToAdd')}</p>
        </div>

        {/* Corpo scrollabile */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
          {results ? (
            results.length > 0 ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {results.map((d, i) => <Pill key={`${d.name}-${i}`} d={d} />)}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-dark-secondary)' }}>
                <div style={{ fontSize: 32, marginBottom: 10 }}>🤔</div>
                <p style={{ fontSize: 14, color: '#FFF', marginBottom: 4 }}>{t('drink.noResults', { q: q.trim() })}</p>
                <p style={{ fontSize: 12 }}>{t('drink.noResultsHint')}</p>
              </div>
            )
          ) : (
            <>
              {venue.length > 0 && (
                <Section label={t('drink.venueSection')}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {venue.map((d, i) => <Pill key={`v-${i}`} d={d} />)}
                  </div>
                </Section>
              )}

              <Section label={t('drink.quickSection')}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {quick.map((d, i) => <Pill key={`q-${i}`} d={d} />)}
                </div>
              </Section>

              <Section label={t('drink.beerSection')}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {beerFamilies.map((f) => {
                    const active = f.key === openBeer;
                    return (
                      <button
                        key={f.key}
                        type="button"
                        onClick={() => setOpenBeer(active ? null : f.key)}
                        className="btn btn-secondary"
                        style={{ padding: '9px 12px', fontSize: 13, borderRadius: 14, border: active ? '1px solid var(--primary)' : '1px solid var(--border-dark)', color: active ? 'var(--primary)' : undefined, fontWeight: active ? 700 : 600 }}
                      >
                        {f.label} {active ? '▴' : '▾'}
                      </button>
                    );
                  })}
                </div>
                {openBeer && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: 10, padding: 10, background: 'var(--bg-input-dark)', border: '1px solid var(--border-dark)', borderRadius: 14 }}>
                    {beerFamilies.find((f) => f.key === openBeer).sizes.map((s, i) => <Pill key={`b-${i}`} d={s} />)}
                  </div>
                )}
              </Section>

              <Section label={t('drink.otherSection')}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {extra.map((d, i) => <Pill key={`e-${i}`} d={d} />)}
                </div>
              </Section>
            </>
          )}
        </div>

        {/* Nota pacing: compare quando registri 2+ drink ravvicinati (il consiglio del
            pannello live resta nascosto dietro questo foglio, quindi lo mostriamo qui). */}
        {showPacing && (
          <div style={{ flexShrink: 0, display: 'flex', alignItems: 'flex-start', gap: '8px', margin: '0 12px', padding: '10px 12px', background: 'rgba(223,255,0,0.08)', border: '1px solid rgba(223,255,0,0.35)', borderRadius: '12px' }}>
            <span style={{ fontSize: '15px', flexShrink: 0 }}>📈</span>
            <span style={{ flex: 1, fontSize: '11.5px', color: 'var(--text-dark-secondary)', lineHeight: 1.4 }}>{t('drink.pacingNote')}</span>
            <button onClick={() => setShowPacing(false)} aria-label="ok" style={{ background: 'none', border: 'none', color: 'var(--text-dark-secondary)', cursor: 'pointer', fontSize: '15px', lineHeight: 1, flexShrink: 0 }}>×</button>
          </div>
        )}

        {/* Barra inferiore: contatore + Fatto */}
        <div style={{ flexShrink: 0, padding: '12px 16px calc(12px + env(safe-area-inset-bottom, 0px))', borderTop: '1px solid var(--border-dark)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ flex: 1, fontSize: 13, color: addedTotal ? 'var(--success)' : 'var(--text-dark-secondary)', fontWeight: addedTotal ? 700 : 400 }}>
            {addedTotal > 0 ? t(scope === 'stop' ? 'drink.addedCountStop' : 'drink.addedCount', { n: addedTotal }) : ''}
          </span>
          <button onClick={onClose} className="btn btn-primary" style={{ borderRadius: 24, padding: '11px 28px', fontSize: 15, fontWeight: 700 }}>
            {t('drink.done')}
          </button>
        </div>
      </div>
    </div>
  );
}
