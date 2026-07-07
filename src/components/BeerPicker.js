'use client';

import { useState } from 'react';
import { useDrinkCatalog } from '@/lib/useDrinkCatalog';
import { useT } from '@/lib/i18n';

// Selettore birre con TAGLIA: si sceglie prima il tipo (Bionda/Rossa/IPA/Doppio Malto),
// poi si apre la riga delle taglie (Piccola/Media/Grande). Toccare una taglia aggiunge
// quel drink via onPick(preset); per più birre basta toccare ancora (la quantità si regola
// poi con i +/- nella lista). Riutilizzabile in tutti i punti di registrazione drink.
export default function BeerPicker({ onPick, disabled = false }) {
  const t = useT();
  const [openKey, setOpenKey] = useState(null);
  const { beerFamilies } = useDrinkCatalog();
  const open = beerFamilies.find((f) => f.key === openKey);

  return (
    <div>
      <span style={{ fontSize: '11px', color: 'var(--text-dark-secondary)', textTransform: 'uppercase', fontWeight: 600, display: 'block', marginBottom: '8px' }}>
        {t('beerpicker.label')}
      </span>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
        {beerFamilies.map((f) => {
          const active = f.key === openKey;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setOpenKey(active ? null : f.key)}
              className="btn btn-secondary"
              style={{
                padding: '6px 12px', fontSize: '12px', borderRadius: '15px',
                border: active ? '1px solid var(--primary)' : '1px solid var(--border-dark)',
                color: active ? 'var(--primary)' : undefined, fontWeight: active ? 700 : undefined,
              }}
            >
              {f.label} {active ? '▴' : '▾'}
            </button>
          );
        })}
      </div>

      {open && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px', padding: '10px', background: 'var(--bg-input-dark)', border: '1px solid var(--border-dark)', borderRadius: '12px' }}>
          {open.sizes.map((preset, i) => (
            <button
              key={i}
              type="button"
              onClick={() => onPick(preset)}
              disabled={disabled}
              className="btn btn-secondary"
              style={{ padding: '6px 12px', fontSize: '12px', borderRadius: '15px', border: '1px solid var(--border-dark)', opacity: disabled ? 0.5 : 1, cursor: disabled ? 'wait' : 'pointer' }}
              title={`${preset.units.toFixed(1)} ${t('beerpicker.unitsLabel')} · ${preset.abv}%`}
            >
              {open.label.replace(/^🍺\s*/, '🍺 ')} {preset.size} <span style={{ color: 'var(--secondary)', fontWeight: 700 }}>· {preset.abv}°</span> <span style={{ color: 'var(--text-dark-secondary)' }}>· {preset.units.toFixed(1)} {t('beerpicker.unitsLabel')}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
