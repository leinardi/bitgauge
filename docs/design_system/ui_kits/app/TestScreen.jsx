/* BitGauge web UI kit — TestScreen
 * Props:
 *   state: "idle" | "countdown" | "connecting" | "latency" | "download" | "upload" | "complete" | "error" | "error-early" | "cancelled" | "cancelled-late" | "cancelled-latency" | "cancelled-download" | "cancelled-slow" | "slow" | "slowdone" | "continuous" | "cont-warmup" | "cont-done" | "offline" | "basepath" | "ws-fallback" | "insufficient" | "param-ignored"  (default "download")
 *   mobile: boolean  (default false)
 *   custom: boolean  (default false)
 *   units: "bits" | "bytes"  (default "bits")
 *   theme: "light" | "dark" | "system"  (default "system")
 *   v01: boolean  (default false)
 *   kept: boolean  (default false)
 *   share: boolean  (default false)
 *   label: string  (default "")
 *   tips: boolean  (default false)
 *   resp: "ok" | "uncertain" | "needs-h2" | "not-reported" | "few-samples"  (default "ok")
 *   probe: "auto" | "WebSocket" | "HTTP/2 probe" | "HTTP/1.1 reserved"  (default "auto")
 *   errKind: "requests" | "unreachable" | "restarted" | "network"  (default "requests")
 *   overhead: boolean  (default false)
 *   cpu: boolean  (default false)
 */
