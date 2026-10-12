/* BitGauge web UI kit — ResultDetail
 * Props:
 *   mobile: boolean  (default false)
 *   state: "result" | "not-found" | "history-unavailable"  (default "result")
 *   kind: "standard" | "continuous"  (default "standard")
 *   tableView: boolean  (default false)
 *   includeLabel: boolean  (default false)
 *   demo: "none" | "deleted" | "clipboard-denied"  (default "none")
 *   overhead: "0" | "6" | "5.13" | "3.69" | "8.1"  (default "0") — overhead compensation preset (§9.3)
 */
class ResultDetail extends React.Component {
  state = { views: null, inc: null, clipDenied: null, toast: null, del: null, delN: 8, paramsOpen: false, note: null };
  preRef = React.createRef();
  componentDidMount() { if (!window.BG) { this._h = () => this.forceUpdate(); window.addEventListener('bg-lib-ready', this._h); } this._sel(); }
  componentDidUpdate() { this._sel(); }
  componentWillUnmount() { if (this._h) window.removeEventListener('bg-lib-ready', this._h); clearTimeout(this._tt); clearInterval(this._di); }
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
    const st = this.props.state || 'result', hu = st === 'history-unavailable', cont = this.props.kind === 'continuous';
    const delSt = this.state.del ?? (this.props.demo === 'deleted' ? 'pending' : 'none');
    const notFound = st === 'not-found' || delSt === 'done';
    const inc = this.state.inc ?? on(this.props.includeLabel);
    const denied = this.denied();
    const L = m ? { pad: '14px 16px 24px', h1: 'var(--text-3xl)', cols: 'minmax(0,1fr)', tileCols: 'repeat(2, minmax(0,1fr))', tileGap: '10px', tileNum: '24px', midCols: 'minmax(0,1fr)', chartCols: 'minmax(0,1fr)', confCols: 'minmax(0,1fr)', nfMargin: '40px auto' }
      : { pad: '20px 40px 48px', h1: 'var(--text-4xl)', cols: 'minmax(0,1fr) 352px', tileCols: 'repeat(4, minmax(0,1fr))', tileGap: '12px', tileNum: '28px', midCols: 'minmax(0,1.4fr) minmax(0,1fr)', chartCols: 'repeat(2, minmax(0,1fr))', confCols: 'repeat(2, minmax(0,1fr))', nfMargin: '96px auto' };

