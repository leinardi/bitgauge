import React from 'react';
import { Icon } from '../brand/Icon.jsx';
import { chartGeometry } from './Chart.jsx';
// charts.md — Result-detail per-phase chart: stored series with null gaps, warm-up as a hatched excluded interval,
// event chips, latency under load dashed on its own axis, and the Chart / table toggle.
export function PhaseChart({ title, icon, color, meta, summary, pts = [], lat, xMax, ms = false, xStep, xLabel, units = 'bits', width, height = 170,
  warmup, marks = [], gapLabel = 'No known data', view = 'chart', onViewChange, className, style, children }) {
  const known = pts.filter(p => p[1] != null), latK = lat ? lat.filter(p => p[1] != null) : null;
  const top = (() => { const n = known.length ? Math.max(...known.map(p => p[1])) * 1.08 : 1; const e = Math.pow(10, Math.floor(Math.log10(n))); for (const m of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * e >= n) return m * e; return 10 * e; })();
  const g = chartGeometry({ units, w: width, h: height, xMax, yMax: top, ms, xStep, xLabel, series: [{ pts: known.length ? known : [[0, 0]], color }], lat: latK });
  const X = t => g.pl + (g.pr - g.pl) * t / xMax, Y = v => g.pb - (g.pb - g.pt) * v / top;
  const path = s => s.map((p, i) => (i ? 'L' : 'M') + X(p[0]).toFixed(1) + ' ' + Y(p[1]).toFixed(1)).join('');
  // A gap spans exactly its null cells; the series before it holds its last value to the gap start.
  const S = [], gaps = []; let cur = [], g0 = null;
  pts.forEach(p => { if (p[1] == null) { if (g0 == null) { g0 = p[0]; if (cur.length) { cur.push([p[0], cur[cur.length - 1][1]]); S.push(cur); cur = []; } } } else { if (g0 != null) { gaps.push([g0, p[0]]); g0 = null; } cur.push(p); } });
  if (cur.length) S.push(cur);
  const placed = [];
  const chips = marks.map(m => { const x = X(m.t), cw = m.label.length * 6 + 22, left = x + 4 + cw > g.pr, x0 = left ? x - 4 - cw : x + 4, x1 = x0 + cw;
    let row = 0; while (row < 6 && placed.some(p => p.row === row && x0 < p.x1 + 4 && x1 > p.x0 - 4)) row++; placed.push({ x0, x1, row });
    return Object.assign({ x, lx: left ? x - 4 : x + 4, ly: g.pt + 2 + row * 18, left }, m); });
  const H = g.pb - g.pt;
  return <section className={'card pchart' + (className ? ' ' + className : '')} style={style}>
    <div className="pchart-h">
      <span className="t"><span className="ic" style={{ color }}><Icon name={icon} size={14} stroke={2} /></span>{title}</span>
      {meta ? <span className="meta">{meta}</span> : null}
      {lat && view === 'chart' ? <span className="lg"><span className="sw"></span>Latency under load</span> : null}
      <div className="seg seg-sm" role="radiogroup" aria-label={title + ' view'}>
        {['chart', 'table'].map(k => <button key={k} type="button" role="radio" aria-checked={view === k} className={'seg-btn' + (view === k ? ' on' : '')} onClick={() => onViewChange && onViewChange(k)}>{k === 'chart' ? 'Chart' : 'Table'}</button>)}
      </div>
    </div>
    {view === 'chart' ? <>
      <div className="chart-plot" style={{ alignSelf: 'flex-start' }}>
        <svg width={width} height={height} role="img" aria-label={summary}>
          {g.grid.map((l, i) => <line key={i} x1={l.x1} y1={l.y} x2={l.x2} y2={l.y} className="grid" />)}
          {S.map((s, i) => { const l = path(s); return <g key={i}><path d={l + 'L' + X(s[s.length - 1][0]).toFixed(1) + ' ' + g.pb + 'L' + X(s[0][0]).toFixed(1) + ' ' + g.pb + 'Z'} style={{ fill: color, fillOpacity: 0.1 }} /><path d={l} style={{ fill: 'none', stroke: color, strokeWidth: 1.5, strokeLinejoin: 'round' }} /></g>; })}
          {g.lat ? <path d={g.lat.line} className="lat" /> : null}
          {chips.map((m, i) => <line key={i} x1={m.x} y1={g.pt} x2={m.x} y2={g.pb} className="mark" style={{ stroke: m.c }} />)}
        </svg>
        <div className="chart-lb" aria-hidden="true">
          {warmup ? <span className="hatch" style={{ left: g.pl, top: g.pt, width: Math.max(2, X(warmup.t1) - g.pl), height: H }}></span> : null}
          {gaps.map(([a, b], i) => <span key={'g' + i} className="gap" style={{ left: X(a), top: g.pt, width: X(b) - X(a), height: H }}></span>)}
          {g.grid.map((l, i) => <span key={'y' + i} className="y" style={{ left: l.lx, top: l.ly }}>{l.t}</span>)}
          {g.xt.map((l, i) => <span key={'x' + i} className="x" style={{ left: l.x, top: l.y }}>{l.t}</span>)}
          {g.lat ? g.lat.ticks.map((l, i) => <span key={'t' + i} className="lt" style={{ left: l.x, top: l.y }}>{l.t}</span>) : null}
          {chips.map((m, i) => <span key={'c' + i} className={'chip-ev' + (m.left ? ' left' : '')} style={{ left: m.lx, top: m.ly, borderColor: m.bd, color: m.fg }}><Icon name={m.icon} size={10} stroke={2.25} />{m.label}</span>)}
        </div>
      </div>
      {warmup || gaps.length ? <div className="pchart-k">
        {warmup ? <span><span className="sw hatch"></span>{warmup.label}</span> : null}
        {gaps.length ? <span><span className="sw gap"></span>{gapLabel}</span> : null}
      </div> : null}
    </> : children}
  </section>;
}
