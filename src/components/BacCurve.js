'use client';

// Vera curva di ebbrezza: BAC (g/l) nel tempo — salita per assorbimento, picco,
// discesa per smaltimento epatico. Grafico ad area in SVG con scala UNIFORME
// (viewBox a proporzioni fisse, width 100% / height auto): si rende identica su
// desktop e iOS PWA, senza lo stretch non uniforme che prima appiattiva la linea.
// La linea tratteggiata rossa = limite legale di guida (0,5 g/l).
// `curve` è l'oggetto restituito da db.calculateBACCurve().
export default function BacCurve({ curve, height = 160 }) {
  if (!curve || !curve.series || curve.series.length < 2) return null;
  const { series, start, end, peak } = curve;

  // Sistema di coordinate dell'SVG (proporzioni fisse, scala uniforme).
  const VBW = 320;
  const VBH = Math.max(120, Math.round(height));
  const padL = 8, padR = 8, padT = 22, padB = 16;
  const plotW = VBW - padL - padR;
  const plotH = VBH - padT - padB;

  const span = Math.max(1, end - start);
  const maxVal = Math.max(peak?.val || 0, 0.5) * 1.18; // headroom sopra picco/limite

  const fx = (t) => padL + ((t - start) / span) * plotW;
  const fy = (v) => padT + (1 - Math.min(Math.max(v, 0), maxVal) / maxVal) * plotH;

  const pts = series.map((p) => `${fx(p.t).toFixed(1)},${fy(p.val).toFixed(1)}`);
  const line = `M ${pts.join(' L ')}`;
  const baseY = (padT + plotH).toFixed(1);
  const area = `M ${fx(series[0].t).toFixed(1)},${baseY} L ${pts.join(' L ')} L ${fx(series[series.length - 1].t).toFixed(1)},${baseY} Z`;

  const LIMIT = 0.5;
  const showLimit = LIMIT < maxVal;
  const color = peak.val > 0.8 ? '#EF4444' : peak.val > 0.5 ? '#FF2000' : '#10B981';
  const gid = `bacFill_${Math.round((peak?.val || 0) * 1000)}_${series.length}`;

  const peakX = fx(peak.t), peakY = fy(peak.val);
  // Tieni l'etichetta del picco dentro i bordi orizzontali.
  const peakLabelX = Math.min(Math.max(peakX, 30), VBW - 30);

  return (
    <div>
      <svg viewBox={`0 0 ${VBW} ${VBH}`} width="100%" height={VBH} style={{ display: 'block', maxWidth: '100%' }}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.42" />
            <stop offset="100%" stopColor={color} stopOpacity="0.03" />
          </linearGradient>
        </defs>

        {/* Limite legale 0,5 g/l */}
        {showLimit && (
          <>
            <line x1={padL} y1={fy(LIMIT)} x2={VBW - padR} y2={fy(LIMIT)} stroke="#EF4444" strokeOpacity="0.7" strokeWidth="1" strokeDasharray="4 3" />
            <text x={VBW - padR} y={fy(LIMIT) - 3} textAnchor="end" fontSize="9" fill="#FF7D7D">limite 0,5</text>
          </>
        )}

        {/* Area + curva */}
        <path d={area} fill={`url(#${gid})`} stroke="none" />
        <path d={line} fill="none" stroke={color} strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />

        {/* Punto e valore di picco */}
        <circle cx={peakX} cy={peakY} r="3.4" fill={color} stroke="#000" strokeWidth="1.4" />
        <text x={peakLabelX} y={peakY - 8} textAnchor="middle" fontSize="11" fontWeight="800" fill={color}>
          picco {peak.val.toFixed(2)} g/l
        </text>
      </svg>

      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-dark-secondary)', marginTop: 4 }}>
        <span>🟢 {curve.startLabel} · inizio</span>
        <span>🔺 {peak.label} · picco</span>
        <span>🏁 {curve.endLabel} · sobrio</span>
      </div>
    </div>
  );
}
