/* BitGauge web UI kit — TestScreen
 * Props:
 *   state: "idle" | "countdown" | "connecting" | "latency" | "download" | "upload" | "complete" | "error" | "error-early" | "cancelled" | "cancelled-late" | "cancelled-latency" | "cancelled-download" | "cancelled-slow" | "cancelled-slow-up" | "slow" | "slowdone" | "continuous" | "cont-upload" | "cont-warmup" | "cont-done" | "offline" | "basepath" | "ws-fallback" | "insufficient" | "param-ignored"  (default "download")
 *   mobile: boolean  (default false)
 *   custom: boolean  (default false)
 *   units: "bits" | "bytes"  (default "bits")
 *   theme: "light" | "dark" | "system"  (default "system")
 *   llGap: "none" | "no-steady-window" | "insufficient-samples" | "reservation-broken" | "no-probe-path"  (default "none")
 *     — the upload direction's loaded latency has no value for this reason; the grade falls back to download
 *   server: string | null — server.display_name, null while GET /info fails (the host is shown instead)
 *   kept: boolean  (default false)
 *   share: boolean  (default false)
 *   label: string  (default "")
 *   tips: boolean  (default false)
 *   resp: "ok" | "uncertain" | "needs-h2" | "not-reported" | "few-samples"  (default "ok")
 *   probe: "auto" | "WebSocket" | "HTTP/2 probe" | "HTTP/3 probe" | "HTTP/1.1 reserved"  (default "auto") — the one
 *     probe path for idle and loaded latency (measurement §10, §11); ws-fallback forces an HTTP source
 *   wsClose: boolean  (default false) — the WebSocket closes after idle latency and cannot be reopened;
 *     idle stays WebSocket, loaded samples come over the HTTP source from `probe`. On HTTP/1.1 the direction
 *     already running (download) has no value ("HTTP/1.1 reservation not held"); upload runs with the reservation.
 *   errKind: "requests" | "unreachable" | "restarted" | "network"  (default "requests") — the Error state's cause
 *   (state "upload-interrupted" is separate: not an Error state, the run completes)
 *   overhead: boolean  (default false)
 *   cpu: boolean  (default false)
 *   timerRes: number  (default 0.1) — the page's timer resolution in ms; latencies below it read "< 1 ms" etc.
 *   browser: "Firefox" | "Chrome" | "Safari" | "Edge"  (default "Firefox") — browser family, named by the browser upload limit notice
 *   uploadPauses: boolean  (default false) — the engine saw the browser pause between upload requests (idle share > 20 %)
 *   runLength: "none" | "2h"  (default "none") — Continuous: no run length (elapsed time alone) or a 2 h run length
 *     (elapsed against it, with the run's end time)
 */
