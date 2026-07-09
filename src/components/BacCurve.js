'use client';

import { useT } from '@/lib/i18n';

// Vera curva di ebbrezza: BAC (g/l) nel tempo — salita per assorbimento, picco,
// discesa per smaltimento. Grafico ad area in SVG con scala UNIFORME (viewBox a
// proporzioni fisse, width 100%): si rende identica su desktop e iOS PWA.
// Mostra: linea del limite legale 0,5 g/l, punto di picco, riferimenti orari sull'asse
// X e il momento in cui si scende sotto 0,5. `curve` = output di db.calculateBACCurve().
export default function BacCurve({ curve, height = 170 }) {
  const t = useT();
  if (!curve || !curve.series || curve.series.length < 2) return null;
  const { series, start, end, peak, belowLimit } = curve;

  const VBW = 320;
  const VBH = Math.max(140, Math.round(height));
  const padL = 8, padR = 8, padT = 22, padB = 28; // padB ospita le etichette orarie
  const plotW = VBW - padL - padR;
  const plotH = VBH - padT - padB;
  const axisY = padT + plotH; // linea di base (y del tempo)

  const span = Math.max(1, end - start);
  const maxVal = Math.max(peak?.val || 0, 0.5) * 1.18;

  const fx = (t) => padL + ((t - start) / span) * plotW;
  const fy = (v) => padT + (1 - Math.min(Math.max(v, 0), maxVal) / maxVal) * plotH;

  const pts = series.map((p) => `${fx(p.t).toFixed(1)},${fy(p.val).toFixed(1)}`);
  const line = `M ${pts.join(' L ')}`;
  const area = `M ${fx(series[0].t).toFixed(1)},${axisY.toFixed(1)} L ${pts.join(' L ')} L ${fx(series[series.length - 1].t).toFixed(1)},${axisY.toFixed(1)} Z`;

  const LIMIT = 0.5;
  const showLimit = LIMIT < maxVal;
  const color = peak.val > 0.8 ? '#EF4444' : peak.val > 0.5 ? '#FF3B2F' : '#10B981';
  const gid = `bacFill_${Math.round((peak?.val || 0) * 1000)}_${series.length}`;

  const peakX = fx(peak.t), peakY = fy(peak.val);
  const peakLabelX = Math.min(Math.max(peakX, 32), VBW - 32);

  // Riferimenti orari sull'asse X (5 tacche uniformi).
  const fmt = (ms) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const TICKS = 4;
  const ticks = Array.from({ length: TICKS + 1 }, (_, i) => {
    const t = start + (span * i) / TICKS;
    return { x: fx(t), label: fmt(t), anchor: i === 0 ? 'start' : i === TICKS ? 'end' : 'middle' };
  });

  const limitX = belowLimit ? fx(belowLimit.t) : null;
  const limitLabelX = belowLimit ? Math.min(Math.max(limitX, 26), VBW - 26) : null;

  return (
    <div>
      <svg viewBox={`0 0 ${VBW} ${VBH}`} width="100%" height={VBH} style={{ display: 'block', maxWidth: '100%' }}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.42" />
            <stop offset="100%" stopColor={color} stopOpacity="0.03" />
          </linearGradient>
        </defs>

        {/* Griglia verticale + tacche orarie */}
        {ticks.map((tk, i) => (
          <g key={i}>
            <line x1={tk.x} y1={padT} x2={tk.x} y2={axisY} stroke="rgba(255,255,255,0.07)" strokeWidth="0.6" />
            <text x={Math.min(Math.max(tk.x, 12), VBW - 12)} y={axisY + 11} textAnchor={tk.anchor} fontSize="8.5" fill="var(--text-dark-secondary)">{tk.label}</text>
          </g>
        ))}

        {/* Limite legale 0,5 g/l */}
        {showLimit && (
          <>
            <line x1={padL} y1={fy(LIMIT)} x2={VBW - padR} y2={fy(LIMIT)} stroke="#EF4444" strokeOpacity="0.7" strokeWidth="1" strokeDasharray="4 3" />
            <text x={padL + 1} y={fy(LIMIT) - 2.5} textAnchor="start" fontSize="8.5" fill="#FF7D7D">{t('session.curveLimitLabel')}</text>
          </>
        )}

        {/* Area + curva */}
        <path d={area} fill={`url(#${gid})`} stroke="none" />
        <path d={line} fill="none" stroke={color} strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />

        {/* Discesa sotto 0,5: marcatore verticale + orario */}
        {belowLimit && (
          <>
            <line x1={limitX} y1={fy(LIMIT)} x2={limitX} y2={axisY} stroke="#10B981" strokeWidth="1" strokeDasharray="3 2" />
            <circle cx={limitX} cy={fy(LIMIT)} r="2.6" fill="#10B981" stroke="#000" strokeWidth="1" />
            <text x={limitLabelX} y={fy(LIMIT) + 11} textAnchor="middle" fontSize="9" fontWeight="700" fill="#10B981">{t('session.curveBelowLimitMarker', { time: belowLimit.label })}</text>
          </>
        )}

        {/* Punto e valore di picco */}
        <circle cx={peakX} cy={peakY} r="3.4" fill={color} stroke="#000" strokeWidth="1.4" />
        <text x={peakLabelX} y={peakY - 8} textAnchor="middle" fontSize="11" fontWeight="800" fill={color}>
          {t('session.curvePeakLabel', { val: peak.val.toFixed(2), time: peak.label })}
        </text>
      </svg>

      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6, fontSize: 10, color: 'var(--text-dark-secondary)', marginTop: 4 }}>
        <span>{t('session.curveStartLabel', { time: curve.startLabel })}</span>
        {belowLimit
          ? <span style={{ color: '#10B981' }}>{t('session.curveBelowLimitLabel', { time: belowLimit.label })}</span>
          : <span>{t('session.curveAlwaysBelowLabel')}</span>}
        <span>{t('session.curveEndLabel', { time: curve.endLabel })}</span>
      </div>
    </div>
  );
}
