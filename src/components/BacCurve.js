'use client';

// Vera curva di ebbrezza: BAC (g/l) nel tempo — salita per assorbimento, picco,
// discesa per smaltimento epatico. Disegna un grafico ad area (SVG), non più
// pallini equidistanti su una barra fissa (che sembravano una linea dritta).
// La linea tratteggiata rossa = limite legale di guida (0,5 g/l).
// `curve` è l'oggetto restituito da db.calculateBACCurve().
export default function BacCurve({ curve, height = 150 }) {
  if (!curve || !curve.series || curve.series.length < 2) return null;
  const { series, start, end, peak } = curve;

  const span = Math.max(1, end - start);
  const maxVal = Math.max(peak?.val || 0, 0.5) * 1.18; // headroom sopra il picco / limite

  // Coordinate in viewBox 0..100 (l'SVG viene poi stirato in larghezza/altezza).
  const fx = (t) => ((t - start) / span) * 100;
  const fy = (v) => (1 - Math.min(Math.max(v, 0), maxVal) / maxVal) * 100;

  const pts = series.map((p) => `${fx(p.t).toFixed(2)},${fy(p.val).toFixed(2)}`);
  const line = `M ${pts.join(' L ')}`;
  const area = `M ${fx(series[0].t).toFixed(2)},100 L ${pts.join(' L ')} L ${fx(series[series.length - 1].t).toFixed(2)},100 Z`;

  const LIMIT = 0.5;
  const showLimit = LIMIT < maxVal;
  const color = peak.val > 0.8 ? '#EF4444' : peak.val > 0.5 ? '#FF2000' : '#10B981';

  // Posizione orizzontale dell'etichetta del picco, tenuta dentro i bordi.
  const peakLabelLeft = Math.min(Math.max(fx(peak.t), 14), 86);

  return (
    <div>
      <div style={{ position: 'relative', width: '100%', height }}>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" width="100%" height="100%" style={{ display: 'block', overflow: 'visible' }}>
          <defs>
            <linearGradient id="bacCurveFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.40" />
              <stop offset="100%" stopColor={color} stopOpacity="0.03" />
            </linearGradient>
          </defs>
          {showLimit && (
            <line x1="0" y1={fy(LIMIT)} x2="100" y2={fy(LIMIT)} stroke="rgba(239,68,68,0.7)" strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
          )}
          <path d={area} fill="url(#bacCurveFill)" stroke="none" />
          <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        </svg>

        {/* Punto di picco e limite come overlay HTML, per non deformarsi con lo stretch dell'SVG */}
        <div style={{ position: 'absolute', left: `${fx(peak.t)}%`, top: `${fy(peak.val)}%`, transform: 'translate(-50%, -50%)', width: 11, height: 11, borderRadius: '50%', background: color, border: '2px solid #000', boxShadow: '0 0 8px rgba(0,0,0,0.6)' }} />
        <div style={{ position: 'absolute', left: `${peakLabelLeft}%`, top: `${fy(peak.val)}%`, transform: 'translate(-50%, calc(-50% - 17px))', fontSize: 11, fontWeight: 800, color, whiteSpace: 'nowrap', textShadow: '0 1px 3px #000' }}>
          picco {peak.val.toFixed(2)} g/l
        </div>
        {showLimit && (
          <div style={{ position: 'absolute', right: 2, top: `${fy(LIMIT)}%`, transform: 'translateY(-50%)', fontSize: 9, color: '#FF7D7D', background: 'rgba(0,0,0,0.55)', padding: '0 4px', borderRadius: 4, whiteSpace: 'nowrap' }}>
            limite 0,5
          </div>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-dark-secondary)', marginTop: 5 }}>
        <span>🟢 {curve.startLabel} · inizio</span>
        <span>🔺 {peak.label} · picco</span>
        <span>🏁 {curve.endLabel} · sobrio</span>
      </div>
    </div>
  );
}