class TestScreen extends React.Component {
  state = { ann: '', ctxOpen: false, ctxSel: null, ctxCustom: '', kept: null, share: null, label: null, inc: false, toast: null };
  _toast(t) { clearTimeout(this._tt); this.setState({ toast: t }); this._tt = setTimeout(() => this.setState({ toast: null }), 8000); }
  componentDidMount() { this._tick(); }
  componentWillUnmount() { clearTimeout(this._tt); clearTimeout(this._rc); }
  componentDidUpdate() { this._tick(); }
  // error-early: the run starts with the server reachable; after the error the page re-checks GET /info, which fails,
  // so the header switches to unreachable (its status region announces it) and the screen shows the unreachable notice.
  _recheck(st) {
    if (st !== 'error-early') { clearTimeout(this._rc); this._rcFor = null; if (this.state.eeDown) this.setState({ eeDown: false }); return; }
    if (this._rcFor === st) return;
    this._rcFor = st; clearTimeout(this._rc); this._rc = setTimeout(() => this.setState({ eeDown: true }), 100);
  }
  // Phase region: phase changes immediately, the live rate at most every 5 s, a finished direction's headline once.
  // The 10 Hz readout is not live. The summary region is rendered directly from the result.
  _tick() {
    const c = this._live; if (!c) return;
    this._recheck(c.st);
    const now = Date.now(); let msg = null;
    if (c.key !== this._key) { this._key = c.key; this._at = now; msg = c.ph; }
    else if (c.rate) { if (now - this._at >= 5000) { this._at = now; msg = c.rate; } }
    else if (c.ph !== this._ph) msg = c.ph;
    this._ph = c.ph;
    if (msg != null && msg !== this.state.ann) this.setState({ ann: msg });
  }
  renderVals() {
    const BG = window.BG;
    const on = v => !!v && v !== 'false';
    const m = on(this.props.mobile);
    // A complete result always has a steady window in each direction and no direction as short as the WebSocket's close
    // sequence (measurement §11.1, §11.4): these two gaps are drawn on a run stopped in the upload (partial, not saved).
    const st0 = this.props.state || 'idle', LLSTOP = { 'no-steady-window': 3.1, 'no-probe-path': 0.8 }[this.props.llGap];
    const gapStop = LLSTOP != null && ['complete', 'cancelled', 'cancelled-late', 'slowdone', 'cancelled-slow-up'].includes(st0) ? this.props.llGap : null;
    const st = gapStop ? (['slowdone', 'cancelled-slow-up'].includes(st0) ? 'cancelled-slow-up' : 'cancelled') : st0, bp = st === 'basepath';
    // Server name from GET /info; while it is unknown the page's host stands in. Never a hard-coded name.
    const SRV = this.props.server || BG.KIT.host;
    const eeDown = st === 'error-early' && !!this.state.eeDown, unreach = st === 'offline' || eeDown;
    const base = { mobile: m, desktop: !m, srvStatus: unreach || (st === 'error' && this.props.errKind === 'unreachable') ? 'offline' : 'online', navMobile: m && !bp, navDesktop: !m && !bp, basePath: bp, theme: this.props.theme || 'system', liveMsg: this.state.ann || '' };
    if (!BG || bp) return { ...base, ready: false };
    const unit = this.props.units === 'bytes' ? 'bytes' : 'bits';
    const rs = v => BG.rateStr(v, unit), rn = v => BG.rate(v, unit).n;
    const RES = parseFloat(this.props.timerRes) || 0.1, fms = v => BG.ms(v, RES), fjit = v => BG.jit(v, RES);
    // Spoken numbers: the visual digits with long unit names.
    const SPU = { 'kbit/s': 'kilobits per second', 'Mbit/s': 'megabits per second', 'Gbit/s': 'gigabits per second', 'kB/s': 'kilobytes per second', 'MB/s': 'megabytes per second', 'GB/s': 'gigabytes per second', kB: 'kilobytes', MB: 'megabytes', GB: 'gigabytes', TB: 'terabytes' };
    const sayR = v => { const r = BG.rate(v, unit); return r.n + ' ' + SPU[r.u]; };
    const sayMs = s => s.replace('< ', 'less than ') + ' milliseconds';
    const sayB = s => !s || s === '—' || /^0(\.0+)? /.test(s) ? '0 bytes' : s.replace(/ (\w+)$/, (_, u) => ' ' + (SPU[u] || u));
    const custom = on(this.props.custom) || unit === 'bytes';
    const OH = on(this.props.overhead) ? ['+' + (parseFloat(this.props.overhead) || 6) + ' % overhead compensation'] : [];
    const RS = this.props.resp || 'ok';
    const C = { lat: 'var(--series-latency)', down: 'var(--series-download)', up: 'var(--series-upload)' };
    // Screen layout only (template level): tracks and paddings around components, tokens only.
    const L = m
      ? { instCols: 'minmax(0,1fr)', gPad: 'var(--space-5) var(--space-4)', cPad: 'var(--space-3-5) var(--space-4) var(--space-4)', bl: 'none', bt: '1px solid var(--border-subtle)', stepPad: 'var(--space-3) var(--space-3-5)', resCols: 'repeat(2, minmax(0,1fr))', tileGap: 'var(--layout-tile-gap-compact)', loadSpan: 'span 2', fitSpan: 'span 2', metaSpan: 'span 2' }
      : { instCols: 'var(--layout-instrument) minmax(0,1fr)', gPad: 'var(--space-6)', cPad: 'var(--space-5) var(--space-6)', bl: '1px solid var(--border-subtle)', bt: 'none', stepPad: 'var(--space-4) var(--space-6)', resCols: 'repeat(4, minmax(0,1fr))', tileGap: 'var(--layout-tile-gap)', loadSpan: 'span 2', fitSpan: 'span 1', metaSpan: 'span 1' };
    const slow = ['slow', 'slowdone', 'cancelled-slow', 'cancelled-slow-up'].includes(st);
    // Plateau reason: shown for the reported direction once its ramp has ended ('cancelled' stops during upload warm-up).
    const after = ['complete', 'error', 'cancelled-late', 'slowdone', 'upload-interrupted', 'cancelled-slow'].includes(st);
    // No request has run yet: the protocol is read from a request. The auto stream count is known once the ramp starts.
    const preReq = ['idle', 'countdown', 'param-ignored', 'connecting'].includes(st);
    const preRamp = preReq || ['latency', 'cancelled-latency'].includes(st);
    // Latency source label: "WebSocket", "HTTP/1.1 reserved", "HTTP/2 probe" or "HTTP/3 probe". One probe path for idle
    // and loaded latency (measurement §10, §11). ws-fallback: the WebSocket never opens, both run over HTTP.
    // wsClose: the WebSocket closes after idle latency; idle stays WebSocket, loaded samples come over HTTP.
    const PRB = this.props.probe, httpSrc = PRB && PRB !== 'auto' && PRB !== 'WebSocket' ? PRB : 'HTTP/2 probe';
    const wsClose = !!this.props.wsClose && st !== 'ws-fallback';
    const src = st === 'ws-fallback' || wsClose ? httpSrc : (PRB && PRB !== 'auto' ? PRB : 'WebSocket');
    const idleSrc = wsClose ? 'WebSocket' : src;
    // HTTP/1.1 probe reservation (measurement §4, §11): one connection kept free, so the stream cap drops to 5.
    const reserved = src === 'HTTP/1.1 reserved';
    const lowLink = slow || st === 'insufficient';

    // ---- connection strip (context pill is editable)
    const CO = [['LAN', 'house'], ['VPN', 'shield'], ['None', 'circle-dashed'], ['Custom…', 'pencil']];
    const sel = this.state.ctxSel || (slow ? 'VPN' : 'LAN');
    let ctx = { label: sel === 'Custom…' ? (this.state.ctxCustom || 'Custom') : sel, icon: CO.find(o => o[0] === sel)[1], suggested: !this.state.ctxSel };
    const ctxOpts = CO.map(([label, icon]) => ({ label, icon, on: label === sel, checked: label === sel ? 'true' : 'false', bg: label === sel ? 'var(--primary-bg)' : 'transparent', pick: () => this.setState({ ctxSel: label, ctxOpen: label === 'Custom…' }) }));
    const streams = slow ? '2' : st === 'insufficient' && !custom ? '1' : custom ? '4' : reserved ? '5' : '6', auto = slow || !custom;
    // Fast LAN (§19.4): 1 → 2 → 4 → 6 streams keep gaining, so the ramp stops at the cap. The slow link's download stops gaining at 2;
    // its 210 kbit/s upload skips the trial to 4 streams (≈ 6.4 KiB/s each, under the 8 KiB/s floor) as floor-limited (§8.2).
    const plateau = auto ? ' · plateau: ' + (slow ? (st === 'slowdone' ? 'floor-limited' : 'no-gain') : streams === '5' ? 'HTTP/1.1 probe reservation' : 'cap') : '';
    // Closed-after-idle on HTTP/1.1: the WebSocket closes during download, which keeps 6 streams; the probe reservation
    // (5 streams) starts with upload. WebSocket never opened (no wsClose): 5 for both directions from the start.
    const wsH1 = wsClose && reserved && streams === '5';
    const streamsD = wsH1 ? '6' : streams, plateauD = wsH1 ? (auto ? ' · plateau: cap' : '') : plateau;
    const conn = [
      // Slow states read as a VPN link: a CGNAT address (100.64.0.0/10) is suggested as VPN; RFC 1918 would be LAN.
      { k: 'Client IP', v: slow ? '100.101.4.17' : '192.168.1.42', s: 'IPv4' },
      preReq ? { k: 'Protocol', v: '—', s: 'not reported' }
        : st === 'upload-interrupted' ? { k: 'Protocol', v: 'HTTP/1.1', s: '' }
        : { k: 'Protocol', v: reserved || RS === 'needs-h2' ? 'HTTP/1.1' : RS === 'not-reported' ? '—' : 'HTTP/2', s: RS === 'not-reported' && !reserved ? 'not reported' : '' },
      preRamp && auto ? { k: 'Streams', v: '—', s: 'auto' } : { k: 'Streams', v: streams, s: (auto ? 'auto' : 'fixed') + (after ? plateau : '') }
    ];
    // Offline: nothing from the server. Early error after the failed re-check: Protocol keeps what the run read.
    if (unreach) { conn.forEach(c => { if (!(eeDown && c.k === 'Protocol')) { c.v = '—'; c.s = ''; } }); if (!this.state.ctxSel) ctx = { label: '—', icon: 'circle-dashed', suggested: false }; }
    const customChips = this.props.chips || [{ t: 'Extended', icon: 'timer' }, { t: '4 streams', icon: 'layers' }, { t: 'Cap 500 MB', icon: 'database' }];

    // ---- phases
    const PI = { lat: ['Latency', 'activity'], down: ['Download', 'arrow-down'], up: ['Upload', 'arrow-up'] };
    // PhaseStep props (phase-indicator.md): meta renders as "<state> · <detail>".
    const PK = { lat: 'latency', down: 'download', up: 'upload' };
    const ph = (k, status, meta, pct, label) => ({ phase: PK[k], state: status, detail: meta || undefined, progress: (status === 'done' ? 100 : pct || 0) / 100, label });
    const PD = { lat: '~2 s', down: '~10–20 s', up: '~15–25 s' };
    const pend = (k, meta) => ph(k, 'pending', meta || PD[k]);

    // ---- tiles
    const T = o => Object.assign({ icon: 'circle-dot', ic: 'var(--fg-subtle)', num: '—', unit: '', sub: '', notes: [], span: 'auto', tag: null, tagCls: '', nc: 'var(--fg)' }, o);
    const rt = (label, icon, ic, v, o) => { const r = BG.rate(v, unit); return T(Object.assign({ label, icon, ic, num: r.n, unit: r.u, notes: OH }, o)); };
    const em = (label, icon, ic, sub) => T({ label, icon, ic, state: sub === 'not run' ? 'skipped' : 'empty', sub: sub === 'not run' ? 'skipped' : sub || '' });
    const LIVE = { state: 'live' };
    const msT = (label, icon, v, sub, o) => T(Object.assign({ label, icon, ic: C.lat, num: fms(v), unit: 'ms', sub }, o));
    const eDown = s => em('Download', 'arrow-down', C.down, s), eUp = s => em('Upload', 'arrow-up', C.up, s);
    const eLat = () => em('Idle latency', 'activity', C.lat), eJit = () => em('Jitter', 'activity', C.lat);
    const IDLE = lowLink ? { v: 48, mn: 41, p9: 66, jit: 9.4 } : { v: 3.1, mn: 2.4, p9: 4.1, jit: 0.8 };
    IDLE.sub = 'min ' + fms(IDLE.mn) + ' · p90 ' + fms(IDLE.p9) + ' ms · ' + idleSrc + ' · 0.0 % probe timeouts';
    const LATD = fms(IDLE.v) + ' ms';
    const latT = o => msT('Idle latency', 'activity', IDLE.v, IDLE.sub, o);
    const jitT = o => T(Object.assign({ label: 'Jitter', icon: 'activity', ic: C.lat, num: fjit(IDLE.jit), unit: 'ms', sub: 'mean of consecutive differences' }, o));

    // ---- steady-window stats: avg and peak (= p90) over warm-up end → now only
    const q90 = a => { const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(0.9 * (s.length - 1)))]; };
    const steady = (pts, warm) => { if (pts[pts.length - 1][0] < warm) return null; const v = pts.filter(q => q[0] >= warm).map(q => q[1]); return !v.length ? null : { avg: v.reduce((a, b) => a + b, 0) / v.length, peak: q90(v) }; };
    // Live direction tile (screens.md §1): "warming up" until warm-up ends, then the steady-window average and peak so far.
    const LT = (label, icon, ic, sw) => sw ? rt(label, icon, ic, sw.avg, { sub: 'peak ' + rn(sw.peak), state: 'live' }) : T({ label, icon, ic, state: 'warming-up' });
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
      // The source qualifies a result (screens.md §6): none while Pending, Not run or live (it can still fall back to HTTP).
      const named = !o.noSrc && !o.live && !(v == null && (!o.sub || o.sub === 'Not run'));
      const label = (k === 'down' ? 'During download' : 'During upload') + (named ? ' · ' + src : '');
      if (v == null) return { icon: PI[k][1], ic: C[k], label, sub: o.sub || 'Pending', num: '—', unit: '', nc: 'var(--fg-subtle)', v: null };
      // Idle over the WebSocket, loaded over the HTTP fallback: the change names the idle path.
      const sub = (o.p90 != null ? 'p90 ' + fms(o.p90) + ' · ' : '') + '+' + fms(v - IDLE.v) + ' ms vs idle' + (idleSrc !== src ? ' over ' + idleSrc : '') + (o.partial ? ' · partial' : '') + (o.tail ? ' · ' + o.tail : '');
      return { icon: PI[k][1], ic: C[k], label, sub: o.sub || sub, num: fms(v), unit: 'ms', nc: o.live ? 'var(--primary-text)' : 'var(--fg)', v, live: !!o.live };
    };
    // HTTP loaded responsiveness: one RPM per direction; no High/Low levels. Each direction carries its state (§12.4)
    // for the summary; null while it has none yet (pending, not run). one: Continuous, the one direction it ran.
    const respB = (d, u, one) => {
      const blocked = RS === 'needs-h2' || RS === 'not-reported';
      const dir = (k, v) => {
        const b = { icon: PI[k][1], ic: C[k], num: null, unit: 'RPM', text: null, state: null, nc: RS === 'uncertain' ? 'var(--fg-muted)' : 'var(--fg)' };
        if (blocked) return Object.assign(b, { text: '—', state: v == null ? null : 'unavailable_h1' });
        if (v === 'few' || (RS === 'few-samples' && k === 'up' && typeof v === 'number')) return Object.assign(b, { text: 'not enough samples', state: 'unavailable_insufficient' });
        if (v == null) return Object.assign(b, { text: '—' });
        return Object.assign(b, { num: v.toLocaleString('en-US'), state: RS === 'uncertain' ? 'uncertain' : 'measured' });
      };
      const has = typeof d === 'number' || typeof u === 'number';
      return {
        proto: RS === 'needs-h2' ? 'HTTP/1.1' : RS === 'not-reported' || preReq || st === 'offline' ? 'not reported' : 'HTTP/2',
        note: RS === 'needs-h2' ? 'needs HTTP/2 or HTTP/3 at the reverse proxy' : RS === 'not-reported' ? 'protocol not reported — treated as HTTP/1.1' : RS === 'uncertain' && has ? 'round trips per minute · uncertain' : one ? 'round trips per minute, download only' : 'round trips per minute, one per direction',
        tag: RS === 'uncertain' && has ? 'Uncertain' : null, dirs: one ? [dir('down', d)] : [dir('down', d), dir('up', u)]
      };
    };
    const load = (g, rows, resp, text) => Object.assign(GR(g), { rows, resp }, text ? { gText: text } : {});
    // §11: grade from the worse gradable increase. §13: AIM points; packet loss is fixed at 0 points; upload is not an input.
    // Shared with Result detail (fixtures.js): one grade rule and one AIM table.
    const gradeOf = BG.gradeOf, aim = (lat, jit, dl, inc) => BG.aim(lat, jit, dl, inc).bands;
    const FIT = [['Streaming', 'tv'], ['Gaming', 'gamepad'], ['Video calls', 'video']];
    const fit = (q, none) => FIT.map(([label, icon], i) => {
      const nn = Array.isArray(none) ? none[i] : none;
      if (!q || q[i] == null) return { label, icon, rating: null, none: nn || '—' };
      const Q = BG.QUALITY[q[i]]; return { label, icon, rating: q[i], cls: 'sbadge ' + Q.tone, ricon: Q.icon, none: null };
    });
    // Packet loss slot (screens.md §6): the reason is a visible sub line, not only a tooltip (not seen on touch).
    const PL = { icon: 'signal', label: 'Packet loss', sub: DS.NOT_MEASURED_REASON, na: true };
    const meta = (data, dataSub, dur, durSub) => [
      { icon: 'database', label: 'Data used', sub: dataSub, value: data, vc: data === '—' ? 'var(--fg-subtle)' : 'var(--fg)' },
      { icon: 'timer', label: 'Duration', sub: durSub, value: dur, vc: dur === '—' ? 'var(--fg-subtle)' : 'var(--fg)' },
      PL
    ];
    // Notice props (notices.md): the tone decides surface and role (danger → alert); screens pass nothing else.
    const N = (tone, icon, title, body, actions) => ({ tone, icon, title, body, actions: actions || [] });
    // Test extended (Duration): the engine reports one per direction; the UI shows one notice and rewords it to both
    // directions when the upload extends too. Never a second notice.
    const EXT = (d, u) => N('info', 'hourglass', 'Test extended', d && u ? 'Neither download nor upload had a steady window at its minimum duration, so both were extended up to their maximum.' : (d ? 'Download' : 'Upload') + ' had no steady window at its minimum duration, so it was extended up to its maximum.');
    // Browser upload limit (Confidence): complete results only, never live. Any browser when the engine saw it pause
    // between upload requests; always for Firefox once the upload is at least 100 Mbit/s.
    const BRW = this.props.browser || 'Firefox', PAUSES = on(this.props.uploadPauses);
    const BUL = up => PAUSES || (BRW === 'Firefox' && up >= 100e6) ? [N('info', 'globe', BRW + ' may limit the upload', 'On fast links ' + BRW + '’s own upload path, not the network, can bound the upload number; the measurement is the server’s and stands. Compare with another browser on this device to tell the two apart.', [{ label: 'Known browser limits', href: '#' }])] : [];
    const BTN = {
      start: { role: 'start', label: 'Start test', icon: 'play', cls: 'btn lg primary', kbd: 'Enter' },
      stop: { role: 'stop', label: 'Stop test', icon: 'square', cls: 'btn lg secondary', kbd: 'Esc' },
      again: { role: 'again', label: 'Run again', icon: 'rotate-ccw', cls: 'btn lg primary', kbd: 'Enter' },
      retry: { role: 'retry', label: 'Retry test', icon: 'refresh-cw', cls: 'btn lg primary', kbd: 'Enter' },
      now: { role: 'now', label: 'Start now', icon: 'play', cls: 'btn lg primary', kbd: 'Enter' }
    };
    const shift = (pts, dt) => pts.map(p => [p[0] + dt, p[1]]);
    // Upload: "received" (server-confirmed) trails client "sending" progress by the confirmation delay.
    // Upload "received" is drawn on the server timeline, known only up to the watermark (≈ 1 s behind "sending").
    const upto = (pts, tm) => { const r = pts.filter(q => q[0] <= tm + 1e-9); return r.length >= 2 ? r : [[0, 0], [Math.max(0.01, tm), 0]]; };
    const delay = (pts, d, tMax) => { const r = pts.map(q => [q[0] + d, q[1]]).filter(q => q[0] <= tMax); return r.length >= 2 ? r : [[0, 0], [Math.max(0.01, tMax), 0]]; };
    const ser = (pts, c, faint) => ({ pts, c, so: faint ? 0.4 : 1, fo: faint ? 0 : 0.1 });
    const lg = (t, c, dash, o) => ({ t, c, dash: dash ? 'dashed' : 'solid', o: o || 1 });
    const LG = { d: lg('Download', C.down), u: lg('Upload', C.up), ur: lg('Upload · received', C.up), us: lg('Upload · sending', C.up, false, 0.4), l: lg('Latency under load', C.lat, true) };
    const used = BG.usedBytes, avgOf = (pts, t0, t1) => { const v = pts.filter(q => q[0] >= t0 - 1e-6 && q[0] < t1 - 1e-6).map(q => q[1]); return v.length ? v.reduce((x, y) => x + y, 0) / v.length : null; };
    const bparts = x => { const [n, u] = BG.bytes(x).split(' '); return { num: n, unit: u }; };
    const MK = { ext: 'var(--info)', cap: 'var(--warn)' };
    // Pre-phase time: info (≈ 0.6 s) + 20 sequential idle pings at the 100 ms send floor (≈ 2 s). The same for
    // 3.1 ms and 48 ms idle latency, since both answer within 100 ms.
    const PRE = 2.6;
    // Standard on the fast LAN (measurement §8.5, §19.4): download 10–20 s, upload 15–25 s.
    // Download 0–10 s: warm-up ends ≈ 6.5 s, the phase ends at its 10 s minimum.
    // Upload: every ramp decision waits ≈ 1 s for confirmation, so warm-up ends ≈ 9.5 s on the server timeline (the
    // "received" series), known on the client at ≈ 10.5 s ("warming up" ends then). The 3 s window is confirmed at
    // ≈ 13.5 s, inside the 15 s minimum: new requests stop at 15 s, the last in-flight ones confirm at ≈ 16 s, and the
    // steady window is ≈ 9.5–16 s. No extension. Chart: download 0–10 s, upload 10–26 s; total 2.6 + 26 = 28.6 s.
    // A stop leaves the final confirmed watermark ≈ 1 s before it (STOP_LAG); a number needs watermark ≥ warm-up end
    // + 3 s and ≥ 3 confirmed requests, so the fast run's cut-off is ≈ 13.4 s into upload (spec: ≈ 13.5 s).
    const LAG = 1.0, STOP_LAG = 0.9, DWU = 6.5, UWU = 9.5, UMIN = 15, UEND = 16;
    const DOWN = BG.thr(3, 612e6, 10), DLAT = BG.lat(5, 3.1, 18, 10), UPC = BG.thr(7, 438e6, UEND), USED_D = used(DOWN);
    const DBAND = { t0: 0, t1: DWU }, ubBand = wm => ({ t0: 10, t1: 10 + Math.max(0, Math.min(wm, UWU)) });
    // Slow VPN (640 kbit/s down, 210 kbit/s up, 48 ms idle). Download: warm-up ends ≈ 4.5 s, the window condition holds
    // before 10 s, so it ends at its 10 s minimum. Upload: warm-up ends ≈ 9.9 s on the server timeline, confirmation
    // delay ≈ 1.1 s, so the window condition holds at ≈ 14 s, before the 15 s minimum: it ends at 15 s (≈ 16 s with
    // in-flight requests), not extended. Total 2.6 + 10 + 16 = 28.6 s.
    const SDWU = 4.5, SUWU = 9.9, SLAG = 1.1, SUEND = 16;
    const SD = BG.thr(11, 640e3, 10, 0.1, 0.22, 2.5), SDL = BG.lat(13, 48, 162, 10, 0.25, 0.25, 2);
    const DONE_D = rt('Download', 'arrow-down', C.down, 612e6, { sub: 'peak ' + rn(641e6) + ' · ' + streamsD + ' streams' + plateauD });
    const DONE_U = rt('Upload', 'arrow-up', C.up, 438e6, { sub: 'peak ' + rn(455e6) + ' · ' + streams + ' streams' + plateau });
    const ROW_D = lrow('down', 18, { p90: 24 });
    // screens.md §7: the Error state's message (what failed, in which phase) is always danger + role="alert".
    // When the cause is itself a §7 notice (server restarted, network changed: neutral), it is shown alongside.
    const ERRK = this.props.errKind || 'requests';
    const CAUSE = { restarted: ['refresh-cw', 'Server restarted', 'The server restarted during the test, so the phase that was running reports nothing.'], network: ['network', 'Network changed', 'The network changed during the test; the completed phases are kept.'] }[ERRK];
    const EK = { requests: ['3 requests in a row failed during download', '3 requests in a row failed'], unreachable: ['server unreachable', 'server unreachable'], restarted: ['server restarted', 'server restarted'], network: ['network changed', 'network changed'] }[this.props.errKind || 'requests'] || ['3 requests in a row failed during download', '3 requests in a row failed'];

    const P = this.props.progress == null || this.props.progress === '' ? null : Math.max(0, Math.min(1, +this.props.progress));
    const pv = d => P == null ? d : P;
    const cdN = Math.max(1, Math.ceil(3 * (1 - pv(0.2)) - 1e-9));
    const EMPTY = { xMax: 26, yMax: 1e9, series: [], empty: 'Throughput over time appears here while the test runs.', title: 'Throughput', legend: [LG.d, LG.u, LG.l], meta: '' };
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
        notices: st === 'countdown' ? [N('info', 'timer', 'Auto-start in ' + cdN + ' s', 'This page was opened from a link that starts a test automatically.', [{ label: 'Cancel', icon: 'x', cls: 'btn sm secondary' }])] : st === 'param-ignored' ? [N('warn', 'link', 'URL parameter ignored', 'streams=12 ignored, allowed 1–6. Streams stay on Auto; the other parameters from the link were applied.', [{ label: 'Dismiss', icon: 'x', cls: 'btn sm ghost' }])] : [],
        btn: st === 'countdown' ? BTN.now : BTN.start, lastLine: st !== 'countdown'
      }; break;
      case 'connecting': { const p = pv(0.5); S = {
        phases: [ph('lat', 'active', 'server info', p * 100, 'Connecting…'), pend('down'), pend('up')],
        gauge: { opts: {} }, R: { textual: true, title: 'Connecting…', sub: SRV + ' · reading server info', icon: null },
        chart: EMPTY, prim: [eDown(), eUp(), eLat(), eJit()], load: preLoad(), fit: fit(null), meta: meta('—', '', (0.6 * p).toFixed(1) + ' s', 'elapsed'), notices: [], btn: BTN.stop,
        ph: 'Connecting to the server'
      }; } break;
      case 'latency': { const p = pv(0.7), t = Math.max(0.1, 2 * p), n = Math.max(1, Math.round(20 * p)), lp = BG.lat(5, 3.1, 3.1, t, 0.1, 0.35), lv = lp.map(q => q[1]); S = {
        phases: [ph('lat', 'active', n + ' / 20 pings', p * 100), pend('down'), pend('up')],
        gauge: { opts: { mode: 'ms', value: lv[lv.length - 1], bandLo: Math.min(...lv), bandHi: Math.max(...lv) }, scale: 'log scale · 1 – 1000 ms', c: C.lat },
        R: { numeric: true, eyebrow: 'Latency', icon: 'activity', ec: C.lat, num: fms(lv[lv.length - 1]), unit: 'ms', sub: 'median ' + fms(3.1) + ' · ping ' + n + ' of 20' },
        chart: { xMax: 2, ms: true, series: [ser(lp, C.lat)], now: t, title: 'Latency samples', legend: [lg('Round-trip time', C.lat)], meta: t.toFixed(1) + ' s / ~2 s' },
        prim: [eDown(), eUp(), latT(LIVE), jitT(LIVE)],
        load: preLoad(), fit: fit(null), meta: meta('—', '', (t + 0.6).toFixed(1) + ' s', 'elapsed'), notices: [], btn: BTN.stop,
        ph: 'Measuring idle latency'
      }; } break;
      case 'ws-fallback':
      case 'download': { const p = pv(0.75), t = Math.max(0.2, 10 * p), dp = BG.thr(3, 590e6, t), d = tail(dp), sw = steady(dp, DWU), lp = BG.lat(5, 3.1, 17, t); S = {
        phases: [ph('lat', 'done', LATD), ph('down', 'active', (10 - t).toFixed(1) + ' s left', p * 100), pend('up')],
        gauge: { opts: { value: d.cur, bandLo: d.lo, bandHi: d.hi, peak: sw ? sw.peak : null }, src: dp, c: C.down },
        R: { numeric: true, eyebrow: 'Download', icon: 'arrow-down', ec: C.down, num: rn(d.cur), unit: BG.rate(d.cur, unit).u, sub: liveSub(sw), oh: OH[0] },
        chart: { xMax: 10, series: [ser(dp, C.down)], lat: lp, now: t, bands: [{ t0: 0, t1: Math.min(t, DWU) }], title: 'Throughput', legend: [LG.d, LG.l], meta: t.toFixed(1) + ' s / 10 s' },
        prim: [LT('Download', 'arrow-down', C.down, sw), eUp('up next'), latT(), jitT()],
        load: load(null, [lrow('down', lastLat(lp, 3.2), { p90: latP90(lp), live: true }), lrow('up')], respB(null, null), 'Graded after upload'), fit: fit(null), meta: meta(BG.bytes(used(dp)), 'so far', (t + PRE).toFixed(1) + ' s', 'elapsed'), notices: st === 'ws-fallback' ? [N('info', 'info', 'WebSocket unavailable — HTTP latency fallback', 'The reverse proxy did not accept a WebSocket, so latency is measured with HTTP requests.')] : [], btn: BTN.stop,
        ph: 'Download, ' + sayR(d.cur), live: true
      }; } break;
      // No peak tick while upload runs: the gauge shows sending progress, not a measurement (§14).
      case 'upload': { const p = pv(0.75), t = Math.max(0.2, UEND * p), wm = t >= UEND - 1e-6 ? UEND : t - LAG, snd = BG.thr(7, 431e6, t), rcv = upto(snd, wm), u = tail(snd), sw = steady(rcv, UWU), lp = BG.lat(9, 3.1, 40, t), rc = rcv[rcv.length - 1][1]; S = {
        phases: [ph('lat', 'done', LATD), ph('down', 'done', rs(612e6)), ph('up', 'active', t < UMIN ? (UMIN - t).toFixed(1) + ' s left' : 'confirming last requests', p * 100)],
        gauge: { opts: { value: u.cur, bandLo: u.lo, bandHi: u.hi }, prev: DOWN, src: snd, c: C.up },
        R: { numeric: true, eyebrow: 'Upload · sending', icon: 'arrow-up', ec: C.up, num: rn(u.cur), unit: BG.rate(u.cur, unit).u, sub: liveSub(sw), oh: OH[0] },
        chart: { xMax: 10 + UEND, series: [ser(DOWN, C.down), ser(shift(snd, 10), C.up, true), ser(shift(rcv, 10), C.up)], lat: DLAT.concat(shift(lp, 10)), seps: [{ t: 0, label: 'Download' }, { t: 10, label: 'Upload' }], bands: [DBAND, ubBand(wm)], now: 10 + t, title: 'Throughput', legend: [LG.d, LG.ur, LG.us, LG.l], meta: (10 + t).toFixed(1) + ' s / ' + (10 + UEND) + ' s' },
        prim: [DONE_D, LT('Upload', 'arrow-up', C.up, sw), latT(), jitT()],
        load: load(null, [ROW_D, lrow('up', lastLat(lp, 3.2), { p90: latP90(lp), live: true })], respB(1420, null), 'Graded after upload'), fit: fit(null), meta: meta(BG.bytes(USED_D + used(snd)), 'so far', (t + PRE + 10).toFixed(1) + ' s', 'elapsed'), notices: [], btn: BTN.stop,
        ph: 'Upload sending, ' + sayR(u.cur), live: true
      }; } break;
      case 'complete': { const UL = BG.lat(9, 3.1, 42, UEND); S = {
        phases: [ph('lat', 'done', LATD), ph('down', 'done', rs(612e6)), ph('up', 'done', rs(438e6))],
        gauge: { opts: { value: 612e6, inner: 438e6 }, prev: DOWN, c: C.down },
        R: { numeric: true, eyebrow: 'Download', icon: 'arrow-down', ec: C.down, num: rn(612e6), unit: BG.rate(612e6, unit).u, sub: '', up: rs(438e6) + ' upload', oh: OH[0] },
        chart: { xMax: 10 + UEND, series: [ser(DOWN, C.down), ser(shift(UPC, 10), C.up)], lat: DLAT.concat(shift(UL, 10)), seps: [{ t: 0, label: 'Download' }, { t: 10, label: 'Upload' }], bands: [DBAND, ubBand(UWU)], title: 'Throughput', legend: [LG.d, LG.u, LG.l], meta: (PRE + 10 + UEND).toFixed(1) + ' s total' },
        prim: [DONE_D, DONE_U, latT(), jitT()],
        load: load('B', [ROW_D, lrow('up', 42, { p90: 55 })], respB(1420, 980)), fit: fit(aim(IDLE.v, IDLE.jit, 612e6, 42 - IDLE.v)), meta: meta(BG.bytes(USED_D + used(UPC)), '', (PRE + 10 + UEND).toFixed(1) + ' s', ''),
        notices: (on(this.props.cpu) ? [N('warn', 'cpu', "Limited by this device's CPU", 'The browser ran at full CPU during download, so the link may be faster than measured. Close other tabs or test from a faster device.')] : []).concat(BUL(438e6)),
        btn: BTN.again, saved: { iso: '2026-10-12T12:02:11.000Z', label: '', chips: ['LAN', 'Home Wi-Fi', 'Office'] }, dl: 612e6,
        share: { blocks: [{ dir: 'download', bps: 612e6, conf: on(this.props.cpu) ? { level: 'cpu-bound', reasons: [] } : null }, { dir: 'upload', bps: 438e6 }], loaded: { inc: '+39 ms', dir: 'upload' } },
        ph: 'Upload result: ' + sayR(438e6), sum: { st: 'done', down: 'Download ' + sayR(612e6), up: 'Upload ' + sayR(438e6) }
      }; } break;
      // Upload interrupted (flows.md §1 branch, measurement.md §7.5): over HTTP/1.1 the first failed upload request ends
      // only the upload phase. It is NOT the Error state: the run is complete, upload reports the window up to the failure.
      case 'upload-interrupted': { const UF = 12, UPF = UPC.filter(p => p[0] <= UF), UL = BG.lat(9, 3.1, 40, UF); S = {
        phases: [ph('lat', 'done', LATD), ph('down', 'done', rs(612e6)), ph('up', 'done', rs(402e6))],
        gauge: { opts: { value: 612e6, inner: 402e6 }, prev: DOWN, c: C.down },
        R: { numeric: true, eyebrow: 'Download', icon: 'arrow-down', ec: C.down, num: rn(612e6), unit: BG.rate(612e6, unit).u, sub: '', up: rs(402e6) + ' upload', oh: OH[0] },
        chart: { xMax: 10 + UF, series: [ser(DOWN, C.down), ser(shift(UPF, 10), C.up)], lat: DLAT.concat(shift(UL, 10)), seps: [{ t: 0, label: 'Download' }, { t: 10, label: 'Upload' }], bands: [DBAND, ubBand(UWU)], marks: [{ t: 10 + UF, label: 'Request failed' }], markColor: 'var(--danger)', title: 'Throughput', legend: [LG.d, LG.u, LG.l], meta: (PRE + 10 + UF).toFixed(1) + ' s total', noEnd: true },
        prim: [DONE_D, rt('Upload', 'arrow-up', C.up, 402e6, { sub: 'window up to the failed request at ' + UF + ' s' }), latT(), jitT()],
        load: load('B', [ROW_D, lrow('up', 40, { p90: 52 })], respB(1420, 960)), fit: fit(aim(IDLE.v, IDLE.jit, 612e6, 40 - IDLE.v)), meta: meta(BG.bytes(USED_D + used(UPF)), '', (PRE + 10 + UF).toFixed(1) + ' s', ''),
        notices: [N('danger', 'circle-x', 'Upload interrupted by a failed request', 'Over HTTP/1.1 one failed request ends the upload, so its number covers the window up to the failure. HTTP/2 at the proxy lets uploads survive transient failures.', [{ label: 'Deployment guide', href: '#' }])],
        btn: BTN.again, saved: { iso: '2026-10-12T12:02:11.000Z', label: '', chips: ['LAN', 'Home Wi-Fi', 'Office'] }, dl: 612e6,
        share: { blocks: [{ dir: 'download', bps: 612e6 }, { dir: 'upload', bps: 402e6 }], loaded: { inc: '+37 ms', dir: 'upload' } },
        ph: 'Upload result: ' + sayR(402e6), sum: { st: 'done', down: 'Download ' + sayR(612e6), up: 'Upload ' + sayR(402e6) }
      }; } break;
      case 'error': { const ep = BG.thr(3, 575e6, 6.4); S = {
        phases: [ph('lat', 'done', LATD), ph('down', 'failed', 'interrupted at 6.4 s', 64), ph('up', 'skipped')],
        gauge: { opts: {} },
        R: { textual: true, title: 'Connection lost', sub: 'Error during download', faint: 'last sample ' + rs(575e6), icon: 'wifi-off', ec: 'var(--danger)' },
        chart: { xMax: 10, series: [ser(ep, C.down)], lat: BG.lat(5, 3.1, 17, 6.4), bands: [{ t0: 0, t1: 6.4 }], marks: [{ t: 6.4, label: 'Connection lost' }], markColor: 'var(--danger)', title: 'Throughput', legend: [LG.d, LG.l], meta: 'stopped at 6.4 s', noEnd: true },
        prim: [T({ label: 'Download', icon: 'arrow-down', ic: C.down, state: 'error', sub: 'error · ' + EK[1] }), eUp('not run'), latT(), jitT()],
        load: load(null, [lrow('down', null, { sub: 'no steady window · download failed' }), lrow('up', null, { sub: 'Not run' })], respB('few', null), 'Not graded — test incomplete'),
        fit: fit(null, ['needs loaded latency and download', 'needs loaded latency', 'needs loaded latency']), meta: meta(BG.bytes(used(ep)), 'not saved', (PRE + 6.4).toFixed(1) + ' s', ''),
        notices: [N('danger', 'wifi-off', 'Connection to ' + SRV + ' lost — ' + EK[0], 'Download stopped at 6.4 s. Latency finished before the error.')].concat(CAUSE ? [N('neutral', CAUSE[0], CAUSE[1], CAUSE[2])] : []),
        btn: BTN.retry, partial: { kind: 'error', keep: true },
        ph: 'Download, ' + sayR(575e6), sum: { st: 'fail', down: 'Download failed', up: 'Upload skipped', n: CAUSE ? [CAUSE[1]] : [] }
      }; } break;
      // Stopped during upload, computed from the stop time T. The confirmed window ends at the final watermark,
      // ≈ T − confirmation delay (whole cells only); in-flight requests are aborted and count nothing. A number needs a
      // watermark ≥ warm-up end + 3 s with ≥ 3 confirmed requests: on the LAN a stop from ≈ 13.4 s into upload, on the slow
      // VPN from ≈ 13.8 s. Before that the direction is "insufficient data" and has no loaded latency, so grade and
      // quality scores come from download only. Demo defaults: 'cancelled' stops at 3.1 s; 'cancelled-late' at 14.0 s
      // (watermark 13.1 s, window 9.5–13.1 s = 3.6 s, 21 requests, ≈ 438 Mbit/s: the live run's
      // own curve over that window, so data used and the chart continue without a jump at the stop); 'cancelled-slow-up' (VPN) at 8 s.
      case 'cancelled':
      case 'cancelled-late':
      case 'cancelled-slow-up': {
        const su = st === 'cancelled-slow-up';
        const K = su ? { span: SUEND, lag: STOP_LAG, wu: SUWU, ns: 2, up: 210e3, snd: t => BG.thr(17, 210e3, t, 0.1, 0.3, 2.5), uLat: t => BG.lat(15, 48, 310, t, 0.25, 0.25, 2), uLL: [310, 380], rpm: [240, 'few', 'few'],
            dPts: SD, dLat: SDL, dBand: { t0: 0, t1: SDWU }, dV: 640e3, dLL: 162, rowD: lrow('down', 162, { p90: 205 }), tileD: rt('Download', 'arrow-down', C.down, 640e3, { sub: 'peak ' + rn(702e3) + ' · 2 streams · plateau: no-gain' }), def: 8 / SUEND }
          : { span: UEND, lag: STOP_LAG, wu: UWU, ns: 6, up: 402e6, snd: t => BG.thr(7, 431e6, t), uLat: t => BG.lat(9, 3.1, 40, t), uLL: [37, 46], rpm: [1420, 610, 'few'],
            dPts: DOWN, dLat: DLAT, dBand: DBAND, dV: 612e6, dLL: 18, rowD: ROW_D, tileD: DONE_D, def: st === 'cancelled' ? 3.1 / UEND : 14 / UEND };
        const npp = gapStop === 'no-probe-path', WSL = 9.7, dLatC = npp ? K.dLat.filter(q => q[0] < WSL) : K.dLat;
        const p = gapStop ? LLSTOP / K.span : pv(K.def), Tt = Math.max(0.2, K.span * p), wEnd = Math.floor((Tt - K.lag) * 10 + 1e-6) / 10;
        const win = Math.max(0, Math.round((wEnd - K.wu) * 10) / 10), nReq = Math.max(0, Math.round(K.ns * win) - 1), part = win >= 3 && nReq >= 3, inWarm = wEnd <= K.wu;
        const snd = K.snd(Tt), rcv = upto(snd, wEnd), uv = part ? avgOf(snd, K.wu, wEnd) : null, uUsed = used(snd), lp = npp ? [] : K.uLat(Tt), stopAt = (10 + Tt).toFixed(1), Ts = Tt.toFixed(1);
        // no-probe-path: the WebSocket closed 9.7 s into the download and its reopening was never answered, so the download's
        // loaded latency comes from the samples before the close and no probe runs in the upload.
        const PT = { state: 'partial', tag: 'Partial — stopped early' }, gD = gradeOf(K.dLL - IDLE.v);
        // Partial loaded latency: median and p90 of the same probe curve over the confirmed window.
        const lw = lp.filter(q => q[0] >= K.wu - 1e-6 && q[0] < wEnd - 1e-6).map(q => q[1]).sort((x, y) => x - y);
        const uLLc = part && lw.length ? [Math.round(lw[lw.length >> 1]), Math.round(q90(lw))] : K.uLL;
        S = {
          phases: [ph('lat', 'done', LATD), ph('down', 'done', rs(K.dV)), ph('up', 'cancelled', Ts + ' s', Math.min(100, Tt / K.span * 100))],
          gauge: { opts: Object.assign({ value: K.dV }, part ? { inner: uv } : {}), prev: K.dPts, c: C.down, noDot: true },
          R: { textual: true, title: 'Cancelled', sub: 'Partial results · not saved', icon: 'circle-minus', ec: 'var(--fg-subtle)' },
          chart: { xMax: 10 + K.span, series: [ser(K.dPts, C.down), ser(shift(snd, 10), C.up, true), ser(shift(rcv, 10), C.up)], lat: dLatC.concat(shift(lp, 10)), seps: [{ t: 0, label: 'Download' }, { t: 10, label: 'Upload' }], bands: [K.dBand, { t0: 10, t1: 10 + Math.max(0, Math.min(wEnd, K.wu)) }], wins: part ? [{ t0: 10 + K.wu, t1: 10 + wEnd, label: 'Steady ' + win.toFixed(1) + ' s' }] : [], marks: [{ t: 10 + Tt, label: 'Cancelled' }], markColor: 'var(--fg-muted)', title: 'Throughput', legend: [LG.d, LG.ur, LG.us, LG.l], meta: 'stopped at ' + stopAt + ' s', noEnd: true },
          prim: [K.tileD, part ? rt('Upload', 'arrow-up', C.up, uv, Object.assign({ sub: 'based on a ' + win.toFixed(1) + ' s steady window · ' + nReq + ' requests' }, PT))
            : T({ label: 'Upload', icon: 'arrow-up', ic: C.up, state: 'insufficient-data', sub: 'Insufficient data — confirmed steady window shorter than 3 s' + (inWarm ? ' (stopped in warm-up)' : ''), notes: [BG.bytes(uUsed) + ' used'] }), latT(), jitT()],
          load: part ? load(gradeOf(Math.max(K.dLL, uLLc[0]) - IDLE.v), [K.rowD, lrow('up', uLLc[0], { p90: uLLc[1], partial: true })], respB(K.rpm[0], K.rpm[1]))
            : load(gD, [K.rowD, lrow('up', null, npp ? { sub: 'no latency probe', noSrc: true } : { sub: 'no steady window' + (inWarm ? ' · stopped in warm-up' : '') })], respB(K.rpm[0], K.rpm[2]), BG.GRADES[gD].text + ' · download only'),
          fit: fit(aim(IDLE.v, IDLE.jit, K.dV, (part ? Math.max(K.dLL, uLLc[0]) : K.dLL) - IDLE.v)), fitBasis: part ? '' : 'download only',
          meta: meta(BG.bytes(used(K.dPts) + uUsed), '', (PRE + 10 + Tt).toFixed(1) + ' s', ''),
          notices: [].concat([part ? N('neutral', 'circle-minus', 'Partial — stopped early · upload based on a ' + win.toFixed(1) + ' s steady window', 'Latency and download completed. Upload stopped at ' + Ts + ' s; in-flight requests were aborted, and the ' + nReq + ' requests confirmed by ' + wEnd.toFixed(1) + ' s give the partial value.')
            : N('neutral', 'circle-minus', 'Test cancelled during upload', 'Latency and download completed.' + (npp ? ' The WebSocket closed ' + WSL + ' s into the download and its reopening was never answered, so no latency probe could be sent during the upload.' : '') + ' Upload stopped at ' + Ts + ' s, before a 3 s confirmed steady window' + (inWarm ? ' (still in warm-up)' : '') + ', so it has no value and no loaded latency. The grade and quality scores use download only.')]),
          btn: BTN.again, partial: { kind: 'partial', keep: true },
          ph: part ? 'Upload result: ' + sayR(uv) : 'Upload finished without a number',
          sum: { st: 'partial', down: 'Download ' + sayR(K.dV), up: part ? 'Upload ' + sayR(uv) + ', partial, stopped early' : 'Upload: insufficient data' }
        };
      } break;
      // Idle-latency stop: the first ping is a warm-up sample and is discarded, so 5 usable samples need 6 pings sent.
      case 'cancelled-latency': { const p = pv(0.6), t = Math.max(0.6, 2 * p), n = Math.max(6, Math.round(20 * p)), k = n - 1, lp = BG.lat(5, 3.1, 3.1, t, 0.1, 0.35), PT = { state: 'partial', tag: 'Partial — stopped early' }; S = {
        phases: [ph('lat', 'cancelled', n + ' / 20 pings', p * 100), ph('down', 'skipped'), ph('up', 'skipped')],
        gauge: { opts: { mode: 'ms', value: IDLE.v }, scale: 'log scale · 1 – 1000 ms', c: C.lat, noDot: true },
        R: { textual: true, title: 'Cancelled', sub: 'Partial results · not saved', icon: 'circle-minus', ec: 'var(--fg-subtle)' },
        chart: { xMax: 2, ms: true, series: [ser(lp, C.lat)], marks: [{ t, label: 'Cancelled' }], markColor: 'var(--fg-muted)', title: 'Latency samples', legend: [lg('Round-trip time', C.lat)], meta: 'stopped at ' + t.toFixed(1) + ' s', noEnd: true },
        prim: [eDown('not run'), eUp('not run'), latT(Object.assign({ sub: 'median of ' + k + ' pings · first of ' + n + ' discarded · ' + idleSrc }, PT)), jitT(PT)],
        load: load(null, [lrow('down', null, { sub: 'Not run' }), lrow('up', null, { sub: 'Not run' })], respB(null, null), 'Not graded — no loaded latency'),
        fit: fit(null, ['needs loaded latency and download', 'needs loaded latency', 'needs loaded latency']), meta: meta('—', '', (t + 0.6).toFixed(1) + ' s', ''),
        notices: [N('neutral', 'circle-minus', 'Test cancelled during latency', 'Stopped after ' + n + ' of 20 pings. The first is a warm-up sample, so idle latency and jitter come from the other ' + k + '; download and upload did not run.')],
        btn: BTN.again, partial: { kind: 'partial', keep: true },
        ph: 'Measuring idle latency', sum: { st: 'partial', down: 'Download skipped', up: 'Upload skipped', n: [] }
      }; } break;
      // Stopped during download: a value only when the steady window (warm-up end → stop) holds ≥ 3 s; then the grade
      // and quality scores use download only.
      case 'cancelled-slow':
      case 'cancelled-download': { const D = slow ? { warm: SDWU, v: 640e3, ll: 162 } : { warm: DWU, v: 612e6, ll: 18 };
        const p = pv(slow ? 0.8 : 0.52), t = Math.max(0.3, 10 * p), dp = slow ? BG.thr(11, D.v, t, 0.1, 0.22, 2.5) : BG.thr(3, D.v, t), lp = slow ? BG.lat(13, 48, D.ll, t, 0.25, 0.25, 2) : BG.lat(5, 3.1, D.ll, t);
        const win = t - D.warm, part = win >= 3, sw = steady(dp, D.warm), ub = BG.bytes(used(dp)), inc = D.ll - IDLE.v, g = part ? gradeOf(inc) : null; S = {
        phases: [ph('lat', 'done', LATD), ph('down', 'cancelled', t.toFixed(1) + ' s', p * 100), ph('up', 'skipped')],
        gauge: Object.assign({ opts: { value: part ? sw.avg : dp[dp.length - 1][1] }, src: dp, c: C.down, noDot: true }, slow ? { prev: dp } : {}),
        R: { textual: true, title: 'Cancelled', sub: 'Partial results · not saved', icon: 'circle-minus', ec: 'var(--fg-subtle)' },
        chart: { xMax: 10, series: [ser(dp, C.down)], lat: lp, bands: [{ t0: 0, t1: Math.min(t, D.warm) }], wins: part ? [{ t0: D.warm, t1: t, label: 'Steady ' + win.toFixed(1) + ' s' }] : [], marks: [{ t, label: 'Cancelled' }], markColor: 'var(--fg-muted)', title: 'Throughput', legend: [LG.d, LG.l], meta: 'stopped at ' + t.toFixed(1) + ' s', noEnd: true },
        prim: [part ? rt('Download', 'arrow-down', C.down, sw.avg, { state: 'partial', tag: 'Partial — stopped early', sub: 'based on a ' + win.toFixed(1) + ' s steady window' }) : T({ label: 'Download', icon: 'arrow-down', ic: C.down, state: 'insufficient-data', sub: t < D.warm ? 'Insufficient data — stopped during warm-up' : 'Insufficient data — steady window shorter than 3 s', notes: [ub + ' used'] }), eUp('not run'), latT(), jitT()],
        load: part ? load(g, [lrow('down', D.ll, { p90: Math.max(D.ll, latP90(lp)), partial: true }), lrow('up', null, { sub: 'Not run' })], respB('few', null), BG.GRADES[g].text + ' · download only') : load(null, [lrow('down', null, { sub: 'no steady window' }), lrow('up', null, { sub: 'Not run' })], respB('few', null), 'Not graded — no gradable direction'),
        fit: part ? fit(aim(IDLE.v, IDLE.jit, sw.avg, inc)) : fit(null, ['needs loaded latency and download', 'needs loaded latency', 'needs loaded latency']), fitBasis: part ? 'download only' : '',
        meta: meta(ub, '', (t + PRE).toFixed(1) + ' s', ''),
        notices: [N('neutral', 'circle-minus', 'Test cancelled during download', part ? 'Latency completed. Download has a ' + win.toFixed(1) + ' s steady window, enough for a partial value. Upload did not run.' : 'Latency completed. Download stopped before a 3 s steady window, so it has no value. Upload did not run.')],
        btn: BTN.again, partial: { kind: 'partial', keep: true },
        ph: part ? 'Download result: ' + sayR(sw.avg) : 'Download finished without a number',
        sum: { st: 'partial', down: part ? 'Download ' + sayR(sw.avg) + ', partial, stopped early' : 'Download: insufficient data', up: 'Upload skipped' }
      }; } break;
      // Slow VPN, live: one timeline over download (0–10 s, ends at its minimum) and upload (10–26 s, ends at its 15 s
      // minimum plus in-flight requests; not extended).
      case 'slow': { const p = pv(0.85), tt = Math.max(0.5, (10 + SUEND) * p);
        if (tt <= 10) { const t = tt, dp = BG.thr(11, 640e3, t, 0.1, 0.22, 2.5), d = tail(dp), sw = steady(dp, SDWU), lp = BG.lat(13, 48, 162, t, 0.25, 0.25, 2); S = {
          phases: [ph('lat', 'done', LATD), ph('down', 'active', (10 - t).toFixed(1) + ' s left', t * 10), pend('up')],
          gauge: { opts: { value: d.cur, bandLo: d.lo, bandHi: d.hi, peak: sw ? sw.peak : null }, src: dp, c: C.down },
          R: { numeric: true, eyebrow: 'Download', icon: 'arrow-down', ec: C.down, num: rn(d.cur), unit: BG.rate(d.cur, unit).u, sub: liveSub(sw), oh: OH[0] },
          chart: { xMax: 10, series: [ser(dp, C.down)], lat: lp, now: t, bands: [{ t0: 0, t1: Math.min(t, SDWU) }], title: 'Throughput', legend: [LG.d, LG.l], meta: t.toFixed(1) + ' s / 10 s' },
          prim: [LT('Download', 'arrow-down', C.down, sw), eUp('up next'), latT(), jitT()],
          load: load(null, [lrow('down', lastLat(lp, 49), { p90: latP90(lp), live: true }), lrow('up')], respB(null, null), 'Graded after upload'), fit: fit(null),
          meta: meta(BG.bytes(used(dp)), 'so far', (t + PRE).toFixed(1) + ' s', 'elapsed'), notices: [], btn: BTN.stop,
          ph: 'Download, ' + sayR(d.cur), live: true, phKey: 'down'
        }; } else { const t = tt - 10, wm = t >= SUEND - 1e-6 ? SUEND : t - SLAG, snd = BG.thr(17, 210e3, t, 0.1, 0.3, 2.5), rcv = upto(snd, wm), u = tail(snd), sw = steady(rcv, SUWU), lp = BG.lat(15, 48, 310, t, 0.25, 0.25, 2), rc = rcv[rcv.length - 1][1]; S = {
          phases: [ph('lat', 'done', LATD), ph('down', 'done', rs(640e3)), ph('up', 'active', t < UMIN ? (UMIN - t).toFixed(1) + ' s left' : 'confirming last requests', t / SUEND * 100)],
          gauge: { opts: { value: u.cur, bandLo: u.lo, bandHi: u.hi }, prev: SD, src: snd, c: C.up },
          R: { numeric: true, eyebrow: 'Upload · sending', icon: 'arrow-up', ec: C.up, num: rn(u.cur), unit: BG.rate(u.cur, unit).u, sub: liveSub(sw), oh: OH[0] },
          chart: { xMax: 10 + SUEND, series: [ser(SD, C.down), ser(shift(snd, 10), C.up, true), ser(shift(rcv, 10), C.up)], lat: SDL.concat(shift(lp, 10)), seps: [{ t: 0, label: 'Download' }, { t: 10, label: 'Upload' }], bands: [{ t0: 0, t1: SDWU }, { t0: 10, t1: 10 + Math.max(0, Math.min(wm, SUWU)) }], now: 10 + t, title: 'Throughput', legend: [LG.d, LG.ur, LG.us, LG.l], meta: (10 + t).toFixed(1) + ' s / ' + (10 + SUEND) + ' s' },
          prim: [rt('Download', 'arrow-down', C.down, 640e3, { sub: 'peak ' + rn(702e3) + ' · 2 streams · plateau: no-gain' }), LT('Upload', 'arrow-up', C.up, sw), latT(), jitT()],
          load: load(null, [lrow('down', 162, { p90: 205 }), lrow('up', lastLat(lp, 49), { p90: latP90(lp), live: true })], respB(240, null), 'Graded after upload'), fit: fit(null),
          meta: meta(BG.bytes(used(SD) + used(snd)), 'so far', (t + PRE + 10).toFixed(1) + ' s', 'elapsed'),
          notices: [],
          btn: BTN.stop, ph: 'Upload sending, ' + sayR(u.cur), live: true, phKey: 'up'
        }; }
      } break;
      case 'slowdone': { const SU = BG.thr(17, 210e3, SUEND, 0.1, 0.3, 2.5), SUL = BG.lat(15, 48, 310, SUEND, 0.25, 0.25, 2), tot = (PRE + 10 + SUEND).toFixed(1); S = {
        phases: [ph('lat', 'done', LATD), ph('down', 'done', rs(640e3)), ph('up', 'done', rs(210e3))],
        gauge: { opts: { value: 640e3, inner: 210e3 }, prev: SD, c: C.down },
        R: { numeric: true, eyebrow: 'Download', icon: 'arrow-down', ec: C.down, num: rn(640e3), unit: BG.rate(640e3, unit).u, sub: '', up: rs(210e3) + ' upload', oh: OH[0] },
        chart: { xMax: 10 + SUEND, series: [ser(SD, C.down), ser(shift(SU, 10), C.up)], lat: SDL.concat(shift(SUL, 10)), seps: [{ t: 0, label: 'Download' }, { t: 10, label: 'Upload' }], bands: [{ t0: 0, t1: SDWU }, { t0: 10, t1: 10 + SUWU }], title: 'Throughput', legend: [LG.d, LG.u, LG.l], meta: tot + ' s total', noEnd: true },
        prim: [rt('Download', 'arrow-down', C.down, 640e3, { sub: 'peak ' + rn(702e3) + ' · 2 streams · plateau: no-gain' }), rt('Upload', 'arrow-up', C.up, 210e3, { state: 'low-confidence', sub: 'peak ' + rn(224e3) + ' · 2 streams · plateau: floor-limited', notes: OH.concat(['low confidence · few samples']) }), latT(), jitT()],
        load: load('D', [lrow('down', 162, { p90: 205 }), lrow('up', 310, { p90: 380 })], respB(240, 'few')), fit: fit(aim(IDLE.v, IDLE.jit, 640e3, 310 - IDLE.v)), meta: meta(BG.bytes(used(SD) + used(SU)), '', tot + ' s', ''),
        notices: [N('warn', 'triangle-alert', 'Low confidence', 'Upload: few samples.')],
        btn: BTN.again, saved: { iso: '2026-10-12T06:41:57.000Z', label: 'VPN via 5G', chips: ['VPN', 'Mobile'] }, dl: 640e3,
        share: { blocks: [{ dir: 'download', bps: 640e3 }, { dir: 'upload', bps: 210e3, conf: { level: 'low', reasons: ['insufficient-samples'] } }], loaded: { inc: '+262 ms', dir: 'upload' } },
        ph: 'Upload result: ' + sayR(210e3), sum: { st: 'done', down: 'Download ' + sayR(640e3), up: 'Upload ' + sayR(210e3) + ', low confidence: few samples' }
      }; } break;
      case 'offline': S = {
        phases: [ph('lat', 'pending'), ph('down', 'pending'), ph('up', 'pending')],
        gauge: { opts: {} }, R: { textual: true, title: 'Server unreachable', sub: SRV + " didn't respond. Next check in 8 s.", icon: 'server-off', ec: 'var(--danger)', action: { label: 'Retry', icon: 'refresh-cw' } },
        chart: Object.assign({}, EMPTY, { empty: 'Nothing to measure yet. The chart fills in once ' + SRV + ' responds.' }),
        prim: [eDown(), eUp(), eLat(), eJit()], load: preLoad(), fit: fit(null), meta: meta('—', '', '—', ''), notices: [],
        btn: Object.assign({}, BTN.start, { dis: true, tip: 'Server unreachable — use Retry first' })
      }; break;
      // 20 kbit/s on Standard: no steady window by the 10 s minimum, so download is extended (mark at 10 s) up to its 20 s
      // max. The first 64 KiB request (≈ 26 s at this rate) is still in flight at 20 s, so only one request contributed
      // bytes (≈ 50 kB): insufficient data. Upload runs on the same slow link (≈ 19 kbit/s, its own curve): no confirmed
      // window by its 15 s minimum, so it is extended too, up to its 25 s max.
      case 'insufficient': { const p = pv(0.45), UMAXI = 25, t = Math.max(0.3, UMAXI * p), uext = t >= UMIN, DP = BG.thr(23, 20e3, 20, 0.1, 0.3, 1.5), snd = BG.thr(29, 19e3, t, 0.1, 0.25, 1.5), u = tail(snd), lp = BG.lat(15, 48, 210, t, 0.25, 0.25, 2); S = {
        phases: [ph('lat', 'done', LATD), ph('down', 'done', 'insufficient data', 100), ph('up', 'active', uext ? 'extended · up to 25 s' : (UMIN - t).toFixed(1) + ' s left', p * 100)],
        gauge: { opts: { value: u.cur, bandLo: u.lo, bandHi: u.hi }, prev: DP, src: snd, c: C.up },
        R: { numeric: true, eyebrow: 'Upload · sending', icon: 'arrow-up', ec: C.up, num: rn(u.cur), unit: BG.rate(u.cur, unit).u, sub: 'warming up', oh: OH[0] },
        chart: { xMax: 20 + UMAXI, series: [ser(DP, C.down), ser(shift(snd, 20), C.up, true)], lat: BG.lat(13, 48, 140, 20, 0.25, 0.25, 2).concat(shift(lp, 20)), seps: [{ t: 0, label: 'Download' }, { t: 20, label: 'Upload' }], bands: [{ t0: 0, t1: 5 }, { t0: 20, t1: 20 + t }], marks: [{ t: 10, label: 'Extended', c: MK.ext }, { t: 20, label: '20 s max', c: MK.cap }].concat(uext ? [{ t: 20 + UMIN, label: 'Extended', c: MK.ext }] : []), now: 20 + t, title: 'Throughput', legend: [LG.d, LG.us, LG.l], meta: (20 + t).toFixed(1) + ' s / ' + (20 + UMAXI) + ' s max' },
        prim: [T({ label: 'Download', icon: 'arrow-down', ic: C.down, state: 'insufficient-data', sub: 'Insufficient data — no steady window within the 20 s max', notes: [BG.bytes(50e3) + ' used'] }), T({ label: 'Upload', icon: 'arrow-up', ic: C.up, state: 'warming-up', sub: 'no confirmed request yet' }), latT(), jitT()],
        load: load(null, [lrow('down', 140, { p90: 176 }), lrow('up', lastLat(lp, 49), { p90: latP90(lp), live: true })], respB(null, null), 'Graded after upload'), fit: fit(null),
        meta: meta(BG.bytes(50e3 + used(snd)), 'so far · download ' + BG.bytes(50e3), (t + PRE + 20).toFixed(1) + ' s', 'elapsed'),
        notices: [EXT(true, uext), N('warn', 'database', 'Download: insufficient data', 'Download reached its 20 s maximum without a confirmed steady window long enough for a number. ' + BG.bytes(50e3) + ' used. Upload continues; Extended allows up to 40 s per direction.', [{ label: 'Try Extended', icon: 'timer', cls: 'btn sm secondary' }])],
        btn: BTN.stop, ph: 'Upload sending, ' + sayR(u.cur), live: true
      }; } break;
      case 'error-early': { const lp = BG.lat(5, 3.1, 3.1, 1.2, 0.1, 0.35); S = {
        phases: [ph('lat', 'failed', 'interrupted at 1.2 s', 60), ph('down', 'skipped'), ph('up', 'skipped')],
        gauge: { opts: {} },
        R: { textual: true, title: 'Connection lost', sub: 'Error during latency', faint: '12 of 20 pings', icon: 'wifi-off', ec: 'var(--danger)' },
        chart: { xMax: 2, ms: true, series: [ser(lp, C.lat)], marks: [{ t: 1.2, label: 'Connection lost' }], markColor: 'var(--danger)', title: 'Latency samples', legend: [lg('Round-trip time', C.lat)], meta: 'stopped at 1.2 s', noEnd: true },
        prim: [eDown('not run'), eUp('not run'), T({ label: 'Idle latency', icon: 'activity', ic: C.lat, state: 'error', sub: 'error · 12 of 20 pings before the error' }), eJit()],
        load: load(null, [lrow('down', null, { sub: 'Not run' }), lrow('up', null, { sub: 'Not run' })], respB(null, null), 'Not graded — test incomplete'),
        fit: fit(null, 'needs a full test'), meta: meta('—', '', '1.8 s', ''),
        notices: [N('danger', 'wifi-off', 'Connection to ' + SRV + ' lost — the network changed', 'The test stopped at 1.2 s, during latency. No phase finished.')],
        btn: eeDown ? Object.assign({}, BTN.retry, { dis: true, tip: 'Server unreachable — use Retry first' }) : BTN.retry, partial: eeDown ? null : { kind: 'error', keep: false },
        ph: 'Measuring idle latency'
      }; } break;
      // Data used follows the curve: ≈ 184 MB for 6.2 s of warm-up at ≈ 237 Mbit/s average.
      case 'cont-warmup': { const pts = BG.thr(19, 921e6, 6.2, 0.1, 0.05, 10), d = tail(pts); S = {
        phases: [ph('lat', 'done', LATD), ph('down', 'cancelled', 'in warm-up · 0:06', 1, 'Download · continuous')],
        gauge: { opts: { value: d.cur }, src: pts, c: C.down, noDot: true },
        R: { textual: true, title: 'Stopped', sub: 'During warm-up · not saved', icon: 'circle-minus', ec: 'var(--fg-subtle)' },
        chart: { xMax: 14, series: [ser(pts, C.down)], lat: BG.lat(21, 3.1, 21, 6.2, 0.1, 0.3, 10), bands: [{ t0: 0, t1: 6.2 }], seps: [{ t: 0, label: 'Warm-up' }], marks: [{ t: 6.2, label: 'Stopped' }], markColor: 'var(--fg-muted)', title: 'Throughput · session', legend: [LG.d, LG.l], meta: 'stopped at 6.2 s', noEnd: true },
        prim: [
          em('Current', 'arrow-down', C.down, 'stopped'),
          em('Average', 'arrow-down', C.down, 'starts after warm-up'),
          em('Peak · p90, last hour', 'trending-up', C.down, 'starts after warm-up'),
          em('Loaded latency', 'activity', C.lat, 'starts after warm-up'),
          T(Object.assign({ label: 'Data used', icon: 'database', sub: 'warm-up included', span: m ? 'span 2' : 'auto' }, bparts(used(pts))))
        ],
        resCols: m ? null : 'repeat(5, minmax(0,1fr))',
        load: null, fit: null, metaTitle: 'Session', metaSpan: m ? 'span 2' : 'span 5', metaCols: m ? 'minmax(0,1fr)' : 'repeat(4, minmax(0,1fr))',
        meta: [
          { icon: 'timer', label: 'Elapsed', sub: 'stopped during warm-up', value: '0:06', vc: 'var(--fg)' },
          { icon: 'arrow-up-down', label: 'Min / max', sub: 'download, 1 s cells', value: '—', vc: 'var(--fg-subtle)' },
          { icon: 'activity', label: 'Idle latency', sub: 'measured at start', value: LATD, vc: 'var(--fg)' },
          PL
        ],
        notices: [N('neutral', 'circle-minus', 'Continuous run stopped during warm-up', 'Stopped at 6.2 s, before warm-up ended (at the latest 10 s). Warm-up samples are left out of averages, so the run has no steady value.')],
        btn: BTN.again, partial: { kind: 'partial', keep: true }
      }; } break;
      // Continuous at 42:18: the live run and its stopped state share one curve, so they show the same data used.
      // Live view (screens.md §1): run-wide min / average / max, "p90, last hour", last-minute loaded latency, data used with
      // its rate, and the elapsed time against the run length with its end time, or the elapsed time alone (the default).
      // cont-upload: a live Continuous upload, "received" solid with its unknown cells as gaps, "sending" faint (flows.md §7).
      // cont-done: the finished result adds the grade, the HTTP loaded responsiveness and the quality scores; its loaded
      // latency is the last hour's median, and it keeps each data-used notice the run raised (measurement §15, screens.md §7).
      case 'cont-done':
      case 'cont-upload':
      case 'continuous': {
        const up = st === 'cont-upload', done = st === 'cont-done', EL = 2538, elS = '42:18';
        const RL = this.props.runLength && this.props.runLength !== 'none' ? 7200 : null, rlS = '2:00:00';
        const DCc = up ? C.up : C.down, dIcon = up ? 'arrow-up' : 'arrow-down', dName = up ? 'Upload' : 'Download';
        const K = up ? { av: 412e6, p90: 428e6, mn: 318e6, mx: 437e6, cur: 426e6, ll: 38 } : { av: 921e6, p90: 936e6, mn: 702e6, mx: 941e6, cur: 934e6, ll: 21 };
        const pts = BG.thr(19, 921e6, EL, 10, 0.025, 30), d = tail(pts);
        // Upload: two failure gaps leave unknown cells, drawn as gaps in "received"; "sending" (client progress) continues.
        const inGap = t => (t >= 1210 && t < 1250) || (t >= 2100 && t < 2120);
        const snd = up ? BG.thr(29, 418e6, EL, 10, 0.02, 30) : null, rcv = up ? BG.thr(23, 412e6, EL, 10, 0.03, 30) : null, segs = [];
        if (up) { let cur = []; rcv.forEach(p => { if (inGap(p[0])) { if (cur.length > 1) segs.push(cur); cur = []; } else cur.push(p); }); if (cur.length > 1) segs.push(cur); }
        const CU = used(up ? rcv : pts, 10), perMin = BG.bytes(CU / (EL / 60)) + '/min';
        const cLat = BG.lat(21, 3.1, K.ll, EL, 10, 0.3, 30), common = { resCols: m ? null : 'repeat(5, minmax(0,1fr))', load: null, fit: null, metaTitle: 'Session', metaSpan: m ? 'span 2' : 'span 5', metaCols: m ? 'minmax(0,1fr)' : 'repeat(4, minmax(0,1fr))' };
        const dataT = T(Object.assign({ label: 'Data used', icon: 'database', sub: '≈ ' + perMin, span: m ? 'span 2' : 'auto' }, bparts(CU)));
        const mm = { icon: 'arrow-up-down', label: 'Min / max', sub: (up ? 'upload' : 'download') + ', run-wide, fully known 1 s cells', value: rn(K.mn) + ' / ' + rs(K.mx), vc: 'var(--fg)' }, idleM = { icon: 'activity', label: 'Idle latency', sub: 'measured at start', value: LATD, vc: 'var(--fg)' };
        const chartBase = { xMax: 2700, xStep: 600, xLabel: t => (t / 60) + 'm', lat: cLat, title: 'Throughput · session', legend: up ? [LG.ur, LG.us, LG.l] : [LG.d, LG.l],
          series: up ? [ser(snd, C.up, true)].concat(segs.map(s => ser(s, C.up))) : [ser(pts, C.down)] };
        const gapNote = up ? ' · unknown cells as gaps' : '';
        // Data-used notices (info): 1 GB, 10 GB, 100 GB, … each step the run passed.
        const DUv = []; for (let x = 1e9; x <= CU; x *= 10) DUv.push(x);
        const DUN = x => N('info', 'database', 'Data used: ' + BG.bytes(x), x === DUv[DUv.length - 1] && !done ? 'This run has passed ' + BG.bytes(x) + '. The next notice appears at ' + BG.bytes(x * 10) + '.' : 'This run passed ' + BG.bytes(x) + '.');
        if (done) {
          const inc = K.ll - IDLE.v, g = gradeOf(inc);
          S = Object.assign({}, common, {
            phases: [ph('lat', 'done', LATD), ph('down', 'done', 'stopped at ' + elS, 100, 'Download · continuous')],
            gauge: { opts: { value: K.av, peak: K.p90 }, note: 'session average', src: pts, c: C.down },
            R: { numeric: true, eyebrow: 'Average', icon: 'arrow-down', ec: C.down, num: rn(K.av), unit: BG.rate(K.av, unit).u, sub: 'peak ' + rn(K.p90) + ' · p90, last hour', oh: OH[0] },
            chart: Object.assign({}, chartBase, { marks: [{ t: EL, label: 'Stopped' }], markColor: 'var(--fg-muted)', meta: elS + ' · stopped by you', noEnd: true }),
            prim: [
              rt('Average', 'arrow-down', C.down, K.av, { sub: 'run-wide, since warm-up ended' }),
              rt('Peak · p90, last hour', 'trending-up', C.down, K.p90, { sub: '1 s cells · max ' + rs(K.mx) }),
              rt('Minimum', 'arrow-down', C.down, K.mn, { sub: 'run-wide, 1 s cells' }),
              msT('Loaded latency', 'activity', K.ll, 'median, last hour'),
              dataT
            ],
            load: load(g, [lrow('down', K.ll, { p90: 27, tail: 'last hour' })], respB(1380, null, true), BG.GRADES[g].text),
            fit: fit(aim(IDLE.v, IDLE.jit, K.av, inc)), fitBasis: 'download only', dl: K.av,
            loadSpan: m ? 'span 2' : 'span 3', fitSpan: m ? 'span 2' : 'span 2',
            meta: [{ icon: 'timer', label: 'Duration', sub: RL ? 'stopped by you · planned ' + rlS : 'stopped by you', value: elS, vc: 'var(--fg)' }, mm, idleM, PL],
            notices: DUv.map(DUN), btn: BTN.again, saved: { iso: '2026-10-12T13:26:40.000Z', label: '', chips: ['LAN', 'Home Wi-Fi', 'Office'] },
            share: { blocks: [{ dir: 'download', bps: K.av }], loaded: { inc: '+' + fms(inc) + ' ms', dir: 'download' } },
            sum: { st: 'done', down: 'Download average ' + sayR(K.av) + ', run-wide minimum ' + sayR(K.mn) + ', maximum ' + sayR(K.mx) + ', peak ' + sayR(K.p90) + ' p90, last hour', up: 'Upload not run', used: BG.bytes(CU) }
          });
        } else S = Object.assign({}, common, {
          phases: [ph('lat', 'done', LATD), ph(up ? 'up' : 'down', 'active', RL ? elS + ' of ' + rlS : elS + ' elapsed', RL ? EL / RL * 100 : 0, dName + ' · continuous')],
          gauge: { opts: { value: K.cur, bandLo: up ? 404e6 : d.lo, bandHi: up ? 433e6 : d.hi, peak: up ? null : K.p90 }, note: up ? 'sending' : 'tick p90, last hour', c: DCc },
          R: { numeric: true, eyebrow: up ? 'Upload · sending' : 'Download', icon: dIcon, ec: DCc, num: rn(K.cur), unit: BG.rate(K.cur, unit).u, sub: 'avg ' + rn(K.av) + ' · peak ' + rn(K.p90), oh: OH[0] },
          chart: Object.assign({}, chartBase, { now: EL, meta: (RL ? elS + ' / ' + rlS : elS + ' elapsed') + gapNote }),
          prim: [
            rt(up ? 'Current · sending' : 'Current', dIcon, DCc, K.cur, Object.assign({ sub: up ? 'client progress, last 0.5 s' : 'last 0.5 s' }, LIVE)),
            rt('Average', dIcon, DCc, K.av, { sub: 'run-wide, since warm-up ended' }),
            rt('Peak · p90, last hour', 'trending-up', DCc, K.p90, { sub: '1 s cells · max ' + rs(K.mx) }),
            msT('Loaded latency', 'activity', K.ll, 'last-minute median'),
            dataT
          ],
          meta: [{ icon: 'timer', label: 'Elapsed', sub: RL ? 'of ' + rlS + ' · ends 16:44' : 'no run length set', value: elS, vc: 'var(--fg)' }, mm, idleM, PL],
          notices: [DUN(DUv[DUv.length - 1])], btn: BTN.stop, cont: true
        });
        S.cont = true;
      } break;
    }

    // ---- loaded latency (screens.md §1, measurement §11): reasons, basis, fallback notices.
    const LLR = { 'no-steady-window': 'no steady window', 'insufficient-samples': 'fewer than 10 samples', 'reservation-broken': 'HTTP/1.1 reservation not held', 'no-probe-path': 'no latency probe' };
    // no-steady-window and no-probe-path never reach a complete run; they are drawn on the stopped run above.
    const GAP = LLSTOP != null ? null : LLR[this.props.llGap];
    if (GAP && S.load && S.load.grade !== '—' && S.load.rows[1] && S.load.rows[1].v != null) {
      // Demo: the upload direction ends without a loaded-latency value; the grade rests on download alone.
      const r0 = S.load.rows[0], di = r0.v - IDLE.v, g = gradeOf(di), gt = BG.GRADES[g].text, inc = '+' + fms(di);
      S.load = Object.assign(load(g, [r0, lrow('up', null, { sub: GAP })], S.load.resp, gt), { basisK: 'download' });
      if (S.fit && S.dl) { S.fit = fit(aim(IDLE.v, IDLE.jit, S.dl, di)); S.fitBasis = 'download only'; }
      if (S.share) S.share = Object.assign({}, S.share, { loaded: { inc: inc + ' ms', dir: 'download' } });
    }
    // wsClose on HTTP/1.1: download was running when the WebSocket closed, so its reservation was not held;
    // upload is measured with the reservation and the grade rests on upload alone.
    // wsH1: before upload starts the strip shows download's 6 streams and no reservation notice.
    const upOn = (S.phases || []).some(x => x.phase === PK.up && (x.state === 'active' || x.state === 'done'));
    const upDone = (S.phases || []).some(x => x.phase === PK.up && x.state === 'done');
    if (wsH1) conn.forEach(c => { if (c.k !== 'Streams' || c.v !== '5') return;
      if (!upOn) { c.v = '6'; c.s = c.s.replace(plateau, plateauD); }
      else if (upDone) { c.v = '6 · 5'; c.s = auto ? 'auto · download 6 · plateau: cap; upload 5 · plateau: HTTP/1.1 probe reservation' : 'fixed · download 6; upload 5'; } });
    if (wsClose && reserved && !S.cont && S.load && S.load.rows[0] && S.load.rows[0].v != null) {
      const ru = S.load.rows[1], rows = [lrow('down', null, { sub: LLR['reservation-broken'] }), ru];
      if (ru && ru.v != null && !ru.live) {
        const di = ru.v - IDLE.v, g = gradeOf(di), gt = BG.GRADES[g].text, inc = '+' + fms(di);
        S.load = Object.assign(load(g, rows, S.load.resp, gt), { basisK: 'upload' });
        if (S.fit && S.dl) S.fit = fit(aim(IDLE.v, IDLE.jit, S.dl, di));
        if (S.share) S.share = Object.assign({}, S.share, { loaded: { inc: inc + ' ms', dir: 'upload' } });
      } else if (S.load.grade !== '—') S.load = load(null, rows, S.load.resp, 'Not graded — no loaded latency');
      else S.load = Object.assign({}, S.load, { rows });
    }
    if (S.load && S.load.grade !== '—') {
      const DO = ' · download only', has = S.load.rows.map(r => r.v != null && !r.live);
      const bk = S.load.basisK || ((S.load.gText || '').endsWith(DO) ? 'download' : has[0] && has[1] ? 'download+upload' : has[1] ? 'upload' : 'download');
      if ((S.load.gText || '').endsWith(DO)) S.load.gText = S.load.gText.slice(0, -DO.length);
      S.load.basisK = bk;
      S.load.basis = { 'download+upload': 'Basis: worse of download and upload', download: 'Basis: download only', upload: 'Basis: upload only' }[bk];
      S.load.inc = Math.max(...S.load.rows.filter(r => r.v != null).map(r => r.v - IDLE.v));
    }
    if (!preRamp && !unreach && st !== 'error-early') {
      const FB = 'WebSocket unavailable — HTTP latency fallback', add = [];
      if (src !== 'WebSocket' && !S.notices.some(n => n.title === FB)) add.push(N('info', 'info', FB, idleSrc === 'WebSocket' ? 'The WebSocket closed after idle latency, so latency under load is measured with HTTP requests; the change vs idle compares the two paths.' : 'The reverse proxy did not accept a WebSocket, so latency is measured with HTTP requests.'));
      if (reserved && (!wsH1 || upOn)) add.push(N('info', 'layers', 'HTTP/1.1 probe reservation active — 5 streams', wsH1 ? 'From the upload on, one HTTP/1.1 connection is kept free for the latency probe, so the upload uses at most 5 streams.' : 'One HTTP/1.1 connection is kept free for the latency probe, so throughput uses at most 5 streams.'));
      S.notices = S.notices.concat(add);
    }
    const tipO = on(this.props.tips) ? '1' : '';
    const kept = this.state.kept ?? on(this.props.kept);
    const label = this.state.label ?? (this.props.label || (S.saved ? S.saved.label : ''));
    const shareOpen = !!S.saved && !!(this.state.share ?? on(this.props.share));
    const A = (text, icon, cls, onClick, after) => ({ text, icon, cls, on: onClick || (() => {}), after: after || null, wrap: '', tip: null, tipO: '' });
    const JSONA = Object.assign(A('Download JSON', 'file-json', 'btn ghost sm'), { wrap: 'has-tip tip-end', tip: 'Contains your IP address and notes', tipO });
    const DET = A('Details', null, 'btn secondary sm', null, 'chevron-right');
    let bar = null;
    // Save-bar time from the result's instant, in the active locale (i18n-a11y.md §1.3).
    const barT = iso => BG.timeEl(iso, 'time');
    if (S.saved) bar = { icon: 'circle-check', ic: 'var(--ok)', title: 'Saved to history', time: barT(S.saved.iso), sub: null, labelled: true, chips: S.saved.chips, actions: [A('Share', 'share-2', 'btn ghost sm', () => this.setState({ share: true })), JSONA, DET] };
    else if (S.partial) {
      const canKeep = S.partial.keep;
      if (canKeep && kept) {
        // Undo lives in the undo toast, not in the bar (save-bar.md).
      bar = { icon: 'circle-check', ic: 'var(--ok)', title: 'Saved as ' + S.partial.kind, time: barT('2026-10-12T12:06:52.000Z'), sub: null, labelled: false, actions: [JSONA, DET] };
        if (S.R.sub && S.R.sub.indexOf('not saved') >= 0) S.R = Object.assign({}, S.R, { sub: S.R.sub.replace('not saved', 'saved as ' + S.partial.kind) });
        if (S.meta && S.meta[0] && S.meta[0].sub === 'not saved') S.meta[0].sub = 'saved as ' + S.partial.kind;
      } else bar = { icon: 'circle-minus', ic: 'var(--fg-subtle)', title: 'Partial results are not saved', time: '', sub: canKeep ? null : 'No phase finished, so there is nothing to keep in history.', labelled: false, actions: canKeep ? [A('Keep in history', 'history', 'btn secondary sm', () => { const kind = S.partial.kind; this.setState({ kept: true }); this._toast({ icon: 'history', t: 'Kept in history as ' + kind + '.', undo: true }); }), JSONA, DET] : [JSONA] };
    }
    const SH = S.share, inc = !!label && !!this.state.inc, dateT = S.saved ? BG.date(S.saved.iso, 'dateTime') : '';
    // Share image props (share-panel.md "Share image layout"): result fields, worded by SharePreview. No foot strings.
    const SJ = { 'WebSocket': 'websocket', 'HTTP/2 probe': 'http-h2', 'HTTP/3 probe': 'http-h3', 'HTTP/1.1 reserved': 'http-h1-reserved' };
    const share = SH ? { blocks: SH.blocks.map(b => b.bps == null ? { dir: b.dir, status: b.status, value: null } : { dir: b.dir, status: b.status, confidence: b.conf || undefined, value: rn(b.bps), unit: BG.rate(b.bps, unit).u }),
      overhead: OH.length ? (parseFloat(this.props.overhead) || 6) : 0, grade: S.load && S.load.grade && S.load.grade !== '—' ? S.load.grade : null, basis: S.load ? S.load.basisK : undefined,
      idle: LATD, jitter: fjit(IDLE.jit) + ' ms', loaded: SH.loaded ? { increase: SH.loaded.inc, dir: SH.loaded.dir, source: SJ[src], idleSource: wsClose ? 'websocket' : undefined } : null,
      head: inc ? label : '', where: SRV, when: dateT } : null;
    // Copied text: the image's lines, from the same props (flows.md §8).
    if (share) share.text = DS.ShareFormat.summary(share).join('\n');
    if (share) share.label = 'Share image: ' + share.text.split('\n').join(', ');
    // Share via… only where the browser can share the PNG file (flows.md §8).
    let canShare = false;
    if (shareOpen) try { canShare = !!(navigator.canShare && navigator.canShare({ files: [new File([new Blob([''], { type: 'image/png' })], 'x.png', { type: 'image/png' })] })); } catch (e) {}
    const R = Object.assign({ numeric: false, textual: false, ec: 'var(--fg-subtle)', up: null, oh: null, faint: null, action: null }, S.R);
    // Gauge props (gauge.md modes × states). Values in bit/s; bytes mode passes B/s.
    const G = S.gauge.opts || {}, div = unit === 'bytes' && G.mode !== 'ms' ? 8 : 1, sc = x => x == null ? undefined : x / div;
    const gState = S.countdown ? 'countdown' : st === 'idle' || st === 'param-ignored' ? 'idle' : st === 'connecting' ? 'connecting' : st === 'offline' ? 'offline' : st === 'error' || st === 'error-early' ? 'error' : R.textual ? 'cancelled' : 'live';
    const gauge = { compact: m, state: gState, mode: G.mode || 'rate', units: unit, value: sc(G.value), bandLo: sc(G.bandLo), bandHi: sc(G.bandHi), peak: sc(G.peak), inner: sc(G.inner), innerLabel: R.up || undefined,
      startDecade: S.gauge.prev && G.mode !== 'ms' ? BG.track(S.gauge.prev, { unit }).k : undefined, color: S.gauge.c || C.down, captionNote: S.gauge.note,
      eyebrow: R.eyebrow, eyebrowIcon: R.icon, readout: R.num, unit: S.countdown ? ['second', 'seconds'] : R.unit, note: R.numeric ? R.sub : undefined, sub: R.oh || undefined,
      title: R.title, message: R.textual ? R.sub : undefined, detail: R.faint || undefined, icon: R.textual ? R.icon : undefined, countdownLeft: 3 * (1 - pv(0.2)) };
    // Chart props (charts.md): the accessible label is a summary of the data, never the static title.
    const latOn = !this.state.latOff;
    const cc = S.chart, bandsOn = (cc.bands || []).some(b => b.t1 > b.t0);
    const chart = { title: cc.title, meta: cc.meta, empty: cc.empty || undefined, markColor: cc.markColor || 'var(--fg-muted)', endDot: !cc.noEnd, units: unit, compact: m,
      // "Latency under load" is the loaded-latency series' toggle: pressed while it (and its right-hand axis) is drawn.
      legend: (cc.legend || []).map(l => Object.assign({ label: l.t, color: l.c, dashed: l.dash === 'dashed', faint: (l.o || 1) < 1 }, l === LG.l ? { pressed: latOn, onToggle: () => this.setState({ latOff: latOn }) } : {})),
      data: { xMax: cc.xMax, yMax: cc.yMax, ms: cc.ms, series: cc.series.map(s => ({ pts: s.pts, color: s.c, faint: s.so < 1 })), lat: latOn ? cc.lat : null, now: cc.now, seps: cc.seps, wins: cc.wins, marks: cc.marks, bands: cc.bands, xStep: cc.xStep, xLabel: cc.xLabel },
      summary: cc.title + (cc.empty ? ': no data yet' : ': ' + [R.numeric ? R.eyebrow + ' ' + R.num + ' ' + R.unit : R.title, cc.meta].filter(Boolean).join(', ')) + (bandsOn ? '; warm-up shaded' : '') + (latOn && cc.lat && cc.lat.length ? '; latency under load on a second scale' : '') + ((cc.marks || []).length ? '; marked: ' + cc.marks.map(x => x.label).join(', ') : '') };
    // MetricTile props (tiles.md).
    const tile = x => ({ label: x.label, icon: x.icon, accent: x.ic, value: x.num === '—' ? undefined : x.num, unit: x.unit, note: x.sub, notes: x.notes, state: x.state || (x.num === '—' || x.num == null ? 'empty' : 'done'), tag: x.state === 'partial' ? x.tag : undefined, compact: m, style: x.span && x.span !== 'auto' ? { gridColumn: x.span } : undefined });
    const DIRK = { 'arrow-down': 'download', 'arrow-up': 'upload' };
    // ended: the run stopped, failed or finished, so a missing grade reads "not graded", not "pending".
    // Loaded latency and its source are computed with the run's result: while the run is in progress no row names a source.
    if (S.load && S.btn && S.btn.role === 'stop') S.load = Object.assign({}, S.load, { rows: S.load.rows.map(r => Object.assign({}, r, { label: r.label.split(' · ')[0] })) });
    const loadP = S.load ? { grade: S.load.grade === '—' ? null : S.load.grade, gradeText: S.load.gText, ended: !!S.partial || (!!S.btn && (S.btn.role === 'again' || S.btn.role === 'retry')), basis: S.load.basis, compact: m, style: { gridColumn: S.loadSpan || L.loadSpan },
      rows: S.load.rows.map(r => ({ dir: DIRK[r.icon], label: r.label, sub: r.sub, value: r.num === '—' ? null : r.num, live: r.nc === 'var(--primary-text)' })),
      responsiveness: { protocol: S.load.resp.proto, note: S.load.resp.note, tag: S.load.resp.tag || undefined, dirs: S.load.resp.dirs.map(d => ({ dir: DIRK[d.icon], value: d.num || null, text: d.text || undefined, uncertain: d.nc === 'var(--fg-muted)' })) } } : null;
    const fitP = S.fit ? { bands: S.fit.map(f => f.rating || null), missing: S.fit.map(f => f.none || '—'), basis: S.fitBasis || undefined, compact: m, style: { gridColumn: S.fitSpan || L.fitSpan } } : null;
    const mcols = S.metaCols ? +((S.metaCols.match(/repeat\((\d+)/) || [0, 1])[1]) : 1;
    const metaP = { title: S.metaTitle || 'Test', compact: m, columns: mcols, style: { gridColumn: S.metaSpan || L.metaSpan },
      rows: S.meta.map(r => r.na ? { icon: r.icon, label: r.label, sub: r.sub, node: 'NM' } : { icon: r.icon, label: r.label, sub: r.sub || undefined, value: r.value }) };
    // Continuous keeps its own sentences and rate.
    const PH = { continuous: 'Continuous download running.', 'cont-upload': 'Continuous upload running.', 'cont-warmup': 'Continuous run stopped during warm-up. Partial results were not saved.', 'cont-done': 'Continuous run stopped. Saved to history.' };
    const phMsg = PH[st] || S.ph || '';
    this._live = { st, key: st + '|' + (S.phKey || ''), ph: phMsg, rate: (st === 'continuous' || st === 'cont-upload') && R.numeric ? R.eyebrow + ' ' + R.num + ' ' + R.unit : S.live ? phMsg : null };
    const SUMST = { done: 'Test complete.', partial: 'Partial result: the test was stopped early.', fail: 'Test failed. The phases that finished before the error are kept.' };
    let sumMsg = '';
    if (S.sum) {
      const nt = S.sum.n || S.notices.map(n => n.title);
      // The loaded-latency increase and the grade follow idle latency (i18n-a11y §2.7).
      const LD = S.load && S.load.grade !== '—' ? ['Bufferbloat grade ' + S.load.grade + ', ' + (S.load.gText || '').toLowerCase() + ', plus ' + sayMs(fms(S.load.inc)) + ' under load.'] : [];
      // Next (i18n-a11y §2.7): HTTP loaded responsiveness per direction with its label, protocol and state (no number
      // where it has none), then each quality-score experience with its band or the inputs it is missing.
      const RR = S.load && S.load.resp, RD = RR ? RR.dirs.filter(x => x.state) : [];
      const RSW = { measured: 'measured', uncertain: 'uncertain', unavailable_h1: 'unavailable, ' + (RR ? RR.note : ''), unavailable_insufficient: 'unavailable, not enough samples' };
      const RP = RD.length ? ['HTTP loaded responsiveness, connection sharing not verifiable, over ' + (RR.proto === 'h2' ? 'HTTP/2' : RR.proto === 'not reported' ? 'a protocol not reported' : RR.proto) + ': '
        + RD.map(x => (x.icon === 'arrow-up' ? 'upload ' : 'download ') + (x.num ? x.num + ' round trips per minute, ' : '') + RSW[x.state]).join('; ') + '.'] : [];
      const QF = S.fit ? S.fit.filter(f => f.rating || (f.none && f.none !== '—')) : [];
      const QS = QF.length ? ['Quality scores' + (S.fitBasis ? ', ' + S.fitBasis : '') + ', an upper bound since packet loss is not measured: ' + QF.map(f => f.label.toLowerCase() + ' ' + (f.rating ? String(f.rating).toLowerCase() : f.none)).join(', ') + '.'] : [];
      sumMsg = [SUMST[S.sum.st], S.sum.down + '.', S.sum.up + '.', 'Idle latency ' + sayMs(fms(IDLE.v)) + ', jitter ' + sayMs(fjit(IDLE.jit)) + '.'].concat(LD, RP, QS, ['Data used ' + sayB(S.sum.used || S.meta[0].value) + '.'])
        .concat(nt.length ? [(nt.length > 1 ? 'Notices: ' : 'Notice: ') + nt.join(', ') + '.'] : []).join(' ');
    }
    const bytesOnly = unit === 'bytes' && !on(this.props.custom);
    return {
      ...base, ready: true, L, SRV, ctx, sel, unreach, pageHost: BG.KIT.host, preset: !unreach,
      ctxOptions: CO.map(([label, icon]) => ({ value: label, label, icon, keepOpen: label === 'Custom…' })),
      onCtx: val => this.setState({ ctxSel: val, ctxOpen: val === 'Custom…' }), ctxOpen: this.state.ctxOpen, setCtxOpen: o => this.setState({ ctxOpen: o }),
      ctxIsCustom: sel === 'Custom…', ctxCustom: this.state.ctxCustom, onCtxCustom: e => this.setState({ ctxCustom: e.target.value }), onCtxKey: e => { if (e.key === 'Enter') this.setState({ ctxOpen: false }); },
      conn, custom,
      customChips: bytesOnly && !this.props.chips ? [{ t: 'Units · MB/s', icon: 'sliders' }] : customChips, customCount: (bytesOnly && !this.props.chips ? 1 : customChips.length) + ' changed:',
      phases: S.phases, gauge, chart, btn: S.btn, notices: S.notices, tiles: S.prim.map(tile), resCols: S.resCols || L.resCols, load: loadP, fit: fitP, meta: metaP,
      bar, shareOpen, share, canShare, label, incLabel: inc, incDis: !label, incNote: label ? '“' + label + '”' : 'no label set',
      toggleInc: e => this.setState({ inc: e.target.checked }), closeShare: () => this.setState({ share: false }), onLabel: e => this.setState({ label: e.target.value }), pickLabel: c => this.setState({ label: c }),
      toast: this.state.toast, dismissToast: () => { clearTimeout(this._tt); this.setState({ toast: null }); },
      undoKeep: () => { this.setState({ kept: false }); this._toast({ icon: 'circle-check', t: 'Removed from history.' }); },
      lastLine: !!S.lastLine, tipO: !!tipO, sumMsg
    };
  }
  render() {
    const v = this.renderVals();
    const variant = cls => /primary/.test(cls) ? 'primary' : /ghost/.test(cls) ? 'ghost' : 'secondary';
    const act = (a, i) => a.href
      ? <DS.Link key={i} href={a.href} external>{a.label}</DS.Link>
      : <DS.Button key={i} size="sm" variant={variant(a.cls || '')} icon={a.icon}>{a.label}</DS.Button>;
    const barAct = (a, i) => { const b = <DS.Button key={i} size="sm" variant={variant(a.cls)} icon={a.icon || undefined} iconAfter={a.after || undefined} onClick={a.on}>{a.text}</DS.Button>;
      return a.tip ? <DS.Tooltip key={i} align="end" open={v.tipO} content={<><span style={{ color: 'var(--warn)', display: 'inline-flex' }}><DS.Icon name="triangle-alert" size={12} stroke={2} /></span>{a.tip}</>}>{b}</DS.Tooltip> : b; };
    const barStatus = b => b.title === 'Saved to history' ? 'saved' : b.title === 'Test complete' ? 'complete' : /^Saved as/.test(b.title) ? 'kept' : 'unsaved';
    return (
      <div style={{ position: "relative", display: "flex", flexDirection: "column", minHeight: "100%" }}>
        {v.navMobile ? <Nav variant="mobile-top" active="test" status={v.srvStatus} /> : null}
        {v.navDesktop ? <Nav variant="top" active="test" status={v.srvStatus} /> : null}
        {v.basePath ? (
          <DS.FullScreenError compact={v.mobile} eyebrow="Base path mismatch" title="The base path doesn't match this URL"
            facts={<DS.MetaList facts rows={[{ label: 'Page path', value: '/speed/' }, { label: 'Server base path', value: '/' }]} />}
            hint={<DS.Card as="section" label="Deployment hint" title="How to fix it" icon="terminal">
              <span className="ds-body-sm">Set server.base_path (BITGAUGE_SERVER__BASE_PATH) to the path prefix the reverse proxy forwards, keep the prefix on forwarded requests instead of stripping it, and restart BitGauge.</span>
            </DS.Card>}
            actions={<><DS.Button variant="primary" icon="refresh-cw">Reload</DS.Button><DS.Button href="#" icon="external-link">Deployment docs</DS.Button></>}>
            BitGauge is configured for / but this page was served at /speed/. Its API answers at a different path, so no test can run from here.
          </DS.FullScreenError>
        ) : null}
        {v.ready ? (
          <main className={"page" + (v.mobile ? " compact" : "")}>
            <h1 className="sr-only">Speed test</h1>
            <DS.LiveRegion message={v.liveMsg} />
            <DS.LiveRegion message={v.sumMsg} />
            {v.unreach ? <DS.Notice tone="danger" icon="server-off" title="Server unreachable" actions={<DS.Button size="sm" variant="secondary" icon="refresh-cw">Retry</DS.Button>}>{'BitGauge could not reach the server at ' + v.pageHost + '. No test can start until it answers.'}</DS.Notice> : null}
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: "var(--space-3) var(--space-6)" }}>
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: "var(--space-2-5) var(--space-6)" }}>
                <DS.Stat label="Context">
                  <DS.Menu label="Context" value={v.ctx.label} icon={v.ctx.icon} hint={v.ctx.suggested ? 'suggested' : undefined} options={v.ctxOptions} selected={v.sel}
                    onSelect={v.onCtx} open={v.ctxOpen} onOpenChange={v.setCtxOpen}
                    footer={v.ctxIsCustom ? <DS.Input size="sm" aria-label="Custom context" value={v.ctxCustom} placeholder="e.g. Hotel Wi-Fi" onChange={v.onCtxCustom} onKeyDown={v.onCtxKey} /> : null} />
                </DS.Stat>
                {v.conn.map(c => <DS.Stat key={c.k} label={c.k} value={c.v} sub={c.s} />)}
              </div>
              {v.preset ? <div style={{ marginLeft: "auto", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "var(--space-1-5)" }}>
                {v.custom ? <><span className="ds-caption">{v.customCount}</span>{v.customChips.map(ch => <DS.Chip key={ch.t} size="sm" changed icon={ch.icon}>{ch.t}</DS.Chip>)}</> : <span className="ds-caption">Standard preset · Auto streams · No data cap</span>}
                <DS.Link icon="sliders" href="#" aria-label="Edit settings">Edit</DS.Link>
              </div> : null}
            </div>
            {v.notices.map((n, i) => <DS.Notice key={i} tone={n.tone} icon={n.icon} title={n.title} actions={n.actions.length ? n.actions.map(act) : null}>{n.body}</DS.Notice>)}
            <DS.Card as="section" label="Speed test" padded={false}>
              <div style={{ padding: v.L.stepPad, borderBottom: "1px solid var(--border-subtle)" }}><DS.PhaseIndicator steps={v.phases} compact={v.mobile} /></div>
              <div style={{ display: "grid", gridTemplateColumns: v.L.instCols }}>
                <div style={{ padding: v.L.gPad, display: "flex", flexDirection: "column", alignItems: "center", gap: "var(--space-3-5)" }}>
                  <DS.Gauge {...v.gauge} action={v.gauge.state === 'offline' ? <DS.Button size="sm" icon="refresh-cw">Retry</DS.Button> : null} />
                  <DS.StartButton role={v.btn.role} compact={v.mobile} disabledReason={v.btn.dis ? v.btn.tip : undefined} />
                </div>
                <div style={{ minWidth: 0, padding: v.L.cPad, borderLeft: v.L.bl, borderTop: v.L.bt }}><DS.Chart {...v.chart} /></div>
              </div>
            </DS.Card>
            {v.bar ? <DS.SaveBar status={barStatus(v.bar)} title={v.bar.title} time={v.bar.time} message={v.bar.sub}
              label={v.bar.labelled ? { value: v.label, onChange: v.onLabel, suggestions: v.bar.chips, onSuggest: v.pickLabel } : undefined}
              actions={v.bar.actions.map(barAct)} /> : null}
            <section aria-label="Results" style={{ display: "grid", gridTemplateColumns: v.resCols, gap: v.L.tileGap }}>
              {v.tiles.map((t, i) => <DS.MetricTile key={i} {...t} />)}
              {v.load ? <DS.LoadCard {...v.load} /> : null}
              {v.fit ? <DS.QualityList {...v.fit} /> : null}
              <DS.MetaList {...v.meta} rows={v.meta.rows.map(r => r.node === 'NM' ? Object.assign({}, r, { node: <DS.NotMeasured link={false} />, sub: <React.Fragment>{r.sub}<DS.NotMeasuredWhy /></React.Fragment> }) : r)} />
            </section>
            {v.lastLine ? <DS.LastResult when="2 h ago" values="↓ 612 · ↑ 438 Mbit/s · 3.1 ms" label="Home Wi-Fi" /> : null}
          </main>
        ) : null}
        {v.toast ? <DS.ToastRegion aboveTabBar={v.navMobile}><DS.Toast tone="info" icon={v.toast.icon} title={v.toast.t} onDismiss={v.dismissToast}
          action={v.toast.undo ? <DS.Button size="sm" icon="undo-2" onClick={v.undoKeep}>Undo</DS.Button> : null} /></DS.ToastRegion> : null}
        {v.navMobile ? <div style={{ marginTop: "auto", height: "64px", flex: "none" }}><div style={{ position: "fixed", left: "0", right: "0", bottom: "0", zIndex: "var(--z-nav)" }}><Nav variant="mobile-bottom" active="test" status={v.srvStatus} /></div></div> : null}
        {v.shareOpen ? (
          <DS.Dialog wide icon="share-2" title="Share result" onClose={v.closeShare} align={v.mobile ? 'top' : 'center'} footerStack={v.mobile}
            body={<>
              <DS.Card as="section" headingLevel={3} title="Share image" icon="image" actions={<span className="ds-mono-sm">1200 × 630 PNG</span>}>
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
                  <DS.SharePreview {...v.share} />
                  <label style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", fontSize: "var(--text-sm)", color: v.incDis ? "var(--fg-subtle)" : "var(--fg)", cursor: "pointer" }}>
                    <input type="checkbox" checked={v.incLabel} disabled={v.incDis} onChange={v.toggleInc} style={{ accentColor: "var(--primary)" }} />
                    Include label <span className="ds-mono-sm">{v.incNote}</span>
                  </label>
                </div>
              </DS.Card>
              <DS.Card as="section" headingLevel={3} title="Text summary" icon="file-text"><DS.Snippet lines={v.share.text.split('\n')} /></DS.Card>
            </>}
            footer={<>
              {v.canShare ? <DS.Button variant="ghost" icon="share" title="Opens the system share sheet. Shown only when the browser supports it.">Share via…</DS.Button> : null}
              <DS.Button icon="copy">Copy summary</DS.Button>
              <DS.Button variant="primary" icon="download">Download image</DS.Button>
            </>}>
            Speeds and latency only. Your IP address and notes are never included.
          </DS.Dialog>
        ) : null}
      </div>
    );
  }
}

window.TestScreen = TestScreen;