class TestScreen extends React.Component {
  state = { ann: '', ctxOpen: false, ctxSel: null, ctxCustom: '', kept: null, share: null, label: null, inc: false, cw: null };
  chartRef = React.createRef();
  // The chart fills its card: measure the container and redraw on resize.
  _obs() {
    const el = this.chartRef.current;
    if (el === this._obsEl) return;
    if (this._ro) this._ro.disconnect();
    this._obsEl = el;
    if (!el || !window.ResizeObserver) return;
    this._ro = new ResizeObserver(([e]) => { const w = Math.floor(e.contentRect.width); if (w > 0 && w !== this.state.cw) this.setState({ cw: w }); });
    this._ro.observe(el);
  }
  componentDidMount() { if (!window.BG) { this._h = () => this.forceUpdate(); window.addEventListener('bg-lib-ready', this._h); } this._tick(); this._obs(); this._animK(); }
  componentWillUnmount() { if (this._h) window.removeEventListener('bg-lib-ready', this._h); if (this._ro) this._ro.disconnect(); cancelAnimationFrame(this._raf); }
  componentDidUpdate() { this._tick(); this._obs(); this._animK(); }
  _rm() { return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches; }
  // Gauge window shift: tween the decade k over BG.SHIFT_MS (ease-out, log space); reduced motion jumps.
  _animK() {
    const to = this._kT; if (to == null || to === this._kTo) return;
    const from = this._kA ? this._kA.cur : this._kTo; this._kTo = to;
    cancelAnimationFrame(this._raf);
    if (from == null || this._rm()) { this._kA = null; return; }
    const t0 = performance.now(), D = window.BG.SHIFT_MS; this._kA = { cur: from };
    const step = now => {
      if (!this._kA) return;
      const f = Math.min(1, (now - t0) / D); this._kA.cur = from + (to - from) * (1 - Math.pow(1 - f, 3));
      if (f < 1) this._raf = requestAnimationFrame(step); else this._kA = null;
      this.forceUpdate();
    };
    this._raf = requestAnimationFrame(step);
  }
  // Visually hidden polite region: phase changes immediately, live rate at most every 5 s. The 10 Hz readout is not live.
  _tick() {
    const c = this._live; if (!c) return;
    const now = Date.now(); let msg = null;
    if (c.st !== this._st) { this._st = c.st; this._at = now; msg = c.msg; }
    else if (c.rate && now - this._at >= 5000) { this._at = now; msg = c.rate; }
    if (msg && msg !== this.state.ann) this.setState({ ann: msg });
  }
  renderVals() {
    const BG = window.BG;
    const on = v => !!v && v !== 'false';
    const m = on(this.props.mobile);
    const st = this.props.state || 'idle', bp = st === 'basepath', v01 = on(this.props.v01);
    const base = { mobile: m, desktop: !m, srvStatus: st === 'offline' || (st === 'error-early') || (st === 'error' && ['unreachable', 'restarted'].includes(this.props.errKind)) ? 'offline' : 'online', navMobile: m && !bp, navDesktop: !m && !bp, basePath: bp, v01, BP: m ? { pad: '28px 16px 40px', h: '22px', minH: '720px' } : { pad: '72px 40px', h: '28px', minH: '760px' }, theme: this.props.theme || 'system', liveMsg: this.state.ann || '' };
    if (!BG || bp) return { ...base, ready: false };
    const unit = this.props.units === 'bytes' ? 'bytes' : 'bits';
    const rs = v => BG.rateStr(v, unit), rn = v => BG.rate(v, unit).n;
    const custom = on(this.props.custom) || unit === 'bytes';
    const OH = on(this.props.overhead) ? ['+' + (parseFloat(this.props.overhead) || 6) + ' % overhead compensation'] : [];
    const RS = this.props.resp || 'ok';
    const C = { lat: 'var(--series-latency)', down: 'var(--series-download)', up: 'var(--series-upload)' };
    const L = m ? {
      pad: '16px 16px 24px', gap: '14px', tileGap: '10px', instCols: 'minmax(0,1fr)', gPad: '20px 16px 20px', cPad: '14px 16px 16px', bl: 'none', bt: '1px solid var(--border-subtle)',
      gSize: 272, gNum: '46px', gTitle: '22px', btnW: '100%', btnH: '52px', kbd: false, chartW: 311, chartH: 150,
      stepPad: '12px 14px', stepGap: '10px', stepDir: 'column', stepAlign: 'flex-start', stepInnerGap: '2px', metaML: '0', metaWS: 'normal',
      resCols: 'repeat(2, minmax(0,1fr))', tilePad: '12px 14px', tileNum: '24px', loadSpan: 'span 2', fitSpan: 'span 2', metaSpan: 'span 2', loadCols: 'minmax(0,1fr)'
    } : {
      pad: '24px 40px 40px', gap: '20px', tileGap: '16px', instCols: '400px minmax(0,1fr)', gPad: '28px 24px 28px', cPad: '20px 24px 20px', bl: '1px solid var(--border-subtle)', bt: 'none',
      gSize: 316, gNum: '58px', gTitle: '26px', btnW: '248px', btnH: '46px', kbd: true, chartW: 672, chartH: 300,
      stepPad: '16px 24px', stepGap: '24px', stepDir: 'row', stepAlign: 'center', stepInnerGap: '8px', metaML: 'auto', metaWS: 'nowrap',
      resCols: 'repeat(4, minmax(0,1fr))', tilePad: '16px 18px', tileNum: '30px', loadSpan: 'span 2', fitSpan: 'span 1', metaSpan: 'span 1', loadCols: '172px minmax(0,1fr)'
    };
    const slow = st === 'slow' || st === 'slowdone' || st === 'cancelled-slow';
    const after = ['complete', 'cancelled', 'cancelled-late', 'slowdone'].includes(st);
    const src = this.props.probe && this.props.probe !== 'auto' ? this.props.probe : (st === 'ws-fallback' ? 'HTTP/2 probe' : 'WebSocket');
    const lowLink = slow || st === 'insufficient';

    // ---- connection strip (context pill is editable)
    const CO = [['LAN', 'house'], ['VPN', 'shield'], ['None', 'circle-dashed'], ['Custom…', 'pencil']];
    const sel = this.state.ctxSel || (slow ? 'VPN' : 'LAN');
    let ctx = { label: sel === 'Custom…' ? (this.state.ctxCustom || 'Custom') : sel, icon: CO.find(o => o[0] === sel)[1], suggested: !this.state.ctxSel };
    const ctxOpts = CO.map(([label, icon]) => ({ label, icon, on: label === sel, checked: label === sel ? 'true' : 'false', bg: label === sel ? 'var(--primary-bg)' : 'transparent', pick: () => this.setState({ ctxSel: label, ctxOpen: label === 'Custom…' }) }));
    const streams = slow ? '2' : st === 'insufficient' && !custom ? '1' : custom ? '4' : '6', auto = slow || !custom;
    // Fast LAN (§19.4): 1 → 2 → 4 → 6 streams keep gaining, so the ramp stops at the cap. The slow link stops gaining at 2.
    const plateau = auto ? ' · plateau: ' + (slow ? 'no-gain' : 'cap') : '';
    const conn = [
      { k: 'Client IP', v: slow ? '10.8.0.6' : '192.168.1.42', s: 'IPv4' },
      { k: 'Protocol', v: RS === 'needs-h2' ? 'HTTP/1.1' : RS === 'not-reported' ? '—' : 'HTTP/2', s: RS === 'not-reported' ? 'not reported' : '' },
      { k: 'Streams', v: streams, s: (auto ? 'auto' : 'fixed') + (after ? plateau : '') }
    ];
    if (st === 'offline') { conn.forEach(c => { c.v = '—'; c.s = ''; }); if (!this.state.ctxSel) ctx = { label: '—', icon: 'circle-dashed', suggested: false }; }
    const customChips = this.props.chips || [{ t: 'Extended', icon: 'timer' }, { t: '4 streams', icon: 'layers' }, { t: 'Cap 500 MB', icon: 'database' }];

    // ---- phases
    const PI = { lat: ['Latency', 'activity'], down: ['Download', 'arrow-down'], up: ['Upload', 'arrow-up'] };
    const ph = (k, status, meta, pct, label) => {
      const S = {
        pending: { bar: 'transparent', icon: null, ic: '', lc: 'var(--fg-muted)', mc: 'var(--fg-subtle)', pct: 0 },
        active: { bar: C[k], icon: PI[k][1], ic: C[k], lc: 'var(--fg)', mc: 'var(--fg-muted)' },
        done: { bar: C[k], icon: 'circle-check', ic: 'var(--ok)', lc: 'var(--fg)', mc: 'var(--fg-muted)', pct: 100 },
        failed: { bar: 'var(--danger)', icon: 'circle-x', ic: 'var(--danger)', lc: 'var(--fg)', mc: 'var(--danger-fg)' },
        cancelled: { bar: 'var(--fg-subtle)', icon: 'circle-minus', ic: 'var(--fg-subtle)', lc: 'var(--fg)', mc: 'var(--fg-muted)' },
        skipped: { bar: 'transparent', icon: 'circle-dashed', ic: 'var(--fg-subtle)', lc: 'var(--fg-subtle)', mc: 'var(--fg-subtle)', pct: 0 },
        capped: { bar: 'var(--warn)', icon: 'triangle-alert', ic: 'var(--warn)', lc: 'var(--fg)', mc: 'var(--warn-fg)' }
      }[status];
      return { label: label || PI[k][0], meta, pct: (S.pct ?? pct) + '%', bar: S.bar, icon: S.icon, ic: S.ic, lc: S.lc, mc: S.mc, hasIcon: !!S.icon, isPending: !S.icon, aria: status === 'active' ? 'step' : 'false' };
    };
    const PD = { lat: '~2 s', down: '~10–20 s', up: '~12–25 s' };
    const pend = (k, meta) => ph(k, 'pending', meta || PD[k]);

    // ---- tiles
    const T = o => Object.assign({ icon: 'circle-dot', ic: 'var(--fg-subtle)', num: '—', unit: '', sub: '', notes: [], span: 'auto', tag: null, tagCls: '', nc: 'var(--fg)' }, o);
    const rt = (label, icon, ic, v, o) => { const r = BG.rate(v, unit); return T(Object.assign({ label, icon, ic, num: r.n, unit: r.u, notes: OH }, o)); };
    const em = (label, icon, ic, sub) => T({ label, icon, ic, nc: 'var(--fg-subtle)', sub: sub || '' });
    const LIVE = { tag: 'Live', tagCls: 'pill info' };
    const msT = (label, icon, v, sub, o) => T(Object.assign({ label, icon, ic: C.lat, num: BG.ms(v), unit: 'ms', sub }, o));
    const eDown = s => em('Download', 'arrow-down', C.down, s), eUp = s => em('Upload', 'arrow-up', C.up, s);
    const eLat = () => em('Idle latency', 'activity', C.lat), eJit = () => em('Jitter', 'activity', C.lat);
    const idleSub = (mn, p9) => 'min ' + mn + ' · p90 ' + p9 + ' ms · ' + src + ' · 0 % probe timeouts';
    const IDLE = lowLink ? { v: 48, sub: idleSub('41', '66'), jit: 9.4 } : { v: 3.1, sub: idleSub('2.4', '4.1'), jit: 0.8 };
    const latT = o => msT('Idle latency', 'activity', IDLE.v, IDLE.sub, o);
    const jitT = o => T(Object.assign({ label: 'Jitter', icon: 'activity', ic: C.lat, num: BG.jit(IDLE.jit), unit: 'ms', sub: 'mean of consecutive differences' }, o));

    // ---- steady-window stats: avg and peak (= p90) over warm-up end → now only
    const q90 = a => { const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(0.9 * (s.length - 1)))]; };
    const steady = (pts, warm) => { if (pts[pts.length - 1][0] < warm) return null; const v = pts.filter(q => q[0] >= warm).map(q => q[1]); return !v.length ? null : { avg: v.reduce((a, b) => a + b, 0) / v.length, peak: q90(v) }; };
    const liveSub = sw => sw ? 'avg so far ' + rn(sw.avg) + ' · peak ' + rn(sw.peak) : 'warming up';
    const tail = pts => { const tl = pts[pts.length - 1][0], v = pts.filter(q => q[0] > tl - 1 + 1e-6).map(q => q[1]); return { cur: pts[pts.length - 1][1], lo: Math.min(...v), hi: Math.max(...v) }; };
    const lastLat = (lp, min) => Math.max(min, lp[lp.length - 1][1]);
    const latP90 = lp => q90(lp.slice(-20).map(q => q[1]));

    // ---- load card
    const GR = g => {
      const scale = ['A+', 'A', 'B', 'C', 'D', 'F'].map(x => { const sel = x === g, tone = BG.GRADES[x].tone; return { g: x, w: sel ? 700 : 500, bg: sel ? 'var(--' + tone + '-bg)' : 'var(--surface-3)', c: sel ? 'var(--' + tone + '-fg)' : 'var(--fg-subtle)' }; });
      if (!g) return { grade: '—', gStyle: 'dashed', gBd: 'var(--border-strong)', gBg: 'transparent', gFg: 'var(--fg-subtle)', scale, gAria: 'Bufferbloat grade pending' };
      const t = BG.GRADES[g].tone;
      return { grade: g, gStyle: 'solid', gBd: 'var(--' + t + '-border)', gBg: 'var(--' + t + '-bg)', gFg: 'var(--' + t + '-fg)', gText: BG.GRADES[g].text, scale, gAria: 'Bufferbloat grade ' + g + ', ' + BG.GRADES[g].text };
    };
    const lrow = (k, v, o) => {
      o = o || {};
      const label = (k === 'down' ? 'During download' : 'During upload') + ' · ' + src;
      if (v == null) return { icon: PI[k][1], ic: C[k], label, sub: o.sub || 'Pending', num: '—', unit: '', nc: 'var(--fg-subtle)' };
      const sub = (o.p90 != null ? 'p90 ' + BG.ms(o.p90) + ' · ' : '') + '+' + BG.ms(v - IDLE.v) + ' ms vs idle' + (o.partial ? ' · partial' : '');
      return { icon: PI[k][1], ic: C[k], label, sub: o.sub || sub, num: BG.ms(v), unit: 'ms', nc: o.live ? 'var(--primary-text)' : 'var(--fg)' };
    };
    // HTTP loaded responsiveness: one RPM per direction; no High/Low levels.
    const respB = (d, u) => {
      const blocked = RS === 'needs-h2' || RS === 'not-reported';
      const dir = (k, v) => {
        const b = { icon: PI[k][1], ic: C[k], num: null, unit: 'RPM', text: null, nc: RS === 'uncertain' ? 'var(--fg-muted)' : 'var(--fg)' };
        if (blocked) return Object.assign(b, { text: '—' });
        if (v === 'few' || (RS === 'few-samples' && k === 'up' && typeof v === 'number')) return Object.assign(b, { text: 'not enough samples' });
        if (v == null) return Object.assign(b, { text: '—' });
        return Object.assign(b, { num: v.toLocaleString('en-US') });
      };
      const has = typeof d === 'number' || typeof u === 'number';
      return {
        proto: RS === 'needs-h2' ? 'HTTP/1.1' : RS === 'not-reported' ? 'not reported' : 'h2',
        note: RS === 'needs-h2' ? 'needs HTTP/2 or HTTP/3 at the reverse proxy' : RS === 'not-reported' ? 'protocol not reported — treated as HTTP/1.1' : RS === 'uncertain' && has ? 'round trips per minute · uncertain' : 'round trips per minute, one per direction',
        tag: RS === 'uncertain' && has ? 'Uncertain' : null, dirs: [dir('down', d), dir('up', u)]
      };
    };
    const load = (g, rows, resp, text) => Object.assign(GR(g), { rows, resp }, text ? { gText: text } : {});
    // §11: grade from the worse gradable increase. §13: AIM points; packet loss is fixed at 0 points; upload is not an input.
    const gradeOf = inc => inc < 5 ? 'A+' : inc < 30 ? 'A' : inc < 60 ? 'B' : inc < 200 ? 'C' : inc < 400 ? 'D' : 'F';
    const aimP = (v, th, p) => { let i = 0; while (i < th.length && v >= th[i]) i++; return p[i]; };
    const band = (sum, th) => ['Bad', 'Poor', 'Average', 'Good', 'Great'][th.filter(x => Math.max(0, sum) >= x).length];
    const aim = (lat, jit, dl, inc) => {
      const pl = aimP(lat, [10, 20, 50, 100, 500], [20, 10, 5, 0, -10, -20]), pi = aimP(inc, [10, 20, 50, 100, 500], [20, 10, 5, 0, -10, -20]);
      const pj = aimP(jit, [10, 20, 100, 500], [10, 5, 0, -10, -20]), pd = aimP(dl, [1e6, 1e7, 5e7, 1e8], [0, 5, 10, 20, 30]);
      return [band(pl + pd + pi, [15, 20, 40, 60]), band(pl + pi, [5, 15, 25, 30]), band(pl + pj + pi, [5, 15, 25, 40])];
    };
    const FIT = [['Streaming', 'tv'], ['Gaming', 'gamepad'], ['Video calls', 'video']];
    const fit = (q, none) => FIT.map(([label, icon], i) => {
      const nn = Array.isArray(none) ? none[i] : none;
      if (!q || q[i] == null) return { label, icon, rating: null, none: nn || '—' };
      const Q = BG.QUALITY[q[i]]; return { label, icon, rating: q[i], cls: 'sbadge ' + Q.tone, ricon: Q.icon, none: null };
    });
    const PL = { icon: 'signal', label: 'Packet loss', na: true };
    const meta = (data, dataSub, dur, durSub) => [
      { icon: 'database', label: 'Data used', sub: dataSub, value: data, vc: data === '—' ? 'var(--fg-subtle)' : 'var(--fg)' },
      { icon: 'timer', label: 'Duration', sub: durSub, value: dur, vc: dur === '—' ? 'var(--fg-subtle)' : 'var(--fg)' },
      PL
    ];
    const N = (tone, icon, title, body, actions) => {
      const t = tone === 'neutral' ? { bg: 'var(--surface-2)', bd: 'var(--border-default)', fg: 'var(--fg)', ic: 'var(--fg-subtle)' } : { bg: 'var(--' + tone + '-bg)', bd: 'var(--' + tone + '-border)', fg: 'var(--' + tone + '-fg)', ic: 'var(--' + tone + ')' };
      return Object.assign(t, { icon, title, body, actions: actions || [], role: tone === 'danger' ? 'alert' : 'status' });
    };
    const BTN = {
      start: { label: 'Start test', icon: 'play', cls: 'btn lg primary', kbd: 'Enter' },
      stop: { label: 'Stop test', icon: 'square', cls: 'btn lg secondary', kbd: 'Esc' },
      again: { label: 'Run again', icon: 'rotate-ccw', cls: 'btn lg primary', kbd: 'Enter' },
      retry: { label: 'Retry test', icon: 'refresh-cw', cls: 'btn lg primary', kbd: 'Enter' },
      now: { label: 'Start now', icon: 'play', cls: 'btn lg primary', kbd: 'Enter' }
    };
    const shift = (pts, dt) => pts.map(p => [p[0] + dt, p[1]]);
    // Upload: "received" (server-confirmed) trails client "sending" progress.
    const delay = (pts, d, tMax) => { const r = pts.map(q => [q[0] + d, q[1]]).filter(q => q[0] <= tMax); return r.length >= 2 ? r : [[0, 0], [Math.max(0.01, tMax), 0]]; };
    const ser = (pts, c, faint) => ({ pts, c, so: faint ? 0.4 : 1, fo: faint ? 0 : 0.1 });
    const lg = (t, c, dash, o) => ({ t, c, dash: dash ? 'dashed' : 'solid', o: o || 1 });
    const LG = { d: lg('Download', C.down), u: lg('Upload', C.up), ur: lg('Upload · received', C.up), us: lg('Upload · sending', C.up, false, 0.4), l: lg('Latency under load', C.lat, true) };
    // Standard, fast LAN: download 0–10 s (warm-up ends ≈ 6.5 s), upload 10–22 s (warm-up ends ≈ 7.5 s, confirmed window ≈ 7.5–11.0 s).
    const DOWN = BG.thr(3, 612e6, 10), DLAT = BG.lat(5, 3.1, 18, 10);
    const DONE_D = rt('Download', 'arrow-down', C.down, 612e6, { sub: 'peak ' + rn(641e6) + ' · ' + streams + ' streams' + plateau });
    const DONE_U = rt('Upload', 'arrow-up', C.up, 438e6, { sub: 'peak ' + rn(455e6) + ' · ' + streams + ' streams' + plateau });
    const ROW_D = lrow('down', 18, { p90: 24 });
    const EK = { requests: ['3 requests in a row failed during download', '3 requests in a row failed'], unreachable: ['server unreachable', 'server unreachable'], restarted: ['server restarted', 'server restarted'], network: ['network changed', 'network changed'] }[this.props.errKind || 'requests'] || ['3 requests in a row failed during download', '3 requests in a row failed'];

    const P = this.props.progress == null || this.props.progress === '' ? null : Math.max(0, Math.min(1, +this.props.progress));
    const pv = d => P == null ? d : P;
    const cdN = Math.max(1, Math.ceil(3 * (1 - pv(0.2)) - 1e-9));
    const EMPTY = { xMax: 22, yMax: 1e9, series: [], empty: 'Throughput over time appears here while the test runs.', title: 'Throughput', legend: [LG.d, LG.u, LG.l], meta: '' };
    const preLoad = () => load(null, [lrow('down'), lrow('up')], respB(null, null), 'Graded after upload');
    let S;
    switch (st) {
      case 'countdown':
      case 'param-ignored':
      case 'idle': S = {
        phases: [pend('lat'), pend('down'), pend('up')],
        gauge: { opts: {} }, R: st !== 'countdown' ? { textual: true, title: 'Ready', sub: m ? 'Tap Start test to begin' : 'Press Enter to start', icon: null } : { numeric: true, eyebrow: 'Auto-start in', icon: 'timer', ec: 'var(--primary-text)', num: String(cdN), unit: cdN === 1 ? 'second' : 'seconds', sub: 'Esc cancels' },
        countdown: st === 'countdown', chart: EMPTY,
        prim: [eDown(), eUp(), eLat(), eJit()], load: preLoad(), fit: fit(null), meta: meta('—', '', '—', ''),
        notices: st === 'countdown' ? [N('info', 'timer', 'Auto-start in ' + cdN + ' s', 'This page was opened from a link with autostart enabled.', [{ label: 'Cancel', icon: 'x', cls: 'btn sm secondary' }])] : st === 'param-ignored' ? [N('warn', 'link', 'URL parameter ignored', 'streams=12 ignored, allowed 1–6. Streams stay on Auto; the other parameters from the link were applied.', [{ label: 'Dismiss', icon: 'x', cls: 'btn sm ghost' }])] : [],
        btn: st === 'countdown' ? BTN.now : BTN.start, lastLine: st !== 'countdown'
      }; break;
      case 'connecting': { const p = pv(0.5); S = {
        phases: [ph('lat', 'active', 'server info', p * 100, 'Connecting…'), pend('down'), pend('up')],
        gauge: { opts: {} }, R: { textual: true, title: 'Connecting…', sub: 'Basement NAS · reading server info', icon: null },
        chart: EMPTY, prim: [eDown(), eUp(), eLat(), eJit()], load: preLoad(), fit: fit(null), meta: meta('—', '', (0.6 * p).toFixed(1) + ' s', 'elapsed'), notices: [], btn: BTN.stop
      }; } break;
      case 'latency': { const p = pv(0.7), t = Math.max(0.1, 2 * p), n = Math.max(1, Math.round(20 * p)), lp = BG.lat(5, 3.1, 3.1, t, 0.1, 0.35), lv = lp.map(q => q[1]); S = {
        phases: [ph('lat', 'active', n + ' / 20 pings', p * 100), pend('down'), pend('up')],
        gauge: { opts: { mode: 'ms', value: lv[lv.length - 1], bandLo: Math.min(...lv), bandHi: Math.max(...lv) }, scale: 'log scale · 1 – 1000 ms', c: C.lat },
        R: { numeric: true, eyebrow: 'Latency', icon: 'activity', ec: C.lat, num: BG.ms(lv[lv.length - 1]), unit: 'ms', sub: 'median 3.1 · ping ' + n + ' of 20' },
        chart: { xMax: 2, ms: true, series: [ser(lp, C.lat)], now: t, title: 'Latency samples', legend: [lg('Round-trip time', C.lat)], meta: t.toFixed(1) + ' s / ~2 s' },
        prim: [eDown(), eUp(), latT(LIVE), jitT(LIVE)],
        load: preLoad(), fit: fit(null), meta: meta(BG.bytes(Math.max(1e3, 17e3 * p)), 'so far', (t + 0.6).toFixed(1) + ' s', 'elapsed'), notices: [], btn: BTN.stop
      }; } break;
      case 'ws-fallback':
      case 'download': { const p = pv(0.75), t = Math.max(0.2, 10 * p), dp = BG.thr(3, 590e6, t), d = tail(dp), sw = steady(dp, 6.5), lp = BG.lat(5, 3.1, 17, t), all = dp.reduce((a, q) => a + q[1], 0) / dp.length; S = {
        phases: [ph('lat', 'done', '3.1 ms'), ph('down', 'active', (10 - t).toFixed(1) + ' s left', p * 100), pend('up')],
        gauge: { opts: { value: d.cur, bandLo: d.lo, bandHi: d.hi, peak: sw ? sw.peak : null }, src: dp, c: C.down },
        R: { numeric: true, eyebrow: 'Download', icon: 'arrow-down', ec: C.down, num: rn(d.cur), unit: BG.rate(d.cur, unit).u, sub: liveSub(sw), oh: OH[0] },
        chart: { xMax: 10, series: [ser(dp, C.down)], lat: lp, now: t, title: 'Throughput', legend: [LG.d, LG.l], meta: t.toFixed(1) + ' s / 10 s' },
        prim: [rt('Download', 'arrow-down', C.down, d.cur, Object.assign({ sub: liveSub(sw) }, LIVE)), eUp('up next'), latT(), jitT()],
        load: load(null, [lrow('down', lastLat(lp, 3.2), { p90: latP90(lp), live: true }), lrow('up')], respB(null, null), 'Graded after upload'), fit: fit(null), meta: meta(BG.bytes(all * t / 8), 'so far', (t + 2.6).toFixed(1) + ' s', 'elapsed'), notices: st === 'ws-fallback' ? [N('info', 'info', 'WebSocket unavailable — HTTP latency fallback', 'The reverse proxy did not accept a WebSocket upgrade, so latency is measured with HTTP/2 requests. Values can read slightly higher.')] : [], btn: BTN.stop
      }; } break;
      case 'upload': { const p = pv(0.75), t = Math.max(0.2, 12 * p), snd = BG.thr(7, 431e6, t), rcv = delay(snd, 0.4, t), u = tail(snd), sw = steady(rcv, 7.5), lp = BG.lat(9, 3.1, 40, t), rc = rcv[rcv.length - 1][1]; S = {
        phases: [ph('lat', 'done', '3.1 ms'), ph('down', 'done', rs(612e6)), ph('up', 'active', (12 - t).toFixed(1) + ' s left', p * 100)],
        gauge: { opts: { value: u.cur, bandLo: u.lo, bandHi: u.hi, peak: sw ? sw.peak : null }, prev: DOWN, src: snd, c: C.up },
        R: { numeric: true, eyebrow: 'Upload · sending', icon: 'arrow-up', ec: C.up, num: rn(u.cur), unit: BG.rate(u.cur, unit).u, sub: liveSub(sw), oh: OH[0] },
        chart: { xMax: 22, series: [ser(DOWN, C.down), ser(shift(snd, 10), C.up, true), ser(shift(rcv, 10), C.up)], lat: DLAT.concat(shift(lp, 10)), seps: [{ t: 0, label: 'Download' }, { t: 10, label: 'Upload' }], now: 10 + t, title: 'Throughput', legend: [LG.d, LG.ur, LG.us, LG.l], meta: (10 + t).toFixed(1) + ' s / 22 s' },
        prim: [DONE_D, rt('Upload', 'arrow-up', C.up, rc || u.cur, Object.assign({ sub: liveSub(sw) }, LIVE)), latT(), jitT()],
        load: load(null, [ROW_D, lrow('up', lastLat(lp, 3.2), { p90: latP90(lp), live: true })], respB(1420, null), 'Graded after upload'), fit: fit(null), meta: meta(BG.bytes(0.765e9 + 431e6 * t / 8), 'so far', (t + 12.6).toFixed(1) + ' s', 'elapsed'), notices: [], btn: BTN.stop
      }; } break;
      case 'complete': S = {
        phases: [ph('lat', 'done', '3.1 ms'), ph('down', 'done', rs(612e6)), ph('up', 'done', rs(438e6))],
        gauge: { opts: { value: 612e6, inner: 438e6 }, prev: DOWN, c: C.down },
        R: { numeric: true, eyebrow: 'Download', icon: 'arrow-down', ec: C.down, num: rn(612e6), unit: BG.rate(612e6, unit).u, sub: '', up: rs(438e6) + ' upload', oh: OH[0] },
        chart: { xMax: 22, series: [ser(DOWN, C.down), ser(shift(BG.thr(7, 438e6, 12), 10), C.up)], lat: DLAT.concat(shift(BG.lat(9, 3.1, 42, 12), 10)), seps: [{ t: 0, label: 'Download' }, { t: 10, label: 'Upload' }], title: 'Throughput', legend: [LG.d, LG.u, LG.l], meta: '24.6 s total' },
        prim: [DONE_D, DONE_U, latT(), jitT()],
        load: load('B', [ROW_D, lrow('up', 42, { p90: 55 })], respB(1420, 980)), fit: fit(aim(IDLE.v, IDLE.jit, 612e6, 42 - IDLE.v)), meta: meta(BG.bytes(1.42e9), '', '24.6 s', ''),
        notices: on(this.props.cpu) ? [N('warn', 'cpu', "Limited by this device's CPU", 'The browser ran at full CPU during download, so the link may be faster than measured. Close other tabs or test from a faster device.')] : [],
        btn: BTN.again, saved: { time: '14:02:11', label: '', chips: ['LAN', 'Home Wi-Fi', 'Office'] },
        share: { blocks: [['↓ DOWNLOAD', 612e6, C.down], ['↑ UPLOAD', 438e6, C.up]], foot: ['3.1 ms idle', '0.8 ms jitter', '+39 ms under load', 'B · Mild bufferbloat'], lines: ['↓ ' + rs(612e6) + '   ↑ ' + rs(438e6), 'Idle latency 3.1 ms · jitter 0.8 ms', 'Loaded latency +39 ms (worse direction)', 'Bufferbloat B · Mild bufferbloat', 'Basement NAS'] }
      }; break;
      case 'error': S = {
        phases: [ph('lat', 'done', '3.1 ms'), ph('down', 'failed', 'Error at 6.4 s', 64), ph('up', 'skipped', 'Not run')],
        gauge: { opts: {} },
        R: { textual: true, title: 'Connection lost', sub: 'Error during download', faint: 'last sample ' + rs(575e6), icon: 'wifi-off', ec: 'var(--danger)' },
        chart: { xMax: 10, series: [ser(BG.thr(3, 575e6, 6.4), C.down)], lat: BG.lat(5, 3.1, 17, 6.4), marks: [{ t: 6.4, label: 'Connection lost' }], markColor: 'var(--danger)', title: 'Throughput', legend: [LG.d, LG.l], meta: 'stopped at 6.4 s', noEnd: true },
        prim: [T({ label: 'Download', icon: 'arrow-down', ic: C.down, nc: 'var(--fg-subtle)', tag: 'Error', tagCls: 'pill danger', sub: EK[1] }), eUp('not run'), latT(), jitT()],
        load: load(null, [lrow('down', null, { sub: 'not measured · download failed' }), lrow('up', null, { sub: 'Not run' })], respB(null, null), 'Not graded — test incomplete'),
        fit: fit(null, ['needs download', 'needs loaded latency', 'needs loaded latency']), meta: meta(BG.bytes(460e6), 'not saved', '9.0 s', ''),
        notices: [N('danger', 'wifi-off', 'Connection to Basement NAS lost — ' + EK[0], 'Download stopped at 6.4 s. Latency finished before the error.')],
        btn: BTN.retry, partial: { kind: 'error', keep: true }
      }; break;
      // Cancelled direction: a number only when the CONFIRMED steady window (warm-up end → final confirmed watermark) is ≥ 3 s AND holds ≥ 3 confirmed requests.
      case 'cancelled': { const snd = BG.thr(7, 402e6, 3.1), rcv = delay(snd, 0.4, 2.7); S = {
        phases: [ph('lat', 'done', '3.1 ms'), ph('down', 'done', rs(612e6)), ph('up', 'cancelled', 'Cancelled at 3.1 s', 26)],
        gauge: { opts: { value: 612e6 }, prev: DOWN, c: C.down, noDot: true },
        R: { textual: true, title: 'Cancelled', sub: 'Partial results · not saved', icon: 'circle-minus', ec: 'var(--fg-subtle)' },
        chart: { xMax: 22, series: [ser(DOWN, C.down), ser(shift(snd, 10), C.up, true), ser(shift(rcv, 10), C.up)], lat: DLAT.concat(shift(BG.lat(9, 3.1, 37, 3.1), 10)), seps: [{ t: 0, label: 'Download' }, { t: 10, label: 'Upload' }], marks: [{ t: 13.1, label: 'Cancelled' }], markColor: 'var(--fg-muted)', title: 'Throughput', legend: [LG.d, LG.ur, LG.us, LG.l], meta: 'stopped at 13.1 s', noEnd: true },
        prim: [DONE_D, T({ label: 'Upload', icon: 'arrow-up', ic: C.up, nc: 'var(--fg-subtle)', tag: 'Cancelled', tagCls: 'pill neutral', sub: 'Insufficient data — confirmed steady window shorter than 3 s', notes: ['156 MB used'] }), latT(), jitT()],
        load: load('A', [ROW_D, lrow('up', null, { sub: 'no steady window' })], respB(1420, 'few'), BG.GRADES.A.text + ' · download only'),
        fit: fit(aim(IDLE.v, IDLE.jit, 612e6, 18 - IDLE.v)), meta: meta(BG.bytes(0.921e9), '', '15.7 s', ''),
        notices: [N('neutral', 'circle-minus', 'Test cancelled during upload', 'Latency and download completed. Upload stopped before a 3 s confirmed steady window, so it has no value. The grade uses download only.')],
        btn: BTN.again, partial: { kind: 'partial', keep: true }
      }; } break;
      // Stopped 11.5 s into upload: in-flight requests aborted; final confirmed watermark 11.1 s; window 7.5–11.1 s holds 21 confirmed requests.
      case 'cancelled-late': { const snd = BG.thr(7, 402e6, 11.5), rcv = delay(snd, 0.4, 11.1); S = {
        phases: [ph('lat', 'done', '3.1 ms'), ph('down', 'done', rs(612e6)), ph('up', 'cancelled', 'Cancelled at 11.5 s', 96)],
        gauge: { opts: { value: 612e6, inner: 402e6 }, prev: DOWN, c: C.down, noDot: true },
        R: { textual: true, title: 'Cancelled', sub: 'Partial results · not saved', icon: 'circle-minus', ec: 'var(--fg-subtle)' },
        chart: { xMax: 22, series: [ser(DOWN, C.down), ser(shift(snd, 10), C.up, true), ser(shift(rcv, 10), C.up)], lat: DLAT.concat(shift(BG.lat(9, 3.1, 37, 11.5), 10)), seps: [{ t: 0, label: 'Download' }, { t: 10, label: 'Upload' }], wins: [{ t0: 17.5, t1: 21.1, label: 'Steady 3.6 s' }], marks: [{ t: 21.5, label: 'Cancelled' }], markColor: 'var(--fg-muted)', title: 'Throughput', legend: [LG.d, LG.ur, LG.us, LG.l], meta: 'stopped at 21.5 s', noEnd: true },
        prim: [DONE_D, rt('Upload', 'arrow-up', C.up, 402e6, { tag: 'Partial — stopped early', tagCls: 'pill warn', sub: 'based on a 3.6 s steady window · 21 requests' }), latT(), jitT()],
        load: load(gradeOf(37 - IDLE.v), [ROW_D, lrow('up', 37, { p90: 46, partial: true })], respB(1420, 610)),
        fit: fit(aim(IDLE.v, IDLE.jit, 612e6, 37 - IDLE.v)), meta: meta(BG.bytes(1.34e9), '', '24.1 s', ''),
        notices: [N('neutral', 'circle-minus', 'Partial — stopped early · upload based on a 3.6 s steady window', 'Latency and download completed. Upload stopped at 11.5 s; in-flight requests were aborted, and the 21 requests confirmed by 11.1 s give the partial value.')],
        btn: BTN.again, partial: { kind: 'partial', keep: true }
      }; } break;
      case 'cancelled-latency': { const p = pv(0.6), t = Math.max(0.5, 2 * p), n = Math.max(5, Math.round(20 * p)), lp = BG.lat(5, 3.1, 3.1, t, 0.1, 0.35), PT = { tag: 'Partial — stopped early', tagCls: 'pill warn' }; S = {
        phases: [ph('lat', 'cancelled', 'Cancelled · ' + n + ' / 20 pings', p * 100), ph('down', 'skipped', 'Not run'), ph('up', 'skipped', 'Not run')],
        gauge: { opts: { mode: 'ms', value: IDLE.v }, scale: 'log scale · 1 – 1000 ms', c: C.lat, noDot: true },
        R: { textual: true, title: 'Cancelled', sub: 'Partial results · not saved', icon: 'circle-minus', ec: 'var(--fg-subtle)' },
        chart: { xMax: 2, ms: true, series: [ser(lp, C.lat)], marks: [{ t, label: 'Cancelled' }], markColor: 'var(--fg-muted)', title: 'Latency samples', legend: [lg('Round-trip time', C.lat)], meta: 'stopped at ' + t.toFixed(1) + ' s', noEnd: true },
        prim: [eDown('not run'), eUp('not run'), latT(Object.assign({ sub: 'median of ' + n + ' of 20 pings · ' + src }, PT)), jitT(PT)],
        load: load(null, [lrow('down', null, { sub: 'Not run' }), lrow('up', null, { sub: 'Not run' })], respB(null, null), 'Not graded — no loaded latency'),
        fit: fit(null, ['needs download', 'needs loaded latency', 'needs loaded latency']), meta: meta(BG.bytes(17e3 * p), '', (t + 0.6).toFixed(1) + ' s', ''),
        notices: [N('neutral', 'circle-minus', 'Test cancelled during latency', 'Stopped after ' + n + ' of 20 pings. Idle latency and jitter come from those pings; download and upload did not run.')],
        btn: BTN.again, partial: { kind: 'partial', keep: true }
      }; } break;
      // Stopped during download: a value only when the steady window (warm-up end → stop) holds ≥ 3 s; then the grade uses download only.
      case 'cancelled-slow':
      case 'cancelled-download': { const D = slow ? { dur: 20, warm: 6, v: 640e3, ll: 162, pre: 4.2 } : { dur: 10, warm: 6.5, v: 612e6, ll: 18, pre: 2.6 };
        const p = pv(slow ? 0.6 : 0.52), t = Math.max(0.3, D.dur * p), dp = slow ? BG.thr(11, D.v, t, 0.1, 0.22, 2.5) : BG.thr(3, D.v, t), lp = slow ? BG.lat(13, 48, D.ll, t, 0.25, 0.25, 2) : BG.lat(5, 3.1, D.ll, t);
        const win = t - D.warm, part = win >= 3, sw = steady(dp, D.warm), all = dp.reduce((a, q) => a + q[1], 0) / dp.length, used = BG.bytes(all * t / 8), inc = D.ll - IDLE.v, g = part ? gradeOf(inc) : null; S = {
        phases: [ph('lat', 'done', BG.ms(IDLE.v) + ' ms'), ph('down', 'cancelled', 'Cancelled at ' + t.toFixed(1) + ' s', p * 100), ph('up', 'skipped', 'Not run')],
        gauge: { opts: { value: part ? sw.avg : dp[dp.length - 1][1] }, src: dp, c: C.down, noDot: true },
        R: { textual: true, title: 'Cancelled', sub: 'Partial results · not saved', icon: 'circle-minus', ec: 'var(--fg-subtle)' },
        chart: { xMax: D.dur, series: [ser(dp, C.down)], lat: lp, wins: part ? [{ t0: D.warm, t1: t, label: 'Steady ' + win.toFixed(1) + ' s' }] : [], marks: [{ t, label: 'Cancelled' }], markColor: 'var(--fg-muted)', title: 'Throughput', legend: [LG.d, LG.l], meta: 'stopped at ' + t.toFixed(1) + ' s', noEnd: true },
        prim: [part ? rt('Download', 'arrow-down', C.down, sw.avg, { tag: 'Partial — stopped early', tagCls: 'pill warn', sub: 'based on a ' + win.toFixed(1) + ' s steady window' }) : T({ label: 'Download', icon: 'arrow-down', ic: C.down, nc: 'var(--fg-subtle)', tag: 'Cancelled', tagCls: 'pill neutral', sub: t < D.warm ? 'Insufficient data — stopped during warm-up' : 'Insufficient data — steady window shorter than 3 s', notes: [used + ' used'] }), eUp('not run'), latT(), jitT()],
        load: part ? load(g, [lrow('down', D.ll, { partial: true }), lrow('up', null, { sub: 'Not run' })], respB(null, null), BG.GRADES[g].text + ' · download only') : load(null, [lrow('down', null, { sub: 'no steady window' }), lrow('up', null, { sub: 'Not run' })], respB(null, null), 'Not graded — no gradable direction'),
        fit: part ? fit(aim(IDLE.v, IDLE.jit, sw.avg, inc)) : fit(null, ['needs download', 'needs loaded latency', 'needs loaded latency']),
        meta: meta(used, '', (t + D.pre).toFixed(1) + ' s', ''),
        notices: [N('neutral', 'circle-minus', 'Test cancelled during download', part ? 'Latency completed. Download has a ' + win.toFixed(1) + ' s steady window, enough for a partial value. Upload did not run.' : 'Latency completed. Download stopped before a 3 s steady window, so it has no value. Upload did not run.')],
        btn: BTN.again, partial: { kind: 'partial', keep: true }
      }; } break;
      case 'slow': { const p = pv(0.467), t = Math.max(0.5, 20 * p), dp = BG.thr(11, 640e3, t, 0.1, 0.22, 2.5), d = tail(dp), sw = steady(dp, 6), lp = BG.lat(13, 48, 162, t, 0.25, 0.25, 2), all = dp.reduce((a, q) => a + q[1], 0) / dp.length, mb = BG.bytes(all * t / 8); S = {
        phases: [ph('lat', 'done', '48 ms'), ph('down', 'active', 'extended · ' + Math.round(20 - t) + ' s left', p * 100), pend('up', '~25 s')],
        gauge: { opts: { value: d.cur, bandLo: d.lo, bandHi: d.hi, peak: sw ? sw.peak : null }, src: dp, c: C.down },
        R: { numeric: true, eyebrow: 'Download', icon: 'arrow-down', ec: C.down, num: rn(d.cur), unit: BG.rate(d.cur, unit).u, sub: liveSub(sw), oh: OH[0] },
        chart: { xMax: 20, series: [ser(dp, C.down)], lat: lp, now: t, marks: t >= 10 ? [{ t: 10, label: 'Extended' }] : [], markColor: 'var(--info)', title: 'Throughput', legend: [LG.d, LG.l], meta: Math.round(t) + ' s / 20 s' },
        prim: [rt('Download', 'arrow-down', C.down, d.cur, Object.assign({ sub: liveSub(sw) }, LIVE)), eUp('up next'), latT(), jitT()],
        load: load(null, [lrow('down', lastLat(lp, 49), { p90: latP90(lp), live: true }), lrow('up')], respB(null, null), 'Graded after upload'), fit: fit(null), meta: meta(mb, 'so far · cap 2 MB', (t + 4.2).toFixed(1) + ' s', 'elapsed'),
        notices: [N('info', 'hourglass', 'Slow connection detected — test extended', 'Download now runs for up to 20 s to collect enough samples. ' + mb + ' of your 2 MB cap used so far.')],
        btn: BTN.stop
      }; } break;
      case 'slowdone': S = {
        phases: [ph('lat', 'done', '48 ms'), ph('down', 'done', rs(640e3)), ph('up', 'capped', 'stopped at data cap', 64)],
        gauge: { opts: { value: 640e3, inner: 210e3 }, prev: BG.thr(11, 640e3, 20, 0.1, 0.22, 2.5), c: C.down },
        R: { numeric: true, eyebrow: 'Download', icon: 'arrow-down', ec: C.down, num: rn(640e3), unit: BG.rate(640e3, unit).u, sub: '', up: rs(210e3) + ' upload', oh: OH[0] },
        chart: { xMax: 36, series: [ser(BG.thr(11, 640e3, 20, 0.1, 0.22, 2.5), C.down), ser(shift(BG.thr(17, 210e3, 16, 0.25, 0.3, 2.5), 20), C.up)], lat: BG.lat(13, 48, 162, 20, 0.25, 0.25, 2).concat(shift(BG.lat(15, 48, 310, 16, 0.25, 0.25, 2), 20)), seps: [{ t: 0, label: 'Download' }, { t: 20, label: 'Upload' }], marks: [{ t: 36, label: 'Data cap' }], markColor: 'var(--warn)', title: 'Throughput', legend: [LG.d, LG.u, LG.l], meta: '39.6 s total', noEnd: true },
        prim: [rt('Download', 'arrow-down', C.down, 640e3, { sub: 'peak ' + rn(702e3) + ' · 2 streams · plateau: no-gain' }), rt('Upload', 'arrow-up', C.up, 210e3, { sub: 'insufficient samples · stopped at cap', tag: 'Low confidence', tagCls: 'pill warn' }), latT(), jitT()],
        load: load('D', [lrow('down', 162, { p90: 205 }), lrow('up', 310, { p90: 380 })], respB(240, 'few')), fit: fit(aim(IDLE.v, IDLE.jit, 640e3, 310 - IDLE.v)), meta: meta(BG.bytes(2e6), 'cap reached', '39.6 s', 'extended'),
        notices: [N('warn', 'database', 'Data cap reached', 'Upload stopped at the 2 MB per-test cap after 16 s.', [{ label: 'Change cap', icon: 'sliders', cls: 'btn sm ghost' }]), N('warn', 'triangle-alert', 'Low confidence — upload: insufficient samples', 'Upload confirmed 18 requests before the cap. Treat the upload value as approximate.')],
        btn: BTN.again, saved: { time: '08:41:57', label: 'VPN via 5G', chips: ['VPN', 'Mobile'] },
        share: { blocks: [['↓ DOWNLOAD', 640e3, C.down], ['↑ UPLOAD', 210e3, C.up]], foot: ['48 ms idle', '9.4 ms jitter', '+262 ms under load', 'D · High bufferbloat'], lines: ['↓ ' + rs(640e3) + '   ↑ ' + rs(210e3) + ' (low confidence)', 'Idle latency 48 ms · jitter 9.4 ms', 'Loaded latency +262 ms (worse direction)', 'Bufferbloat D · High bufferbloat', 'Basement NAS'] }
      }; break;
      case 'offline': S = {
        phases: [pend('lat'), pend('down'), pend('up')],
        gauge: { opts: {} }, R: { textual: true, title: 'Server unreachable', sub: "Basement NAS didn't respond. Next check in 8 s.", icon: 'server-off', ec: 'var(--danger)', action: { label: 'Retry', icon: 'refresh-cw' } },
        chart: Object.assign({}, EMPTY, { empty: 'Nothing to measure yet. The chart fills in once Basement NAS responds.' }),
        prim: [eDown(), eUp(), eLat(), eJit()], load: preLoad(), fit: fit(null), meta: meta('—', '', '—', ''), notices: [],
        btn: Object.assign({}, BTN.start, { dis: true, tip: 'Server unreachable — use Retry first' })
      }; break;
      // 20 kbit/s on Standard: the first 64 KiB request (≈ 26 s at this rate) is still in flight at the 20 s max, so only one request contributed bytes (≈ 50 kB).
      case 'insufficient': { const p = pv(0.45), t = Math.max(0.3, 12 * p), DP = BG.thr(23, 20e3, 20, 0.1, 0.3, 1.5), snd = BG.thr(29, 19e3, t, 0.1, 0.25, 1.5), u = tail(snd), lp = BG.lat(15, 48, 210, t, 0.25, 0.25, 2); S = {
        phases: [ph('lat', 'done', '48 ms'), ph('down', 'capped', 'insufficient data', 100), ph('up', 'active', (12 - t).toFixed(1) + ' s left', p * 100)],
        gauge: { opts: { value: u.cur, bandLo: u.lo, bandHi: u.hi }, prev: DP, src: snd, c: C.up },
        R: { numeric: true, eyebrow: 'Upload · sending', icon: 'arrow-up', ec: C.up, num: rn(u.cur), unit: BG.rate(u.cur, unit).u, sub: 'warming up', oh: OH[0] },
        chart: { xMax: 32, series: [ser(DP, C.down), ser(shift(snd, 20), C.up, true)], lat: BG.lat(13, 48, 140, 20, 0.25, 0.25, 2).concat(shift(lp, 20)), seps: [{ t: 0, label: 'Download' }, { t: 20, label: 'Upload' }], marks: [{ t: 20, label: '20 s max' }], markColor: 'var(--warn)', now: 20 + t, title: 'Throughput', legend: [LG.d, LG.us, LG.l], meta: (20 + t).toFixed(1) + ' s / 32 s' },
        prim: [T({ label: 'Download', icon: 'arrow-down', ic: C.down, nc: 'var(--fg-subtle)', tag: 'Insufficient data', tagCls: 'pill warn', sub: 'only 1 request contributed within the 20 s max', notes: [BG.bytes(50e3) + ' used'] }), T(Object.assign({ label: 'Upload', icon: 'arrow-up', ic: C.up, nc: 'var(--fg-subtle)', sub: 'no confirmed request yet' }, LIVE)), latT(), jitT()],
        load: load(null, [lrow('down', 140, { p90: 176 }), lrow('up', lastLat(lp, 49), { p90: latP90(lp), live: true })], respB(null, null), 'Graded after upload'), fit: fit(null),
        meta: meta(BG.bytes(50e3 + 19e3 * t / 8), 'so far · download ' + BG.bytes(50e3), (t + 22.6).toFixed(1) + ' s', 'elapsed'),
        notices: [N('warn', 'database', 'Download: insufficient data', 'Download reached its 20 s maximum with the first 64 KiB request still in flight, so only one request contributed bytes and there is no value. ' + BG.bytes(50e3) + ' used. Upload continues; Extended allows up to 40 s per direction.', [{ label: 'Try Extended', icon: 'timer', cls: 'btn sm secondary' }])],
        btn: BTN.stop
      }; } break;
      case 'error-early': { const lp = BG.lat(5, 3.1, 3.1, 1.2, 0.1, 0.35); S = {
        phases: [ph('lat', 'failed', 'Error at 1.2 s', 60), ph('down', 'skipped', 'Not run'), ph('up', 'skipped', 'Not run')],
        gauge: { opts: {} },
        R: { textual: true, title: 'Connection lost', sub: 'Error during latency', faint: '12 of 20 pings', icon: 'wifi-off', ec: 'var(--danger)' },
        chart: { xMax: 2, ms: true, series: [ser(lp, C.lat)], marks: [{ t: 1.2, label: 'Connection lost' }], markColor: 'var(--danger)', title: 'Latency samples', legend: [lg('Round-trip time', C.lat)], meta: 'stopped at 1.2 s', noEnd: true },
        prim: [eDown('not run'), eUp('not run'), T({ label: 'Idle latency', icon: 'activity', ic: C.lat, nc: 'var(--fg-subtle)', tag: 'Error', tagCls: 'pill danger', sub: '12 of 20 pings before the error' }), eJit()],
        load: load(null, [lrow('down', null, { sub: 'Not run' }), lrow('up', null, { sub: 'Not run' })], respB(null, null), 'Not graded — test incomplete'),
        fit: fit(null, 'needs a full test'), meta: meta(BG.bytes(9e3), '', '1.8 s', ''),
        notices: [N('danger', 'wifi-off', 'Connection to Basement NAS lost — server stopped responding', 'The test stopped at 1.2 s, during latency. No phase finished.')],
        btn: BTN.retry, partial: { kind: 'error', keep: false }
      }; } break;
      case 'cont-warmup': { const pts = BG.thr(19, 921e6, 6.2, 0.1, 0.05, 10), d = tail(pts); S = {
        phases: [ph('lat', 'done', '3.1 ms'), ph('down', 'cancelled', 'stopped in warm-up · 0:06', 1, 'Download · continuous')],
        gauge: { opts: { value: d.cur }, src: pts, c: C.down, noDot: true },
        R: { textual: true, title: 'Stopped', sub: 'During warm-up · not saved', icon: 'circle-minus', ec: 'var(--fg-subtle)' },
        chart: { xMax: 14, series: [ser(pts, C.down)], lat: BG.lat(21, 3.1, 21, 6.2, 0.1, 0.3, 10), seps: [{ t: 0, label: 'Warm-up' }], marks: [{ t: 6.2, label: 'Stopped' }], markColor: 'var(--fg-muted)', title: 'Throughput · session', legend: [LG.d, LG.l], meta: 'stopped at 6.2 s', noEnd: true },
        prim: [
          em('Current', 'arrow-down', C.down, 'stopped'),
          em('Average', 'arrow-down', C.down, 'starts after warm-up'),
          em('Peak · p90, last hour', 'trending-up', C.down, 'starts after warm-up'),
          em('Loaded latency', 'activity', C.lat, 'starts after warm-up'),
          T({ label: 'Data used', icon: 'database', num: '540', unit: 'MB', sub: 'warm-up included', span: m ? 'span 2' : 'auto' })
        ],
        resCols: m ? null : 'repeat(5, minmax(0,1fr))',
        load: null, fit: null, metaTitle: 'Session', metaSpan: m ? 'span 2' : 'span 5', metaCols: m ? 'minmax(0,1fr)' : 'repeat(4, minmax(0,1fr))',
        meta: [
          { icon: 'timer', label: 'Elapsed', sub: 'stopped during warm-up', value: '0:06', vc: 'var(--fg)' },
          { icon: 'arrow-up-down', label: 'Min / max', sub: 'download, 1 s cells', value: '—', vc: 'var(--fg-subtle)' },
          { icon: 'activity', label: 'Idle latency', sub: 'measured at start', value: '3.1 ms', vc: 'var(--fg)' },
          PL
        ],
        notices: [N('neutral', 'circle-minus', 'Continuous run stopped during warm-up', 'Stopped at 6.2 s, before warm-up ended (at the latest 10 s). Warm-up samples are left out of averages, so the run has no steady value.')],
        btn: BTN.again, partial: { kind: 'partial', keep: true }
      }; } break;
      case 'cont-done': { const pts = BG.thr(19, 921e6, 2538, 10, 0.025, 30); S = {
        phases: [ph('lat', 'done', '3.1 ms'), ph('down', 'done', 'stopped at 42:18', 100, 'Download · continuous')],
        gauge: { opts: { value: 921e6, peak: 936e6 }, note: 'session average', src: pts, c: C.down },
        R: { numeric: true, eyebrow: 'Average', icon: 'arrow-down', ec: C.down, num: rn(921e6), unit: BG.rate(921e6, unit).u, sub: 'peak ' + rn(936e6) + ' · p90, last hour', oh: OH[0] },
        chart: { xMax: 2700, xStep: 600, xLabel: t => (t / 60) + 'm', series: [ser(pts, C.down)], lat: BG.lat(21, 3.1, 21, 2538, 10, 0.3, 30), marks: [{ t: 2538, label: 'Stopped' }], markColor: 'var(--fg-muted)', title: 'Throughput · session', legend: [LG.d, LG.l], meta: '42:18 · stopped by you', noEnd: true },
        prim: [
          rt('Average', 'arrow-down', C.down, 921e6, { sub: 'since warm-up ended' }),
          rt('Peak · p90, last hour', 'trending-up', C.down, 936e6, { sub: '1 s cells' }),
          rt('Minimum', 'arrow-down', C.down, 702e6, { sub: '1 s cells' }),
          msT('Loaded latency', 'activity', 21, 'session median'),
          T({ label: 'Data used', icon: 'database', num: '292', unit: 'GB', sub: '≈ 6.9 GB/min', span: m ? 'span 2' : 'auto' })
        ],
        resCols: m ? null : 'repeat(5, minmax(0,1fr))',
        load: null, fit: null, metaTitle: 'Session', metaSpan: m ? 'span 2' : 'span 5', metaCols: m ? 'minmax(0,1fr)' : 'repeat(4, minmax(0,1fr))',
        meta: [
          { icon: 'timer', label: 'Duration', sub: 'stopped by you · planned 2:00:00', value: '42:18', vc: 'var(--fg)' },
          { icon: 'arrow-up-down', label: 'Min / max', sub: 'download, 1 s cells', value: rn(702e6) + ' / ' + rs(941e6), vc: 'var(--fg)' },
          { icon: 'activity', label: 'Idle latency', sub: 'measured at start', value: '3.1 ms', vc: 'var(--fg)' },
          PL
        ],
        notices: [], btn: BTN.again, saved: { time: '15:26:40', label: '', chips: ['LAN', 'Home Wi-Fi', 'Office'] },
        share: { blocks: [['↓ AVERAGE', 921e6, C.down], ['PEAK · P90', 936e6, C.down]], foot: ['3.1 ms idle', '0.8 ms jitter', '+18 ms under load', 'continuous · 42:18'], lines: ['↓ avg ' + rs(921e6) + ' · peak ' + rs(936e6) + ' (p90)', 'Continuous · 42:18', 'Idle latency 3.1 ms · jitter 0.8 ms', 'Loaded latency +18 ms', 'Basement NAS'] }
      }; } break;
      case 'continuous': {
        const pts = BG.thr(19, 921e6, 2538, 10, 0.025, 30), d = tail(pts);
        S = {
          phases: [ph('lat', 'done', '3.1 ms'), ph('down', 'active', '42:18 of 2:00:00', 35, 'Download · continuous')],
          gauge: { opts: { value: 934e6, bandLo: d.lo, bandHi: d.hi, peak: 936e6 }, note: 'tick p90, last hour', c: C.down },
          R: { numeric: true, eyebrow: 'Download', icon: 'arrow-down', ec: C.down, num: rn(934e6), unit: BG.rate(934e6, unit).u, sub: 'avg ' + rn(921e6) + ' · peak ' + rn(936e6), oh: OH[0] },
          chart: { xMax: 2700, xStep: 600, xLabel: t => (t / 60) + 'm', series: [ser(pts, C.down)], lat: BG.lat(21, 3.1, 21, 2538, 10, 0.3, 30), now: 2538, title: 'Throughput · session', legend: [LG.d, LG.l], meta: '42:18 elapsed' },
          prim: [
            rt('Current', 'arrow-down', C.down, 934e6, Object.assign({ sub: 'last 0.5 s' }, LIVE)),
            rt('Average', 'arrow-down', C.down, 921e6, { sub: 'since warm-up ended' }),
            rt('Peak · p90, last hour', 'trending-up', C.down, 936e6, { sub: '1 s cells' }),
            msT('Loaded latency', 'activity', 21, 'last-minute median'),
            T({ label: 'Data used', icon: 'database', num: '289', unit: 'GB', sub: '≈ 6.8 GB/min', span: m ? 'span 2' : 'auto' })
          ],
          resCols: m ? null : 'repeat(5, minmax(0,1fr))',
          load: null, fit: null, metaTitle: 'Session', metaSpan: m ? 'span 2' : 'span 5', metaCols: m ? 'minmax(0,1fr)' : 'repeat(4, minmax(0,1fr))',
          meta: [
            { icon: 'timer', label: 'Elapsed', sub: 'of 2:00:00 · ends 16:44', value: '42:18', vc: 'var(--fg)' },
            { icon: 'arrow-up-down', label: 'Min / max', sub: 'download, 1 s cells', value: rn(702e6) + ' / ' + rs(941e6), vc: 'var(--fg)' },
            { icon: 'activity', label: 'Idle latency', sub: 'measured at start', value: '3.1 ms', vc: 'var(--fg)' },
            PL
          ],
          notices: [N('info', 'database', 'Data used: 100 GB', 'This run has passed 100 GB. The next notice appears at 1 TB.')], btn: BTN.stop
        };
      } break;
    }

    S.phases.forEach((p, i) => { p.num = String(i + 1); });
    const tipO = on(this.props.tips) ? '1' : '';
    const kept = this.state.kept ?? on(this.props.kept);
    const label = this.state.label ?? (this.props.label || (S.saved ? S.saved.label : ''));
    const shareOpen = !!S.saved && !v01 && !!(this.state.share ?? on(this.props.share));
    if (v01) {
      S.load = null; S.fit = null; S.lastLine = false;
      if (S.chart.legend) S.chart = Object.assign({}, S.chart, { lat: null, legend: S.chart.legend.filter(x => x !== LG.l) });
      if (!S.metaTitle) { S.metaSpan = m ? 'span 2' : 'span 4'; S.metaCols = m ? 'minmax(0,1fr)' : 'repeat(3, minmax(0,1fr))'; }
    }
    const A = (text, icon, cls, onClick, after) => ({ text, icon, cls, on: onClick || (() => {}), after: after || null, wrap: '', tip: null, tipO: '' });
    const JSONA = Object.assign(A('Download JSON', 'file-json', 'btn ghost sm'), { wrap: 'has-tip tip-end', tip: 'Contains your IP address and notes', tipO });
    const DET = A('Details', null, 'btn secondary sm', null, 'chevron-right');
    let bar = null;
    if (S.saved) bar = v01
      ? { icon: 'circle-check', ic: 'var(--ok)', title: 'Test complete', time: S.saved.time, sub: 'Not stored in this browser. Download the JSON to keep it.', labelled: false, actions: [Object.assign({}, JSONA, { cls: 'btn secondary sm' })] }
      : { icon: 'circle-check', ic: 'var(--ok)', title: 'Saved to history', time: S.saved.time, sub: null, labelled: true, chips: S.saved.chips, actions: [A('Share', 'share-2', 'btn ghost sm', () => this.setState({ share: true })), JSONA, DET] };
    else if (S.partial) {
      const canKeep = S.partial.keep && !v01;
      if (canKeep && kept) {
        bar = { icon: 'circle-check', ic: 'var(--ok)', title: 'Saved as ' + S.partial.kind, time: '14:06:52', sub: null, labelled: false, actions: [A('Undo', 'undo-2', 'btn ghost sm', () => this.setState({ kept: false })), JSONA, DET] };
        if (S.R.sub && S.R.sub.indexOf('not saved') >= 0) S.R = Object.assign({}, S.R, { sub: S.R.sub.replace('not saved', 'saved as ' + S.partial.kind) });
        if (S.meta && S.meta[0] && S.meta[0].sub === 'not saved') S.meta[0].sub = 'saved as ' + S.partial.kind;
      } else bar = { icon: 'circle-minus', ic: 'var(--fg-subtle)', title: 'Partial results are not saved', time: '', sub: v01 ? 'Download the JSON to keep them.' : canKeep ? null : 'No phase finished, so there is nothing to keep in history.', labelled: false, actions: canKeep ? [A('Keep in history', 'history', 'btn secondary sm', () => this.setState({ kept: true })), JSONA] : [JSONA] };
    }
    const SH = S.share, inc = !!label && !!this.state.inc, dateT = '2026-10-12 ' + (S.saved ? S.saved.time.slice(0, 5) : '');
    const share = SH ? { blocks: SH.blocks.map(([k, v, c]) => ({ k, c, n: rn(v), u: BG.rate(v, unit).u })), foot: SH.foot, head: inc ? label : '', where: 'Basement NAS · 12 Oct 2026 ' + (S.saved ? S.saved.time.slice(0, 5) : ''), text: ['BitGauge · ' + (inc ? label + ' · ' : '') + dateT].concat(SH.lines).join('\n') } : null;
    const gopts = Object.assign({ size: L.gSize }, S.gauge.opts);
    let gScale = S.gauge.scale || 'log scale · 1 – 1000 ms';
    if (!gopts.mode) {
      let k = BG.track(S.gauge.prev || [], { unit }).k;
      if (S.gauge.src) k = BG.track(S.gauge.src, { unit, k0: k }).k;
      if (unit === 'bytes') ['value', 'bandLo', 'bandHi', 'peak', 'inner'].forEach(n => { if (gopts[n] != null) gopts[n] /= 8; });
      this._kT = k;
      const kS = this._kA ? this._kA.cur : this._kTo != null && this._kTo !== k && !this._rm() ? this._kTo : k;
      gopts.lo = Math.pow(10, kS); gopts.hi = Math.pow(10, kS + 4);
      gScale = BG.winLabel(k, unit) + (S.gauge.note ? ' · ' + S.gauge.note : '');
    } else { cancelAnimationFrame(this._raf); this._kT = null; this._kTo = null; this._kA = null; }
    const g = BG.gauge(gopts);
    if (S.countdown) g.fill = BG.arc(L.gSize / 2, L.gSize / 2, L.gSize / 2 - 10, 0, Math.max(0.002, 1 - pv(0.2)));
    if (S.gauge.noDot) g.dot = null;
    g.sizePx = L.gSize + 'px'; g.scale = gScale;
    const gc = S.countdown ? 'var(--primary)' : (S.gauge.c || C.down);
    const cc = S.chart;
    const c = BG.chart({ unit, w: this.state.cw || L.chartW, h: L.chartH, xMax: cc.xMax, yMax: cc.yMax, ms: cc.ms, series: cc.series.map(s => s.pts), lat: cc.lat, now: cc.now, seps: cc.seps, wins: cc.wins, marks: cc.marks, xStep: cc.xStep || (m && cc.xMax > 20 ? (cc.xMax > 40 ? 18 : 8) : null), xLabel: cc.xLabel });
    const series = c.series.map((s, i) => Object.assign(s, { c: cc.series[i].c, so: cc.series[i].so, fo: cc.series[i].fo }));
    const lastS = series[series.length - 1];
    const endDot = lastS && !cc.noEnd ? { x: lastS.endX, y: lastS.endY, c: lastS.c } : null;
    const R = Object.assign({ numeric: false, textual: false, ec: 'var(--fg-subtle)', up: null, oh: null, faint: null, action: null }, S.R);
    const PH = { countdown: 'Test starts automatically in ' + cdN + ' seconds. Press Escape to cancel.', connecting: 'Connecting to Basement NAS.', latency: 'Measuring latency.', download: 'Latency 3.1 milliseconds. Measuring download.', upload: 'Download finished: ' + rs(612e6) + '. Measuring upload.', complete: 'Upload finished: ' + rs(438e6) + '. Test complete and saved to history.', error: 'Connection to Basement NAS lost: ' + EK[0] + '. Partial results were not saved.', cancelled: 'Test cancelled during upload. Upload has insufficient data. Partial results were not saved.', 'cancelled-late': 'Test cancelled during upload. Partial upload ' + rs(402e6) + ' from a 3.6 second steady window. Not saved.', slow: 'Slow connection detected. Download extended to 20 seconds.', slowdone: 'Download finished: ' + rs(640e3) + '. Upload stopped at the data cap: ' + rs(210e3) + ', low confidence. Saved to history.', continuous: 'Continuous download running.', offline: 'Server unreachable. Start is unavailable until Basement NAS responds.', 'ws-fallback': 'WebSocket unavailable, using HTTP latency fallback. Measuring download.', insufficient: 'Download has insufficient data. Measuring upload.', 'param-ignored': 'URL parameter streams=12 ignored, allowed 1 to 6.', 'error-early': 'Connection lost during latency. Nothing was saved.', 'cont-warmup': 'Continuous run stopped during warm-up. Partial results were not saved.', 'cont-done': 'Continuous run stopped. Saved to history.', 'cancelled-latency': 'Test cancelled during latency. Partial results were not saved.', 'cancelled-download': 'Test cancelled during download. Partial results were not saved.', 'cancelled-slow': 'Test cancelled during download. Partial results were not saved.' };
    if (v01) Object.keys(PH).forEach(k => { PH[k] = PH[k].replace(' and saved to history', '').replace(' Saved to history.', ''); });
    this._live = { st, msg: PH[st] || '', rate: ['latency', 'download', 'ws-fallback', 'insufficient', 'upload', 'slow', 'continuous'].includes(st) && R.numeric ? R.eyebrow + ' ' + R.num + ' ' + R.unit : null };
    const bytesOnly = unit === 'bytes' && !on(this.props.custom);
    return {
      ...base, ready: true, chartRef: this.chartRef, L, ctx, ctxOpts, conn, custom, notCustom: !custom,
      ctxOpen: this.state.ctxOpen, ctxOpenStr: this.state.ctxOpen ? 'true' : 'false', ctxIsCustom: sel === 'Custom…', ctxCustom: this.state.ctxCustom,
      toggleCtx: () => this.setState(s => ({ ctxOpen: !s.ctxOpen })),
      onCtxCustom: e => this.setState({ ctxCustom: e.target.value }),
      onCtxKey: e => { if (e.key === 'Enter' || e.key === 'Escape') this.setState({ ctxOpen: false }); },
      customChips: bytesOnly && !this.props.chips ? [{ t: 'Units · MB/s', icon: 'sliders' }] : customChips, customCount: (bytesOnly && !this.props.chips ? 1 : customChips.length) + ' changed:',
      phases: S.phases, phaseCols: 'repeat(' + S.phases.length + ', minmax(0,1fr))',
      g, gc, R, btn: S.btn,
      ch: { title: cc.title, legend: cc.legend, meta: cc.meta, empty: cc.empty || null, markColor: cc.markColor || 'var(--fg-muted)', aria: cc.title + ' chart' },
      c, series, endDot, notices: S.notices, noop: () => {},
      bar, shareOpen, share, label, incLabel: inc, incDis: !label, incNote: label ? '“' + label + '”' : 'no label set', incC: label ? 'var(--fg)' : 'var(--fg-subtle)',
      toggleInc: e => this.setState({ inc: e.target.checked }), closeShare: () => this.setState({ share: false }), stopProp: e => e.stopPropagation(), onLabel: e => this.setState({ label: e.target.value }),
      SD: m ? { pad: '56px 12px 24px', dir: 'column-reverse' } : { pad: '72px 24px', dir: 'row' },
      btnWrap: S.btn.tip ? 'has-tip' : '', btnDis: S.btn.dis ? 'true' : 'false', btnOp: S.btn.dis ? '0.45' : '1', btnTipId: S.btn.tip ? 'start-tip' : null, tipO,
      prim: S.prim, resCols: S.resCols || L.resCols, load: S.load, fit: S.fit, meta: S.meta, metaTitle: S.metaTitle || 'Test', metaSpan: S.metaSpan || L.metaSpan, metaCols: S.metaCols || 'minmax(0,1fr)',
      lastLine: !!S.lastLine
    };
  }
  render() {
    const v = this.renderVals();
    return (
      <div style={{ position: "relative", background: "var(--bg-base)", color: "var(--fg)", fontFamily: "var(--font-sans)", display: "flex", flexDirection: "column", minHeight: "100%" }}>
        {v.navMobile ? (
          <Nav variant="mobile-top" active="test" v01={v.v01} status={v.srvStatus} />
        ) : null}
        {v.navDesktop ? (
          <Nav variant="top" active="test" theme={v.theme} v01={v.v01} status={v.srvStatus} />
        ) : null}
        {v.basePath ? (
          <main role="alert" aria-labelledby="bp-title" style={{ flex: "1", minHeight: v.BP?.minH, boxSizing: "border-box", padding: v.BP?.pad, display: "flex", justifyContent: "center", alignItems: "flex-start" }}>
            <div style={{ width: "100%", maxWidth: "600px", display: "flex", flexDirection: "column", gap: "22px" }}>
              <span style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "var(--text-md)", fontWeight: "600", letterSpacing: "var(--tracking-tight)" }}>
                <bg-logo size="22" style={{ color: "var(--fg)" }} />
                <span>Bit<span style={{ color: "var(--primary-text)" }}>Gauge</span></span>
              </span>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <span style={{ display: "flex", alignItems: "center", gap: "6px", fontFamily: "var(--font-cond)", fontWeight: "600", fontSize: "11px", letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--danger-fg)" }}>
                  <bg-icon name="circle-alert" size="13" stroke="2.25" />
                  Deployment error
                </span>
                <h1 id="bp-title" style={{ margin: "0", fontSize: v.BP?.h, lineHeight: "1.2", fontWeight: "600", letterSpacing: "var(--tracking-tight)", textWrap: "pretty" }}>
                  The base path doesn't match this URL
                </h1>
                <p style={{ margin: "0", fontSize: "var(--text-base)", color: "var(--fg-muted)", lineHeight: "1.55", textWrap: "pretty" }}>
                  {"This page was opened at "}
                  <code style={{ fontFamily: "var(--font-mono)", fontSize: "0.92em", color: "var(--fg)", background: "var(--surface-3)", padding: "1px 5px", borderRadius: "var(--radius-xs)" }}>
                    /speed/
                  </code>
                  {", but the server is configured for "}
                  <code style={{ fontFamily: "var(--font-mono)", fontSize: "0.92em", color: "var(--fg)", background: "var(--surface-3)", padding: "1px 5px", borderRadius: "var(--radius-xs)" }}>
                    /
                  </code>
                  . Its API answers at a different path, so no test can run from here.
                </p>
              </div>
              <dl style={{ margin: "0", display: "flex", flexDirection: "column", borderTop: "1px solid var(--border-subtle)" }}>
                <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: "4px 16px", padding: "9px 0", borderBottom: "1px solid var(--border-subtle)" }}>
                  <dt style={{ fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>Page path</dt>
                  <dd style={{ margin: "0", fontFamily: "var(--font-mono)", fontSize: "var(--text-caption)", color: "var(--fg)" }}>/speed/</dd>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: "4px 16px", padding: "9px 0", borderBottom: "1px solid var(--border-subtle)" }}>
                  <dt style={{ fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>Server base path</dt>
                  <dd style={{ margin: "0", fontFamily: "var(--font-mono)", fontSize: "var(--text-caption)", color: "var(--fg)" }}>
                    / · BITGAUGE_BASE_PATH not set
                  </dd>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: "4px 16px", padding: "9px 0", borderBottom: "1px solid var(--border-subtle)" }}>
                  <dt style={{ fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>Check</dt>
                  <dd style={{ margin: "0", fontFamily: "var(--font-mono)", fontSize: "var(--text-caption)", color: "var(--danger-fg)" }}>
                    GET /api/v1/info → 404
                  </dd>
                </div>
              </dl>
              <section className="card" aria-label="Deployment hint" style={{ overflow: "hidden" }}>
                <div className="card-h"><bg-icon name="terminal" size="15" /><span className="t">How to fix it</span></div>
                <div style={{ padding: "14px 16px 16px", display: "flex", flexDirection: "column", gap: "10px" }}>
                  <p style={{ margin: "0", fontSize: "var(--text-sm)", color: "var(--fg-muted)", lineHeight: "1.5" }}>
                    Set the base path to the reverse-proxy prefix and restart the container:
                  </p>
                  <pre style={{ margin: "0", padding: "10px 12px", borderRadius: "var(--radius-md)", background: "var(--term-bg)", color: "var(--term-fg)", fontFamily: "var(--font-mono)", fontSize: "var(--text-caption)", lineHeight: "1.6", whiteSpace: "pre-wrap" }}>{"environment:\n  BITGAUGE_BASE_PATH: /speed/"}</pre>
                  <p style={{ margin: "0", fontSize: "var(--text-sm)", color: "var(--fg-muted)", lineHeight: "1.5" }}>
                    {"Or strip the "}
                    <code style={{ fontFamily: "var(--font-mono)", fontSize: "0.92em", color: "var(--fg)" }}>/speed</code>
                    {" prefix at the proxy so BitGauge is served from "}
                    <code style={{ fontFamily: "var(--font-mono)", fontSize: "0.92em", color: "var(--fg)" }}>/</code>
                    .
                  </p>
                </div>
              </section>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                <button className="btn primary"><bg-icon name="refresh-cw" size="15" />Reload</button>
                <a className="btn secondary" href="#" style={{ textDecoration: "none" }}><bg-icon name="external-link" size="15" />Deployment docs</a>
              </div>
            </div>
          </main>
        ) : null}
        {v.ready ? (
          <main style={{ flex: "1", width: "100%", maxWidth: "1200px", margin: "0 auto", boxSizing: "border-box", padding: v.L?.pad, display: "flex", flexDirection: "column", gap: v.L?.gap }}>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: "12px 28px" }}>
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: "10px 24px" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                  <span style={{ fontFamily: "var(--font-cond)", fontWeight: "600", fontSize: "11px", letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--fg-subtle)" }}>
                    Context
                  </span>
                  <span style={{ position: "relative", display: "flex", alignItems: "center", gap: "6px" }}>
                    <button className="hv-testsc-1" aria-haspopup="menu" aria-expanded={v.ctxOpenStr} onClick={v.toggleCtx} style={{ display: "inline-flex", alignItems: "center", gap: "5px", height: "24px", padding: "0 7px 0 9px", borderRadius: "var(--radius-full)", border: "1px solid var(--border-default)", background: "var(--surface-2)", color: "var(--fg)", fontFamily: "var(--font-sans)", fontSize: "var(--text-caption)", fontWeight: "600", cursor: "pointer" }}>
                      <bg-icon name={v.ctx?.icon} size="12" stroke="2" />
                      {v.ctx?.label}
                      <span style={{ color: "var(--fg-subtle)", display: "flex" }}><bg-icon name="chevron-down" size="12" stroke="2" /></span>
                    </button>
                    {v.ctx?.suggested ? (
                      <span style={{ fontSize: "var(--text-caption)", color: "var(--fg-subtle)" }}>suggested</span>
                    ) : null}
                    {v.ctxOpen ? (
                      <div role="menu" aria-label="Context" style={{ position: "absolute", top: "calc(100% + 6px)", left: "0", zIndex: "20", width: "212px", boxSizing: "border-box", background: "var(--surface-2)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-pop)", padding: "4px", display: "flex", flexDirection: "column", gap: "2px" }}>
                        {(v.ctxOpts || []).map((o, $index) => (
                          <React.Fragment key={$index}>
                            <button className="hv-testsc-2" role="menuitemradio" aria-checked={o?.checked} onClick={o?.pick} style={{ display: "flex", alignItems: "center", gap: "8px", height: "32px", padding: "0 8px", border: "0", borderRadius: "var(--radius-sm)", background: o?.bg, color: "var(--fg)", fontFamily: "var(--font-sans)", fontSize: "var(--text-sm)", textAlign: "left", cursor: "pointer" }}>
                              <span style={{ color: "var(--fg-subtle)", display: "flex" }}><bg-icon name={o?.icon} size="14" /></span>
                              <span style={{ flex: "1" }}>{o?.label}</span>
                              {o?.on ? (
                                <span style={{ color: "var(--primary-text)", display: "flex" }}><bg-icon name="check" size="14" stroke="2" /></span>
                              ) : null}
                            </button>
                          </React.Fragment>
                        ))}
                        {v.ctxIsCustom ? (
                          <label className="input" style={{ height: "32px", margin: "4px 2px 2px" }}>
                            <input aria-label="Custom context" value={v.ctxCustom} placeholder="e.g. Hotel Wi-Fi" onChange={v.onCtxCustom} onKeyDown={v.onCtxKey} />
                          </label>
                        ) : null}
                      </div>
                    ) : null}
                  </span>
                </div>
                {(v.conn || []).map((c, $index) => (
                  <React.Fragment key={$index}>
                    <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                      <span style={{ fontFamily: "var(--font-cond)", fontWeight: "600", fontSize: "11px", letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--fg-subtle)" }}>
                        {c?.k}
                      </span>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-base)", color: "var(--fg)", lineHeight: "22px" }}>
                        {c?.v}{" "}
                        <span style={{ color: "var(--fg-subtle)", fontSize: "var(--text-caption)" }}>{c?.s}</span>
                      </span>
                    </div>
                  </React.Fragment>
                ))}
              </div>
              <div style={{ marginLeft: "auto", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px" }}>
                {v.custom ? (
                  <>
                    <span style={{ fontSize: "var(--text-caption)", color: "var(--fg-subtle)", marginRight: "2px" }}>{v.customCount}</span>
                    {(v.customChips || []).map((ch, $index) => (
                    <React.Fragment key={$index}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", height: "24px", padding: "0 9px", borderRadius: "var(--radius-full)", background: "var(--primary-bg)", border: "1px solid var(--primary-border)", color: "var(--primary-text)", fontSize: "var(--text-caption)", fontWeight: "600" }}>
                        <bg-icon name={ch?.icon} size="12" stroke="2" />
                        {ch?.t}
                      </span>
                    </React.Fragment>
                  ))}
                  </>
                ) : null}
                {v.notCustom ? (
                  <span style={{ fontSize: "var(--text-caption)", color: "var(--fg-subtle)" }}>Standard preset · Auto streams · No data cap</span>
                ) : null}
                <a href="#" style={{ display: "inline-flex", alignItems: "center", gap: "5px", height: "28px", padding: "0 8px", borderRadius: "var(--radius-md)", color: "var(--primary-text)", fontSize: "var(--text-caption)", fontWeight: "600", textDecoration: "none" }}>
                  <bg-icon name="sliders" size="13" />
                  Edit
                </a>
              </div>
            </div>
            {(v.notices || []).map((n, $index) => (
              <React.Fragment key={$index}>
                <div role={n?.role} style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", gap: "10px 12px", padding: "12px 14px", borderRadius: "var(--radius-md)", border: `1px solid ${n?.bd ?? ""}`, background: n?.bg }}>
                  <span style={{ color: n?.ic, display: "flex", marginTop: "1px" }}><bg-icon name={n?.icon} size="18" /></span>
                  <div style={{ flex: "1 1 220px", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" }}>
                    <span style={{ fontSize: "var(--text-sm)", fontWeight: "600", color: n?.fg }}>{n?.title}</span>
                    <span style={{ fontSize: "var(--text-sm)", color: "var(--fg-muted)", lineHeight: "1.5", textWrap: "pretty" }}>{n?.body}</span>
                  </div>
                  <div style={{ display: "flex", gap: "8px", alignItems: "center", marginLeft: "auto" }}>
                    {(n?.actions || []).map((a, $index) => (
                      <React.Fragment key={$index}>
                        <button className={a?.cls}><bg-icon name={a?.icon} size="14" />{a?.label}</button>
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              </React.Fragment>
            ))}
            <section className="card" aria-label="Speed test" style={{ overflow: "hidden", boxShadow: "inset 0 1px 0 var(--card-highlight)" }}>
              <ol aria-label="Test phases" style={{ display: "grid", gridTemplateColumns: v.phaseCols, gap: v.L?.stepGap, listStyle: "none", margin: "0", padding: v.L?.stepPad, borderBottom: "1px solid var(--border-subtle)" }}>
                {(v.phases || []).map((p, $index) => (
                  <React.Fragment key={$index}>
                    <li aria-current={p?.aria} style={{ display: "flex", flexDirection: "column", gap: "9px", minWidth: "0" }}>
                      <div style={{ height: "3px", borderRadius: "2px", background: "var(--surface-4)", overflow: "hidden" }}>
                        <div style={{ height: "100%", width: p?.pct, background: p?.bar, borderRadius: "2px" }} />
                      </div>
                      <div style={{ display: "flex", flexDirection: v.L?.stepDir, alignItems: v.L?.stepAlign, gap: v.L?.stepInnerGap, minWidth: "0" }}>
                        <span style={{ display: "flex", alignItems: "center", gap: "7px", minWidth: "0" }}>
                          {p?.isPending ? (
                            <span style={{ width: "16px", height: "16px", boxSizing: "border-box", borderRadius: "50%", border: "1.5px solid var(--border-strong)", fontFamily: "var(--font-mono)", fontSize: "10px", fontWeight: "600", color: "var(--fg-subtle)", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
                              {p?.num}
                            </span>
                          ) : null}
                          {p?.hasIcon ? (
                            <span style={{ color: p?.ic, display: "flex" }}><bg-icon name={p?.icon} size="16" /></span>
                          ) : null}
                          <span style={{ fontSize: "var(--text-sm)", fontWeight: "600", color: p?.lc, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {p?.label}
                          </span>
                        </span>
                        <span style={{ marginLeft: v.L?.metaML, fontFamily: "var(--font-mono)", fontSize: "var(--text-caption)", color: p?.mc, whiteSpace: v.L?.metaWS, overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%", lineHeight: "1.35" }}>
                          {p?.meta}
                        </span>
                      </div>
                    </li>
                  </React.Fragment>
                ))}
              </ol>
              <div style={{ display: "grid", gridTemplateColumns: v.L?.instCols }}>
                <div style={{ padding: v.L?.gPad, display: "flex", flexDirection: "column", alignItems: "center", gap: "14px" }}>
                  <div style={{ position: "relative", width: v.g?.sizePx, height: v.g?.sizePx }}>
                    <svg width={v.g?.size} height={v.g?.size} aria-hidden="true" style={{ display: "block", overflow: "visible" }}>
                      <path d={v.g?.track} style={{ fill: "none", stroke: "var(--surface-3)", strokeWidth: "10", strokeLinecap: "round" }} />
                      {(v.g?.ticks || []).map((t, $index) => (
                        <React.Fragment key={$index}>
                          <line x1={t?.x1} y1={t?.y1} x2={t?.x2} y2={t?.y2} style={{ stroke: "var(--fg-faint)", strokeWidth: t?.w, opacity: t?.o }} />
                        </React.Fragment>
                      ))}
                      {v.g?.band ? (
                        <path d={v.g?.band} style={{ fill: "none", stroke: v.gc, strokeOpacity: "0.2", strokeWidth: "22" }} />
                      ) : null}
                      {v.g?.fill ? (
                        <path d={v.g?.fill} style={{ fill: "none", stroke: v.gc, strokeWidth: "10", strokeLinecap: "round" }} />
                      ) : null}
                      {v.g?.inner ? (
                        <path d={v.g?.inner} style={{ fill: "none", stroke: "var(--series-upload)", strokeWidth: "4", strokeLinecap: "round" }} />
                      ) : null}
                      {v.g?.peak ? (
                        <line x1={v.g?.peak?.x1} y1={v.g?.peak?.y1} x2={v.g?.peak?.x2} y2={v.g?.peak?.y2} style={{ stroke: "var(--fg-muted)", strokeWidth: "2", strokeLinecap: "round" }} />
                      ) : null}
                      {v.g?.dot ? (
                        <circle cx={v.g?.dot?.x} cy={v.g?.dot?.y} r="7" style={{ fill: "var(--surface-2)", stroke: v.gc, strokeWidth: "3" }} />
                      ) : null}
                    </svg>
                    {(v.g?.labels || []).map((l, $index) => (
                      <React.Fragment key={$index}>
                        <span aria-hidden="true" style={{ position: "absolute", left: `${l?.x ?? ""}px`, top: `${l?.y ?? ""}px`, transform: "translate(-50%,-80%)", fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--fg-subtle)", whiteSpace: "nowrap" }}>
                          {l?.t}
                        </span>
                      </React.Fragment>
                    ))}
                    <div role="status" aria-live="polite" style={{ position: "absolute", width: "1px", height: "1px", overflow: "hidden", clip: "rect(0 0 0 0)", clipPath: "inset(50%)", whiteSpace: "nowrap" }}>
                      {v.liveMsg}
                    </div>
                    <div style={{ position: "absolute", inset: "0", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "3px", paddingTop: "8px", textAlign: "center" }}>
                      {v.R?.numeric ? (
                        <>
                          <span style={{ display: "flex", alignItems: "center", gap: "5px", fontFamily: "var(--font-cond)", fontWeight: "600", fontSize: "12px", letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: v.R?.ec }}>
                          <bg-icon name={v.R?.icon} size="13" stroke="2.25" />
                          {v.R?.eyebrow}
                        </span>
                          <span style={{ fontFamily: "var(--font-mono)", fontWeight: "500", fontSize: v.L?.gNum, lineHeight: "1.05", letterSpacing: "-0.03em", color: "var(--fg)", fontVariantNumeric: "tabular-nums" }}>
                          {v.R?.num}
                        </span>
                          <span style={{ fontSize: "var(--text-md)", fontWeight: "500", color: "var(--fg-muted)" }}>{v.R?.unit}</span>
                          <span style={{ marginTop: "6px", fontFamily: "var(--font-mono)", fontSize: "var(--text-caption)", color: "var(--fg-subtle)" }}>{v.R?.sub}</span>
                          {v.R?.oh ? (
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-micro)", color: "var(--fg-subtle)" }}>{v.R?.oh}</span>
                        ) : null}
                          {v.R?.up ? (
                          <span style={{ display: "flex", alignItems: "center", gap: "5px", fontFamily: "var(--font-mono)", fontSize: "var(--text-caption)", color: "var(--fg-muted)" }}>
                            <span style={{ color: "var(--series-upload)", display: "flex" }}><bg-icon name="arrow-up" size="12" stroke="2.25" /></span>
                            {v.R?.up}
                          </span>
                        ) : null}
                        </>
                      ) : null}
                      {v.R?.textual ? (
                        <>
                          {v.R?.icon ? (
                          <span style={{ color: v.R?.ec, display: "flex", marginBottom: "4px" }}><bg-icon name={v.R?.icon} size="22" /></span>
                        ) : null}
                          <span style={{ fontSize: v.L?.gTitle, fontWeight: "600", letterSpacing: "var(--tracking-tight)", color: "var(--fg)" }}>{v.R?.title}</span>
                          <span style={{ fontSize: "var(--text-sm)", color: "var(--fg-subtle)", maxWidth: "180px", lineHeight: "1.4" }}>{v.R?.sub}</span>
                          {v.R?.faint ? (
                          <span style={{ marginTop: "4px", fontFamily: "var(--font-mono)", fontSize: "var(--text-caption)", color: "var(--fg-subtle)" }}>{v.R?.faint}</span>
                        ) : null}
                          {v.R?.action ? (
                          <button className="btn sm secondary" style={{ marginTop: "10px" }}><bg-icon name={v.R?.action?.icon} size="14" />{v.R?.action?.label}</button>
                        ) : null}
                        </>
                      ) : null}
                    </div>
                  </div>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-micro)", color: "var(--fg-subtle)", marginTop: "-18px" }}>{v.g?.scale}</span>
                  <span className={v.btnWrap} style={{ position: "relative", display: "flex", width: v.L?.btnW }}>
                    <button className={v.btn?.cls} aria-disabled={v.btnDis} aria-describedby={v.btnTipId} style={{ height: v.L?.btnH, width: "100%", opacity: v.btnOp, justifyContent: "center", fontSize: "var(--text-md)", gap: "10px", borderRadius: "var(--radius-md)" }}>
                      <bg-icon name={v.btn?.icon} size="16" stroke="2" />
                      {v.btn?.label}
                      {v.L?.kbd ? (
                        <kbd style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-micro)", fontWeight: "500", padding: "1px 6px", borderRadius: "var(--radius-xs)", border: "1px solid currentColor", opacity: "0.6", marginLeft: "4px" }}>
                          {v.btn?.kbd}
                        </kbd>
                      ) : null}
                    </button>
                    {v.btn?.tip ? (
                      <span className="tip" role="tooltip" id="start-tip" style={{ opacity: v.tipO }}>{v.btn?.tip}</span>
                    ) : null}
                  </span>
                </div>
                <div style={{ minWidth: "0", padding: v.L?.cPad, borderLeft: v.L?.bl, borderTop: v.L?.bt, display: "flex", flexDirection: "column", gap: "12px" }}>
                  <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px 16px" }}>
                    <span style={{ fontSize: "var(--text-base)", fontWeight: "600" }}>{v.ch?.title}</span>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px" }}>
                      {(v.ch?.legend || []).map((lg, $index) => (
                        <React.Fragment key={$index}>
                          <span style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "var(--text-caption)", color: "var(--fg-muted)" }}>
                            <span style={{ width: "14px", height: "0", borderTop: `2px ${lg?.dash ?? ""} ${lg?.c ?? ""}`, opacity: lg?.o }} />
                            {lg?.t}
                          </span>
                        </React.Fragment>
                      ))}
                    </div>
                    <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: "var(--text-caption)", color: "var(--fg-subtle)" }}>
                      {v.ch?.meta}
                    </span>
                  </div>
                  <div ref={v.chartRef} style={{ position: "relative" }}>
                    <svg width={v.c?.w} height={v.c?.h} style={{ display: "block", overflow: "visible" }} role="img" aria-label={v.ch?.aria}>
                      {(v.c?.grid || []).map((gl, $index) => (
                        <React.Fragment key={$index}>
                          <line x1={gl?.x1} y1={gl?.y} x2={gl?.x2} y2={gl?.y} style={{ stroke: "var(--border-subtle)", strokeWidth: "1" }} />
                        </React.Fragment>
                      ))}
                      {(v.c?.seps || []).map((sp, $index) => (
                        <React.Fragment key={$index}>
                          <line x1={sp?.x} y1={sp?.y1} x2={sp?.x} y2={sp?.y2} style={{ stroke: "var(--border-default)", strokeWidth: "1", strokeDasharray: "2 3" }} />
                        </React.Fragment>
                      ))}
                      {(v.c?.wins || []).map((w, $index) => (
                        <React.Fragment key={$index}>
                          <rect x={w?.x} y={w?.y} width={w?.w} height={w?.h} style={{ fill: "var(--series-upload)", fillOpacity: "0.08", stroke: "var(--series-upload)", strokeOpacity: "0.4", strokeDasharray: "2 3" }} />
                        </React.Fragment>
                      ))}
                      {(v.series || []).map((s, $index) => (
                        <React.Fragment key={$index}>
                          <path d={s?.area} style={{ fill: s?.c, fillOpacity: s?.fo, stroke: "none" }} />
                          <path d={s?.line} style={{ fill: "none", stroke: s?.c, strokeOpacity: s?.so, strokeWidth: "1.75", strokeLinejoin: "round" }} />
                        </React.Fragment>
                      ))}
                      {v.c?.lat ? (
                        <path d={v.c?.lat?.line} style={{ fill: "none", stroke: "var(--series-latency)", strokeWidth: "1.25", strokeDasharray: "4 3", opacity: "0.9" }} />
                      ) : null}
                      {(v.c?.marks || []).map((mk, $index) => (
                        <React.Fragment key={$index}>
                          <line x1={mk?.x} y1={mk?.y1} x2={mk?.x} y2={mk?.y2} style={{ stroke: v.ch?.markColor, strokeWidth: "1.5", strokeDasharray: "3 3" }} />
                        </React.Fragment>
                      ))}
                      {v.c?.nowX ? (
                        <line x1={v.c?.nowX} y1={v.c?.plotT} x2={v.c?.nowX} y2={v.c?.plotB} style={{ stroke: "var(--fg-subtle)", strokeWidth: "1", opacity: "0.5" }} />
                      ) : null}
                      {v.endDot ? (
                        <circle cx={v.endDot?.x} cy={v.endDot?.y} r="4" style={{ fill: "var(--surface-2)", stroke: v.endDot?.c, strokeWidth: "2" }} />
                      ) : null}
                    </svg>
                    <div aria-hidden="true" style={{ position: "absolute", inset: "0", pointerEvents: "none", fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--fg-subtle)" }}>
                      {(v.c?.grid || []).map((gl, $index) => (
                        <React.Fragment key={$index}>
                          <span style={{ position: "absolute", left: `${gl?.lx ?? ""}px`, top: `${gl?.ly ?? ""}px`, transform: "translate(-100%,-75%)", whiteSpace: "nowrap" }}>
                            {gl?.t}
                          </span>
                        </React.Fragment>
                      ))}
                      {(v.c?.xt || []).map((xt, $index) => (
                        <React.Fragment key={$index}>
                          <span style={{ position: "absolute", left: `${xt?.x ?? ""}px`, top: `${xt?.y ?? ""}px`, transform: "translate(-50%,-75%)", whiteSpace: "nowrap" }}>
                            {xt?.t}
                          </span>
                        </React.Fragment>
                      ))}
                      {(v.c?.seps || []).map((sp, $index) => (
                        <React.Fragment key={$index}>
                          <span style={{ position: "absolute", left: `${sp?.lx ?? ""}px`, top: `${sp?.ly ?? ""}px`, transform: "translateY(-75%)", whiteSpace: "nowrap", fontFamily: "var(--font-cond)", fontWeight: "600", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                            {sp?.t}
                          </span>
                        </React.Fragment>
                      ))}
                      {v.c?.lat ? (
                        <>
                          {(v.c?.lat?.ticks || []).map((lt, $index) => (
                          <React.Fragment key={$index}>
                            <span style={{ position: "absolute", left: `${lt?.x ?? ""}px`, top: `${lt?.y ?? ""}px`, transform: "translateY(-75%)", whiteSpace: "nowrap", color: "var(--series-latency)" }}>
                              {lt?.t}
                            </span>
                          </React.Fragment>
                        ))}
                        </>
                      ) : null}
                      {(v.c?.wins || []).map((w, $index) => (
                        <React.Fragment key={$index}>
                          <span style={{ position: "absolute", left: `${w?.lx ?? ""}px`, top: `${w?.ly ?? ""}px`, transform: "translateY(-75%)", whiteSpace: "nowrap", color: "var(--series-upload)" }}>
                            {w?.t}
                          </span>
                        </React.Fragment>
                      ))}
                      {(v.c?.marks || []).map((mk, $index) => (
                        <React.Fragment key={$index}>
                          <span style={{ position: "absolute", left: `${mk?.lx ?? ""}px`, top: `${mk?.ly ?? ""}px`, transform: "translate(-100%,-75%)", whiteSpace: "nowrap", fontFamily: "var(--font-sans)", fontWeight: "600", fontSize: "11px", color: v.ch?.markColor }}>
                            {mk?.t}
                          </span>
                        </React.Fragment>
                      ))}
                    </div>
                    {v.ch?.empty ? (
                      <div style={{ position: "absolute", top: `${v.c?.plotT ?? 0}px`, left: `${v.c?.plotL ?? 44}px`, width: `${(v.c?.plotR ?? 0) - (v.c?.plotL ?? 0)}px`, height: `${(v.c?.plotB ?? 0) - (v.c?.plotT ?? 0)}px`, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "0 16px", boxSizing: "border-box" }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: "8px", fontSize: "var(--text-sm)", color: "var(--fg-subtle)", maxWidth: "300px", lineHeight: "1.45", textWrap: "pretty", textAlign: "left", padding: "8px 14px", background: "var(--surface-2)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)" }}><bg-icon name="activity" size="15" style={{ flex: "none", color: "var(--fg-faint)" }} />{v.ch?.empty}</span>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </section>
            {v.bar ? (
              <section className="card" aria-label="Result status" style={{ overflow: "visible", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "10px 14px", padding: "12px 16px" }}>
                <span role="status" style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "var(--text-sm)", fontWeight: "600" }}>
                  <span style={{ color: v.bar?.ic, display: "flex" }}><bg-icon name={v.bar?.icon} size="16" /></span>
                  {v.bar?.title}{" "}
                  <span style={{ fontFamily: "var(--font-mono)", fontWeight: "400", fontSize: "var(--text-caption)", color: "var(--fg-subtle)" }}>
                    {v.bar?.time}
                  </span>
                </span>
                {v.bar?.sub ? (
                  <span style={{ flex: "1 1 220px", minWidth: "0", fontSize: "var(--text-caption)", color: "var(--fg-subtle)", lineHeight: "1.45", textWrap: "pretty" }}>
                    {v.bar?.sub}
                  </span>
                ) : null}
                {v.bar?.labelled ? (
                  <>
                    <label className="input" style={{ flex: "1 1 200px", maxWidth: "340px", height: "34px" }}>
                    <bg-icon name="tag" size="14" />
                    <input aria-label="Result label" value={v.label} placeholder="Add a label, e.g. Home Wi-Fi" onChange={v.onLabel} />
                  </label>
                    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                    {(v.bar?.chips || []).map((sc, $index) => (
                      <React.Fragment key={$index}>
                        <button className="chip" style={{ height: "26px", fontSize: "var(--text-caption)", padding: "0 10px" }}>{sc}</button>
                      </React.Fragment>
                    ))}
                  </div>
                  </>
                ) : null}
                <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginLeft: "auto" }}>
                  {(v.bar?.actions || []).map((a, $index) => (
                    <React.Fragment key={$index}>
                      <span className={a?.wrap} style={{ display: "inline-flex" }}>
                        <button className={a?.cls} onClick={a?.on}>
                          {a?.icon ? (
                            <bg-icon name={a?.icon} size="14" />
                          ) : null}
                          {a?.text}
                          {a?.after ? (
                            <bg-icon name={a?.after} size="14" />
                          ) : null}
                        </button>
                        {a?.tip ? (
                          <span className="tip" role="tooltip" style={{ opacity: a?.tipO, display: "flex", alignItems: "center", gap: "6px" }}>
                            <span style={{ color: "var(--warn)", display: "flex" }}><bg-icon name="triangle-alert" size="12" stroke="2" /></span>
                            {a?.tip}
                          </span>
                        ) : null}
                      </span>
                    </React.Fragment>
                  ))}
                </div>
              </section>
            ) : null}
            <section aria-label="Results" style={{ display: "grid", gridTemplateColumns: v.resCols, gap: v.L?.tileGap }}>
              {(v.prim || []).map((t, $index) => (
                <React.Fragment key={$index}>
                  <div style={{ gridColumn: t?.span, background: "var(--surface-2)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-lg)", boxShadow: "inset 0 1px 0 var(--card-highlight)", padding: v.L?.tilePad, display: "flex", flexDirection: "column", gap: "6px", minWidth: "0" }}>
                    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px", minHeight: "20px" }}>
                      <span style={{ color: t?.ic, display: "flex" }}><bg-icon name={t?.icon} size="14" stroke="2" /></span>
                      <span style={{ fontFamily: "var(--font-cond)", fontWeight: "600", fontSize: "11px", letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--fg-subtle)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {t?.label}
                      </span>
                      {t?.tag ? (
                        <span className={t?.tagCls} style={{ marginLeft: "auto", height: "18px", padding: "0 7px", fontSize: "10px" }}>
                          <span className="d" />
                          {t?.tag}
                        </span>
                      ) : null}
                    </div>
                    <div style={{ display: "flex", alignItems: "baseline", gap: "6px", flexWrap: "wrap" }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontWeight: "500", fontSize: v.L?.tileNum, lineHeight: "1.1", letterSpacing: "-0.02em", color: t?.nc, fontVariantNumeric: "tabular-nums" }}>
                        {t?.num}
                      </span>
                      <span style={{ fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>{t?.unit}</span>
                    </div>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-micro)", color: "var(--fg-subtle)", minHeight: "15px", lineHeight: "1.45", textWrap: "pretty" }}>
                      {t?.sub}
                    </span>
                    {(t?.notes || []).map((nt, $index) => (
                      <React.Fragment key={$index}>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-micro)", color: "var(--fg-subtle)", marginTop: "-4px" }}>{nt}</span>
                      </React.Fragment>
                    ))}
                  </div>
                </React.Fragment>
              ))}
              {v.load ? (
                <div style={{ gridColumn: v.L?.loadSpan, background: "var(--surface-2)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-lg)", boxShadow: "inset 0 1px 0 var(--card-highlight)", padding: v.L?.tilePad, display: "flex", flexWrap: "wrap", gap: "16px 20px", minWidth: "0" }}>
                  <div style={{ flex: "1 0 172px", maxWidth: "220px", display: "flex", flexDirection: "column", gap: "8px" }}>
                    <span style={{ fontFamily: "var(--font-cond)", fontWeight: "600", fontSize: "11px", letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--fg-subtle)" }}>
                      Bufferbloat
                    </span>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <span aria-label={v.load?.gAria} style={{ width: "52px", height: "52px", boxSizing: "border-box", borderRadius: "var(--radius-lg)", border: `1px ${v.load?.gStyle ?? ""} ${v.load?.gBd ?? ""}`, background: v.load?.gBg, color: v.load?.gFg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-mono)", fontWeight: "600", fontSize: "24px", letterSpacing: "-0.02em", flex: "none" }}>
                        {v.load?.grade}
                      </span>
                      <div style={{ display: "flex", flexDirection: "column", gap: "6px", minWidth: "0" }}>
                        <div aria-hidden="true" style={{ display: "flex", gap: "2px" }}>
                          {(v.load?.scale || []).map((gs, $index) => (
                            <React.Fragment key={$index}>
                              <span style={{ width: "17px", height: "17px", borderRadius: "var(--radius-xs)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-mono)", fontSize: "9px", fontWeight: gs?.w, background: gs?.bg, color: gs?.c }}>
                                {gs?.g}
                              </span>
                            </React.Fragment>
                          ))}
                        </div>
                        <span style={{ fontSize: "var(--text-caption)", color: "var(--fg-muted)", lineHeight: "1.3" }}>{v.load?.gText}</span>
                      </div>
                    </div>
                  </div>
                  <div style={{ flex: "999 1 260px", display: "flex", flexDirection: "column", minWidth: "0" }}>
                    {(v.load?.rows || []).map((r, $index) => (
                      <React.Fragment key={$index}>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "7px 0", borderBottom: "1px solid var(--border-subtle)" }}>
                          <span style={{ color: r?.ic, display: "flex" }}><bg-icon name={r?.icon} size="14" stroke="2" /></span>
                          <div style={{ display: "flex", flexDirection: "column", minWidth: "0", flex: "1" }}>
                            <span style={{ fontSize: "var(--text-sm)", color: "var(--fg)" }}>{r?.label}</span>
                            <span style={{ fontSize: "var(--text-micro)", color: "var(--fg-subtle)" }}>{r?.sub}</span>
                          </div>
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-lg)", fontWeight: "500", color: r?.nc, whiteSpace: "nowrap" }}>
                            {r?.num}{" "}
                            <span style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-caption)", color: "var(--fg-muted)", fontWeight: "400" }}>{r?.unit}</span>
                          </span>
                        </div>
                      </React.Fragment>
                    ))}
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px", paddingTop: "10px" }}>
                      <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
                        <span style={{ color: "var(--fg-subtle)", display: "flex", marginTop: "2px" }}><bg-icon name="gauge" size="14" stroke="2" /></span>
                        <div style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" }}>
                          <span style={{ fontSize: "var(--text-sm)", color: "var(--fg)", lineHeight: "1.4", textWrap: "pretty" }}>
                            HTTP loaded responsiveness — connection sharing not verifiable
                          </span>
                          <span style={{ fontSize: "var(--text-micro)", color: "var(--fg-subtle)", lineHeight: "1.4" }}>{v.load?.resp?.note}</span>
                        </div>
                        <div style={{ display: "flex", gap: "6px", alignItems: "center", flex: "none" }}>
                          {v.load?.resp?.tag ? (
                            <span className="pill warn" style={{ height: "18px", padding: "0 7px", fontSize: "10px" }}><span className="d" />{v.load?.resp?.tag}</span>
                          ) : null}
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-micro)", color: "var(--fg-muted)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-xs)", padding: "1px 6px", whiteSpace: "nowrap" }}>
                            {v.load?.resp?.proto}
                          </span>
                        </div>
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 18px", paddingLeft: "24px" }}>
                        {(v.load?.resp?.dirs || []).map((rd, $index) => (
                          <React.Fragment key={$index}>
                            <div style={{ display: "flex", alignItems: "center", gap: "6px", minWidth: "0" }}>
                              <span style={{ color: rd?.ic, display: "flex" }}><bg-icon name={rd?.icon} size="12" stroke="2.25" /></span>
                              {rd?.num ? (
                                <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-lg)", fontWeight: "500", color: rd?.nc, whiteSpace: "nowrap" }}>
                                  {rd?.num}{" "}
                                  <span style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-caption)", color: "var(--fg-muted)", fontWeight: "400" }}>{rd?.unit}</span>
                                </span>
                              ) : null}
                              {rd?.text ? (
                                <span style={{ fontSize: "var(--text-caption)", color: "var(--fg-subtle)" }}>{rd?.text}</span>
                              ) : null}
                            </div>
                          </React.Fragment>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
              {v.fit ? (
                <div style={{ gridColumn: v.L?.fitSpan, background: "var(--surface-2)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-lg)", boxShadow: "inset 0 1px 0 var(--card-highlight)", padding: v.L?.tilePad, display: "flex", flexDirection: "column", gap: "4px", minWidth: "0" }}>
                  <span style={{ fontFamily: "var(--font-cond)", fontWeight: "600", fontSize: "11px", letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--fg-subtle)", marginBottom: "4px" }}>
                    Good for
                  </span>
                  {(v.fit || []).map((f, $index) => (
                    <React.Fragment key={$index}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px", minHeight: "36px", borderBottom: "1px solid var(--border-subtle)" }}>
                        <span style={{ color: "var(--fg-subtle)", display: "flex" }}><bg-icon name={f?.icon} size="16" /></span>
                        <span style={{ fontSize: "var(--text-sm)", flex: "1" }}>{f?.label}</span>
                        {f?.rating ? (
                          <span className={f?.cls}><bg-icon name={f?.ricon} size="13" stroke="2" />{f?.rating}</span>
                        ) : null}
                        {f?.none ? (
                          <span style={{ fontSize: "var(--text-caption)", color: "var(--fg-subtle)" }}>{f?.none}</span>
                        ) : null}
                      </div>
                    </React.Fragment>
                  ))}
                  <span style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "6px", fontSize: "var(--text-micro)", color: "var(--fg-subtle)", lineHeight: "1.4" }}>
                    <bg-icon name="info" size="12" />
                    Upper bound: packet loss is not measured
                  </span>
                </div>
              ) : null}
              <div style={{ gridColumn: v.metaSpan, background: "var(--surface-2)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-lg)", boxShadow: "inset 0 1px 0 var(--card-highlight)", padding: v.L?.tilePad, display: "flex", flexDirection: "column", gap: "4px", minWidth: "0" }}>
                <span style={{ fontFamily: "var(--font-cond)", fontWeight: "600", fontSize: "11px", letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--fg-subtle)", marginBottom: "4px" }}>
                  {v.metaTitle}
                </span>
                <div style={{ display: "grid", gridTemplateColumns: v.metaCols, columnGap: "24px" }}>
                  {(v.meta || []).map((mr, $index) => (
                    <React.Fragment key={$index}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px", minHeight: "36px", borderBottom: "1px solid var(--border-subtle)" }}>
                        <span style={{ color: "var(--fg-subtle)", display: "flex" }}><bg-icon name={mr?.icon} size="15" /></span>
                        <div style={{ flex: "1", display: "flex", flexDirection: "column", minWidth: "0" }}>
                          <span style={{ fontSize: "var(--text-sm)" }}>{mr?.label}</span>
                          {mr?.sub ? (
                            <span style={{ fontSize: "var(--text-micro)", color: "var(--fg-subtle)" }}>{mr?.sub}</span>
                          ) : null}
                        </div>
                        {mr?.na ? (
                          <span style={{ display: "flex", alignItems: "center", gap: "8px", flex: "none" }}>
                            <span title="Browsers can't see packet loss over TCP" style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "var(--text-caption)", color: "var(--fg-subtle)", border: "1px dashed var(--border-strong)", borderRadius: "var(--radius-full)", padding: "2px 8px", whiteSpace: "nowrap" }}>
                              <bg-icon name="circle-dashed" size="12" />
                              Not measured
                            </span>
                            <a href="#" title="Browsers can't see packet loss over TCP" style={{ fontSize: "var(--text-caption)", fontWeight: "600", color: "var(--primary-text)", textDecoration: "none" }}>
                              Why?
                            </a>
                          </span>
                        ) : null}
                        {mr?.value ? (
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-sm)", color: mr?.vc, whiteSpace: "nowrap" }}>{mr?.value}</span>
                        ) : null}
                      </div>
                    </React.Fragment>
                  ))}
                </div>
              </div>
            </section>
            {v.lastLine ? (
              <a href="#" style={{ alignSelf: "flex-start", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px 10px", fontSize: "var(--text-caption)", color: "var(--fg-subtle)", textDecoration: "none" }}>
                <bg-icon name="history" size="13" />
                {"Last test 2 h ago · "}
                <span style={{ fontFamily: "var(--font-mono)", color: "var(--fg-muted)" }}>↓ 612 · ↑ 438 Mbit/s · 3.1 ms</span>
                {" · Home Wi-Fi"}
                <span style={{ color: "var(--primary-text)", fontWeight: "600" }}>View</span>
              </a>
            ) : null}
          </main>
        ) : null}
        {v.navMobile ? (
          <div style={{ marginTop: "auto", position: "sticky", bottom: "0", zIndex: "var(--z-nav)" }}><Nav variant="mobile-bottom" active="test" v01={v.v01} status={v.srvStatus} /></div>
        ) : null}
        {v.shareOpen ? (
          <div onClick={v.closeShare} style={{ position: "absolute", inset: "0", zIndex: "60", background: "var(--scrim)", backdropFilter: "blur(2px)", display: "flex", justifyContent: "center", alignItems: "flex-start", padding: v.SD?.pad, boxSizing: "border-box" }}>
            <div className="modal" role="dialog" aria-modal="true" aria-labelledby="share-title" onClick={v.stopProp} style={{ width: "540px", maxWidth: "100%", maxHeight: "none" }}>
              <div className="mh">
                <div className="mi primary"><bg-icon name="share-2" size="18" /></div>
                <div style={{ flex: "1", minWidth: "0" }}>
                  <div className="mt" id="share-title">Share result</div>
                  <div className="md">Speeds and latency only. Your IP address and notes are never included.</div>
                </div>
                <button className="btn ghost sm icon" aria-label="Close" onClick={v.closeShare} style={{ alignSelf: "flex-start", margin: "-4px -6px 0 0" }}>
                  <bg-icon name="x" size="16" />
                </button>
              </div>
              <div style={{ padding: "0 20px", display: "flex", flexDirection: "column", gap: "12px" }}>
                <section className="card" style={{ overflow: "hidden" }}>
                  <div className="card-h">
                    <bg-icon name="image" size="15" />
                    <span className="t">Share image</span>
                    <span className="right" style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: "var(--text-micro)", color: "var(--fg-subtle)" }}>
                      1200 × 630 PNG
                    </span>
                  </div>
                  <div style={{ padding: "14px", display: "flex", flexDirection: "column", gap: "12px" }}>
                    <div data-theme="dark" aria-label="Share image preview" style={{ aspectRatio: "1200/630", borderRadius: "var(--radius-md)", background: "var(--bg-base)", border: "1px solid var(--border-default)", padding: "14px 16px", display: "flex", flexDirection: "column", justifyContent: "space-between", color: "var(--fg)", boxSizing: "border-box" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", fontWeight: "600" }}>
                        <bg-logo size="15" style={{ color: "var(--fg)" }} />
                        <span style={{ letterSpacing: "var(--tracking-tight)" }}>
                          Bit
                          <span style={{ color: "var(--primary-text)", fontWeight: "var(--weight-semibold)" }}>Gauge</span>
                        </span>
                        <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontWeight: "400", fontSize: "9px", color: "var(--fg-subtle)" }}>
                          {v.share?.head}
                        </span>
                      </div>
                      <div style={{ display: "flex", gap: "18px", alignItems: "flex-end" }}>
                        {(v.share?.blocks || []).map((b, $index) => (
                          <React.Fragment key={$index}>
                            <div style={{ display: "flex", flexDirection: "column" }}>
                              <span style={{ fontFamily: "var(--font-cond)", fontSize: "8px", letterSpacing: ".08em", color: b?.c, fontWeight: "600" }}>{b?.k}</span>
                              <span style={{ fontFamily: "var(--font-mono)", fontSize: "26px", fontWeight: "500", lineHeight: "1" }}>
                                {b?.n}
                                <span style={{ fontFamily: "var(--font-sans)", fontSize: "10px", color: "var(--fg-muted)", marginLeft: "3px" }}>{b?.u}</span>
                              </span>
                            </div>
                          </React.Fragment>
                        ))}
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 12px", fontFamily: "var(--font-mono)", fontSize: "9px", color: "var(--fg-muted)" }}>
                        {(v.share?.foot || []).map((f, $index) => (
                          <React.Fragment key={$index}>
                            <span>{f}</span>
                          </React.Fragment>
                        ))}
                        <span style={{ marginLeft: "auto", color: "var(--fg-subtle)" }}>{v.share?.where}</span>
                      </div>
                    </div>
                    <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "var(--text-sm)", color: v.incC, cursor: "pointer" }}>
                      <input type="checkbox" checked={v.incLabel} disabled={v.incDis} onChange={v.toggleInc} style={{ width: "16px", height: "16px", margin: "0", accentColor: "var(--primary)" }} />
                      {" Include label "}
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-caption)", color: "var(--fg-muted)" }}>{v.incNote}</span>
                    </label>
                  </div>
                </section>
                <section className="card" style={{ overflow: "hidden" }}>
                  <div className="card-h"><bg-icon name="file-text" size="15" /><span className="t">Text summary</span></div>
                  <pre style={{ margin: "0", padding: "12px 16px", background: "var(--term-bg)", color: "var(--term-fg)", fontFamily: "var(--font-mono)", fontSize: "var(--text-micro)", lineHeight: "1.65", whiteSpace: "pre-wrap" }}>{v.share?.text}</pre>
                </section>
              </div>
              <div style={{ display: "flex", flexDirection: v.SD?.dir, flexWrap: "wrap", justifyContent: "flex-end", gap: "8px", padding: "16px 20px 18px" }}>
                <button className="btn ghost" title="Opens the system share sheet. Shown only when the browser supports it." style={{ justifyContent: "center" }}>
                  <bg-icon name="share" size="15" />
                  Share via…
                </button>
                <button className="btn secondary" style={{ justifyContent: "center" }}><bg-icon name="copy" size="15" />Copy summary</button>
                <button className="btn primary" style={{ justifyContent: "center" }}><bg-icon name="download" size="15" />Download image</button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    );
  }
}

window.TestScreen = TestScreen;
