// Anteprima social (og:image) comune a tutte le pagine condivisibili di Strabar.
//
// Perché esiste: ogni link condiviso su WhatsApp — una sessione, la classifica di un
// locale, un percorso — mostrava la stessa icona quadrata dell'app. Un'anteprima che dice
// COSA c'è dietro il link ("Da Momi's — 47 atleti, in testa @marco") è la differenza tra
// un link ignorato e un link aperto, ed è il canale di acquisizione che ci costa zero.
//
// Vincoli di ImageResponse (Satori): solo flexbox, niente grid, font di sistema, e ogni
// elemento con più di un figlio deve dichiarare display:flex. Niente emoji: verrebbero
// scaricate da una CDN esterna a ogni generazione.

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = 'image/png';

const BG = '#0A0A0D';
const PRIMARY = '#FF3B2F';
const SECONDARY = '#DFFF00';
const MUTED = '#8A8A99';

// Taglia un testo troppo lungo: in 1200px un titolo oltre i ~46 caratteri diventa
// illeggibile o esce dalla card.
const clamp = (s, n) => {
  const text = String(s || '').trim();
  return text.length > n ? `${text.slice(0, n - 1).trimEnd()}…` : text;
};

/**
 * Card standard: occhiello, titolo, sottotitolo e fino a tre numeri in evidenza.
 * @param {{kicker?: string, title: string, subtitle?: string, stats?: {value: string|number, label: string}[], footer?: string}} props
 */
export function ogCard({ kicker, title, subtitle, stats = [], footer }) {
  const shown = stats.filter((s) => s && s.value !== undefined && s.value !== null).slice(0, 3);
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        backgroundColor: BG,
        // Bagliore rosso in alto a destra: la firma visiva dell'app, senza immagini da caricare.
        backgroundImage: `radial-gradient(circle at 78% 12%, rgba(255,59,47,0.22) 0%, rgba(10,10,13,0) 55%)`,
        padding: '64px 72px',
        fontFamily: 'sans-serif',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {kicker ? (
          <div
            style={{
              display: 'flex',
              fontSize: 26,
              letterSpacing: 4,
              textTransform: 'uppercase',
              color: SECONDARY,
              fontWeight: 700,
              marginBottom: 18,
            }}
          >
            {clamp(kicker, 42)}
          </div>
        ) : null}
        <div
          style={{
            display: 'flex',
            fontSize: title.length > 30 ? 74 : 92,
            lineHeight: 1.05,
            color: '#FFFFFF',
            fontWeight: 800,
          }}
        >
          {clamp(title, 52)}
        </div>
        {subtitle ? (
          <div style={{ display: 'flex', fontSize: 34, color: MUTED, marginTop: 20 }}>
            {clamp(subtitle, 78)}
          </div>
        ) : null}
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex' }}>
          {shown.map((s, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                flexDirection: 'column',
                marginRight: 56,
              }}
            >
              <div style={{ display: 'flex', fontSize: 58, color: SECONDARY, fontWeight: 800 }}>
                {String(s.value)}
              </div>
              <div
                style={{
                  display: 'flex',
                  fontSize: 22,
                  color: MUTED,
                  textTransform: 'uppercase',
                  letterSpacing: 2,
                  marginTop: 6,
                }}
              >
                {clamp(s.label, 24)}
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
          {footer ? (
            <div style={{ display: 'flex', fontSize: 24, color: MUTED, marginBottom: 10 }}>
              {clamp(footer, 40)}
            </div>
          ) : null}
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <div
              style={{
                display: 'flex',
                width: 18,
                height: 18,
                borderRadius: 9,
                backgroundColor: PRIMARY,
                marginRight: 14,
              }}
            />
            <div style={{ display: 'flex', fontSize: 40, color: '#FFFFFF', fontWeight: 800, letterSpacing: 2 }}>
              STRABAR
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
