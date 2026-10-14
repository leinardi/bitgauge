import React from 'react';
import { Format } from './Format.jsx';
function niceMax(v) { const e = Math.pow(10, Math.floor(Math.log10(v))); for (const m of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * e >= v) return m * e; return 10 * e; }
// Geometry: pure function of the data and the plot size (charts.md). Production: uPlot with the same series and hooks.
export function chartGeometry(o) {
  const all = o.series.map(s => s.pts).flat(); const ym = o.yMax || niceMax(Math.max(1, ...all.map(p => p[1])) * 1.08);
  const lab = f => { const v = ym * f, r = o.ms ? { n: Format.ms(v), u: 'ms' } : Format.rate(v, o.units); return f === 0 ? '0' : r.n + (f === 1 ? ' ' + r.u : ''); };
  const CH = 6.7, fit = (min, s) => Math.max(min, Math.ceil(s.length * CH) + 14);
  const pl = fit(44, lab(1));
  const lm = o.lat ? (o.latMax || niceMax(Math.max(...o.lat.map(p => p[1])) * 1.9)) : 0;
  const pr = o.lat ? fit(40, Math.round(lm) + ' ms') : 12, pt = 10, pb = 22, W = o.w - pl - pr, H = o.h - pt - pb;
  const X = t => pl + W * t / o.xMax, Y = v => pt + H * (1 - v / ym);
  const grid = [0, 0.25, 0.5, 0.75, 1].map(f => ({ y: Y(ym * f), x1: pl, x2: pl + W, t: lab(f), ly: Y(ym * f) + 3.5, lx: pl - 8 }));
  const xt = []; let stepX = o.xStep || niceMax(o.xMax / 6); if (!(stepX > 0) || !isFinite(stepX)) stepX = o.xMax > 0 ? o.xMax : 1;
  for (let t = 0; t <= o.xMax + 1e-9; t += stepX) xt.push({ x: X(t), y: o.h - 6, t: o.xLabel ? o.xLabel(t) : (Math.round(t * 10) / 10) + 's' });
  const line = pts => pts.map((p, i) => (i ? 'L' : 'M') + X(p[0]).toFixed(1) + ' ' + Y(p[1]).toFixed(1)).join('');
  const series = o.series.map(s => { const l = line(s.pts), last = s.pts[s.pts.length - 1]; return { ...s, line: l, area: l + 'L' + X(last[0]).toFixed(1) + ' ' + Y(0) + 'L' + X(s.pts[0][0]).toFixed(1) + ' ' + Y(0) + 'Z', endX: X(last[0]), endY: Y(last[1]) }; });
  const LY = v => pt + H * (1 - v / lm);
  const lat = o.lat ? { line: o.lat.map((p, i) => (i ? 'L' : 'M') + X(p[0]).toFixed(1) + ' ' + LY(p[1]).toFixed(1)).join(''), ticks: [0, 0.5, 1].map(f => ({ y: LY(lm * f) + 3.5, x: pl + W + 8, t: Math.round(lm * f) + (f === 1 ? ' ms' : '') })) } : null;
  const seps = (o.seps || []).map(q => ({ x: X(q.t), lx: X(q.t) + 6, ly: pt + 12, t: q.label }));
  const wins = (o.wins || []).map(q => ({ x: X(q.t0), w: X(q.t1) - X(q.t0), lx: X(q.t0) + 4, ly: pt + H - 8, t: q.label }));
  const marks = (o.marks || []).map(q => ({ x: X(q.t), t: q.label, c: q.c || null, lx: X(q.t) - 6, ly: pt + 12 }));
  const bands = (o.bands || []).filter(q => q.t1 > q.t0).map(q => ({ x: X(q.t0), w: X(q.t1) - X(q.t0), x1: X(q.t1) }));
  return { grid, xt, series, lat, seps, wins, marks, bands, pl, pr: pl + W, pt, pb: pt + H, nowX: o.now != null ? X(o.now) : null };
}
export function Chart({ title, meta, legend = [], summary, empty, data, height = 300, compact = false, markColor = 'var(--fg-muted)', endDot = true, units = 'bits' }) {
  const ref = React.useRef(null);
  const [w, setW] = React.useState(compact ? 311 : 672);
  React.useEffect(() => {
    const el = ref.current; if (!el || !window.ResizeObserver) return;
    const ro = new ResizeObserver(([e]) => { const x = Math.floor(e.contentRect.width); if (x > 0) setW(x); });
    ro.observe(el); return () => ro.disconnect();
  }, []);
  const h = compact ? 150 : height;
  const g = chartGeometry({ units, ...data, series: data.series || [], w, h, xStep: data.xStep || (compact && data.xMax > 20 ? (data.xMax > 40 ? 18 : 8) : null) });
  const last = g.series[g.series.length - 1];
  const dot = endDot && last ? last : null;
  return <div className="chart">
    <div className="chart-h">
      <span className="t">{title}</span>
      <div className="lg">{legend.map((l, i) => <span key={i}><span className="sw" style={{ borderTop: '2px ' + (l.dashed ? 'dashed' : 'solid') + ' ' + l.color, opacity: l.faint ? 0.4 : 1 }}></span>{l.label}</span>)}
        {g.bands.length ? <span><span className="sw band"></span>Warm-up</span> : null}</div>
      {meta ? <span className="meta">{meta}</span> : null}
    </div>
    <div ref={ref} className="chart-plot">
      <svg width={w} height={h} role="img" aria-label={summary}>
        {g.bands.map((b, i) => <g key={'b' + i}><rect x={b.x} y={g.pt} width={b.w} height={g.pb - g.pt} style={{ fill: 'var(--chart-band)' }} /><line x1={b.x} y1={g.pt} x2={b.x} y2={g.pb} className="edge" /><line x1={b.x1} y1={g.pt} x2={b.x1} y2={g.pb} className="edge" /></g>)}
        {g.grid.map((l, i) => <line key={'g' + i} x1={l.x1} y1={l.y} x2={l.x2} y2={l.y} className="grid" />)}
        {g.seps.map((s, i) => <line key={'s' + i} x1={s.x} y1={g.pt} x2={s.x} y2={g.pb} className="sep" />)}
        {g.wins.map((s, i) => <rect key={'w' + i} x={s.x} y={g.pt} width={s.w} height={g.pb - g.pt} className="win" />)}
        {g.series.map((s, i) => <g key={'l' + i}><path d={s.area} style={{ fill: s.color, fillOpacity: s.faint ? 0 : 0.1, stroke: 'none' }} /><path d={s.line} style={{ fill: 'none', stroke: s.color, strokeOpacity: s.faint ? 0.4 : 1, strokeWidth: 1.75, strokeLinejoin: 'round' }} /></g>)}
        {g.lat ? <path d={g.lat.line} className="lat" /> : null}
        {g.marks.map((m, i) => <line key={'m' + i} x1={m.x} y1={g.pt} x2={m.x} y2={g.pb} className="mark" style={{ stroke: m.c || markColor }} />)}
        {g.nowX != null ? <line x1={g.nowX} y1={g.pt} x2={g.nowX} y2={g.pb} className="now" /> : null}
        {dot ? <circle cx={dot.endX} cy={dot.endY} r="4" style={{ fill: 'var(--surface-2)', stroke: dot.color, strokeWidth: 2 }} /> : null}
      </svg>
      <div className="chart-lb" aria-hidden="true">
        {g.grid.map((l, i) => <span key={'g' + i} className="y" style={{ left: l.lx, top: l.ly }}>{l.t}</span>)}
        {g.xt.map((l, i) => <span key={'x' + i} className="x" style={{ left: l.x, top: l.y }}>{l.t}</span>)}
        {g.seps.map((l, i) => <span key={'s' + i} className="sp" style={{ left: l.lx, top: l.ly }}>{l.t}</span>)}
        {g.lat ? g.lat.ticks.map((l, i) => <span key={'t' + i} className="lt" style={{ left: l.x, top: l.y }}>{l.t}</span>) : null}
        {g.wins.map((l, i) => <span key={'w' + i} className="wn" style={{ left: l.lx, top: l.ly }}>{l.t}</span>)}
        {g.marks.map((l, i) => <span key={'m' + i} className="mk" style={{ left: l.lx, top: l.ly, color: l.c || markColor }}>{l.t}</span>)}
      </div>
      {empty ? <div className="chart-empty" style={{ top: g.pt, left: g.pl, width: g.pr - g.pl, height: g.pb - g.pt }}><span>{empty}</span></div> : null}
    </div>
  </div>;
}
