import React from 'react';
import { Icon } from '../brand/Icon.jsx';
const A0 = 135, SW = 270, HOLD_MS = 2000, SHIFT_MS = 280;
const KR = { bits: { min: 4, max: 6, start: 6 }, bytes: { min: 3, max: 6, start: 5 } };
const pt = (cx, cy, r, a) => [cx + r * Math.cos(a * Math.PI / 180), cy + r * Math.sin(a * Math.PI / 180)];
function arc(cx, cy, r, f0, f1) {
  f0 = Math.max(0, Math.min(1, f0)); f1 = Math.max(f0 + 0.0005, Math.min(1, f1));
  const a0 = A0 + SW * f0, a1 = A0 + SW * f1, p0 = pt(cx, cy, r, a0), p1 = pt(cx, cy, r, a1);
  return 'M' + p0[0].toFixed(2) + ' ' + p0[1].toFixed(2) + 'A' + r + ' ' + r + ' 0 ' + (a1 - a0 > 180 ? 1 : 0) + ' 1 ' + p1[0].toFixed(2) + ' ' + p1[1].toFixed(2);
}
const tickLabel = v => v >= 1e9 ? (v / 1e9) + 'G' : v >= 1e6 ? (v / 1e6) + 'M' : v >= 1e3 ? (v / 1e3) + 'k' : String(v);
const rateLabel = (v, units) => { const u = units === 'bytes' ? 'B/s' : 'bit/s'; const s = v >= 1e9 ? [1e9, 'G'] : v >= 1e6 ? [1e6, 'M'] : v >= 1e3 ? [1e3, 'k'] : [1, ''];
  return (v / s[0]) + ' ' + s[1] + u; };
