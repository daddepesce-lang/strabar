'use client';

// Carosello "storie" sopra il feed: le sessioni recenti CON foto, una per utente.
// Tocca una storia → apre il dettaglio della sessione (titolo, compagni, drink, link).
// Usa solo dati/immagini GIÀ caricati dal feed (cover_url) → nessun egress aggiuntivo.
export default function StoriesBar({ stories, onOpen, label }) {
  if (!stories || stories.length === 0) return null;
  return (
    <div style={{ marginBottom: '14px' }}>
      {label && (
        <span style={{ fontSize: '11px', color: 'var(--text-dark-secondary)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '.4px', display: 'block', marginBottom: '8px', paddingLeft: '2px' }}>
          {label}
        </span>
      )}
      <div
        style={{ display: 'flex', gap: '12px', overflowX: 'auto', paddingBottom: '4px', scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}
        className="stories-scroll"
      >
        {stories.map((s) => (
          <button
            key={s.act.id}
            type="button"
            onClick={() => onOpen(s.act)}
            style={{ flexShrink: 0, width: '70px', background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px' }}
            title={s.name}
          >
            <span
              style={{
                position: 'relative', width: '64px', height: '64px', borderRadius: '50%', padding: '3px',
                background: s.live
                  ? 'conic-gradient(from 0deg, #FF3B2F, #FF8A00, #FF3B2F)'
                  : 'linear-gradient(135deg, var(--secondary), #8fb300)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={s.photo}
                alt={s.name}
                loading="lazy"
                decoding="async"
                style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%', border: '2px solid var(--bg-dark, #0B0A09)' }}
              />
              {s.live && (
                <span style={{ position: 'absolute', bottom: '-2px', left: '50%', transform: 'translateX(-50%)', background: '#FF3B2F', color: '#fff', fontSize: '8px', fontWeight: 800, padding: '1px 6px', borderRadius: '8px', letterSpacing: '.3px', border: '1.5px solid var(--bg-dark, #0B0A09)' }}>
                  LIVE
                </span>
              )}
              {!s.live && s.drinks > 0 && (
                <span style={{ position: 'absolute', bottom: '-3px', right: '-2px', background: 'var(--secondary)', color: '#0A0A0D', fontSize: '10px', fontWeight: 800, minWidth: '18px', height: '18px', borderRadius: '9px', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px', border: '1.5px solid var(--bg-dark, #0B0A09)' }}>
                  🍺{s.drinks}
                </span>
              )}
            </span>
            <span style={{ fontSize: '11px', color: 'var(--text-dark-secondary)', maxWidth: '70px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'center' }}>
              {s.name}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