    // bg-lib formatting: 3 significant digits with an auto-scaled unit; latency/jitter one decimal below 10 ms.
    const BGF = window.BG || { rate: v => ({ n: String(Math.round(v / 1e6)), u: 'Mbit/s' }), rateStr: v => Math.round(v / 1e6) + ' Mbit/s', jit: v => v < 9.95 ? v.toFixed(1) : String(Math.round(v)), ms: v => v < 9.95 ? v.toFixed(1) : String(Math.round(v)) };
    const rn = v => v == null ? '—' : BGF.rate(v, 'bits').n, ru = v => v == null ? '' : BGF.rate(v, 'bits').u, rs = v => v == null ? '—' : BGF.rateStr(v, 'bits');
    const jit = v => BGF.jit(v);
    const med = a => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y), h = s.length >> 1; return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2; };
    const mmss = s => Math.floor(s / 60) + ':' + String(Math.round(s % 60)).padStart(2, '0');
    const T = { ok: 'var(--ok)', warn: 'var(--warn)', danger: 'var(--danger)', info: 'var(--info)', neutral: 'var(--fg-subtle)' };
    const it = (tone, icon, title, body) => ({ c: T[tone], icon, title, body });

    // Overhead compensation (§9.3): 0 % in the example. A preset multiplies every rate and is named next to each one.
    const OHP = parseFloat(this.props.overhead) || 0, OHF = 1 + OHP / 100, OH = OHP ? '+' + OHP + ' % overhead compensation' : '';
    const ohs = s => OH ? s + ' · ' + OH : s;
    const GT = { 'A+': ['ok', 'Minimal'], A: ['ok', 'Low'], B: ['ok', 'Mild'], C: ['warn', 'Moderate'], D: ['warn', 'High'], F: ['danger', 'Severe'] };
    const gradeOf = inc => inc < 5 ? 'A+' : inc < 30 ? 'A' : inc < 60 ? 'B' : inc < 200 ? 'C' : inc < 400 ? 'D' : 'F';
    const hms = s => { s = Math.round(s); return Math.floor(s / 3600) + ':' + String(Math.floor(s % 3600 / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };

    // Continuous: a 2 h download run. Longer than 1 h, so it is stored in 1 min cells (day tier). Auto warm-up ends at
    // ≈ 6.5 s (6-stream ramp, plateau cap) and the cells start there. Download cells are always known. The run length ends it.
    const CWU = 6.5, CEND = 7200, cells = [];
    for (let i = 0; CWU + 60 * i < CEND; i++) {
      const a = CWU + 60 * i, b = Math.min(a + 60, CEND);
      cells.push({ a, b, known: b - a, v: OHF * (412e6 + 26e6 * Math.sin(i * 0.7) + 11e6 * Math.cos(i * 2.3) - (i >= 40 && i <= 52 ? 31e6 : 0)), l: 17 + 3.5 * Math.sin(i * 1.3) + (i % 5) * 0.5 });
    }
    const cKnown = cells.reduce((s, c) => s + c.known, 0), cAvg = cells.reduce((s, c) => s + c.v * c.known, 0) / cKnown;
    // The run's 1 s cells (hour tier while it ran): "p90, last hour" is the p90 of the last 3600 of them; the run max is
    // a running aggregate over all of them. Only the 1 min cells are saved.
    if (!this._sec || this._secF !== OHF) {
      let sd = 7; const rnd = () => (sd = (sd * 16807) % 2147483647) / 2147483647, sec = [];
      cells.forEach(c => { for (let t = c.a; t < c.b - 1e-6; t++) sec.push([t, c.v * (1 + 0.07 * (rnd() - 0.5) + 0.02 * Math.sin(t * 0.9))]); });
      this._sec = sec; this._secF = OHF;
    }
    const lastHr = this._sec.filter(q => q[0] >= CEND - 3600).map(q => q[1]).sort((x, y) => x - y), cP90 = lastHr[Math.floor(0.9 * (lastHr.length - 1))];
    // Run-wide running aggregates over the 1 s cells (§15); saved as minBitsPerSecond / maxBitsPerSecond (§17).
    const CAGG = this._sec.reduce((a, q) => ({ min: Math.min(a.min, q[1]), max: Math.max(a.max, q[1]) }), { min: Infinity, max: 0 });
    const cMax = CAGG.max, cMin = CAGG.min;
    const cUsedB = Math.round(cAvg / OHF * CEND / 8), cUsed = Math.round(cUsedB / 1e9) + ' GB';
    // Standard run on the fast LAN: the same curves as the Test screen, so data used = 737 MB down + 855 MB up
    // (upload sends for ≈ 16 s: until its 15 s minimum, then the last in-flight requests).
    const SUSED = { down: 736700000, up: 854549086 }, sUsed = (SUSED.down + SUSED.up) / 1e9;

    const D = cont ? {
      label: 'Overnight check', ctx: 'LAN', ctxIcon: 'house', when: 'Thu 8 Oct 2026 · 01:00:04', abs: '2026-10-08 01:00:04 CEST', iso: '2026-10-07T23:00:04.000Z', crumb: '2026-10-08 01:00', short: 'Thu 8 Oct 2026 · 01:00', file: 'bitgauge-2026-10-08-0100',
      preset: 'Continuous', server: 'Basement NAS', note: 'Checking whether the evening dip comes back after midnight.', down: cAvg, up: null
    } : {
      label: 'Home Wi-Fi', ctx: 'LAN', ctxIcon: 'house', when: 'Thu 8 Oct 2026 · 14:02:11', abs: '2026-10-08 14:02:11 CEST', iso: '2026-10-08T12:02:11.000Z', crumb: '2026-10-08 14:02', short: 'Thu 8 Oct 2026 · 14:02', file: 'bitgauge-2026-10-08-1402',
      preset: 'Standard', server: 'Basement NAS', note: 'Office desk, 5 GHz. Router is in the hallway, one wall between.', down: 612e6 * OHF, up: 438e6 * OHF
    };
    const IDLE = 3.1, JIT = 0.8, r1 = v => Math.round(v * 10) / 10;
    // Loaded latency (median, p90) per direction. Increase = median − idle; the grade uses the worse one, and
    // loadedLatency.increaseMs and bufferbloat.increaseMs in the JSON hold the same value.
    const LL = { down: [18, 24], up: cont ? null : [42, 55] }, INC = { down: r1(LL.down[0] - IDLE), up: LL.up ? r1(LL.up[0] - IDLE) : null };
    D.worst = INC.up != null && INC.up > INC.down ? ['upload', INC.up] : ['download', INC.down];
    const grade = gradeOf(D.worst[1]), gT = GT[grade], gradeWords = gT[1] + ' bufferbloat' + (cont ? ' · download only' : '');
    const gradeBasis = cont ? 'Grade basis: download +15 ms vs idle. Upload not measured.' : 'Grade basis: the worse increase vs idle — upload +39 ms (download +15 ms).';
    const worstStr = '+' + jit(D.worst[1]) + ' ms loaded (' + D.worst[0] + ')';

    const summary = [
      'BitGauge' + (inc ? ' · ' + D.label : ''),
      D.short,
      cont ? 'Download ' + rs(D.down) + ' (2 h average) · Upload not measured' : 'Download ' + rs(D.down) + ' · Upload ' + rs(D.up)
    ].concat(OH ? [OH] : []).concat([
      'Idle latency ' + BGF.ms(IDLE) + ' ms · Jitter ' + jit(JIT) + ' ms',
      'Loaded latency +' + jit(D.worst[1]) + ' ms (' + D.worst[0] + ')',
      'Bufferbloat grade ' + grade + ' · ' + gradeWords,
      'Server: ' + D.server
    ]).join('\n');

    // Quality scores: the same AIM function as the Test screen (bg-lib). Standard: Good/Good/Good (55/25/35 points);
    // Continuous (download +15 ms): Great/Great/Great (60/30/40).
    const SC = BG ? BG.aim(IDLE, JIT, D.down / OHF, D.worst[1]) : null;
    const tiles = [
      { label: cont ? 'Download · average' : 'Download', icon: 'arrow-down', ic: 'var(--series-download)', num: rn(D.down), unit: ru(D.down), nc: 'var(--fg)', sub: ohs(cont ? 'peak ' + rn(cP90) + ' · p90, last hour, 1 s cells · max ' + rn(cMax) + ' · 6 streams · plateau: cap' : 'peak ' + rn(641e6 * OHF) + ' · 6 streams · plateau: cap') },
      cont ? { label: 'Upload', icon: 'arrow-up', ic: 'var(--series-upload)', num: '—', unit: '', nc: 'var(--fg-subtle)', sub: 'not measured · Continuous runs one direction' }
        : { label: 'Upload', icon: 'arrow-up', ic: 'var(--series-upload)', num: rn(D.up), unit: ru(D.up), nc: 'var(--fg)', sub: ohs('peak ' + rn(455e6 * OHF) + ' · 6 streams · plateau: cap · 6.1 of 6.5 s known') },
      { label: 'Idle latency', icon: 'activity', ic: 'var(--series-latency)', num: BGF.ms(IDLE), unit: 'ms', nc: 'var(--fg)', sub: 'min 2.4 · p90 4.1 ms · WebSocket · 0 % probe timeouts' },
      { label: 'Jitter', icon: 'activity', ic: 'var(--series-latency)', num: jit(JIT), unit: 'ms', nc: 'var(--fg)', sub: 'mean of consecutive differences' }
    ];
    const loadRows = [{ icon: 'arrow-down', ic: 'var(--primary-text)', label: 'During download · WebSocket', sub: 'p90 24 · +15 ms vs idle', num: '18', unit: 'ms' }];
    if (!cont) loadRows.push({ icon: 'arrow-up', ic: 'var(--series-upload)', label: 'During upload · WebSocket', sub: 'p90 55 · +39 ms vs idle', num: '42', unit: 'ms' });
    const rpm = [{ icon: 'arrow-down', ic: 'var(--series-download)', num: '1,420' }].concat(cont ? [] : [{ icon: 'arrow-up', ic: 'var(--series-upload)', num: '980' }]);

    // Confidence levels (§16): normal | low (ramp-unsettled, unstable, insufficient-samples) | cpu-bound.
    const conf = { label: 'Confidence: normal', tone: 'ok' };
    const N_LOSS = it('neutral', 'circle-dashed', 'Packet loss not measured', 'Browsers can’t see packet loss over TCP, so the quality scores are an upper bound.');
    const N_RESP = it('neutral', 'gauge', 'Connection sharing not verifiable', 'Responsiveness ran over HTTP/2; the browser doesn’t report whether probes shared the load connections.');
    const N_OH = OH ? [it('neutral', 'sliders', OH, 'Throughput is multiplied by ' + OHF.toFixed(OHP % 1 ? 4 : 2).replace(/0+$/, '') + '. The uncompensated values are kept in the JSON.')] : [];
    const confGroups = cont ? [
      { h: 'Confidence', items: [
        it('ok', 'circle-check', 'Download reached the 6-stream cap', 'Warm-up ended by the guarded rule at 6.5 s and the window condition held. Level: normal.')
      ] },
      { h: 'Notices', items: [
        it('neutral', 'database', 'Data used: ' + cUsed, 'Data-used notices appeared at 1 GB, 10 GB and 100 GB.'),
        it('neutral', 'circle-dashed', 'Upload not measured', 'Continuous runs one direction.'),
        N_LOSS, N_RESP
      ].concat(N_OH) }
    ] : [
      { h: 'Confidence', items: [
        it('ok', 'circle-check', 'Both directions reached the 6-stream cap', 'Warm-up ended by the guarded rule — download at 6.5 s, upload at 9.5 s (each upload ramp step waits for confirmation) — and the window condition held. Level: normal.'),
        it('info', 'info', '94 % of upload time known — 0.4 s unknown after a failed request', 'One HTTP/2 upload request failed and the upload carried on. 10.4–10.8 s is left out; the average uses known time only.')
      ] },
      { h: 'Notices', items: [N_LOSS, N_RESP].concat(N_OH) }
    ];

    const OHV = OH ? '+' + OHP + ' %' : 'None · 0 %';
    const P = (h, rows) => ({ h, rows: rows.map(([k, v]) => ({ k, v })) });
    const env = P('Environment', [['Server', 'Basement NAS · v1.4.0'], ['Browser', 'Firefox 131 · Linux'], ['Client IP', '192.168.1.42'], ['Timer resolution', '0.02 ms'], ['Cross-origin isolated', 'Yes']]);
    const params = cont ? [
      P('Test', [['Preset', 'Continuous'], ['Phases and order', 'Idle latency → Download (continuous)'], ['Streams', 'Auto · Standard ramp · 6 · plateau: cap']]),
      P('Limits', [['Run length', '2 h'], ['Stored cells', '1 min · runs over 1 h, up to 24 h'], ['Data cap', 'Off · ' + cUsed + ' used']]),
      P('Measurement', [['Units', 'Bits · Mbit/s'], ['Warm-up', 'Auto · ended at 6.5 s'], ['Ping count', '20'], ['Overhead compensation', OHV], ['Protocol', 'HTTP/2']]),
      env
    ] : [
      P('Test', [['Preset', 'Standard'], ['Phases and order', 'Idle latency → Download → Upload'], ['Streams', 'Auto · 6 · plateau: cap']]),
      P('Limits', [['Download', '10.0 s · min 10 · max 20'], ['Upload', '16.0 s · min 15 · max 25'], ['Data cap', 'Off · ' + sUsed.toFixed(2) + ' GB used']]),
      P('Measurement', [['Units', 'Bits · Mbit/s'], ['Warm-up', 'Auto · ended at 6.5 s (download), 9.5 s (upload)'], ['Ping count', '20'], ['Overhead compensation', OHV], ['Protocol', 'HTTP/2']]),
      env
    ];
    // Share shows only where the browser can share files (the PNG goes to the system sheet).
    let canShare = false;
    try { canShare = !!(navigator.canShare && navigator.canShare({ files: [new File([new Blob([''], { type: 'image/png' })], 'x.png', { type: 'image/png' })] })); } catch (e) {}

    let toast = this.state.toast;
    if (delSt === 'pending') toast = { kind: 'info', icon: 'trash', t: 'Result deleted.', m: 'Removed from history in ' + this.state.delN + ' s.', undo: true };
    const commit = () => { clearInterval(this._di); this.setState({ del: 'done', toast: null }); };

    const base = {
      mobile: m, desktop: !m, L, D, hu, canEdit: !hu, found: !notFound, notFound,
      nf: delSt === 'done' ? { icon: 'trash', title: 'Result deleted', body: 'It has been removed from history in this browser.' } : { icon: 'search', title: 'Result not found', body: 'This result isn’t in this browser’s history. It may have been deleted, or saved in a different browser.' },
      dimOp: delSt === 'pending' ? '0.45' : '1',
      tiles, loadRows, rpm, rpmSub: cont ? 'round trips per minute, download only' : 'round trips per minute, one per direction',
      fit: SC ? [['Streaming', 'tv'], ['Gaming', 'gamepad'], ['Video calls', 'video']].map(([label, icon], i) => { const rating = SC.bands[i], Q = BG.QUALITY[rating]; return { label, icon, rating, cls: 'sbadge ' + Q.tone, ricon: Q.icon }; }) : [],
      conf, confGroups, params, summary, inc, denied,
      grade, gradeWords, gradeBasis, gShort: gT[1], gradeAria: 'Bufferbloat grade ' + grade + ', ' + gradeWords, gBd: 'var(--' + gT[0] + '-border)', gBg: 'var(--' + gT[0] + '-bg)', gFg: 'var(--' + gT[0] + '-fg)',
      note: this.state.note ?? D.note,
      setNote: e => this.setState({ note: e.target.value }),
      toggleInc: () => this.setState({ inc: !inc }),
      shareBlocks: [{ k: '↓ DOWNLOAD', c: 'var(--series-download)', n: rn(D.down), u: ru(D.down) }, { k: '↑ UPLOAD', c: 'var(--series-upload)', n: rn(D.up), u: ru(D.up) }],
      shareFoot: [BGF.ms(IDLE) + ' ms idle', jit(JIT) + ' ms jitter', worstStr].concat(OH ? [OH] : []).concat([grade + ' · ' + gradeWords, D.short]),
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
      share: () => {
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
        const dir = o => Object.assign({
          status: 'measured', bitsPerSecond: Math.round(o.bps), peakBitsPerSecond: Math.round(o.peak), uncompensatedBitsPerSecond: Math.round(o.bps / OHF),
          windowMs: o.windowMs, streams: 6, plateau: 'cap', confidence: { level: 'normal', reasons: [] }, bytes: o.bytes,
          loadedLatency: { source: 'websocket', samples: o.lat.length, skippedTicks: 0, medianMs: o.ll[0], p90Ms: o.ll[1], increaseMs: o.inc, series: o.lat },
          responsiveness: { state: 'measured', protocol: 'h2', samples: 18, rpm: o.rpm },
          series: { bucketMs: o.bucketMs, firstCellMs: o.wu, warmupEndMs: o.wu, endMs: o.end, values: o.values },
          events: o.events || []
        }, o.agg || {});
        const idleS = ping.slice(1).map(p => r1(p[1]));
        const result = {
          schema: 'bitgauge.result', schemaVersion: 1, id: cont ? 'c41e9a07-5d2b-4f7e-9a31-6b0d2e8f4c15' : '0b6f2d18-9c4a-4e1b-8f37-2a5c6d9e0f41',
          startedAt: D.iso, durationMs: cont ? Math.round((0.6 + 2.0 + CEND) * 1000) : 28600, status: 'complete', label: D.label, note: this.state.note ?? D.note,
          server: { name: D.server, version: '1.4.0', epoch: '2026-09-30T08:12:44.000Z' },
          client: { ip: '192.168.1.42', contextLabel: D.ctx, protocol: 'h2', browser: { name: 'Firefox', major: 131, os: 'Linux' } },
          settings: { preset: D.preset.toLowerCase(), phases: cont ? ['idle', 'download'] : ['idle', 'download', 'upload'], streams: { mode: 'auto', max: 6 }, dataCapBytes: null, overheadCompensationPercent: OHP, warmup: 'auto', pingCount: 20 },
          idle: { path: 'websocket', lossPercent: 0, minMs: 2.4, medianMs: IDLE, p90Ms: 4.1, jitterMs: JIT, samples: idleS },
          download: cont
            ? dir({ bps: cAvg, peak: cP90, windowMs: Math.round((CEND - CWU) * 1000), bytes: cUsedB, lat: cells.map(c => ({ atMs: Math.round((c.a + c.b) / 2 * 1000), rttMs: r1(c.l) })), ll: LL.down, inc: INC.down, agg: { minBitsPerSecond: Math.round(cMin), maxBitsPerSecond: Math.round(cMax) }, rpm: 1420, bucketMs: 60000, wu: CWU * 1000, end: CEND * 1000, values: cells.map(c => Math.round(c.v)) })
            : dir({ bps: D.down, peak: 641e6 * OHF, windowMs: 3500, bytes: SUSED.down, lat: latSer(S.dLat), ll: LL.down, inc: INC.down, rpm: 1420, bucketMs: 100, wu: 6500, end: 10000, values: vals(S.down) }),
          upload: cont ? { status: 'skipped' }
            : Object.assign(dir({ bps: D.up, peak: 455e6 * OHF, windowMs: 6100, bytes: SUSED.up, lat: latSer(S.uLat), ll: LL.up, inc: INC.up, rpm: 980, bucketMs: 100, wu: 9500, end: 16000, values: vals(S.up), events: [{ code: 'failure-gap', startMs: 10400, endMs: 10800 }] }), { confirmedRequests: 38 }),
          bufferbloat: { grade, basis: cont ? 'download' : 'download+upload', increaseMs: D.worst[1] },
          scores,
          dataUsedBytes: cont ? cUsedB : SUSED.down + SUSED.up,
          notices: (cont ? [1e9, 1e10, 1e11].map(v => ({ code: 'data-used', bytes: v })) : []).concat(OHP ? [{ code: 'overhead-compensation', percent: OHP }] : [])
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
      extended: { icon: 'timer', c: 'var(--info)', fg: 'var(--info-fg)', bd: 'var(--info-border)', t: 'Slow link — test extended' },
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
      return {
        title: o.title, icon: o.icon, c: o.c, meta: o.meta, span: o.span, g, segs, gaps, marks, hasGaps: gaps.length > 0, gapLabel: o.gapLabel || 'No known data',
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
      const hl = t => t === 0 ? '0' : t < 3600 ? (t / 60) + 'm' : Math.floor(t / 3600) + 'h' + (t % 3600 ? String(t % 3600 / 60).padStart(2, '0') : '');
      charts = [mk({ key: 'down', title: 'Download', icon: 'arrow-down', c: 'var(--series-download)', pts: cpts, lat: clat, xMax: CEND, xStep: 1200, xLabel: hl, wu: CWU, wuText: '0–0:07',
        meta: ohs('2 h · 1 min cells · 6 streams'), w: wide, h: m ? 150 : 190, span: m ? 'auto' : 'span 2',
        cols: ['1 min averages', 'Known', 'Throughput', 'Latency (median)'], rows: crow,
        foot: 'One row per stored 1 min cell, from warm-up end (0:07). A run is saved from the finest cells that cover it, downsampled to at most 2000 points: up to 10 min from 100 ms cells, up to 1 h from 1 s cells, up to 24 h from 1 min cells, longer from 10 min cells, so this 2 h run keeps 1 min cells' + (OH ? '; throughput includes ' + OH : '') + '. The last cell is 53.5 s because the 2 h run length ended the run.' }), idle];
    } else {
      // Same run as the Test screen (§8.3): both directions ramp to the 6-stream cap.
      // Download: warm-up 0–6.5 s, phase ends at 10 s. Upload (server timeline, measurement §19.4): each ramp decision
      // waits ≈ 1 s for confirmation, so warm-up is 0–9.5 s; sending stops at the 15 s minimum, the last in-flight
      // requests confirm at ≈ 16 s, steady window 9.5–16.0 s; one failed HTTP/2 request leaves a 0.4 s gap at
      // 10.4–10.8 s: 6.1 of 6.5 s known.
      const dEnd = 10, uEnd = 16, DWU = 6.5, UWU = 9.5, inGap = p => p[0] > 10.4 - 1e-6 && p[0] < 10.8 - 1e-6;
      const dPts = tidy(BG.thr(3, 612e6 * OHF, dEnd), DWU, dEnd), dLat = tidy(BG.lat(5, 3.1, 18, dEnd, 0.25), DWU, dEnd);
      const uPts = tidy(BG.thr(7, 438e6 * OHF, uEnd), UWU, uEnd).map(p => inGap(p) ? [p[0], null] : p), uLat = tidy(BG.lat(9, 3.1, 42, uEnd, 0.25), UWU, uEnd);
      this._series = { down: dPts, up: uPts, dLat, uLat, ping };
      charts = [
        mk({ key: 'down', title: 'Download', icon: 'arrow-down', c: 'var(--series-download)', pts: dPts, lat: dLat, xMax: 10, wu: DWU, wuText: '0–6.5 s', meta: ohs('10 s · 6 streams'), w: cw, h: ch, span: sp,
          cols: TCOLS, rows: winRows(dPts, dLat, DWU, dEnd), foot: tfoot('6.5') }),
        mk({ key: 'up', title: 'Upload', icon: 'arrow-up', c: 'var(--series-upload)', pts: uPts, lat: uLat, xMax: 16, wu: UWU, wuText: '0–9.5 s', meta: ohs('16 s · 6 streams'), w: cw, h: ch, span: sp, gapLabel: 'No known data · failed request (10.4–10.8 s)',
          cols: TCOLS, rows: winRows(uPts, uLat, UWU, uEnd), foot: tfoot('9.5', ' The window ends at the confirmed watermark (16.0 s): 6.1 of 6.5 s known.') }),
        idle
      ];
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
          <main style={{ flex: "1", maxWidth: "1200px", width: "100%", boxSizing: "border-box", margin: "0 auto", padding: v.L?.pad, display: "flex", justifyContent: "center" }}>
            <div role="status" style={{ maxWidth: "440px", margin: v.L?.nfMargin, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: "12px" }}>
              <span style={{ width: "48px", height: "48px", borderRadius: "var(--radius-lg)", background: "var(--surface-2)", border: "1px solid var(--border-default)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--fg-subtle)" }}>
                <bg-icon name={v.nf?.icon} size="22" />
              </span>
              <h1 style={{ margin: "4px 0 0", fontSize: "var(--text-2xl)", fontWeight: "600", letterSpacing: "var(--tracking-tight)" }}>{v.nf?.title}</h1>
              <p style={{ margin: "0", fontSize: "var(--text-sm)", color: "var(--fg-muted)", lineHeight: "1.55", textWrap: "pretty" }}>{v.nf?.body}</p>
              <a className="btn primary" href="#" style={{ marginTop: "8px", textDecoration: "none" }}><bg-icon name="history" size="15" />Go to History</a>
            </div>
          </main>
        ) : null}
        {v.found ? (
          <main style={{ maxWidth: "1200px", width: "100%", boxSizing: "border-box", margin: "0 auto", padding: v.L?.pad, display: "flex", flexDirection: "column", gap: "20px", opacity: v.dimOp, transition: "opacity var(--dur-base) var(--ease-out)" }}>
            <nav aria-label="Breadcrumb" style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "var(--text-sm)", color: "var(--fg-subtle)" }}>
              <a href="#" style={{ color: "var(--fg-muted)", textDecoration: "none", display: "flex", alignItems: "center", gap: "4px" }}>
                <bg-icon name="chevron-left" size="14" />
                History
              </a>
              <span>/</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-caption)" }}>{v.D?.crumb}</span>
            </nav>
            {v.hu ? (
              <div role="status" style={{ display: "flex", gap: "12px", padding: "12px 14px", borderRadius: "var(--radius-md)", border: "1px solid var(--warn-border)", background: "var(--warn-bg)" }}>
                <span style={{ color: "var(--warn)", display: "flex", marginTop: "1px" }}><bg-icon name="database" size="16" stroke="2" /></span>
                <div style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" }}>
                  <span style={{ fontSize: "var(--text-sm)", fontWeight: "600" }}>History unavailable</span>
                  <span style={{ fontSize: "var(--text-caption)", color: "var(--fg-muted)", lineHeight: "1.5", textWrap: "pretty" }}>
                    This browser is blocking storage, so results can't be saved. You're seeing this session's result from memory; it's gone when you close the tab. Download JSON to keep it.
                  </span>
                </div>
              </div>
            ) : null}
            <header style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", gap: "16px 24px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", minWidth: "0", flex: "1 1 360px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <h1 style={{ margin: "0", fontSize: v.L?.h1, fontWeight: "600", letterSpacing: "var(--tracking-tight)", lineHeight: "1.15" }}>{v.D?.label}</h1>
                  {v.canEdit ? (
                    <button className="btn ghost icon sm" aria-label="Edit label" style={{ width: "28px" }}><bg-icon name="pencil" size="14" /></button>
                  ) : null}
                  {v.hu ? (
                    <span className="has-tip">
                      <button className="btn ghost icon sm" aria-label="Edit label" aria-disabled="true" aria-describedby="tip-label" style={{ width: "28px", opacity: "0.45" }}>
                        <bg-icon name="pencil" size="14" />
                      </button>
                      <span className="tip" role="tooltip" id="tip-label">History unavailable · labels can't be saved</span>
                    </span>
                  ) : null}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px 12px", fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>
                  <span className="pill neutral" style={{ gap: "5px", color: "var(--fg)" }}><bg-icon name={v.D?.ctxIcon} size="12" stroke="2" />{v.D?.ctx}</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-caption)" }} title={v.D?.abs}>{v.D?.when}</span>
                  <span style={{ color: "var(--fg-subtle)" }}>·</span>
                  <span>{v.D?.preset}{" preset"}</span>
                  <span style={{ color: "var(--fg-subtle)" }}>·</span>
                  <span>{v.D?.server}</span>
                </div>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center" }}>
                <button className="btn secondary" onClick={v.dlJson} aria-describedby="json-warn"><bg-icon name="file-json" size="15" />Download JSON</button>
                <button className="btn primary"><bg-icon name="rotate-ccw" size="15" />Run again</button>
                {v.canEdit ? (
                  <button className="btn danger icon" aria-label="Delete result" title="Delete result" onClick={v.del}><bg-icon name="trash" size="15" /></button>
                ) : null}
                {v.hu ? (
                  <span className="has-tip tip-end">
                    <button className="btn danger icon" aria-label="Delete result" aria-disabled="true" aria-describedby="tip-del" style={{ opacity: "0.45" }}>
                      <bg-icon name="trash" size="15" />
                    </button>
                    <span className="tip" role="tooltip" id="tip-del">History unavailable · nothing saved to delete</span>
                  </span>
                ) : null}
                <span id="json-warn" style={{ flexBasis: "100%", display: "flex", alignItems: "center", gap: "5px", fontSize: "var(--text-micro)", color: "var(--fg-subtle)" }}>
                  <span style={{ color: "var(--warn)", display: "flex" }}><bg-icon name="triangle-alert" size="12" stroke="2" /></span>
                  JSON contains client IP and notes
                </span>
              </div>
            </header>
            <div style={{ display: "grid", gridTemplateColumns: v.L?.cols, gap: "24px", alignItems: "start" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "16px", minWidth: "0" }}>
                <div style={{ display: "grid", gridTemplateColumns: v.L?.tileCols, gap: v.L?.tileGap }}>
                  {(v.tiles || []).map((t, $index) => (
                    <React.Fragment key={$index}>
                      <div className="card" style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: "6px", boxShadow: "inset 0 1px 0 var(--card-highlight)" }}>
                        <span style={{ display: "flex", alignItems: "center", gap: "6px", fontFamily: "var(--font-cond)", fontWeight: "600", fontSize: "11px", letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--fg-subtle)" }}>
                          <span style={{ color: t?.ic, display: "flex" }}><bg-icon name={t?.icon} size="14" stroke="2" /></span>
                          {t?.label}
                        </span>
                        <span style={{ display: "flex", alignItems: "baseline", gap: "6px" }}>
                          <span style={{ fontFamily: "var(--font-mono)", fontWeight: "500", fontSize: v.L?.tileNum, letterSpacing: "-0.02em", lineHeight: "1.1", color: t?.nc }}>
                            {t?.num}
                          </span>
                          <span style={{ fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>{t?.unit}</span>
                        </span>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-micro)", color: "var(--fg-subtle)", lineHeight: "1.45" }}>{t?.sub}</span>
                      </div>
                    </React.Fragment>
                  ))}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: v.L?.midCols, gap: "12px" }}>
                  <div className="card" style={{ padding: "14px 16px", display: "flex", flexWrap: "wrap", gap: "16px", boxShadow: "inset 0 1px 0 var(--card-highlight)" }}>
                    <div style={{ flex: "1 0 150px", maxWidth: "220px", display: "flex", flexDirection: "column", gap: "8px" }}>
                      <span style={{ fontFamily: "var(--font-cond)", fontWeight: "600", fontSize: "11px", letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--fg-subtle)" }}>
                        Bufferbloat
                      </span>
                      <span role="img" aria-label={v.gradeAria} title={v.gradeAria} style={{ width: "52px", height: "52px", boxSizing: "border-box", borderRadius: "var(--radius-lg)", border: `1px solid ${v.gBd ?? ""}`, background: v.gBg, color: v.gFg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-mono)", fontWeight: "600", fontSize: "24px" }}>
                        {v.grade}
                      </span>
                      <span style={{ fontSize: "var(--text-sm)", fontWeight: "500" }}>{v.gradeWords}</span>
                      <span style={{ fontSize: "var(--text-caption)", color: "var(--fg-muted)", lineHeight: "1.45", textWrap: "pretty" }}>{v.gradeBasis}</span>
                    </div>
                    <div style={{ flex: "999 1 260px", minWidth: "0", display: "flex", flexDirection: "column" }}>
                      {(v.loadRows || []).map((r, $index) => (
                        <React.Fragment key={$index}>
                          <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px 0", borderBottom: "1px solid var(--border-subtle)" }}>
                            <span style={{ color: r?.ic, display: "flex" }}><bg-icon name={r?.icon} size="14" stroke="2" /></span>
                            <span style={{ flex: "1", display: "flex", flexDirection: "column" }}>
                              <span style={{ fontSize: "var(--text-sm)" }}>{r?.label}</span>
                              <span style={{ fontSize: "var(--text-micro)", color: "var(--fg-subtle)" }}>{r?.sub}</span>
                            </span>
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-lg)", fontWeight: "500", whiteSpace: "nowrap" }}>
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
                            <span style={{ fontSize: "var(--text-sm)", lineHeight: "1.4", textWrap: "pretty" }}>
                              HTTP loaded responsiveness — connection sharing not verifiable
                            </span>
                            <span style={{ fontSize: "var(--text-micro)", color: "var(--fg-subtle)" }}>{v.rpmSub}</span>
                          </div>
                          <span style={{ flex: "none", fontFamily: "var(--font-mono)", fontSize: "var(--text-micro)", color: "var(--fg-muted)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-xs)", padding: "1px 6px", whiteSpace: "nowrap" }}>
                            h2
                          </span>
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 18px", paddingLeft: "24px" }}>
                          {(v.rpm || []).map((rd, $index) => (
                            <React.Fragment key={$index}>
                              <div style={{ display: "flex", alignItems: "center", gap: "6px", minWidth: "0" }}>
                                <span style={{ color: rd?.ic, display: "flex" }}><bg-icon name={rd?.icon} size="12" stroke="2.25" /></span>
                                <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-lg)", fontWeight: "500", whiteSpace: "nowrap" }}>
                                  {rd?.num}{" "}
                                  <span style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-caption)", color: "var(--fg-muted)", fontWeight: "400" }}>RPM</span>
                                </span>
                              </div>
                            </React.Fragment>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="card" style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: "2px", boxShadow: "inset 0 1px 0 var(--card-highlight)" }}>
                    <span style={{ fontFamily: "var(--font-cond)", fontWeight: "600", fontSize: "11px", letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--fg-subtle)", marginBottom: "4px" }}>
                      Good for
                    </span>
                    {(v.fit || []).map((f, $index) => (
                      <React.Fragment key={$index}>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px", minHeight: "38px", borderBottom: "1px solid var(--border-subtle)" }}>
                          <span style={{ color: "var(--fg-subtle)", display: "flex" }}><bg-icon name={f?.icon} size="16" /></span>
                          <span style={{ fontSize: "var(--text-sm)", flex: "1" }}>{f?.label}</span>
                          <span className={f?.cls}><bg-icon name={f?.ricon} size="13" stroke="2" />{f?.rating}</span>
                        </div>
                      </React.Fragment>
                    ))}
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", minHeight: "38px" }}>
                      <span style={{ color: "var(--fg-subtle)", display: "flex" }}><bg-icon name="signal" size="16" /></span>
                      <span style={{ fontSize: "var(--text-sm)", flex: "1" }}>Packet loss</span>
                      <span style={{ display: "flex", alignItems: "center", gap: "8px", flex: "none" }}>
                        <span title="Browsers can't see packet loss over TCP" style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "var(--text-caption)", color: "var(--fg-subtle)", border: "1px dashed var(--border-strong)", borderRadius: "var(--radius-full)", padding: "2px 8px", whiteSpace: "nowrap" }}>
                          <bg-icon name="circle-dashed" size="12" />
                          Not measured
                        </span>
                        <a href="#" title="Browsers can't see packet loss over TCP" style={{ fontSize: "var(--text-caption)", fontWeight: "600", color: "var(--primary-text)", textDecoration: "none" }}>
                          Why?
                        </a>
                      </span>
                    </div>
                    <span style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "6px", fontSize: "var(--text-micro)", color: "var(--fg-subtle)", lineHeight: "1.4" }}>
                      <bg-icon name="info" size="12" />
                      Upper bound: packet loss is not measured
                    </span>
                  </div>
                </div>
                <section className="card" style={{ overflow: "hidden", boxShadow: "inset 0 1px 0 var(--card-highlight)" }} aria-labelledby="conf-h">
                  <div className="card-h">
                    <bg-icon name="shield" size="15" />
                    <span className="t" id="conf-h">Confidence and notices</span>
                    <span className="right" style={{ marginLeft: "auto" }}>
                      <span className={`pill ${v.conf?.tone ?? ""}`}><span className="d" />{v.conf?.label}</span>
                    </span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: v.L?.confCols, gap: "0 24px", padding: "4px 16px 8px" }}>
                    {(v.confGroups || []).map((cg, $index) => (
                      <React.Fragment key={$index}>
                        <div style={{ display: "flex", flexDirection: "column", minWidth: "0" }}>
                          <span style={{ padding: "10px 0 4px", fontFamily: "var(--font-cond)", fontWeight: "600", fontSize: "11px", letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--fg-subtle)" }}>
                            {cg?.h}
                          </span>
                          <ul style={{ listStyle: "none", margin: "0", padding: "0" }}>
                            {(cg?.items || []).map((n, $index) => (
                              <React.Fragment key={$index}>
                                <li style={{ display: "flex", gap: "10px", padding: "9px 0", borderTop: "1px solid var(--border-subtle)" }}>
                                  <span style={{ color: n?.c, display: "flex", marginTop: "2px" }}><bg-icon name={n?.icon} size="15" stroke="2" /></span>
                                  <div style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" }}>
                                    <span style={{ fontSize: "var(--text-sm)", fontWeight: "500", lineHeight: "1.4" }}>{n?.title}</span>
                                    <span style={{ fontSize: "var(--text-caption)", color: "var(--fg-muted)", lineHeight: "1.45", textWrap: "pretty" }}>{n?.body}</span>
                                  </div>
                                </li>
                              </React.Fragment>
                            ))}
                          </ul>
                        </div>
                      </React.Fragment>
                    ))}
                  </div>
                </section>
                <div style={{ display: "grid", gridTemplateColumns: v.L?.chartCols, gap: "12px" }}>
                  {(v.charts || []).map((k, $index) => (
                    <React.Fragment key={$index}>
                      <section className="card" style={{ gridColumn: k?.span, padding: "14px 16px 12px", display: "flex", flexDirection: "column", gap: "10px", minWidth: "0", boxShadow: "inset 0 1px 0 var(--card-highlight)" }}>
                        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px 14px" }}>
                          <span style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "var(--text-sm)", fontWeight: "600" }}>
                            <span style={{ color: k?.c, display: "flex" }}><bg-icon name={k?.icon} size="14" stroke="2" /></span>
                            {k?.title}
                          </span>
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-caption)", color: "var(--fg-subtle)" }}>{k?.meta}</span>
                          {k?.c2 ? (
                            <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "6px", fontSize: "var(--text-caption)", color: "var(--fg-muted)" }}>
                              <span style={{ width: "14px", borderTop: "2px dashed var(--series-latency)" }} />
                              Latency under load
                            </span>
                          ) : null}
                          <div className="seg" role="radiogroup" aria-label={`${k?.title ?? ""} view`} style={{ marginLeft: k?.toggleML }}>
                            <button className={k?.chartCls} role="radio" aria-checked={k?.chartAria} onClick={k?.toChart} style={{ height: "28px", padding: "0 10px", fontSize: "var(--text-caption)" }}>
                              Chart
                            </button>
                            <button className={k?.tableCls} role="radio" aria-checked={k?.tableAria} onClick={k?.toTable} style={{ height: "28px", padding: "0 10px", fontSize: "var(--text-caption)" }}>
                              Table
                            </button>
                          </div>
                        </div>
                        {k?.isChart ? (
                          <>
                            <div style={{ position: "relative", alignSelf: "flex-start" }}>
                            <svg width={k?.g?.w} height={k?.g?.h} style={{ display: "block", overflow: "visible" }} role="img" aria-label={k?.aria}>
                              {(k?.g?.grid || []).map((gl, $index) => (
                                <React.Fragment key={$index}>
                                  <line x1={gl?.x1} y1={gl?.y} x2={gl?.x2} y2={gl?.y} style={{ stroke: "var(--border-subtle)" }} />
                                </React.Fragment>
                              ))}
                              {(k?.segs || []).map((sg, $index) => (
                                <React.Fragment key={$index}>
                                  <path d={sg?.area} style={{ fill: k?.c, fillOpacity: "0.1" }} />
                                  <path d={sg?.line} style={{ fill: "none", stroke: k?.c, strokeWidth: "1.5", strokeLinejoin: "round" }} />
                                </React.Fragment>
                              ))}
                              {(k?.latSegs || []).map((ls, $index) => (
                                <React.Fragment key={$index}>
                                  <path d={ls} style={{ fill: "none", stroke: "var(--series-latency)", strokeWidth: "1.25", strokeDasharray: "4 3" }} />
                                </React.Fragment>
                              ))}
                              {(k?.marks || []).map((mk, $index) => (
                                <React.Fragment key={$index}>
                                  <line x1={mk?.x} y1={k?.g?.plotT} x2={mk?.x} y2={k?.g?.plotB} style={{ stroke: mk?.c, strokeWidth: "1.25", strokeDasharray: "3 3" }} />
                                </React.Fragment>
                              ))}
                            </svg>
                            <div aria-hidden="true" style={{ position: "absolute", inset: "0", pointerEvents: "none", fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--fg-subtle)" }}>
                              {k?.wu ? (
                                <span style={{ position: "absolute", left: `${k?.wu?.x ?? ""}px`, top: `${k?.wu?.y ?? ""}px`, width: `${k?.wu?.w ?? ""}px`, height: `${k?.wu?.h ?? ""}px`, boxSizing: "border-box", borderRight: "1px solid var(--chart-hatch)", background: "repeating-linear-gradient(135deg, var(--chart-hatch) 0 1px, transparent 1px 6px)" }} />
                              ) : null}
                              {(k?.gaps || []).map((gp, $index) => (
                                <React.Fragment key={$index}>
                                  <span style={{ position: "absolute", left: `${gp?.x ?? ""}px`, top: `${gp?.y ?? ""}px`, width: `${gp?.w ?? ""}px`, height: `${gp?.h ?? ""}px`, boxSizing: "border-box", borderLeft: "1px dashed var(--chart-hatch)", borderRight: "1px dashed var(--chart-hatch)" }} />
                                </React.Fragment>
                              ))}
                              {(k?.g?.grid || []).map((gl, $index) => (
                                <React.Fragment key={$index}>
                                  <span style={{ position: "absolute", left: `${gl?.lx ?? ""}px`, top: `${gl?.ly ?? ""}px`, transform: "translate(-100%,-75%)", whiteSpace: "nowrap" }}>
                                    {gl?.t}
                                  </span>
                                </React.Fragment>
                              ))}
                              {(k?.g?.xt || []).map((xt, $index) => (
                                <React.Fragment key={$index}>
                                  <span style={{ position: "absolute", left: `${xt?.x ?? ""}px`, top: `${xt?.y ?? ""}px`, transform: "translate(-50%,-75%)" }}>{xt?.t}</span>
                                </React.Fragment>
                              ))}
                              {k?.g?.lat ? (
                                <>
                                  {(k?.g?.lat?.ticks || []).map((lt, $index) => (
                                  <React.Fragment key={$index}>
                                    <span style={{ position: "absolute", left: `${lt?.x ?? ""}px`, top: `${lt?.y ?? ""}px`, transform: "translateY(-75%)", whiteSpace: "nowrap", color: "var(--series-latency)" }}>
                                      {lt?.t}
                                    </span>
                                  </React.Fragment>
                                ))}
                                </>
                              ) : null}
                              {(k?.marks || []).map((mk, $index) => (
                                <React.Fragment key={$index}>
                                  <span style={{ position: "absolute", left: `${mk?.lx ?? ""}px`, top: `${mk?.ly ?? ""}px`, transform: mk?.tf, display: "flex", alignItems: "center", gap: "3px", padding: "1px 5px", borderRadius: "var(--radius-xs)", background: "var(--surface-2)", border: `1px solid ${mk?.bd ?? ""}`, color: mk?.fg, fontFamily: "var(--font-sans)", fontSize: "10px", fontWeight: "600", whiteSpace: "nowrap" }}>
                                    <bg-icon name={mk?.icon} size="10" stroke="2.25" />
                                    {mk?.t}
                                  </span>
                                </React.Fragment>
                              ))}
                            </div>
                          </div>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 14px", fontSize: "var(--text-micro)", color: "var(--fg-subtle)" }}>
                            {k?.wu ? (
                              <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                <span style={{ width: "14px", height: "10px", boxSizing: "border-box", borderRight: "1px solid var(--chart-hatch)", background: "repeating-linear-gradient(135deg, var(--chart-hatch) 0 1px, transparent 1px 4px)" }} />
                                {k?.wuLabel}
                              </span>
                            ) : null}
                            {k?.hasGaps ? (
                              <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                <span style={{ width: "12px", height: "10px", boxSizing: "border-box", borderLeft: "1px dashed var(--chart-hatch)", borderRight: "1px dashed var(--chart-hatch)" }} />
                                {k?.gapLabel}
                              </span>
                            ) : null}
                          </div>
                          </>
                        ) : null}
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
                            <span style={{ fontSize: "var(--text-micro)", color: "var(--fg-subtle)", lineHeight: "1.5", textWrap: "pretty" }}>{k?.foot}</span>
                          </>
                        ) : null}
                      </section>
                    </React.Fragment>
                  ))}
                </div>
              </div>
              <aside style={{ display: "flex", flexDirection: "column", gap: "16px", minWidth: "0" }}>
                <section className="card" style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: "10px" }}>
                  <label htmlFor="note" style={{ display: "flex", alignItems: "center", gap: "6px", fontFamily: "var(--font-cond)", fontWeight: "600", fontSize: "11px", letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--fg-subtle)" }}>
                    <bg-icon name="file-text" size="13" />
                    Note
                  </label>
                  {v.canEdit ? (
                    <>
                      <textarea id="note" rows="3" onChange={v.setNote} value={v.note} style={{ resize: "vertical", background: "var(--surface-1)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-md)", color: "var(--fg)", fontFamily: "var(--font-sans)", fontSize: "var(--text-sm)", lineHeight: "1.5", padding: "8px 10px" }} />
                      <span style={{ fontSize: "var(--text-micro)", color: "var(--fg-subtle)" }}>
                      Saved automatically in this browser. Never included when you share.
                    </span>
                    </>
                  ) : null}
                  {v.hu ? (
                    <div className="has-tip" style={{ display: "flex", flexDirection: "column" }}>
                      <textarea id="note" rows="3" readOnly={true} aria-disabled="true" aria-describedby="tip-note" placeholder="Add a note" style={{ resize: "none", cursor: "not-allowed", opacity: "0.45", background: "var(--surface-1)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-md)", color: "var(--fg)", fontFamily: "var(--font-sans)", fontSize: "var(--text-sm)", lineHeight: "1.5", padding: "8px 10px" }} />
                      <span className="tip" role="tooltip" id="tip-note">History unavailable · notes can't be saved</span>
                    </div>
                  ) : null}
                </section>
                <section className="card" style={{ overflow: "hidden" }}>
                  <div className="card-h">
                    <bg-icon name="image" size="15" />
                    <span className="t">Share image</span>
                    <span className="right" style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: "var(--text-micro)", color: "var(--fg-subtle)" }}>
                      1200 × 630 PNG
                    </span>
                  </div>
                  <div style={{ padding: "14px", display: "flex", flexDirection: "column", gap: "12px" }}>
                    <div data-theme="dark" role="img" aria-label={v.shareAria} style={{ aspectRatio: "1200/630", borderRadius: "var(--radius-md)", background: "var(--bg-base)", border: "1px solid var(--border-default)", padding: "12px 14px", display: "flex", flexDirection: "column", justifyContent: "space-between", gap: "6px", color: "var(--fg)", boxSizing: "border-box" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", fontWeight: "600", minWidth: "0" }}>
                        <bg-logo size="15" style={{ color: "var(--fg)" }} />
                        <span style={{ letterSpacing: "var(--tracking-tight)" }}>
                          Bit
                          <span style={{ color: "var(--primary-text)", fontWeight: "var(--weight-semibold)" }}>Gauge</span>
                        </span>
                        <span style={{ marginLeft: "auto", display: "flex", gap: "5px", minWidth: "0", fontFamily: "var(--font-mono)", fontWeight: "400", fontSize: "9px", color: "var(--fg-subtle)", whiteSpace: "nowrap" }}>
                          {v.inc ? (
                            <span style={{ color: "var(--fg)", overflow: "hidden", textOverflow: "ellipsis" }}>{v.D?.label}</span>
                          ) : null}
                        </span>
                      </div>
                      <div style={{ display: "flex", gap: "16px", alignItems: "flex-end" }}>
                        {(v.shareBlocks || []).map((b, $index) => (
                          <React.Fragment key={$index}>
                            <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                              <span style={{ fontFamily: "var(--font-cond)", fontSize: "8px", letterSpacing: ".08em", color: b?.c, fontWeight: "600" }}>{b?.k}</span>
                              <span style={{ fontFamily: "var(--font-mono)", fontSize: "24px", fontWeight: "500", lineHeight: "1" }}>
                                {b?.n}
                                <span style={{ fontFamily: "var(--font-sans)", fontSize: "10px", color: "var(--fg-muted)", marginLeft: "3px" }}>{b?.u}</span>
                              </span>
                            </div>
                          </React.Fragment>
                        ))}
                        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "6px" }}>
                          <span style={{ width: "30px", height: "30px", boxSizing: "border-box", borderRadius: "var(--radius-sm)", border: `1px solid ${v.gBd ?? ""}`, background: v.gBg, color: v.gFg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-mono)", fontWeight: "600", fontSize: "15px" }}>
                            {v.grade}
                          </span>
                          <span style={{ display: "flex", flexDirection: "column", fontSize: "9px", lineHeight: "1.25" }}>
                            <span style={{ fontWeight: "600" }}>{v.gShort}</span>
                            <span style={{ color: "var(--fg-subtle)" }}>bufferbloat</span>
                          </span>
                        </div>
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "3px 10px", fontFamily: "var(--font-mono)", fontSize: "9px", color: "var(--fg-muted)" }}>
                        {(v.shareFoot || []).map((f, $index) => (
                          <React.Fragment key={$index}>
                            <span>{f}</span>
                          </React.Fragment>
                        ))}
                        <span style={{ marginLeft: "auto", color: "var(--fg-subtle)" }}>{v.D?.server}</span>
                      </div>
                    </div>
                    <label style={{ display: "flex", alignItems: "flex-start", gap: "8px", fontSize: "var(--text-sm)", cursor: "pointer" }}>
                      <input type="checkbox" checked={v.inc} onChange={v.toggleInc} style={{ width: "16px", height: "16px", margin: "2px 0 0", accentColor: "var(--primary)" }} />
                      <span style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
                        {"Include label "}
                        <span style={{ fontSize: "var(--text-micro)", color: "var(--fg-subtle)" }}>
                          Adds “{v.D?.label}” to the image and the text. IP address and note are never shared.
                        </span>
                      </span>
                    </label>
                    <div style={{ display: "grid", gridTemplateColumns: v.shareCols, gap: "8px" }}>
                      {v.canShare ? (
                        <button className="btn secondary" onClick={v.share} title="Sends the image to the system share sheet" style={{ justifyContent: "center" }}>
                          <bg-icon name="share" size="15" />
                          Share
                        </button>
                      ) : null}
                      <button className="btn secondary" onClick={v.dlImg} style={{ justifyContent: "center" }}><bg-icon name="download" size="15" />Download image</button>
                    </div>
                  </div>
                </section>
                <section className="card" style={{ overflow: "hidden" }}>
                  <div className="card-h">
                    <bg-icon name="file-text" size="15" />
                    <span className="t">Text summary</span>
                    <button className="btn ghost sm right" onClick={v.copy} style={{ marginLeft: "auto" }}><bg-icon name="copy" size="13" />Copy</button>
                  </div>
                  {v.denied ? (
                    <div role="alert" style={{ display: "flex", gap: "8px", padding: "10px 16px", background: "var(--warn-bg)", borderBottom: "1px solid var(--warn-border)", fontSize: "var(--text-caption)", lineHeight: "1.45" }}>
                      <span style={{ color: "var(--warn)", display: "flex", marginTop: "1px" }}><bg-icon name="triangle-alert" size="14" stroke="2" /></span>
                      <span style={{ textWrap: "pretty" }}>
                        {"Clipboard access was denied. The text below is selected — press "}
                        <span style={{ fontFamily: "var(--font-mono)" }}>Ctrl+C</span>
                        {" ("}
                        <span style={{ fontFamily: "var(--font-mono)" }}>⌘C</span>
                        {" on Mac) to copy it."}
                      </span>
                    </div>
                  ) : null}
                  <pre ref={v.preRef} tabIndex="0" aria-label="Text summary" style={{ margin: "0", padding: "12px 16px", background: "var(--term-bg)", color: "var(--term-fg)", fontFamily: "var(--font-mono)", fontSize: "var(--text-micro)", lineHeight: "1.65", whiteSpace: "pre-wrap", userSelect: "text", outline: v.preOutline, outlineOffset: "-2px" }}>{v.summary}</pre>
                </section>
                <section className="card" style={{ overflow: "hidden" }}>
                  {v.mobile ? (
                    <button className="card-h" onClick={v.toggleParams} aria-expanded={v.paramsAria} aria-controls="params" style={{ width: "100%", boxSizing: "border-box", background: "none", border: "0", borderBottom: v.paramsBorder, color: "inherit", font: "inherit", textAlign: "left", cursor: "pointer", minHeight: "44px" }}>
                      <bg-icon name="sliders" size="15" />
                      <span className="t">Test parameters</span>
                      <span style={{ marginLeft: "auto", display: "flex", color: "var(--fg-subtle)" }}><bg-icon name={v.paramsChevron} size="16" /></span>
                    </button>
                  ) : null}
                  {v.desktop ? (
                    <div className="card-h"><bg-icon name="sliders" size="15" /><span className="t">Test parameters</span></div>
                  ) : null}
                  {v.paramsShown ? (
                    <div id="params" style={{ padding: "2px 16px 10px" }}>
                      {(v.params || []).map((pg, $index) => (
                        <React.Fragment key={$index}>
                          <div style={{ display: "flex", flexDirection: "column" }}>
                            <span style={{ padding: "12px 0 4px", fontFamily: "var(--font-cond)", fontWeight: "600", fontSize: "11px", letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--fg-subtle)" }}>
                              {pg?.h}
                            </span>
                            <dl style={{ margin: "0" }}>
                              {(pg?.rows || []).map((p, $index) => (
                                <React.Fragment key={$index}>
                                  <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", padding: "7px 0", borderTop: "1px solid var(--border-subtle)" }}>
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
                </section>
              </aside>
            </div>
          </main>
        ) : null}
        {v.toast ? (
          <div style={{ position: "sticky", bottom: "16px", zIndex: "50", display: "flex", justifyContent: "flex-end", padding: "16px", pointerEvents: "none" }}>
            <div className={`toast ${v.toast?.kind ?? ""}`} role="status" aria-live="polite" style={{ pointerEvents: "auto", maxWidth: "100%", boxSizing: "border-box", alignItems: "center" }}>
              <span className="i" style={{ display: "flex" }}><bg-icon name={v.toast?.icon} size="16" stroke="2" /></span>
              <div style={{ flex: "1", minWidth: "0" }}>
                <div className="t">{v.toast?.t}</div>
                {v.toast?.m ? (
                  <div className="m">{v.toast?.m}</div>
                ) : null}
              </div>
              {v.toast?.undo ? (
                <button className="btn secondary sm" onClick={v.undo}><bg-icon name="undo-2" size="13" />Undo</button>
              ) : null}
              <button className="btn ghost sm icon" aria-label="Dismiss" onClick={v.dismiss}><bg-icon name="x" size="14" /></button>
            </div>
          </div>
        ) : null}
        {v.mobile ? (
          <Nav variant="mobile-bottom" active="history" status={this.props.srvStatus || "connected"} />
        ) : null}
      </div>
    );
  }
}

window.ResultDetail = ResultDetail;