function useReducedMotion() {
  const q = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const [r, setR] = React.useState(q ? q.matches : false);
  React.useEffect(() => { if (!q) return; const h = e => setR(e.matches); q.addEventListener('change', h); return () => q.removeEventListener('change', h); }, []);
  return r;
}
// Window picker: pure function of the value stream and the clock. The engine never supplies the window.
function useGaugeWindow(value, mode, units, startDecade, onWindowChange) {
  const R = KR[units] || KR.bits;
  const start = startDecade ?? R.start;
  const [k, setK] = React.useState(start);
  const hold = React.useRef({ zone: 0, timer: null });
  const clear = () => { clearTimeout(hold.current.timer); hold.current = { zone: 0, timer: null }; };
  React.useEffect(() => { clear(); setK(start); }, [units, start]);
  React.useEffect(() => {
    if (mode === 'ms' || value == null) { clear(); return; }
    const zone = value < Math.pow(10, k + 1) && k > R.min ? -1 : value > Math.pow(10, k + 3) && k < R.max ? 1 : 0;
    if (zone === hold.current.zone) return;
    clear();
    if (zone) hold.current = { zone, timer: setTimeout(() => { hold.current = { zone: 0, timer: null }; setK(k + zone); onWindowChange && onWindowChange(k + zone); }, HOLD_MS) };
  }, [value, k, mode, units]);
  React.useEffect(() => clear, []);
  return k;
}
// Window shift: tween the decade k over 280 ms, ease-out, in log space (ticks, labels, arc and dot move together).
// prefers-reduced-motion, a unit change or a new start window jumps.
function useTweenK(k, reduce, resetKey) {
  const [kd, setKd] = React.useState(k);
  const cur = React.useRef(k), raf = React.useRef(0), key = React.useRef(resetKey);
  React.useEffect(() => {
    cancelAnimationFrame(raf.current);
    const from = cur.current, jump = reduce || key.current !== resetKey || typeof requestAnimationFrame === 'undefined';
    key.current = resetKey;
    if (jump || from === k) { cur.current = k; setKd(k); return; }
    const t0 = performance.now();
    const step = now => {
      const f = Math.min(1, (now - t0) / SHIFT_MS), v = from + (k - from) * (1 - Math.pow(1 - f, 3));
      cur.current = v; setKd(v);
      if (f < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [k, reduce, resetKey]);
  return kd;
}
const TEXT_STATES = { idle: 1, connecting: 1, cancelled: 1, error: 1, offline: 1 };
const ST_COLOR = { cancelled: 'var(--fg-subtle)', error: 'var(--danger)', offline: 'var(--danger)' };
// gauge.md — modes (rate, ms) × states (live, countdown, idle, connecting, cancelled, error, offline).
export function Gauge({ size, compact = false, value, mode = 'rate', units = 'bits', state = 'live', startDecade, onWindowChange, bandLo, bandHi, peak, inner, innerLabel,
  color = 'var(--series-download)', eyebrow, eyebrowIcon, readout, unit, note, sub, captionNote,
  title, message, detail, icon, action, countdownTotal = 3, countdownLeft }) {
  size = size || (compact ? 272 : 300);
  const reduce = useReducedMotion();
  const live = state === 'live', cd = state === 'countdown', textual = !!TEXT_STATES[state];
  const k = useGaugeWindow(live ? value : null, mode, units, startDecade, onWindowChange);
  const kd = useTweenK(k, reduce, units + '|' + mode + '|' + (startDecade ?? ''));
  const shifting = kd !== k;
  const cx = size / 2, cy = size / 2, r = size / 2 - 10;
  const lo = mode === 'ms' ? 1 : Math.pow(10, k), hi = mode === 'ms' ? 1000 : Math.pow(10, k + 4);
  const dlo = mode === 'ms' ? lo : Math.pow(10, kd), dhi = mode === 'ms' ? hi : Math.pow(10, kd + 4);
  const caption = (mode === 'ms' ? 'log scale · 1 – 1000 ms' : 'log scale · ' + rateLabel(lo, units) + ' – ' + rateLabel(hi, units) + ' · auto') + (captionNote ? ' · ' + captionNote : '');
  const L0 = Math.log10(dlo), L1 = Math.log10(dhi);
  const f = v => (Math.log10(Math.min(Math.max(v, dlo), dhi)) - L0) / (L1 - L0);
  const ticks = [], labels = [];
  for (let d = Math.floor(L0 + 1e-9); d <= Math.ceil(L1 - 1e-9); d++) {
    const base = Math.pow(10, d);
    [1, 2, 5].forEach(m => { const v = base * m; if (v > dhi * 1.0001 || v < dlo * 0.9999) return;
      const major = m === 1, a = A0 + SW * f(v), p1 = pt(cx, cy, r - 14, a), p2 = pt(cx, cy, r - (major ? 22 : 18), a);
      ticks.push({ x1: p1[0], y1: p1[1], x2: p2[0], y2: p2[1], w: major ? 1.5 : 1, o: major ? 1 : 0.6 });
      if (major && size >= 220) { const pl = pt(cx, cy, r - 36, a); labels.push({ x: pl[0], y: pl[1] + 4, t: mode === 'ms' ? String(v) : tickLabel(v) }); } });
  }
  // Countdown: the ring drains linearly; under reduced motion it steps once per second with the number.
  const left = Math.max(0, countdownLeft ?? countdownTotal), secs = Math.max(1, Math.ceil(left - 1e-9));
  const cdFrac = Math.max(0.002, (reduce ? secs : left) / countdownTotal);
  const has = value != null && (live || state === 'cancelled'), fv = has ? f(value) : 0;
  const dot = has && live ? pt(cx, cy, r, A0 + SW * fv) : null;
  const pk = has && live && peak != null ? [pt(cx, cy, r + 8, A0 + SW * f(peak)), pt(cx, cy, r - 8, A0 + SW * f(peak))] : null;
  const tween = reduce || shifting ? undefined : 'd var(--dur-base) var(--ease-out)';
  const stc = ST_COLOR[state] || 'var(--fg-subtle)';
  return <div className={'gauge' + (compact ? ' compact' : '')} style={{ width: size }}>
    <div className="gauge-dial" style={{ width: size, height: size }}>
    <svg width={size} height={size} aria-hidden="true" focusable="false">
      <path d={arc(cx, cy, r, 0, 1)} style={{ fill: 'none', stroke: 'var(--surface-3)', strokeWidth: 10, strokeLinecap: 'round' }} />
      {ticks.map((t, i) => <line key={i} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} style={{ stroke: 'var(--fg-faint)', strokeWidth: t.w, opacity: t.o }} />)}
      {cd ? <path d={arc(cx, cy, r, 0, cdFrac)} style={{ fill: 'none', stroke: 'var(--primary)', strokeWidth: 10, strokeLinecap: 'round' }} /> : null}
      {has && live && bandLo != null ? <path d={arc(cx, cy, r, f(bandLo), f(bandHi))} style={{ fill: 'none', stroke: color, strokeOpacity: 0.2, strokeWidth: 22 }} /> : null}
      {has ? <path d={arc(cx, cy, r, 0, fv)} style={{ fill: 'none', stroke: color, strokeWidth: 10, strokeLinecap: 'round', transition: tween }} /> : null}
      {has && inner != null ? <path d={arc(cx, cy, r - 10, 0, f(inner))} style={{ fill: 'none', stroke: 'var(--series-upload)', strokeWidth: 4, strokeLinecap: 'round' }} /> : null}
      {pk ? <line x1={pk[0][0]} y1={pk[0][1]} x2={pk[1][0]} y2={pk[1][1]} style={{ stroke: 'var(--fg-muted)', strokeWidth: 2, strokeLinecap: 'round' }} /> : null}
      {dot ? <circle cx={dot[0]} cy={dot[1]} r="7" style={{ fill: 'var(--surface-2)', stroke: color, strokeWidth: 3 }} /> : null}
    </svg>
    {labels.map((l, i) => <span key={i} aria-hidden="true" className="gauge-tick" style={{ left: l.x, top: l.y }}>{l.t}</span>)}
    <div className="gauge-rd">
      {textual ? <>
        {icon ? <span className="gauge-st-ic" style={{ color: stc }}><Icon name={icon} size={22} /></span> : null}
        <span className="gauge-title">{title}</span>
        {message ? <span className="gauge-msg">{message}</span> : null}
        {detail ? <span className="gauge-detail">{detail}</span> : null}
        {action ? <span className="gauge-act">{action}</span> : null}
      </> : <>
        {eyebrow ? <span className="gauge-eb" style={{ color: cd ? 'var(--primary-text)' : color }}>{eyebrowIcon ? <Icon name={eyebrowIcon} size={13} stroke={2.25} /> : null}{eyebrow}</span> : null}
        <span className={'gauge-num' + (cd || value != null ? '' : ' none')}>{cd ? String(secs) : readout ?? (value != null ? '' : '—')}</span>
        {unit ? <span className="gauge-unit">{cd && typeof unit === 'object' ? (secs === 1 ? unit[0] : unit[1]) : unit}</span> : null}
        {note ? <span className="gauge-note">{note}</span> : null}
        {innerLabel ? <span className="gauge-inner"><span className="ic"><Icon name="arrow-up" size={12} stroke={2.25} /></span>{innerLabel}</span> : null}
      </>}
    </div>
    </div>
    <span className="gauge-cap">{caption}</span>
    {sub ? <span className="gauge-sub">{sub}</span> : null}
  </div>;
}
