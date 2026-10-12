import React from 'react';
import { Icon } from '../brand/Icon.jsx';
const A0 = 135, SW = 270;
const pt = (cx, cy, r, a) => [cx + r * Math.cos(a * Math.PI / 180), cy + r * Math.sin(a * Math.PI / 180)];
function arc(cx, cy, r, f0, f1) {
  f0 = Math.max(0, Math.min(1, f0)); f1 = Math.max(f0 + 0.0005, Math.min(1, f1));
  const a0 = A0 + SW * f0, a1 = A0 + SW * f1, p0 = pt(cx, cy, r, a0), p1 = pt(cx, cy, r, a1);
  return 'M' + p0[0].toFixed(2) + ' ' + p0[1].toFixed(2) + 'A' + r + ' ' + r + ' 0 ' + (a1 - a0 > 180 ? 1 : 0) + ' 1 ' + p1[0].toFixed(2) + ' ' + p1[1].toFixed(2);
}
const tickLabel = v => v >= 1e9 ? (v / 1e9) + 'G' : v >= 1e6 ? (v / 1e6) + 'M' : v >= 1e3 ? (v / 1e3) + 'k' : String(v);
export function Gauge({ size = 300, value, lo, hi, mode = 'rate', bandLo, bandHi, peak, inner, color = 'var(--series-download)', eyebrow, eyebrowIcon, readout, unit, sub, numSize }) {
  const cx = size / 2, cy = size / 2, r = size / 2 - 10;
  if (lo == null) { if (mode === 'ms') { lo = 1; hi = 1000; } else { lo = 1e6; hi = 1e10; } }
  const L0 = Math.log10(lo), L1 = Math.log10(hi);
  const f = v => (Math.log10(Math.min(Math.max(v, lo), hi)) - L0) / (L1 - L0);
  const ticks = [], labels = [];
  for (let d = Math.floor(L0 + 1e-9); d <= Math.ceil(L1 - 1e-9); d++) {
    const base = Math.pow(10, d);
    [1, 2, 5].forEach(m => { const v = base * m; if (v > hi * 1.0001 || v < lo * 0.9999) return;
      const major = m === 1, a = A0 + SW * f(v), p1 = pt(cx, cy, r - 14, a), p2 = pt(cx, cy, r - (major ? 22 : 18), a);
      ticks.push({ x1: p1[0], y1: p1[1], x2: p2[0], y2: p2[1], w: major ? 1.5 : 1, o: major ? 1 : 0.6 });
      if (major && size >= 220) { const pl = pt(cx, cy, r - 36, a); labels.push({ x: pl[0], y: pl[1] + 4, t: mode === 'ms' ? String(v) : tickLabel(v) }); } });
  }
  const has = value != null, fv = has ? f(value) : 0, dot = has ? pt(cx, cy, r, A0 + SW * fv) : null;
  const pk = peak != null ? [pt(cx, cy, r + 8, A0 + SW * f(peak)), pt(cx, cy, r - 8, A0 + SW * f(peak))] : null;
  const ns = numSize || Math.round(size * 0.193);
  return <div style={{ position: 'relative', width: size, height: size }}>
    <svg width={size} height={size} role="img" aria-label={eyebrow ? eyebrow + ' ' + (readout ?? '') + ' ' + (unit ?? '') : 'Gauge'} style={{ display: 'block', overflow: 'visible' }}>
      <path d={arc(cx, cy, r, 0, 1)} style={{ fill: 'none', stroke: 'var(--surface-3)', strokeWidth: 10, strokeLinecap: 'round' }} />
      {ticks.map((t, i) => <line key={i} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} style={{ stroke: 'var(--fg-faint)', strokeWidth: t.w, opacity: t.o }} />)}
      {has && bandLo != null ? <path d={arc(cx, cy, r, f(bandLo), f(bandHi))} style={{ fill: 'none', stroke: color, strokeOpacity: 0.2, strokeWidth: 22 }} /> : null}
      {has ? <path d={arc(cx, cy, r, 0, fv)} style={{ fill: 'none', stroke: color, strokeWidth: 10, strokeLinecap: 'round', transition: 'd var(--dur-base) var(--ease-out)' }} /> : null}
      {has && inner != null ? <path d={arc(cx, cy, r - 10, 0, f(inner))} style={{ fill: 'none', stroke: 'var(--series-upload)', strokeWidth: 4, strokeLinecap: 'round' }} /> : null}
      {has && pk ? <line x1={pk[0][0]} y1={pk[0][1]} x2={pk[1][0]} y2={pk[1][1]} style={{ stroke: 'var(--fg-muted)', strokeWidth: 2, strokeLinecap: 'round' }} /> : null}
      {dot ? <circle cx={dot[0]} cy={dot[1]} r="7" style={{ fill: 'var(--surface-2)', stroke: color, strokeWidth: 3 }} /> : null}
    </svg>
    {labels.map((l, i) => <span key={i} aria-hidden="true" style={{ position: 'absolute', left: l.x, top: l.y, transform: 'translate(-50%,-80%)', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-subtle)', whiteSpace: 'nowrap' }}>{l.t}</span>)}
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, paddingTop: 8, textAlign: 'center' }}>
      {eyebrow ? <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'var(--font-cond)', fontWeight: 600, fontSize: 12, letterSpacing: 'var(--tracking-caps)', textTransform: 'uppercase', color }}>{eyebrowIcon ? <Icon name={eyebrowIcon} size={13} stroke={2.25} /> : null}{eyebrow}</span> : null}
      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 500, fontSize: ns, lineHeight: 1.05, letterSpacing: '-0.03em', color: has ? 'var(--fg)' : 'var(--fg-subtle)', fontVariantNumeric: 'tabular-nums' }}>{readout ?? (has ? '' : '—')}</span>
      {unit ? <span style={{ fontSize: 'var(--text-md)', fontWeight: 500, color: 'var(--fg-muted)' }}>{unit}</span> : null}
      {sub ? <span style={{ marginTop: 6, fontFamily: 'var(--font-mono)', fontSize: 'var(--text-caption)', color: 'var(--fg-subtle)' }}>{sub}</span> : null}
    </div>
  </div>;
}
