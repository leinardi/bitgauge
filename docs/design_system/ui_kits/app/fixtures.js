/* BitGauge web UI kit — fixtures.js: KIT-ONLY fixture layer and engine stand-ins (window.BG).
   Everything visual comes from the design system (window.DS): icons, logo, gauge, chart, formatting.
   What stays here is what production gets from the engine or the server, mocked for the prototype:
   sample data (KIT), synthetic series (rng/thr/lat), the gauge window replay used to hand the second
   direction its start window (track), grade + AIM point tables (engine side in production), and the
   Result-detail chart geometry that has not moved to DS.Chart yet (see CHANGELOG "Remaining migration"). */
(function () {
  // Sample data. Components never default to these; screens pass them as props.
  const KIT = {
    origin: 'https://speed.home.lan', host: 'speed.home.lan',
    server: { displayName: 'Basement NAS', version: '1.4.0', commit: 'a1b2c3d', buildDate: '2026-09-30' }
  };
  const F = () => window.DS.Format;
  // Formatting delegates to DS.Format (tokens.md "Number formatting") — one implementation.
  const rate = (bps, unit) => F().rate(bps, unit);
  const rateStr = (b, u) => F().rateStr(b, u);
  const ms = (v, res = 0.1) => F().ms(v, res);
  const jit = ms;
  const bytes = b => F().bytes(b);
  // Gauge window replay (gauge.md rule 3) over a finished direction's samples, so the UI can pass the
  // second direction its start window (Gauge startDecade). The live window itself is DS.Gauge's.
  function track(pts, o = {}) {
    const by = o.unit === 'bytes', kMin = by ? 3 : 4, kMax = 6, hold = o.hold ?? 2;
    let k = o.k0 ?? (by ? 5 : 6), dir = 0, since = null;
    const shifts = [], ks = [];
    for (const [t, raw] of pts) {
      const v = by ? raw / 8 : raw;
      const d = v < Math.pow(10, k + 1) && k > kMin ? -1 : v > Math.pow(10, k + 3) && k < kMax ? 1 : 0;
      if (d !== dir) { dir = d; since = t; }
      if (d && t - since >= hold - 1e-9) { shifts.push({ t, from: k, to: k + d, held: [since, t] }); k += d; dir = 0; since = null; }
      ks.push([t, k]);
    }
    const tl = pts.length ? pts[pts.length - 1][0] : 0;
    return { k, lo: Math.pow(10, k), hi: Math.pow(10, k + 4), shifts, ks, dir, holdFor: dir ? tl - since : 0 };
  }

  function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  // throughput ramp: target bit/s, tEnd seconds, step s
  function thr(seed, target, tEnd, step = 0.1, noise = 0.06, tau = 0.5) {
    const R = rng(seed), p = [];
    for (let t = 0; t <= tEnd + 1e-9; t += step) p.push([t, target * (1 - Math.exp(-t / tau)) * (1 + noise * (R() - 0.5) * 2 + 0.02 * Math.sin(t * 2.1))]);
    return p;
  }
  function lat(seed, idle, loaded, tEnd, step = 0.1, noise = 0.18, tau = 1.0) {
    const R = rng(seed), p = [];
    for (let t = 0; t <= tEnd + 1e-9; t += step) p.push([t, (idle + (loaded - idle) * (1 - Math.exp(-t / tau))) * (1 + noise * (R() - 0.5) * 2)]);
    return p;
  }
  function niceMax(v) { const e = Math.pow(10, Math.floor(Math.log10(v))); for (const m of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * e >= v) return m * e; return 10 * e; }

  // opts: {w,h,xMax, series:[pts], yMax?, lat?:pts, latMax?, unit:'bits'|'bytes', xLabel?:fn}
  function chart(o) {
    const all = o.series.flat(); const ym = o.yMax || niceMax(Math.max(...all.map(p => p[1])) * 1.08);
    // Axis label gutters grow to fit the longest label (e.g. "1.00 Gbit/s") so it is never clipped.
    const lab = f => { const v = ym * f, r = o.ms ? { n: ms(v), u: 'ms' } : rate(v, o.unit); return f === 0 ? '0' : r.n + (f === 1 ? ' ' + r.u : ''); };
    const CH = 6.7, fit = (min, s) => Math.max(min, Math.ceil(s.length * CH) + 14);
    const pl = o.padL ?? fit(44, lab(1));
    let lm0 = 0; if (o.lat) lm0 = o.latMax || niceMax(Math.max(...o.lat.map(p => p[1])) * 1.9);
    const pr = o.lat ? (o.padR ?? fit(40, Math.round(lm0) + ' ms')) : 12, pt_ = 10, pb = 22, W = o.w - pl - pr, H = o.h - pt_ - pb;
    const X = t => pl + W * t / o.xMax, Y = v => pt_ + H * (1 - v / ym);
    const grid = [0, 0.25, 0.5, 0.75, 1].map(f => { const v = ym * f; return { y: Y(v).toFixed(1), x1: pl, x2: pl + W, t: lab(f), ly: (Y(v) + 3.5).toFixed(1), lx: pl - 8 }; });
    const xt = []; const stepX = o.xStep || niceMax(o.xMax / 6);
    for (let t = 0; t <= o.xMax + 1e-9; t += stepX) xt.push({ x: X(t).toFixed(1), y: (o.h - 6).toFixed(1), t: o.xLabel ? o.xLabel(t) : (Math.round(t * 10) / 10) + 's' });
    const line = pts => pts.map((p, i) => (i ? 'L' : 'M') + X(p[0]).toFixed(1) + ' ' + Y(p[1]).toFixed(1)).join('');
    const series = o.series.map(pts => { const l = line(pts); const last = pts[pts.length - 1]; return { line: l, area: l + `L${X(last[0]).toFixed(1)} ${Y(0)}L${X(pts[0][0]).toFixed(1)} ${Y(0)}Z`, endX: X(last[0]).toFixed(1), endY: Y(last[1]).toFixed(1) }; });
    let latOut = null;
    if (o.lat) {
      const lm = lm0; const LY = v => pt_ + H * (1 - v / lm);
      latOut = { line: o.lat.map((p, i) => (i ? 'L' : 'M') + X(p[0]).toFixed(1) + ' ' + LY(p[1]).toFixed(1)).join(''), ticks: [0, 0.5, 1].map(f => ({ y: (LY(lm * f) + 3.5).toFixed(1), x: pl + W + 8, t: Math.round(lm * f) + (f === 1 ? ' ms' : '') })) };
    }
    const seps = (o.seps || []).map(q => ({ x: X(q.t).toFixed(1), lx: (X(q.t) + 6).toFixed(1), ly: pt_ + 12, t: q.label, y1: pt_, y2: pt_ + H }));
    const wins = (o.wins || []).map(q => ({ x: X(q.t0).toFixed(1), w: (X(q.t1) - X(q.t0)).toFixed(1), y: pt_, h: H, t: q.label, lx: (X(q.t0) + 4).toFixed(1), ly: pt_ + H - 8 }));
    const marks = (o.marks || []).map(q => ({ x: X(q.t).toFixed(1), y1: pt_, y2: pt_ + H, t: q.label, c: q.c || null, lx: (X(q.t) - 6).toFixed(1), ly: pt_ + 12 }));
    // Live warm-up bands: samples are drawn over them; x0/x1 are the band edges.
    const bands = (o.bands || []).filter(q => q.t1 > q.t0).map(q => ({ x: X(q.t0).toFixed(1), w: (X(q.t1) - X(q.t0)).toFixed(1), x1: X(q.t1).toFixed(1), y: pt_, h: H, y2: pt_ + H, open: !!q.open }));
    return { vb: `0 0 ${o.w} ${o.h}`, w: o.w, h: o.h, grid, seps, wins, marks, bands, xt, series, lat: latOut, plotL: pl, plotR: pl + W, plotT: pt_, plotB: pt_ + H, nowX: o.now != null ? X(o.now).toFixed(1) : null };
  }

  // ---------- grade + quality scores (measurement §11, §13) ----------
  const gradeOf = inc => inc < 5 ? 'A+' : inc < 30 ? 'A' : inc < 60 ? 'B' : inc < 200 ? 'C' : inc < 400 ? 'D' : 'F';
  const aimP = (v, th, p) => { let i = 0; while (i < th.length && v >= th[i]) i++; return p[i]; };
  const band = (sum, th) => ['Bad', 'Poor', 'Average', 'Good', 'Great'][th.filter(x => sum >= x).length];
  // AIM points; packet loss fixed at 0; upload is not an input. Sums clamp at 0. Returns points + bands per
  // experience in the order streaming, gaming, video calls (rtc). Test screen and Result detail both call this.
  function aim(lat, jit, dl, inc) {
    const pl = aimP(lat, [10, 20, 50, 100, 500], [20, 10, 5, 0, -10, -20]), pi = aimP(inc, [10, 20, 50, 100, 500], [20, 10, 5, 0, -10, -20]);
    const pj = aimP(jit, [10, 20, 100, 500], [10, 5, 0, -10, -20]), pd = aimP(dl, [1e6, 1e7, 5e7, 1e8], [0, 5, 10, 20, 30]);
    const points = [pl + pd + pi, pl + pi, pl + pj + pi].map(p => Math.max(0, p));
    return { points, bands: [band(points[0], [15, 20, 40, 60]), band(points[1], [5, 15, 25, 30]), band(points[2], [5, 15, 25, 40])] };
  }
  // Data used (bytes) of a sampled rate series [[t s, bit/s]] at `step` s: the integral of the curve.
  const usedBytes = (pts, step = 0.1) => pts.reduce((a, q) => a + (q[1] || 0), 0) * step / 8;


  window.BG = { KIT, rate, rateStr, ms, jit, bytes, track, thr, lat, chart, niceMax, rng, get GRADES() { return window.DS.GRADES; }, get QUALITY() { return window.DS.QUALITY; }, gradeOf, aim, usedBytes };
})();
