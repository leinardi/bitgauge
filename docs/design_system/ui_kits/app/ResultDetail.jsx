/* BitGauge web UI kit — ResultDetail
 * Props:
 *   mobile: boolean  (default false)
 *   state: "result" | "not-found" | "history-unavailable" | "not-saved-partial" | "not-saved-missing"  (default "result") —
 *     the last three are not saved (screens.md §2): history unavailable, a partial result not kept, or the in-memory result
 *     missing from this browser's history
 *   kind: "standard" | "continuous"  (default "standard")
 *   tableView: boolean  (default false)
 *   includeLabel: boolean  (default false)
 *   demo: "none" | "deleted" | "clipboard-denied"  (default "none")
 *   overhead: "0" | "6" | "5.13" | "3.69" | "8.1"  (default "0") — overhead compensation preset (§9.3)
 *   browser: "Firefox" | "Chrome" | "Safari" | "Edge"  (default "Firefox") — browser family of the run
 *   uploadPauses: boolean  (default false) — the engine saw the browser pause between upload requests (idle share > 20 %)
 *   llGap: "none" | "no-steady-window" | "insufficient-samples" | "reservation-broken" | "no-probe-path"  (default "none") —
 *     the upload direction's loaded latency has no value for this reason (Standard only)
 *   probe: "auto" | "WebSocket" | "HTTP/2 probe" | "HTTP/3 probe" | "HTTP/1.1 reserved"  (default "auto") — one path for idle and loaded latency
 *   confDown, confUp: "normal" | "low:ramp-unsettled" | "low:unstable" | "low:ramp-unsettled,unstable" | "low:insufficient-samples,unstable" |
 *     "cpu-bound"  (default "normal") — each direction's confidence (measurement §16); confUp is ignored without an upload
 *   wsClose: boolean  (default false) — the WebSocket closed after idle latency: idle stays WebSocket, loaded over the HTTP
 *     source from `probe`; on HTTP/1.1 download (running at the close) is unavailable, reason reservation-broken (Standard only)
 *   resp: "ok" | "uncertain" | "needs-h2" | "not-reported" | "few-samples"  (default "ok") — responsiveness state:
 *     measured, uncertain, unavailable_h1 (HTTP/1.1 at the proxy / protocol not reported), unavailable_insufficient (upload)
 *   contLen: "2h" | "9d"  (default "2h") — Continuous only: a 2 h run with a run length, or a 9-day run without one,
 *     of which only the last 7 days were saved (measurement §15)
 */
class ResultDetail extends React.Component {
  state = { views: null, inc: null, clipDenied: null, toast: null, del: null, delN: 8, paramsOpen: false, note: null };
  preRef = React.createRef();
  componentDidMount() { this._sel(); }
  componentDidUpdate() { this._sel(); }
  componentWillUnmount() { clearTimeout(this._tt); clearInterval(this._di); }
  on(v) { return !!v && v !== 'false'; }
  denied() { return this.state.clipDenied ?? (this.props.demo === 'clipboard-denied'); }
  // Clipboard fallback: select the summary text so the user can copy it by hand.
  _sel() {
    const el = this.preRef.current;
    if (!this.denied()) { this._selDone = false; return; }
    if (el && !this._selDone) { this._selDone = true; try { const r = document.createRange(); r.selectNodeContents(el); const s = window.getSelection(); s.removeAllRanges(); s.addRange(r); } catch (e) {} }
  }
  toast(t) { clearTimeout(this._tt); this.setState({ toast: t }); this._tt = setTimeout(() => this.setState({ toast: null }), 4000); }
  renderVals() {
    const BG = window.BG, on = v => this.on(v);
    const m = on(this.props.mobile), tv = on(this.props.tableView);
    const UNS = { 'history-unavailable': 'History unavailable · nothing is saved in this window', 'not-saved-partial': 'Partial results are not saved', 'not-saved-missing': "This result isn't in this browser's history" }, cont = this.props.kind === 'continuous';
    // Loaded latency without a value (measurement §11): reason → [JSON source, label source, samples].
    const LLR = { 'no-steady-window': 'no steady window', 'insufficient-samples': 'fewer than 10 samples', 'reservation-broken': 'HTTP/1.1 reservation not held', 'no-probe-path': 'no latency probe' };
    const UPSRC = { 'no-steady-window': ['websocket', 'WebSocket', 0], 'insufficient-samples': ['http-h2', 'HTTP/2 probe', 7], 'reservation-broken': ['http-h1-reserved', 'HTTP/1.1 reserved', 24], 'no-probe-path': ['none', null, 0] };
    // Latency path (measurement §10, §11): one probe path for idle and loaded latency; wsClose = the WebSocket closed
    // after idle latency, so idle stays WebSocket and loaded samples come over HTTP.
    const SJ = { 'WebSocket': 'websocket', 'HTTP/2 probe': 'http-h2', 'HTTP/3 probe': 'http-h3', 'HTTP/1.1 reserved': 'http-h1-reserved' };
    const PRB = this.props.probe, httpSrc = PRB && PRB !== 'auto' && PRB !== 'WebSocket' ? PRB : 'HTTP/2 probe';
    const wsClose = !!this.props.wsClose;
    const src = wsClose ? httpSrc : (SJ[PRB] ? PRB : 'WebSocket'), idleSrc = wsClose ? 'WebSocket' : src;
    const dnGap = wsClose && !cont && src === 'HTTP/1.1 reserved' ? 'reservation-broken' : null;
    // not-saved-partial: only a partial result is "not saved" for that reason (screens.md §2), so it draws the run stopped
    // in the upload (no-steady-window) unless another stopped-run gap is chosen.
    const partSt = this.props.state === 'not-saved-partial', llG = this.props.llGap;
    const gapK = cont || dnGap ? null : partSt && !['no-steady-window', 'no-probe-path'].includes(llG) ? 'no-steady-window' : LLR[llG] ? llG : null;
    // A complete result always has a steady window in each direction and no direction as short as the WebSocket's close
    // sequence (measurement §11.1, §11.4): these two reasons come from the run stopped in the upload, partial and not saved,
    // the same run as the Test screen. no-probe-path: the WebSocket closed 9.7 s into the download, its reopening never answered.
    const USTOP = { 'no-steady-window': 3.1, 'no-probe-path': 0.8 }[gapK] ?? null, stop = USTOP != null, npp = gapK === 'no-probe-path', WSL = 9.7;
    const st0 = this.props.state || 'result', st = stop && st0 === 'result' ? 'not-saved-partial' : st0, hu = !!UNS[st], histOff = st === 'history-unavailable';
    const gapSrc = k => k === 'no-probe-path' ? null : k === 'reservation-broken' ? 'HTTP/1.1 reserved' : src;
    // HTTP/1.1 probe reservation (measurement §4, §11.2): stream cap 5 while it is held. Closed-after-idle: it starts with
    // the next direction (upload), so download keeps 6.
    const resv = src === 'HTTP/1.1 reserved';
    const STR = { down: resv && !wsClose ? 5 : 6, up: resv ? 5 : 6 }, rsvOn = cont ? STR.down === 5 : STR.down === 5 || STR.up === 5;
    const pl = n => 'plateau: ' + (n === 5 ? 'HTTP/1.1 probe reservation' : 'cap');
    const vsIdle = ' ms vs idle' + (idleSrc !== src ? ' over ' + idleSrc : '');
    const delSt = this.state.del ?? (this.props.demo === 'deleted' ? 'pending' : 'none');
    const notFound = st === 'not-found' || delSt !== 'none';
    const inc = this.state.inc ?? on(this.props.includeLabel);
    const denied = this.denied();
    const L = m ? { pad: 'var(--space-3-5) var(--space-4) var(--space-6)', h1: 'var(--text-3xl)', cols: 'minmax(0,1fr)', tileCols: 'repeat(2, minmax(0,1fr))', tileGap: 'var(--space-2-5)', tileNum: '24px', midCols: 'minmax(0,1fr)', chartCols: 'minmax(0,1fr)', confCols: 'minmax(0,1fr)', nfMargin: '40px auto' }
      : { pad: 'var(--space-5) var(--space-10) var(--space-12)', h1: 'var(--text-4xl)', cols: 'minmax(0,1fr) 352px', tileCols: 'repeat(4, minmax(0,1fr))', tileGap: 'var(--space-3)', tileNum: '28px', midCols: 'minmax(0,1.4fr) minmax(0,1fr)', chartCols: 'repeat(2, minmax(0,1fr))', confCols: 'minmax(0,1fr)', nfMargin: '96px auto' };

    // DS.Format (via fixtures.js): 3 significant digits with an auto-scaled unit; latency/jitter one decimal below 10 ms.
    const BGF = window.BG || { rate: v => ({ n: String(Math.round(v / 1e6)), u: 'Mbit/s' }), rateStr: v => Math.round(v / 1e6) + ' Mbit/s', jit: v => v < 9.95 ? v.toFixed(1) : String(Math.round(v)), ms: v => v < 9.95 ? v.toFixed(1) : String(Math.round(v)) };
    const rn = v => v == null ? '—' : BGF.rate(v, 'bits').n, ru = v => v == null ? '' : BGF.rate(v, 'bits').u, rs = v => v == null ? '—' : BGF.rateStr(v, 'bits');
    const jit = v => BGF.jit(v);
    const med = a => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y), h = s.length >> 1; return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2; };
    const mmss = s => Math.floor(s / 60) + ':' + String(Math.round(s % 60)).padStart(2, '0');
    const T = { ok: 'var(--ok)', warn: 'var(--warn)', danger: 'var(--danger)', info: 'var(--info)', neutral: 'var(--fg-subtle)' };
    const it = (tone, icon, title, body, link) => ({ c: T[tone], icon, title, body, link: link || null });
    const BRW = { Chrome: { name: 'Chrome', major: 130, os: 'Linux' }, Safari: { name: 'Safari', major: 18, os: 'macOS' }, Edge: { name: 'Edge', major: 130, os: 'Windows' } }[this.props.browser] || { name: 'Firefox', major: 131, os: 'Linux' }, PAUSES = on(this.props.uploadPauses);

    // Overhead compensation (§9.3): 0 % in the example. A preset multiplies every rate and is named next to each one.
    const OHP = parseFloat(this.props.overhead) || 0, OHF = 1 + OHP / 100, OH = OHP ? '+' + OHP + ' % overhead compensation' : '';
    const ohs = s => OH ? s + ' · ' + OH : s;
    const GT = { 'A+': ['ok', 'Minimal'], A: ['ok', 'Low'], B: ['ok', 'Mild'], C: ['warn', 'Moderate'], D: ['warn', 'High'], F: ['danger', 'Severe'] };
    const gradeOf = inc => inc < 5 ? 'A+' : inc < 30 ? 'A' : inc < 60 ? 'B' : inc < 200 ? 'C' : inc < 400 ? 'D' : 'F';
    const hms = s => { s = Math.round(s); return Math.floor(s / 3600) + ':' + String(Math.floor(s % 3600 / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };

    // Continuous: a 2 h download run with a 2 h run length, longer than 1 h, so stored in 1 min cells (day tier); or
    // (contLen 9d) a 9-day run without a run length, longer than the long ring, so only its last 7 days were saved in
    // 10 min cells. Auto warm-up ends at ≈ 6.5 s (6-stream ramp, plateau cap). Download cells are always known.
    const LONG = cont && this.props.contLen === '9d';
    const CWU = 6.5, CEND = LONG ? 9 * 86400 + 4 * 3600 + 12 * 60 : 7200, CS = LONG ? 600 : 60, C0 = LONG ? CEND - 7 * 86400 : CWU, cells = [];
    for (let i = 0; C0 + CS * i < CEND; i++) {
      const a = C0 + CS * i, b = Math.min(a + CS, CEND);
      cells.push({ a, b, known: b - a, v: OHF * (412e6 + 26e6 * Math.sin(i * 0.7) + 11e6 * Math.cos(i * 2.3) - (i >= 40 && i <= 52 ? 31e6 : 0)), l: 17 + 3.5 * Math.sin(i * 1.3) + (i % 5) * 0.5 });
    }
    // Run-wide statistics (§15) are running aggregates over every fully known 1 s cell since the steady start, in constant
    // memory: on the 9-day run they cover all of it, including the first 2 d 4 h whose cells were not saved (slower, with an
    // evening dip to ≈ 236 Mbit/s). Only the saved series is cut to the last 7 days. The unsaved stretch is modeled here in
    // 10 min steps (the aggregates themselves are exact sums over 1 s cells in the engine).
    const pre = [];
    if (LONG) for (let t = CWU, i = 0; t < C0 - 1e-6; t += 600, i++) {
      const b = Math.min(t + 600, C0);
      pre.push({ a: t, b, known: b - t, v: OHF * (378e6 + 22e6 * Math.sin(i * 0.9) + 9e6 * Math.cos(i * 1.7) - (i >= 110 && i <= 128 ? 128e6 : 0)) });
    }
    const runCells = pre.concat(cells);
    const cKnown = runCells.reduce((s, c) => s + c.known, 0), cAvg = runCells.reduce((s, c) => s + c.v * c.known, 0) / cKnown;
    // The run's 1 s cells (hour tier while it ran): "p90, last hour" is the p90 of the last 3600 of them; the run max is
    // a running aggregate over all of them. Only the stored cells are saved. A long run keeps 1 s cells for its last hour only.
    if (!this._sec || this._secF !== OHF || this._secL !== LONG) {
      let sd = 7; const rnd = () => (sd = (sd * 16807) % 2147483647) / 2147483647, sec = [];
      cells.forEach(c => { if (LONG && c.b <= CEND - 3600) return; for (let t = c.a; t < c.b - 1e-6; t++) sec.push([t, c.v * (1 + 0.07 * (rnd() - 0.5) + 0.02 * Math.sin(t * 0.9))]); });
      this._sec = sec; this._secF = OHF; this._secL = LONG;
    }
    const lastHr = this._sec.filter(q => q[0] >= CEND - 3600).map(q => q[1]).sort((x, y) => x - y), cP90 = lastHr[Math.floor(0.9 * (lastHr.length - 1))];
    // Run-wide running aggregates over the 1 s cells (§15); saved as minBitsPerSecond / maxBitsPerSecond (§17).
    const CAGG0 = this._sec.reduce((a, q) => ({ min: Math.min(a.min, q[1]), max: Math.max(a.max, q[1]) }), { min: Infinity, max: 0 });
    // 9 days: min / max over the whole run's 1 s cells; each coarse step spreads ≈ −6 % / +3.5 % at 1 s resolution.
    const CAGG = LONG ? { min: Math.min(CAGG0.min, Math.min(...runCells.map(c => c.v)) * 0.94), max: Math.max(CAGG0.max, Math.max(...runCells.map(c => c.v)) * 1.035) } : CAGG0;
    const cMax = CAGG.max, cMin = CAGG.min;
    const fmtB = b => BG ? BG.bytes(b) : Math.round(b / 1e9) + ' GB';
    const cUsedB = Math.round(cAvg / OHF * CEND / 8), cUsed = fmtB(cUsedB);
    const dhm = s => (s >= 86400 ? Math.floor(s / 86400) + ' d ' : '') + Math.floor(s % 86400 / 3600) + ' h' + (s % 3600 >= 60 ? ' ' + Math.floor(s % 3600 / 60) + ' min' : '');
    // data-used notices (§16): 1 GB, 10 GB, 100 GB and every further tenfold step the run passed, each kept in the result.
    const DU = []; for (let v = 1e9; v <= cUsedB; v *= 10) DU.push(v);
    // Standard run on the fast LAN: the same curves as the Test screen, so data used = 737 MB down + 855 MB up
    // (upload sends for ≈ 16 s: until its 15 s minimum, then the last in-flight requests).
    const SUSED = { down: 736700000, up: stop ? (BG ? BG.usedBytes(BG.thr(7, 431e6, USTOP)) : 0) : 854549086 }, sUsed = (SUSED.down + SUSED.up) / 1e9;

    const D = cont ? {
      label: LONG ? 'Week-long soak' : 'Overnight check', ctx: 'LAN', ctxIcon: 'house', iso: '2026-10-07T23:00:04.000Z', file: 'bitgauge-2026-10-08-0100',
      preset: 'Continuous', server: 'Basement NAS', note: LONG ? 'Left running while away, to catch any drop over the week.' : 'Checking whether the evening dip comes back after midnight.', down: cAvg, up: null
    } : {
      label: 'Home Wi-Fi', ctx: 'LAN', ctxIcon: 'house', iso: '2026-10-08T12:02:11.000Z', file: 'bitgauge-2026-10-08-1402',
      preset: 'Standard', server: 'Basement NAS', note: 'Office desk, 5 GHz. Router is in the hallway, one wall between.', down: 612e6 * OHF, up: stop ? null : 438e6 * OHF
    };
    // Dates from the instant (i18n-a11y.md §1.3): header date + time medium, its tooltip full + long (with zone),
    // breadcrumb and share line / text summary date medium + time short.
    { const fd = k => window.BG ? window.BG.date(D.iso, k) : D.iso; Object.assign(D, { when: fd('dateTimeSec'), abs: fd('abs'), crumb: fd('dateTime'), short: fd('dateTime') }); }
    const IDLE = 3.1, JIT = 0.8, r1 = v => Math.round(v * 10) / 10;
    // Loaded latency (median, p90) per direction. Increase = median − idle; the grade uses the worse one, and
    // loadedLatency.increaseMs and bufferbloat.increaseMs in the JSON hold the same value.
    const LL = { down: dnGap ? null : [18, 24], up: cont || gapK ? null : [42, 55] }, INC = { down: LL.down ? r1(LL.down[0] - IDLE) : null, up: LL.up ? r1(LL.up[0] - IDLE) : null };
    D.worst = INC.down == null || (INC.up != null && INC.up > INC.down) ? ['upload', INC.up] : ['download', INC.down];
    const basisK = INC.up != null && INC.down != null ? 'download+upload' : INC.down == null ? 'upload' : 'download';
    const grade = gradeOf(D.worst[1]), gT = GT[grade], gradeWords = gT[1] + ' bufferbloat';
    const gradeBasis = basisK === 'download+upload' ? 'Basis: worse of download and upload — upload +' + jit(INC.up) + ' ms (download +' + jit(INC.down) + ' ms)'
      : basisK === 'upload' ? 'Basis: upload only — +' + jit(INC.up) + ' ms vs idle; download: ' + LLR[dnGap]
      : 'Basis: download only — +' + jit(INC.down) + ' ms vs idle' + (cont ? '; upload not run · Continuous runs one direction' : '; upload: ' + LLR[gapK]);
    // Each number carries its qualifiers (flows.md §8): a loaded-latency source other than the WebSocket is named.
    const worstQ = D.worst[0] + (src !== 'WebSocket' ? ', ' + src : '');
    const worstStr = '+' + jit(D.worst[1]) + ' ms loaded (' + worstQ + ')';
    // Confidence per direction (measurement §16): normal | low with reasons | cpu-bound. Continuous has no upload.
    // confDown / confUp: "normal" | "low:<reason>[,<reason>]" | "cpu-bound" (reasons: ramp-unsettled, insufficient-samples, unstable).
    const pconf = v => !v || v === 'normal' ? { level: 'normal', reasons: [] } : v === 'cpu-bound' ? { level: 'cpu-bound', reasons: [] } : { level: 'low', reasons: v.replace(/^low:?/, '').split(',').map(s => s.trim()).filter(Boolean) };
    const DC = { down: Object.assign(pconf(this.props.confDown), { wu: 6.5, win: cont ? hms(CEND - CWU) : '3.5 s' }), up: cont || stop ? null : Object.assign(pconf(this.props.confUp), { wu: 9.5, win: '6.5 s' }) };
    const RSN = { 'ramp-unsettled': ['ramp unsettled', 'the stream ramp was still adding streams when warm-up ended'], 'insufficient-samples': ['insufficient samples', 'too few requests had confirmed when warm-up ended'], 'unstable': ['unstable', 'the steady window stayed unstable'] };
    const confQ = k => { const c = DC[k]; return !c || c.level === 'normal' ? '' : c.level === 'cpu-bound' ? 'limited by this device’s CPU' : 'low confidence: ' + c.reasons.map(r => RSN[r][0]).join(', '); };
    const withQ = (k, s) => confQ(k) ? s + ' (' + confQ(k) + ')' : s;

    // Share image props (share-panel.md "Share image layout"); the copied text is built from the same props (flows.md §8).
    const shareP = {
      blocks: [{ dir: 'download', value: rn(D.down), unit: ru(D.down), confidence: DC.down }].concat(cont ? [] : [stop ? { dir: 'upload', status: 'insufficient-data', value: null } : { dir: 'upload', value: rn(D.up), unit: ru(D.up), confidence: DC.up }]),
      overhead: OHP, grade, basis: basisK, idle: BGF.ms(IDLE) + ' ms', jitter: jit(JIT) + ' ms',
      loaded: { increase: '+' + jit(D.worst[1]) + ' ms', dir: D.worst[0], source: SJ[src], idleSource: wsClose ? 'websocket' : undefined }, where: D.server, when: D.short
    };
    const summary = window.DS.ShareFormat.summary(Object.assign({}, shareP, { head: inc ? D.label : '' })).join('\n');

    // Quality scores: the same AIM function as the Test screen (fixtures.js). Standard: Good/Good/Good (55/25/35 points);
    // Continuous (download +15 ms): Great/Great/Great (60/30/40).
    const SC = BG ? BG.aim(IDLE, JIT, D.down / OHF, D.worst[1]) : null;
    const tiles = [
      { label: cont ? 'Download · average' : 'Download', icon: 'arrow-down', ic: 'var(--series-download)', num: rn(D.down), unit: ru(D.down), nc: 'var(--fg)', sub: ohs(cont ? 'run-wide min ' + rn(cMin) + ' · max ' + rn(cMax) + ' · peak ' + rn(cP90) + ' · p90, last hour, 1 s cells · ' + STR.down + ' streams · ' + pl(STR.down) : 'peak ' + rn(641e6 * OHF) + ' · ' + STR.down + ' streams · ' + pl(STR.down)) },
      cont ? { label: 'Upload', icon: 'arrow-up', ic: 'var(--series-upload)', num: '—', unit: '', nc: 'var(--fg-subtle)', state: 'skipped', sub: 'not run · Continuous runs one direction' }
        : stop ? { label: 'Upload', icon: 'arrow-up', ic: 'var(--series-upload)', num: '—', unit: '', nc: 'var(--fg-subtle)', sub: 'insufficient data · stopped at ' + USTOP.toFixed(1) + ' s, in warm-up' + (BG ? ' · ' + BG.bytes(SUSED.up) + ' used' : '') }
        : { label: 'Upload', icon: 'arrow-up', ic: 'var(--series-upload)', num: rn(D.up), unit: ru(D.up), nc: 'var(--fg)', sub: ohs('peak ' + rn(455e6 * OHF) + ' · ' + STR.up + ' streams · ' + pl(STR.up)) },
      { label: 'Idle latency', icon: 'activity', ic: 'var(--series-latency)', num: BGF.ms(IDLE), unit: 'ms', nc: 'var(--fg)', sub: 'min 2.4 · p90 4.1 ms · ' + idleSrc + ' · 0.0 % probe timeouts' },
      { label: 'Jitter', icon: 'activity', ic: 'var(--series-latency)', num: jit(JIT), unit: 'ms', nc: 'var(--fg)', sub: 'mean of consecutive differences' }
    ];
    const loadRows = [dnGap ? { icon: 'arrow-down', ic: 'var(--primary-text)', label: 'During download · ' + gapSrc(dnGap), sub: LLR[dnGap], num: '—', unit: '' }
      : { icon: 'arrow-down', ic: 'var(--primary-text)', label: 'During download · ' + src, sub: 'p90 24 · +15' + vsIdle + (cont ? ' · last hour' : ''), num: '18', unit: 'ms' }];
    if (!cont) loadRows.push(gapK ? { icon: 'arrow-up', ic: 'var(--series-upload)', label: 'During upload' + (gapSrc(gapK) ? ' · ' + gapSrc(gapK) : ''), sub: LLR[gapK], num: '—', unit: '' }
      : { icon: 'arrow-up', ic: 'var(--series-upload)', label: 'During upload · ' + src, sub: 'p90 55 · +39' + vsIdle, num: '42', unit: 'ms' });
    // HTTP loaded responsiveness (measurement §12.4–12.6, screens.md §6): one state per direction; no number where it has
    // none. TM95 over the last 4 s (≈ 13 samples at 300 ms): fewer than 20, so nothing is trimmed and TM95 is the plain mean.
    const RS = this.props.resp || 'ok', H1 = RS === 'needs-h2' || RS === 'not-reported';
    const RPMV = { down: 1420, up: 980 }, RN = 13, q02 = v => Math.round(v / 0.02) * 0.02;
    const respOf = k => {
      if (H1) return { k, state: 'unavailable_h1', samples: 0 };
      if (RS === 'few-samples' && k === 'up') return { k, state: 'unavailable_insufficient', samples: 3 };
      const tm = q02(60000 / RPMV[k]);
      return { k, state: RS === 'uncertain' ? 'uncertain' : 'measured', samples: RN, tm95: tm, rpm: Math.round(60000 / tm), trimmed: Math.floor(0.05 * RN), med: q02(tm * 1.08) };
    };
    const RESP = (cont ? ['down'] : ['down', 'up']).map(respOf);
    const respP = {
      protocol: RS === 'needs-h2' ? 'HTTP/1.1' : RS === 'not-reported' ? 'not reported' : 'HTTP/2',
      note: RS === 'needs-h2' ? 'needs HTTP/2 or HTTP/3 at the reverse proxy' : RS === 'not-reported' ? 'protocol not reported — treated as HTTP/1.1' : RS === 'uncertain' ? 'round trips per minute · uncertain' : cont ? 'round trips per minute, download only' : 'round trips per minute, one per direction',
      tag: RS === 'uncertain' ? 'Uncertain' : undefined,
      dirs: RESP.map(r => ({ dir: r.k === 'up' ? 'upload' : 'download', value: r.rpm != null ? r.rpm.toLocaleString('en-US') : null, uncertain: r.state === 'uncertain',
        text: r.state === 'unavailable_insufficient' ? 'not enough samples' : r.state === 'unavailable_h1' ? 'unavailable' : undefined,
        detail: r.rpm != null ? 'TM95 ' + r.tm95.toFixed(1) + ' ms · ' + r.samples + ' samples' + (r.trimmed === 0 ? ' · TM95 equals the plain mean' : ' · ' + r.trimmed + ' trimmed') : undefined }))
    };
    const respJ = k => { const r = RESP.find(x => x.k === k) || respOf(k); return Object.assign({ state: r.state, protocol: RS === 'needs-h2' ? 'http/1.1' : RS === 'not-reported' ? '' : 'h2', samples: cont && r.rpm != null ? 23950 : r.samples }, r.rpm != null ? { rpm: r.rpm, tm95Ms: Math.round(r.tm95 * 100) / 100, trimmed: r.trimmed, totalMedianMs: Math.round(r.med * 100) / 100 } : {}); };

    // Confidence levels (§16): normal | low (ramp-unsettled, unstable, insufficient-samples) | cpu-bound.
    const lvls = [DC.down, DC.up].filter(Boolean).map(c => c.level);
    const conf = lvls.includes('cpu-bound') ? { label: 'Confidence: CPU-bound', tone: 'warn' } : lvls.includes('low') ? { label: 'Confidence: low', tone: 'warn' } : { label: 'Confidence: normal', tone: 'ok' };
    const confLine = k => {
      const c = DC[k], dn = k === 'down' ? 'Download' : 'Upload', wu = 'Warm-up ended at ' + c.wu + ' s';
      if (c.level === 'cpu-bound') return it('warn', 'cpu', dn + ' confidence: limited by this device’s CPU', 'The test worker was busy more than 90 % of the steady window, so the number is the browser’s limit, not the link’s.');
      if (c.level === 'low') return it('warn', 'triangle-alert', dn + ' confidence: low — ' + c.reasons.map(r => RSN[r][0]).join(', '), wu + '; ' + c.reasons.map(r => RSN[r][1]).join('; ') + '.');
      return it('ok', 'circle-check', dn + ' confidence: normal', wu + ' and the steady window covered ' + c.win + '.');
    };
    // "Connection sharing not verifiable" is part of the responsiveness label (LoadCard), never a notice (screens.md §6).
    // Browser upload limit: any browser that paused between upload requests; always Firefox at ≥ 100 Mbit/s upload.
    const BUL = !cont && (PAUSES || (BRW.name === 'Firefox' && D.up >= 100e6));
    const N_BUL = BUL ? [it('info', 'globe', BRW.name + ' may limit the upload', 'On fast links ' + BRW.name + '’s own upload path, not the network, can bound the upload number; the measurement is the server’s and stands. Compare with another browser on this device to tell the two apart.', { label: 'Known browser limits', href: '#' })] : [];
    const N_OH = OH ? [it('neutral', 'sliders', OH, 'Throughput is multiplied by ' + OHF.toFixed(OHP % 1 ? 4 : 2).replace(/0+$/, '') + '. The uncompensated values are kept in the JSON.')] : [];
    // Same notice and sentences as the Test screen.
    const N_FB = src !== 'WebSocket' ? [it('info', 'info', 'WebSocket unavailable — HTTP latency fallback', wsClose ? 'The WebSocket closed after idle latency, so latency under load is measured with HTTP requests; the change vs idle compares the two paths.' : 'The reverse proxy did not accept a WebSocket, so latency is measured with HTTP requests.')] : [];
    const N_RSV = rsvOn ? [it('info', 'layers', 'HTTP/1.1 probe reservation active — 5 streams', STR.down === 5 ? 'One HTTP/1.1 connection is kept free for the latency probe, so throughput uses at most 5 streams.' : 'From the upload on, one HTTP/1.1 connection is kept free for the latency probe, so the upload uses at most 5 streams.')] : [];
    // One confidence line per direction, then every notice (screens.md §7); one column, so the card's height follows its lines.
    const confGroups = cont ? [
      { h: 'Confidence', items: [confLine('down')] },
      { h: 'Notices', items: DU.map(v => it('info', 'database', 'Data used: ' + fmtB(v), 'Passed at ' + hms(CWU + v / (cAvg / OHF / 8)) + ' into the run.'))
        .concat(N_FB, N_RSV, N_OH) }
    ] : [
      { h: 'Confidence', items: [confLine('down'), stop ? it('warn', 'triangle-alert', 'Upload: insufficient data', 'Stopped at ' + USTOP.toFixed(1) + ' s, still in warm-up, before a 3 s confirmed steady window: no value and no loaded latency.') : confLine('up')] },
      { h: 'Notices', items: (stop ? [it('neutral', 'circle-minus', 'Test cancelled during upload', 'Latency and download completed.' + (npp ? ' The WebSocket closed ' + WSL + ' s into the download and its reopening was never answered, so no latency probe could be sent during the upload.' : '') + ' Upload stopped at ' + USTOP.toFixed(1) + ' s, so the grade and quality scores use download only.')] : []).concat(N_BUL, N_FB, N_RSV, N_OH) }
    ];

    const OHV = OH ? '+' + OHP + ' %' : 'None · 0 %';
    const P = (h, rows) => ({ h, rows: rows.map(([k, v]) => ({ k, v })) });
    const env = P('Environment', [['Server', 'Basement NAS · v1.4.0'], ['Browser', BRW.name + ' ' + BRW.major + ' · ' + BRW.os], ['Client IP', '192.168.1.42'], ['Timer resolution', '0.02 ms'], ['Cross-origin isolated', 'Yes']]);
    const PROTO = RS === 'needs-h2' ? 'HTTP/1.1' : RS === 'not-reported' ? '— · not reported' : resv ? 'HTTP/1.1' : 'HTTP/2';
    const params = cont ? [
      P('Test', [['Preset', 'Continuous'], ['Phases and order', 'Idle latency → Download (continuous)'], ['Streams', 'Auto · Standard ramp · ' + STR.down + ' · ' + pl(STR.down)]]),
      P('Limits', [['Run length', LONG ? 'None · ran ' + dhm(CEND) : '2 h'], ['Stored cells', LONG ? '10 min · runs over 24 h' : '1 min · runs over 1 h, up to 24 h'], ['Data cap', 'Off · ' + cUsed + ' used']]),
      P('Measurement', [['Units', 'Bits · Mbit/s'], ['Warm-up', 'Auto · ended at 6.5 s'], ['Ping count', '20'], ['Overhead compensation', OHV], ['Protocol', PROTO]]),
      env
    ] : [
      P('Test', [['Preset', 'Standard'], ['Phases and order', 'Idle latency → Download → Upload'], ['Streams', STR.down === STR.up ? 'Auto · ' + STR.down + ' · ' + pl(STR.down) : 'Auto · download ' + STR.down + ' · ' + pl(STR.down) + '; upload ' + STR.up + ' · ' + pl(STR.up)]]),
      P('Limits', [['Download', '10.0 s · min 10 · max 20'], ['Upload', stop ? USTOP.toFixed(1) + ' s · stopped by you · min 15 · max 25' : '16.0 s · min 15 · max 25'], ['Data cap', 'Off · ' + sUsed.toFixed(2) + ' GB used']]),
      P('Measurement', [['Units', 'Bits · Mbit/s'], ['Warm-up', stop ? 'Auto · ended at 6.5 s (download); upload stopped in warm-up' : 'Auto · ended at 6.5 s (download), 9.5 s (upload)'], ['Ping count', '20'], ['Overhead compensation', OHV], ['Protocol', PROTO]]),
      env
    ];
    // Share shows only where the browser can share files (the PNG goes to the system sheet).
    let canShare = false;
    try { canShare = !!(navigator.canShare && navigator.canShare({ files: [new File([new Blob([''], { type: 'image/png' })], 'x.png', { type: 'image/png' })] })); } catch (e) {}

    let toast = this.state.toast;
    if (delSt === 'pending') toast = { kind: 'info', icon: 'trash', t: 'Result deleted.', m: 'Removed from history in ' + this.state.delN + ' s.', undo: true };
    const commit = () => { clearInterval(this._di); this.setState({ del: 'done', toast: null }); };

    const base = {
      mobile: m, desktop: !m, L, D, hu, histOff, unsavedWhy: UNS[st] || '', canEdit: !hu, found: !notFound, notFound,
      nf: delSt !== 'none' ? { icon: 'trash', title: 'Result deleted', body: 'It has been removed from history in this browser.' } : { icon: 'search', title: 'Result not found', body: "This result isn't in this browser's history. It may have been deleted, or saved in a different browser." },
      dimOp: '1',
      tiles, loadRows, respP, midCols: L.midCols,
      fit: SC ? [['Streaming', 'tv'], ['Gaming', 'gamepad'], ['Video calls', 'video']].map(([label, icon], i) => { const rating = SC.bands[i], Q = BG.QUALITY[rating]; return { label, icon, rating, cls: 'sbadge ' + Q.tone, ricon: Q.icon }; }) : [],
      conf, confGroups, params, summary, inc, denied,
      grade, gradeWords, gradeBasis, gShort: gT[1], gradeAria: 'Bufferbloat grade ' + grade + ', ' + gradeWords, gBd: 'var(--' + gT[0] + '-border)', gBg: 'var(--' + gT[0] + '-bg)', gFg: 'var(--' + gT[0] + '-fg)',
      note: this.state.note ?? D.note,
      setNote: e => this.setState({ note: e.target.value }),
      toggleInc: () => this.setState({ inc: !inc }),
      share: shareP,
      shareAria: 'Share image: ' + summary.replace(/\n/g, ', '),
      preRef: this.preRef, preOutline: denied ? '2px solid var(--ring)' : 'none',
      paramsShown: !m || this.state.paramsOpen, paramsAria: this.state.paramsOpen ? 'true' : 'false', paramsChevron: this.state.paramsOpen ? 'chevron-up' : 'chevron-down', paramsBorder: this.state.paramsOpen ? '1px solid var(--border-subtle)' : '0',
      toggleParams: () => this.setState(s => ({ paramsOpen: !s.paramsOpen })),
      toast,
      dismiss: () => { if (delSt === 'pending') commit(); else { clearTimeout(this._tt); this.setState({ toast: null }); } },
      undo: () => { clearInterval(this._di); this.setState({ del: 'none' }); this.toast({ kind: 'ok', icon: 'circle-check', t: 'Result restored.' }); },
      del: () => {
        clearInterval(this._di); clearTimeout(this._tt);
        this.setState({ del: 'pending', delN: 8, toast: null });
        this._di = setInterval(() => { if (this.state.delN <= 1) commit(); else this.setState(s => ({ delN: s.delN - 1 })); }, 1000);
      },
      copy: () => {
        const ok = () => { this.setState({ clipDenied: false }); this.toast({ kind: 'ok', icon: 'circle-check', t: 'Summary copied.' }); };
        const no = () => { this._selDone = false; this.setState({ clipDenied: true }); };
        try { navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(summary).then(ok, no) : no(); } catch (e) { no(); }
      },
      canShare, shareCols: canShare ? 'repeat(2, minmax(0,1fr))' : 'minmax(0,1fr)',
      shareNow: () => {
        // Stand-in for the real 1200 × 630 renderer: the file, not text, goes to the share sheet.
        const c = document.createElement('canvas'); c.width = 1200; c.height = 630;
        const x = c.getContext('2d'), cs = getComputedStyle(document.documentElement);
        x.fillStyle = cs.getPropertyValue('--bg-base') || '#000'; x.fillRect(0, 0, 1200, 630);
        x.fillStyle = cs.getPropertyValue('--fg') || '#fff'; x.font = '36px ' + (cs.getPropertyValue('--font-mono') || 'monospace');
        summary.split('\n').forEach((l, i) => x.fillText(l, 60, 90 + i * 56));
        c.toBlob(b => { if (!b) return; navigator.share({ files: [new File([b], D.file + '.png', { type: 'image/png' })], title: 'BitGauge result' }).catch(() => {}); }, 'image/png');
      },
      dlImg: () => this.toast({ kind: 'ok', icon: 'circle-check', t: 'Image downloaded.', m: D.file + '.png' }),
      // Download JSON: the history export format wrapping one full §17 result object.
      dlJson: () => {
        const S = this._series || {}, ping = this._ping || [], r1 = v => Math.round(v * 10) / 10;
        const vals = a => (a || []).map(p => p[1] == null ? null : Math.round(p[1]));
        const latSer = a => (a || []).map(p => ({ atMs: Math.round(p[0] * 1000), rttMs: r1(p[1]) }));
        const scores = SC ? { streaming: { points: SC.points[0], band: SC.bands[0].toLowerCase() }, gaming: { points: SC.points[1], band: SC.bands[1].toLowerCase() }, rtc: { points: SC.points[2], band: SC.bands[2].toLowerCase() }, packetLoss: 'not-measured' } : null;
        // Loaded latency (§17): a value with its source (idleSource only when idle used another path), or the
        // unavailable form with its reason.
        const llJ = o => {
          const idS = wsClose ? { idleSource: 'websocket' } : {};
          if (o.ll) return Object.assign({ source: SJ[src] }, idS, { samples: o.lat.length, skippedTicks: 0, lost: 0, medianMs: o.ll[0], p90Ms: o.ll[1], increaseMs: o.inc, series: o.lat });
          const gs = gapSrc(o.gap); return Object.assign({ status: 'unavailable', reason: o.gap, source: gs ? SJ[gs] : 'none' }, idS, { samples: UPSRC[o.gap][2], skippedTicks: 0, lost: 0 });
        };
        const dir = o => Object.assign({
          status: 'measured', bitsPerSecond: Math.round(o.bps), peakBitsPerSecond: Math.round(o.peak), uncompensatedBitsPerSecond: Math.round(o.bps / OHF),
          windowMs: o.windowMs, streams: o.streams, plateau: 'cap', confidence: { level: o.conf.level, reasons: o.conf.reasons }, bytes: o.bytes,
          loadedLatency: llJ(o)
        }, { responsiveness: respJ(o.k) }, {
          series: { bucketMs: o.bucketMs, firstCellMs: o.first != null ? o.first : o.wu, warmupEndMs: o.wu, endMs: o.end, values: o.values },
          events: o.events || []
        }, o.agg || {});
        const idleS = ping.slice(1).map(p => r1(p[1]));
        const result = {
          schema: 'bitgauge.result', schemaVersion: 1, id: cont ? 'c41e9a07-5d2b-4f7e-9a31-6b0d2e8f4c15' : '0b6f2d18-9c4a-4e1b-8f37-2a5c6d9e0f41',
          startedAt: D.iso, durationMs: cont ? Math.round((0.6 + 2.0 + CEND) * 1000) : stop ? Math.round((12.6 + USTOP) * 1000) : 28600, status: stop ? 'partial' : 'complete', label: D.label, note: this.state.note ?? D.note,
          server: { name: D.server, version: '1.4.0', epoch: '2026-09-30T08:12:44.000Z' },
          client: { ip: '192.168.1.42', contextLabel: D.ctx, protocol: 'h2', browser: { name: BRW.name, major: BRW.major, os: BRW.os } },
          settings: { preset: D.preset.toLowerCase(), phases: cont ? ['idle', 'download'] : ['idle', 'download', 'upload'], streams: { mode: 'auto', max: 6 }, dataCapBytes: null, overheadCompensationPercent: OHP, warmup: 'auto', pingCount: 20 },
          idle: { path: SJ[idleSrc], lossPercent: 0, minMs: 2.4, medianMs: IDLE, p90Ms: 4.1, jitterMs: JIT, samples: idleS },
          download: cont
            ? dir({ bps: cAvg, peak: cP90, windowMs: Math.round((CEND - CWU) * 1000), bytes: cUsedB, lat: cells.map(c => ({ atMs: Math.round((c.a + c.b) / 2 * 1000), rttMs: r1(c.l) })), ll: LL.down, conf: DC.down, streams: STR.down, inc: INC.down, agg: { minBitsPerSecond: Math.round(cMin), maxBitsPerSecond: Math.round(cMax) }, k: 'down', bucketMs: CS * 1000, wu: CWU * 1000, first: C0 * 1000, end: CEND * 1000, values: cells.map(c => Math.round(c.v)) })
            : dir({ bps: D.down, peak: 641e6 * OHF, windowMs: 3500, bytes: SUSED.down, lat: latSer(S.dLat), ll: LL.down, conf: DC.down, gap: dnGap, streams: STR.down, inc: INC.down, k: 'down', bucketMs: 100, wu: 6500, end: 10000, values: vals(S.down) }),
          upload: cont ? { status: 'skipped' }
            : stop ? { status: 'insufficient-data', streams: STR.up, plateau: null, bytes: SUSED.up, loadedLatency: llJ({ gap: gapK }), events: [{ code: 'cancelled', atMs: Math.round(USTOP * 1000) }] }
            : Object.assign(dir({ bps: D.up, peak: 455e6 * OHF, windowMs: 6100, bytes: SUSED.up, lat: latSer(S.uLat), ll: LL.up, conf: DC.up, gap: gapK, streams: STR.up, inc: INC.up, k: 'up', bucketMs: 100, wu: 9500, end: 16000, values: vals(S.up), events: [{ code: 'failure-gap', startMs: 10400, endMs: 10800 }] }), { confirmedRequests: 38 }),
          bufferbloat: { grade, basis: basisK, increaseMs: D.worst[1] },
          scores,
          dataUsedBytes: cont ? cUsedB : SUSED.down + SUSED.up,
          notices: (cont ? DU.map(v => ({ code: 'data-used', bytes: v })) : []).concat(['down', 'up'].filter(k => DC[k] && DC[k].level === 'low').map(k => ({ code: 'low-confidence', direction: k === 'down' ? 'download' : 'upload', reasons: DC[k].reasons }))).concat(BUL ? [{ code: 'browser-upload-limit', browser: BRW.name }] : []).concat(rsvOn ? [{ code: 'probe-reservation', streams: 5 }] : []).concat(OHP ? [{ code: 'overhead-compensation', percent: OHP }] : [])
        };
        // History export format with one entry (ui/screens.md §1), so it re-imports as is.
        const obj = { format: 'bitgauge.history', formatVersion: 1, exportedAt: new Date().toISOString(), results: [result] };
        try { const u = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' })); const a = document.createElement('a'); a.href = u; a.download = D.file + '.json'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 1000); } catch (e) {}
        this.toast({ kind: 'ok', icon: 'circle-check', t: 'JSON downloaded.', m: D.file + '.json · contains client IP and notes' });
      }
    };
    if (!BG) return Object.assign(base, { charts: [] });

    // ---------- charts ----------
    const EV = {
      extended: { icon: 'timer', c: 'var(--info)', fg: 'var(--info-fg)', bd: 'var(--info-border)', t: 'Test extended' },
      cap: { icon: 'database', c: 'var(--warn)', fg: 'var(--warn-fg)', bd: 'var(--warn-border)', t: 'Data cap' },
      cancelled: { icon: 'square', c: 'var(--fg-muted)', fg: 'var(--fg-muted)', bd: 'var(--border-strong)', t: 'Cancelled' },
      error: { icon: 'circle-x', c: 'var(--danger)', fg: 'var(--danger-fg)', bd: 'var(--danger-border)', t: 'Error' }
    };
    const split = pts => { const out = []; let cur = []; pts.forEach(p => { if (p[1] == null) { if (cur.length) out.push(cur); cur = []; } else cur.push(p); }); if (cur.length) out.push(cur); return out; };
    const view = key => (this.state.views || {})[key] ?? (key === 'down' && tv ? 'table' : 'chart');
    const setView = (key, v) => () => this.setState(s => ({ views: Object.assign({}, s.views || {}, { [key]: v }) }));
    const C = (al, c) => v => ({ v, al, c });
    const cL = C('left', 'var(--fg-muted)'), cK = C('right', 'var(--fg-muted)'), cV = C('right', 'var(--fg)');
    const mk = o => {
      const known = o.pts.filter(p => p[1] != null);
      const ym = BG.niceMax(Math.max(...known.map(p => p[1])) * 1.08);
      const latK = o.lat ? o.lat.filter(p => p[1] != null) : null;
      const lm = latK ? BG.niceMax(Math.max(...latK.map(p => p[1])) * 1.9) : null;
      const g = BG.chart({ w: o.w, h: o.h, xMax: o.xMax, series: [known], yMax: ym, lat: latK, latMax: lm, ms: o.ms, xStep: o.xStep, xLabel: o.xLabel });
      const X = t => g.plotL + (g.plotR - g.plotL) * t / o.xMax, Y = v => g.plotT + (g.plotB - g.plotT) * (1 - v / ym), LY = v => g.plotT + (g.plotB - g.plotT) * (1 - v / lm);
      const path = (s, f) => s.map((p, i) => (i ? 'L' : 'M') + X(p[0]).toFixed(1) + ' ' + f(p[1]).toFixed(1)).join('');
      // A gap spans exactly its null cells, [first null cell start, next known cell start); the series before it
      // holds its last value up to the gap start (e.g. upload: null cells 10.4–10.7 → gap 10.4–10.8 s).
      const H = g.plotB - g.plotT, S = [], gapT = []; let cur = [], g0 = null;
      o.pts.forEach(p => {
        if (p[1] == null) { if (g0 == null) { g0 = p[0]; if (cur.length) { cur.push([p[0], cur[cur.length - 1][1]]); S.push(cur); cur = []; } } }
        else { if (g0 != null) { gapT.push([g0, p[0]]); g0 = null; } cur.push(p); }
      });
      if (cur.length) S.push(cur);
      const segs = S.map(s => { const l = path(s, Y); return { line: l, area: l + 'L' + X(s[s.length - 1][0]).toFixed(1) + ' ' + g.plotB + 'L' + X(s[0][0]).toFixed(1) + ' ' + g.plotB + 'Z' }; });
      const gaps = gapT.map(([a, b]) => ({ x: X(a).toFixed(1), w: (X(b) - X(a)).toFixed(1), y: g.plotT, h: H }));
      // Chips go right of the line unless they'd pass plotR; overlapping chips stagger down one row.
      const placed = [];
      const marks = (o.marks || []).map(([t, type]) => {
        const e = EV[type], x = X(t), cwid = e.t.length * 6 + 22, left = x + 4 + cwid > g.plotR;
        const x0 = left ? x - 4 - cwid : x + 4, x1 = x0 + cwid;
        let row = 0; while (placed.some(p => p.row === row && x0 < p.x1 + 4 && x1 > p.x0 - 4)) row++;
        placed.push({ x0, x1, row });
        return Object.assign({ x: x.toFixed(1), lx: (left ? x - 4 : x + 4).toFixed(1), ly: g.plotT + 2 + row * 18, tf: left ? 'translateX(-100%)' : 'none' }, e);
      });
      const v = view(o.key), tbl = v === 'table';
      const pc = { title: o.title, icon: o.icon, color: o.c, meta: o.meta, pts: o.pts, lat: o.lat, xMax: o.xMax, ms: o.ms, xStep: o.xStep, xLabel: o.xLabel, width: o.w, height: o.h, units: 'bits',
        warmup: o.wu != null ? { t1: o.wu, label: 'Warm-up · not stored (' + o.wuText + ')' } : null, marks: (o.marks || []).map(([t, type]) => Object.assign({}, EV[type], { t, label: EV[type].t })), gapLabel: o.gapLabel || 'No known data',
        summary: [o.meta, o.wu != null ? 'warm-up excluded' : '', o.marks && o.marks.length ? 'events: ' + o.marks.map(q => EV[q[1]].t + ' at ' + (o.xLabel ? mmss(q[0]) : q[0] + ' s')).join(', ') : '', o.lat && !tbl ? 'latency under load on a second scale' : ''].filter(Boolean).join('; '),
        view: v, onViewChange: nv => this.setState(s => ({ views: Object.assign({}, s.views || {}, { [o.key]: nv }) })) };
      return {
        pc, title: o.title, icon: o.icon, c: o.c, meta: o.meta, span: o.span, g, segs, gaps, marks, hasGaps: gaps.length > 0, gapLabel: o.gapLabel || 'No known data',
        latSegs: o.lat ? split(o.lat).map(s => path(s, LY)) : [],
        wu: o.wu != null ? { x: g.plotL, y: g.plotT, w: Math.max(2, X(o.wu) - g.plotL).toFixed(1), h: H } : null, wuLabel: o.wu != null ? 'Warm-up · not stored (' + o.wuText + ')' : '',
        aria: o.title + ' chart' + (o.marks && o.marks.length ? '; events: ' + o.marks.map(q => EV[q[1]].t + ' at ' + (o.xLabel ? mmss(q[0]) : q[0] + ' s')).join(', ') : ''),
        c2: !!o.lat && !tbl, toggleML: o.lat && !tbl ? '0' : 'auto', isChart: !tbl, isTable: tbl,
        chartCls: tbl ? 'seg-btn' : 'seg-btn on', tableCls: tbl ? 'seg-btn on' : 'seg-btn', chartAria: tbl ? 'false' : 'true', tableAria: tbl ? 'true' : 'false',
        toChart: setView(o.key, 'chart'), toTable: setView(o.key, 'table'),
        cols: o.cols.map((t, i) => ({ t, al: i ? 'right' : 'left' })), cols0: o.cols[0], rows: o.rows, foot: o.foot, tblMaxH: o.rows.length > 10 ? '360px' : 'none'
      };
    };
    // 2 s windows from warm-up end; samples are 0.1 s; throughput = bytes / known time; latency = median in window.
    const winRows = (pts, lat, t0, end) => {
      const out = [];
      for (let i = 0; t0 + 2 * i < end - 1e-6; i++) {
        const a = t0 + 2 * i, b = Math.min(a + 2, end), inW = p => p[0] >= a - 1e-6 && p[0] < b - 1e-6;
        const k = pts.filter(p => inW(p) && p[1] != null), kt = k.length * 0.1;
        const thr = k.length ? k.reduce((s, p) => s + p[1], 0) / k.length : null, lmed = med(lat.filter(inW).map(p => p[1]));
        out.push([cL(a.toFixed(1) + '–' + b.toFixed(1) + ' s'), cK(kt.toFixed(1) + ' s'), cV(rs(thr)), cV(lmed == null ? '—' : BG.ms(lmed) + ' ms')]);
      }
      return out;
    };
    const tidy = (pts, t0, end) => pts.map(p => [Math.round(p[0] * 100) / 100, p[1]]).filter(p => p[0] >= t0 - 1e-6 && p[0] < end - 1e-6);
    const tfoot = (wu, extra) => 'From warm-up end (' + wu + ' s). Throughput = bytes ÷ known time' + (OH ? ', with ' + OH : '') + '; “—” = no known time in that window.' + (extra || '') + ' Full samples are in the JSON export.';
    const TCOLS = ['2 s windows', 'Known', 'Throughput', 'Latency (median)'];
    const cw = m ? 309 : 320, ch = m ? 150 : 170, sp = m ? 'auto' : 'span 1', wide = m ? 309 : 690;
    const ping = tidy(BG.lat(4, 3.1, 3.1, 1.9, 0.1, 0.4), 0, 2); this._ping = ping;
    const pingRows = [0, 5, 10, 15].map(s => { const g = ping.slice(s, s + 5).map(p => p[1]); return [cL((s + 1) + '–' + (s + 5)), cV(BG.ms(med(g)) + ' ms'), cK(BG.ms(Math.min(...g)) + ' ms'), cK(BG.ms(Math.max(...g)) + ' ms')]; });
    const idle = mk({ key: 'idle', title: 'Idle latency', icon: 'activity', c: 'var(--series-latency)', pts: ping, xMax: 2, ms: true, meta: '20 pings · median 3.1 ms', w: wide, h: m ? 100 : 120, span: m ? 'auto' : 'span 2',
      cols: ['Pings', 'Median', 'Min', 'Max'], rows: pingRows, foot: 'Groups of 5 pings in send order. No warm-up for latency.' });
    let charts;
    if (cont) {
      const cpts = cells.map(c => [(c.a + c.b) / 2, c.v]), clat = cells.map(c => [(c.a + c.b) / 2, c.l]);
      const crow = cells.map(c => [cL(hms(c.a) + '–' + hms(c.b)), cK((c.known % 1 ? c.known.toFixed(1) : c.known) + ' s'), cV(rs(c.v)), cV(BG.ms(c.l) + ' ms')]);
      const hl = LONG ? (t => t === 0 ? '0' : Math.round(t / 86400) + 'd') : (t => t === 0 ? '0' : t < 3600 ? (t / 60) + 'm' : Math.floor(t / 3600) + 'h' + (t % 3600 ? String(t % 3600 / 60).padStart(2, '0') : ''));
      charts = [mk({ key: 'down', title: 'Download', icon: 'arrow-down', c: 'var(--series-download)', pts: cpts, lat: clat, xMax: CEND, xStep: LONG ? 86400 : 1200, xLabel: hl, wu: LONG ? null : CWU, wuText: '0–0:07',
        meta: ohs(LONG ? dhm(CEND) + ' · last 7 days saved · 10 min cells · ' + STR.down + ' streams' : '2 h · 1 min cells · ' + STR.down + ' streams'), w: wide, h: m ? 150 : 190, span: m ? 'auto' : 'span 2',
        cols: [LONG ? '10 min averages' : '1 min averages', 'Known', 'Throughput', 'Latency (median)'], rows: crow,
        foot: LONG
          ? 'One row per stored 10 min cell. This ' + dhm(CEND) + ' run is longer than the 7-day long ring, so only its last 7 days were saved (from ' + hms(C0) + '); the chart and this table show those 7 days' + (OH ? '; throughput includes ' + OH : '') + '.'
          : 'One row per stored 1 min cell, from warm-up end (0:07). A run is saved from the finest cells that cover it, downsampled to at most 2000 points: up to 10 min from 100 ms cells, up to 1 h from 1 s cells, up to 24 h from 1 min cells, longer from 10 min cells, so this 2 h run keeps 1 min cells' + (OH ? '; throughput includes ' + OH : '') + '. The last cell is 53.5 s because the 2 h run length ended the run.' }), idle];
    } else {
      // Same run as the Test screen (§8.3): both directions ramp to the 6-stream cap.
      // Download: warm-up 0–6.5 s, phase ends at 10 s. Upload (server timeline, measurement §19.4): each ramp decision
      // waits ≈ 1 s for confirmation, so warm-up is 0–9.5 s; sending stops at the 15 s minimum, the last in-flight
      // requests confirm at ≈ 16 s, steady window 9.5–16.0 s; one failed HTTP/2 request leaves a 0.4 s gap at
      // 10.4–10.8 s: 6.1 of 6.5 s known.
      const dEnd = 10, uEnd = 16, DWU = 6.5, UWU = 9.5, inGap = p => p[0] > 10.4 - 1e-6 && p[0] < 10.8 - 1e-6;
      const dPts = tidy(BG.thr(3, 612e6 * OHF, dEnd), DWU, dEnd), dLat = tidy(BG.lat(5, 3.1, 18, dEnd, 0.25), DWU, npp ? WSL : dEnd);
      const uPts = tidy(BG.thr(7, 438e6 * OHF, uEnd), UWU, uEnd).map(p => inGap(p) ? [p[0], null] : p), uLat = tidy(BG.lat(9, 3.1, 42, uEnd, 0.25), UWU, uEnd);
      this._series = { down: dPts, up: stop ? [] : uPts, dLat, uLat: stop ? [] : uLat, ping };
      charts = [
        mk({ key: 'down', title: 'Download', icon: 'arrow-down', c: 'var(--series-download)', pts: dPts, lat: dnGap ? null : dLat, xMax: 10, wu: DWU, wuText: '0–6.5 s', meta: ohs('10 s · ' + STR.down + ' streams'), w: stop ? wide : cw, h: ch, span: stop ? (m ? 'auto' : 'span 2') : sp,
          cols: TCOLS, rows: winRows(dPts, dnGap ? [] : dLat, DWU, dEnd), foot: tfoot('6.5', npp ? ' Latency ends at ' + WSL + ' s, when the WebSocket closed.' : '') }),
        mk({ key: 'up', title: 'Upload', icon: 'arrow-up', c: 'var(--series-upload)', pts: uPts, lat: gapK ? null : uLat, xMax: 16, wu: UWU, wuText: '0–9.5 s', meta: ohs('16 s · ' + STR.up + ' streams'), w: cw, h: ch, span: sp, gapLabel: 'No known data · failed request (10.4–10.8 s)',
          cols: TCOLS, rows: winRows(uPts, gapK ? [] : uLat, UWU, uEnd), foot: tfoot('9.5', ' The window ends at the confirmed watermark (16.0 s): 6.1 of 6.5 s known.') }),
        idle
      ];
      // Stopped in upload warm-up: nothing of the upload is stored (cells start at warm-up end), so it has no chart.
      if (stop) charts.splice(1, 1);
    }
    return Object.assign(base, { charts });
  }
  render() {
    const v = this.renderVals();
    return (
      <div style={{ background: "var(--bg-base)", color: "var(--fg)", fontFamily: "var(--font-sans)", minHeight: "100%", display: "flex", flexDirection: "column" }}>
        {v.desktop ? (
          <Nav variant="top" active="history" status={this.props.srvStatus || "connected"} />
        ) : null}
        {v.mobile ? (
          <Nav variant="mobile-top" active="history" status={this.props.srvStatus || "connected"} />
        ) : null}
        {v.notFound ? (
          <main style={{ flex: "1", maxWidth: "var(--layout-max)", width: "100%", boxSizing: "border-box", margin: "0 auto", padding: v.L?.pad, display: "flex", justifyContent: "center" }}>
            <div role="status" style={{ maxWidth: "440px", margin: v.L?.nfMargin, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: "var(--space-3)" }}>
              <span style={{ width: "48px", height: "48px", borderRadius: "var(--radius-lg)", background: "var(--surface-2)", border: "1px solid var(--border-default)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--fg-subtle)" }}>
                <DS.Icon name={v.nf?.icon} size={22} />
              </span>
              <h1 style={{ margin: "var(--space-1) 0 0", fontSize: "var(--text-2xl)", fontWeight: "var(--weight-semibold)", letterSpacing: "var(--tracking-tight)" }}>{v.nf?.title}</h1>
              <p style={{ margin: "0", fontSize: "var(--text-sm)", color: "var(--fg-muted)", lineHeight: "var(--lh-prose)", textWrap: "pretty" }}>{v.nf?.body}</p>
              <DS.Button variant="primary" href="#" icon="history" style={{ marginTop: "var(--space-2)" }}>Go to History</DS.Button>
            </div>
          </main>
        ) : null}
        {v.found ? (
          <main style={{ maxWidth: "var(--layout-max)", width: "100%", boxSizing: "border-box", margin: "0 auto", padding: v.L?.pad, display: "flex", flexDirection: "column", gap: "var(--space-5)", opacity: v.dimOp, transition: "opacity var(--dur-base) var(--ease-out)" }}>
            <nav aria-label="Breadcrumb" style={{ display: "flex", alignItems: "center", gap: "var(--space-1-5)", fontSize: "var(--text-sm)", color: "var(--fg-subtle)" }}>
              <a href="#" style={{ color: "var(--fg-muted)", textDecoration: "none", display: "flex", alignItems: "center", gap: "var(--space-1)" }}>
                <DS.Icon name="chevron-left" size={14} />
                History
              </a>
              <span aria-hidden="true">/</span>
              <time dateTime={v.D?.iso} style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-caption)" }}>{v.D?.crumb}</time>
            </nav>
            {v.histOff ? (
              <DS.Notice tone="warn" icon="database" title="History unavailable" live={false}>
                This browser is blocking storage, so results can't be saved. You're seeing this session's result from memory; it's gone when you close the tab. Download JSON to keep it.
              </DS.Notice>
            ) : null}
            <header style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", gap: "var(--space-4) var(--space-6)" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", minWidth: "0", flex: "1 1 360px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                  <h1 style={{ margin: "0", fontSize: v.L?.h1, fontWeight: "var(--weight-semibold)", letterSpacing: "var(--tracking-tight)", lineHeight: "var(--lh-tight)" }}>{v.D?.label}</h1>
                  {v.canEdit ? (
                    <DS.Button variant="ghost" size="sm" iconOnly icon="pencil" aria-label="Edit label" style={{ width: "28px" }}></DS.Button>
                  ) : null}
                  {v.hu ? (
                    <>
                      <DS.Button variant="ghost" size="sm" iconOnly icon="pencil" aria-label="Edit label" disabled style={{ width: "28px" }}></DS.Button>
                      <DS.StatusPill tone="warn" size="sm">Not saved</DS.StatusPill>
                    </>
                  ) : null}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "var(--space-2) var(--space-3)", fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>
                  <DS.Chip size="sm" icon={v.D?.ctxIcon}>{v.D?.ctx}</DS.Chip>
                  <time dateTime={v.D?.iso} style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-caption)" }} title={v.D?.abs}>{v.D?.when}</time>
                  <span aria-hidden="true" style={{ color: "var(--fg-subtle)" }}>·</span>
                  <span>{v.D?.preset}{" preset"}</span>
                  <span aria-hidden="true" style={{ color: "var(--fg-subtle)" }}>·</span>
                  <span>{v.D?.server}</span>
                </div>
                {v.hu ? (
                  <p id="unsaved-why" style={{ margin: "0", fontSize: "var(--text-sm)", color: "var(--fg-muted)", lineHeight: "var(--lh-compact)", textWrap: "pretty" }}>{v.unsavedWhy}</p>
                ) : null}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)", alignItems: "center" }}>
                <DS.Button variant="secondary" icon="file-json" onClick={v.dlJson} aria-describedby="json-warn">Download JSON</DS.Button>
                <DS.Button variant="primary" icon="rotate-ccw">Run again</DS.Button>
                {v.canEdit ? (
                  <DS.Button variant="danger" iconOnly icon="trash" aria-label="Delete result" title="Delete result" onClick={v.del}></DS.Button>
                ) : null}
                {v.hu ? (
                  <DS.Button variant="danger" iconOnly icon="trash" aria-label="Delete result" disabled></DS.Button>
                ) : null}
                <span id="json-warn" style={{ flexBasis: "100%", display: "flex", alignItems: "center", gap: "5px", fontSize: "var(--text-micro)", color: "var(--fg-subtle)" }}>
                  <span style={{ color: "var(--warn)", display: "flex" }}><DS.Icon name="triangle-alert" size={12} stroke={2} /></span>
                  JSON contains client IP and notes
                </span>
              </div>
            </header>
            <div style={{ display: "grid", gridTemplateColumns: v.L?.cols, gap: "var(--space-6)", alignItems: "start" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)", minWidth: "0" }}>
                <section aria-label="Results" style={{ display: "grid", gridTemplateColumns: v.L?.tileCols, gap: v.L?.tileGap }}>
                  {(v.tiles || []).map((t, $index) => (
                    <React.Fragment key={$index}>
                      <DS.MetricTile label={t?.label} icon={t?.icon} accent={t?.ic} value={t?.num === '—' ? undefined : t?.num} unit={t?.unit} note={t?.sub} notes={t?.notes} state={t?.state || (t?.num === '—' ? 'empty' : 'done')} compact={v.mobile} />
                    </React.Fragment>
                  ))}
                </section>
                <div style={{ display: "grid", gridTemplateColumns: v.midCols, gap: "var(--space-3)" }}>
                  <DS.LoadCard grade={v.grade} gradeText={v.gradeWords} basis={v.gradeBasis} compact={v.mobile}
                    rows={(v.loadRows || []).map(r => ({ dir: r.icon === 'arrow-up' ? 'upload' : 'download', label: r.label, sub: r.sub, value: r.num }))}
                    responsiveness={v.respP} />
                  <DS.QualityList compact={v.mobile} bands={(v.fit || []).map(f => f.rating || null)} />
                </div>
                <DS.Card as="section" labelledBy="conf-h" padded={false} icon="shield" title={<span id="conf-h">Confidence and notices</span>} actions={<><DS.StatusPill tone={v.conf?.tone}>{v.conf?.label}</DS.StatusPill></>}>
                  <div style={{ display: "grid", gridTemplateColumns: v.L?.confCols, gap: "0 var(--space-6)", padding: "var(--space-1) var(--space-4) var(--space-2)" }}>
                    {(v.confGroups || []).map((cg, $index) => (
                      <React.Fragment key={$index}>
                        <div style={{ display: "flex", flexDirection: "column", minWidth: "0" }}>
                          <h3 style={{ margin: "0", padding: "var(--space-2-5) 0 var(--space-1)", fontFamily: "var(--font-cond)", fontWeight: "var(--weight-semibold)", fontSize: "var(--text-micro)", letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--fg-subtle)" }}>
                            {cg?.h}
                          </h3>
                          <ul style={{ listStyle: "none", margin: "0", padding: "0" }}>
                            {(cg?.items || []).map((n, $index) => (
                              <React.Fragment key={$index}>
                                <li style={{ display: "flex", gap: "var(--space-2-5)", padding: "9px 0", borderTop: "1px solid var(--border-subtle)" }}>
                                  <span style={{ color: n?.c, display: "flex", marginTop: "var(--space-0-5)" }}><DS.Icon name={n?.icon} size={15} stroke={2} /></span>
                                  <div style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "var(--space-0-5)" }}>
                                    <span style={{ fontSize: "var(--text-sm)", fontWeight: "var(--weight-medium)", lineHeight: "var(--lh-compact)" }}>{n?.title}</span>
                                    <span style={{ fontSize: "var(--text-caption)", color: "var(--fg-muted)", lineHeight: "var(--lh-compact)", textWrap: "pretty" }}>{n?.body}</span>
                                    {n?.link ? (
                                      <a href={n?.link?.href} style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: "var(--space-1)", marginTop: "var(--space-0-5)", fontSize: "var(--text-caption)", fontWeight: "var(--weight-semibold)", color: "var(--primary-text)", textDecoration: "none" }}>{n?.link?.label}<DS.Icon name="external-link" size={12} /></a>
                                    ) : null}
                                  </div>
                                </li>
                              </React.Fragment>
                            ))}
                          </ul>
                        </div>
                      </React.Fragment>
                    ))}
                  </div>
                </DS.Card>
                <div style={{ display: "grid", gridTemplateColumns: v.L?.chartCols, gap: "var(--space-3)" }}>
                  {(v.charts || []).map((k, $index) => (
                    <React.Fragment key={$index}>
                      <DS.PhaseChart {...k.pc} style={{ gridColumn: k?.span }}>
                        {k?.isTable ? (
                          <>
                            <div style={{ maxHeight: k?.tblMaxH, overflow: "auto", margin: "0 -4px" }}>
                            <table className="tbl" aria-label={`${k?.title ?? ""} ${k?.cols0 ?? ""}`}>
                              <thead>
                                <tr>
                                  {(k?.cols || []).map((col, $index) => (
                                    <React.Fragment key={$index}>
                                      <th style={{ textAlign: col?.al, position: "sticky", top: "0", background: "var(--surface-2)" }}>{col?.t}</th>
                                    </React.Fragment>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {(k?.rows || []).map((r, $index) => (
                                  <React.Fragment key={$index}>
                                    <tr>
                                      {(r || []).map((cell, $index) => (
                                        <React.Fragment key={$index}>
                                          <td style={{ textAlign: cell?.al, fontFamily: "var(--font-mono)", fontSize: "var(--text-caption)", color: cell?.c, whiteSpace: "nowrap" }}>
                                            {cell?.v}
                                          </td>
                                        </React.Fragment>
                                      ))}
                                    </tr>
                                  </React.Fragment>
                                ))}
                              </tbody>
                            </table>
                          </div>
                            <span style={{ fontSize: "var(--text-micro)", color: "var(--fg-subtle)", lineHeight: "var(--lh-normal)", textWrap: "pretty" }}>{k?.foot}</span>
                          </>
                        ) : null}
                      </DS.PhaseChart>
                    </React.Fragment>
                  ))}
                </div>
              </div>
              <aside style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)", minWidth: "0" }}>
                <DS.Card as="section" padded={false} style={{ padding: "var(--space-3-5) var(--space-4)", display: "flex", flexDirection: "column", gap: "var(--space-2-5)" }}>
                  <label htmlFor="note" style={{ display: "flex", alignItems: "center", gap: "var(--space-1-5)", fontFamily: "var(--font-cond)", fontWeight: "var(--weight-semibold)", fontSize: "var(--text-micro)", letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--fg-subtle)" }}>
                    <DS.Icon name="file-text" size={13} />
                    Note
                  </label>
                  {v.canEdit ? (
                    <>
                      <textarea id="note" rows="3" onChange={v.setNote} value={v.note} style={{ resize: "vertical", background: "var(--surface-1)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-md)", color: "var(--fg)", fontFamily: "var(--font-sans)", fontSize: "var(--text-sm)", lineHeight: "var(--lh-normal)", padding: "var(--space-2) var(--space-2-5)" }} />
                      <span style={{ fontSize: "var(--text-micro)", color: "var(--fg-subtle)" }}>
                      Saved automatically in this browser. Never included when you share.
                    </span>
                    </>
                  ) : null}
                  {v.hu ? (
                    <textarea id="note" rows="3" readOnly={true} aria-describedby="unsaved-why" placeholder="No note" style={{ resize: "none", background: "var(--surface-2)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", color: "var(--fg-muted)", fontFamily: "var(--font-sans)", fontSize: "var(--text-sm)", lineHeight: "var(--lh-normal)", padding: "var(--space-2) var(--space-2-5)" }} />
                  ) : null}
                </DS.Card>
                <DS.Card as="section" padded={false} icon="image" title={"Share image"} actions={<>1200 × 630 PNG</>}>
                  <div style={{ padding: "var(--space-3-5)", display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
                    <DS.SharePreview label={v.shareAria} head={v.inc ? v.D?.label : ''} grade={v.grade} {...(v.share || {})} />
                    <label style={{ display: "flex", alignItems: "flex-start", gap: "var(--space-2)", fontSize: "var(--text-sm)", cursor: "pointer" }}>
                      <input type="checkbox" checked={v.inc} onChange={v.toggleInc} style={{ width: "16px", height: "16px", margin: "var(--space-0-5) 0 0", accentColor: "var(--primary)" }} />
                      <span style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
                        {"Include label "}
                        <span style={{ fontSize: "var(--text-micro)", color: "var(--fg-subtle)" }}>
                          Adds “{v.D?.label}” to the image and the text. IP address and note are never shared.
                        </span>
                      </span>
                    </label>
                    <div style={{ display: "grid", gridTemplateColumns: v.shareCols, gap: "var(--space-2)" }}>
                      {v.canShare ? (
                        <DS.Button variant="secondary" icon="share" onClick={v.shareNow} title="Sends the image to the system share sheet" style={{ justifyContent: "center" }}>Share</DS.Button>
                      ) : null}
                      <DS.Button variant="secondary" icon="download" onClick={v.dlImg} style={{ justifyContent: "center" }}>Download image</DS.Button>
                    </div>
                  </div>
                </DS.Card>
                <DS.Card as="section" padded={false} icon="file-text" title={"Text summary"} actions={<><DS.Button variant="ghost" size="sm" icon="copy" aria-label="Copy summary" onClick={v.copy}>Copy</DS.Button></>}>
                  {v.denied ? (
                    <DS.Notice attached tone="warn" title="Clipboard access was denied">{"The text below is selected — press "}
                        <span style={{ fontFamily: "var(--font-mono)" }}>Ctrl+C</span>
                        {" ("}
                        <span style={{ fontFamily: "var(--font-mono)" }}>⌘C</span>
                        {" on Mac) to copy it."}</DS.Notice>
                  ) : null}
                  <pre ref={v.preRef} tabIndex="0" aria-label="Text summary" style={{ margin: "0", padding: "var(--space-3) var(--space-4)", background: "var(--term-bg)", color: "var(--term-fg)", fontFamily: "var(--font-mono)", fontSize: "var(--text-micro)", lineHeight: "var(--lh-relaxed)", whiteSpace: "pre-wrap", userSelect: "text", outline: v.preOutline, outlineOffset: "-2px" }}>{v.summary}</pre>
                </DS.Card>
                <DS.Card as="section" labelledBy="params-h" padded={false}>
                  {v.mobile ? (
                    <h2 id="params-h" style={{ margin: "0", font: "inherit" }}><button type="button" className="disclosure" onClick={v.toggleParams} aria-expanded={v.paramsAria} aria-controls="params" style={{ borderBottom: v.paramsBorder }}>
                      <DS.Icon name="sliders" size={15} />
                      <span className="t">Test parameters</span>
                      <span style={{ marginLeft: "auto", display: "flex", color: "var(--fg-subtle)" }}><DS.Icon name={v.paramsChevron} size={16} /></span>
                    </button></h2>
                  ) : null}
                  {v.desktop ? (
                    <div className="card-h"><span className="ico"><DS.Icon name="sliders" size={15} /></span><h2 className="t" id="params-h">Test parameters</h2></div>
                  ) : null}
                  {v.paramsShown ? (
                    <div id="params" style={{ padding: "var(--space-0-5) var(--space-4) var(--space-2-5)" }}>
                      {(v.params || []).map((pg, $index) => (
                        <React.Fragment key={$index}>
                          <div style={{ display: "flex", flexDirection: "column" }}>
                            <h3 style={{ margin: "0", padding: "var(--space-3) 0 var(--space-1)", fontFamily: "var(--font-cond)", fontWeight: "var(--weight-semibold)", fontSize: "var(--text-micro)", letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--fg-subtle)" }}>
                              {pg?.h}
                            </h3>
                            <dl style={{ margin: "0" }}>
                              {(pg?.rows || []).map((p, $index) => (
                                <React.Fragment key={$index}>
                                  <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-3)", padding: "7px 0", borderTop: "1px solid var(--border-subtle)" }}>
                                    <dt style={{ fontSize: "var(--text-sm)", color: "var(--fg-muted)", flex: "none" }}>{p?.k}</dt>
                                    <dd style={{ margin: "0", fontFamily: "var(--font-mono)", fontSize: "var(--text-caption)", color: "var(--fg)", textAlign: "right", minWidth: "0", textWrap: "pretty" }}>
                                      {p?.v}
                                    </dd>
                                  </div>
                                </React.Fragment>
                              ))}
                            </dl>
                          </div>
                        </React.Fragment>
                      ))}
                    </div>
                  ) : null}
                </DS.Card>
              </aside>
            </div>
          </main>
        ) : null}
        {v.toast ? (
          <div style={{ position: "sticky", bottom: "16px", zIndex: "50", display: "flex", justifyContent: "flex-end", padding: "var(--space-4)", pointerEvents: "none" }}>
            <div className={`toast ${v.toast?.kind ?? ""}`} role="status" aria-live="polite" style={{ pointerEvents: "auto", maxWidth: "100%", boxSizing: "border-box", alignItems: "center" }}>
              <span className="i" style={{ display: "flex" }}><DS.Icon name={v.toast?.icon} size={16} stroke={2} /></span>
              <div style={{ flex: "1", minWidth: "0" }}>
                <div className="t">{v.toast?.t}</div>
                {v.toast?.m ? (
                  <div className="m">{v.toast?.m}</div>
                ) : null}
              </div>
              {v.toast?.undo ? (
                <DS.Button variant="secondary" size="sm" icon="undo-2" onClick={v.undo}>Undo</DS.Button>
              ) : null}
              <DS.Button variant="ghost" size="sm" iconOnly icon="x" aria-label="Dismiss" onClick={v.dismiss}></DS.Button>
            </div>
          </div>
        ) : null}
        {v.mobile ? (
          <div style={{ marginTop: "auto", height: "64px", flex: "none" }}><div style={{ position: "fixed", left: "0", right: "0", bottom: "0", zIndex: "var(--z-nav)" }}><Nav variant="mobile-bottom" active="history" status={this.props.srvStatus || "connected"} /></div></div>
        ) : null}
      </div>
    );
  }
}

window.ResultDetail = ResultDetail;
