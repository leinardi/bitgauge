/* BitGauge web UI kit — ResultDetail
 * Props:
 *   mobile: boolean  (default false)
 *   state: "result" | "not-found" | "history-unavailable"  (default "result")
 *   kind: "standard" | "continuous"  (default "standard")
 *   tableView: boolean  (default false)
 *   includeLabel: boolean  (default false)
 *   demo: "none" | "deleted" | "clipboard-denied"  (default "none")
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

    const mb = v => v / 1e6, rn = v => v == null ? '—' : mb(v) >= 100 ? String(Math.round(mb(v))) : mb(v).toFixed(1), rs = v => v == null ? '—' : rn(v) + ' Mbit/s';
    const jit = v => v < 10 ? v.toFixed(1) : String(Math.round(v));
    const med = a => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y), h = s.length >> 1; return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2; };
    const mmss = s => Math.floor(s / 60) + ':' + String(Math.round(s % 60)).padStart(2, '0');
    const T = { ok: 'var(--ok)', warn: 'var(--warn)', danger: 'var(--danger)', info: 'var(--info)', neutral: 'var(--fg-subtle)' };
    const it = (tone, icon, title, body) => ({ c: T[tone], icon, title, body });

    // Continuous: stored 1-min cells from warm-up end (3 s); cells 12–13 unknown; data cap ends the run at 27:43.
    const CWU = 3, CEND = 1663, cells = [];
    for (let i = 0; CWU + 60 * i < CEND; i++) {
      const a = CWU + 60 * i, b = Math.min(a + 60, CEND), unk = i === 12 || i === 13;
      cells.push({ a, b, known: unk ? 0 : b - a, v: unk ? null : 412e6 + 26e6 * Math.sin(i * 0.7) + 11e6 * Math.cos(i * 2.3) - (i >= 4 && i <= 9 ? 31e6 : 0), l: unk ? null : 17 + 3.5 * Math.sin(i * 1.3) + (i % 5) * 0.5 });
    }
    const kc = cells.filter(c => c.known), cAvg = kc.reduce((s, c) => s + c.v * c.known, 0) / kc.reduce((s, c) => s + c.known, 0);

    const D = cont ? {
      label: 'Overnight check', ctx: 'LAN', ctxIcon: 'house', when: 'Thu 8 Oct 2026 · 01:00:04', abs: '2026-10-08 01:00:04 CEST', crumb: '2026-10-08 01:00', short: 'Thu 8 Oct 2026 · 01:00', file: 'bitgauge-2026-10-08-0100',
      preset: 'Continuous', server: 'Basement NAS', note: 'Checking whether the evening dip comes back after midnight.', down: cAvg, up: null, worst: ['download', 15]
    } : {
      label: 'Home Wi-Fi', ctx: 'LAN', ctxIcon: 'house', when: 'Thu 8 Oct 2026 · 14:02:11', abs: '2026-10-08 14:02:11 CEST', crumb: '2026-10-08 14:02', short: 'Thu 8 Oct 2026 · 14:02', file: 'bitgauge-2026-10-08-1402',
      preset: 'Standard', server: 'Basement NAS', note: 'Office desk, 5 GHz. Router is in the hallway, one wall between.', down: 612e6, up: 438e6, worst: ['upload', 39]
    };
    const IDLE = 3.1, JIT = 0.8;
    const worstStr = '+' + D.worst[1] + ' ms loaded (' + D.worst[0] + ')';

    const summary = [
      'BitGauge' + (inc ? ' · ' + D.label : ''),
      D.short,
      'Download ' + rs(D.down) + ' · Upload ' + rs(D.up),
      'Idle latency ' + IDLE.toFixed(1) + ' ms · Jitter ' + jit(JIT) + ' ms',
      'Loaded latency +' + D.worst[1] + ' ms (' + D.worst[0] + ')',
      'Bufferbloat grade B · Mild',
      'Server: ' + D.server
    ].join('\n');

    const tiles = [
      { label: cont ? 'Download · average' : 'Download', icon: 'arrow-down', ic: 'var(--series-download)', num: rn(D.down), unit: 'Mbit/s', nc: 'var(--fg)', sub: cont ? 'time-weighted over ' + kc.length + ' of ' + cells.length + ' cells · 6 streams' : 'peak 641 · 6 streams · plateau: no-gain' },
      cont ? { label: 'Upload', icon: 'arrow-up', ic: 'var(--series-upload)', num: '—', unit: '', nc: 'var(--fg-subtle)', sub: 'not measured · Continuous runs one direction' }
        : { label: 'Upload', icon: 'arrow-up', ic: 'var(--series-upload)', num: '438', unit: 'Mbit/s', nc: 'var(--fg)', sub: 'peak 455 · 6 streams · plateau: no-gain · 12.3 of 14.5 s known' },
      { label: 'Idle latency', icon: 'activity', ic: 'var(--series-latency)', num: IDLE.toFixed(1), unit: 'ms', nc: 'var(--fg)', sub: 'min 2.4 · p90 4.1 ms · WebSocket · 0 % probe timeouts' },
      { label: 'Jitter', icon: 'activity', ic: 'var(--series-latency)', num: jit(JIT), unit: 'ms', nc: 'var(--fg)', sub: 'mean of consecutive differences' }
    ];
    const loadRows = [{ icon: 'arrow-down', ic: 'var(--primary-text)', label: 'During download · WebSocket', sub: 'p90 24 · +15 ms vs idle', num: '18', unit: 'ms' }];
    if (!cont) loadRows.push({ icon: 'arrow-up', ic: 'var(--series-upload)', label: 'During upload · WebSocket', sub: 'p90 55 · +39 ms vs idle', num: '42', unit: 'ms' });
    const rpm = [{ icon: 'arrow-down', ic: 'var(--series-download)', num: '1,420' }].concat(cont ? [] : [{ icon: 'arrow-up', ic: 'var(--series-upload)', num: '980' }]);

    const conf = cont ? { label: 'Medium confidence', tone: 'neutral' } : { label: 'High confidence', tone: 'ok' };
    const confGroups = cont ? [
      { h: 'Confidence reasons', items: [
        it('warn', 'circle-alert', '26 of 28 cells have known time', 'Cells 12:03–14:03 have no known time and are left out of the average.'),
        it('ok', 'circle-check', 'Throughput stable across cells', 'Known cells stay within 12 % of the average.'),
        it('ok', 'circle-check', 'Idle latency from 20 of 20 pings', 'No probe timeouts.'),
        it('ok', 'circle-check', 'Precise timers', 'Timer resolution 0.02 ms; the page is cross-origin isolated.')
      ] },
      { h: 'Notices', items: [
        it('warn', 'database', 'Data cap reached at 27:43', 'The 80 GB cap ended the run. The last cell covers 40 s, not a full minute.'),
        it('warn', 'pause', 'No data from 12:03 to 14:03', 'The tab was in the background and the browser throttled requests.'),
        it('neutral', 'circle-dashed', 'Upload not measured', 'Continuous runs one direction.'),
        it('neutral', 'circle-dashed', 'Packet loss not measured', 'Browsers can’t see packet loss over TCP, so the grade is an upper bound.'),
        it('neutral', 'gauge', 'Connection sharing not verifiable', 'Responsiveness ran over HTTP/2; the browser doesn’t report whether probes shared the load connections.')
      ] }
    ] : [
      { h: 'Confidence reasons', items: [
        it('ok', 'circle-check', 'Both directions reached a plateau', 'Adding streams stopped helping at 6 (no-gain), inside the 20 s maximum.'),
        it('warn', 'circle-alert', '85 % of upload time known', '2.2 s of 14.5 s is unknown after a failed request. The average uses known time only.'),
        it('ok', 'circle-check', 'Idle latency from 20 of 20 pings', 'No probe timeouts.'),
        it('ok', 'circle-check', 'Precise timers', 'Timer resolution 0.02 ms; the page is cross-origin isolated.')
      ] },
      { h: 'Notices', items: [
        it('danger', 'circle-x', 'Upload request failed at 7.4 s', 'It was retried. 7.4–9.6 s has no known data and is drawn as a gap.'),
        it('info', 'timer', 'Upload extended to 16 s', 'Throughput was still rising at 12 s, so the phase ran longer.'),
        it('neutral', 'circle-dashed', 'Packet loss not measured', 'Browsers can’t see packet loss over TCP, so the grade is an upper bound.'),
        it('neutral', 'gauge', 'Connection sharing not verifiable', 'Responsiveness ran over HTTP/2; the browser doesn’t report whether probes shared the load connections.'),
        it('neutral', 'sliders', 'Overhead compensation on', 'Throughput includes an estimated 2.6 % for HTTP/2 and TLS framing.')
      ] }
    ];

    const P = (h, rows) => ({ h, rows: rows.map(([k, v]) => ({ k, v })) });
    const params = cont ? [
      P('Test', [['Preset', 'Continuous'], ['Phases and order', 'Idle latency → Download (continuous)'], ['Streams', 'Auto · 6 · plateau: no-gain']]),
      P('Limits', [['Duration', '27:43 · no maximum · ended by data cap'], ['Cell size', '1 min'], ['Data cap', '80 GB · reached']]),
      P('Measurement', [['Units', 'Bits · Mbit/s'], ['Warm-up', 'Fixed · 3 s'], ['Ping count', '20'], ['Overhead compensation', 'On · +2.6 %'], ['Protocol', 'HTTP/2']]),
      P('Environment', [['Server', 'Basement NAS · v1.4.0'], ['Browser', 'Firefox 131 · Linux'], ['Client IP', '192.168.1.42'], ['Timer resolution', '0.02 ms'], ['Cross-origin isolated', 'Yes']])
    ] : [
      P('Test', [['Preset', 'Standard'], ['Phases and order', 'Idle latency → Download → Upload'], ['Streams', 'Auto · 6 · plateau: no-gain']]),
      P('Limits', [['Download', '12.0 s · min 8 · max 20'], ['Upload', '16.0 s · min 8 · max 20 · extended'], ['Data cap', '5 GB · 1.48 GB used']]),
      P('Measurement', [['Units', 'Bits · Mbit/s'], ['Warm-up', 'Auto · 1.5 s'], ['Ping count', '20'], ['Overhead compensation', 'On · +2.6 %'], ['Protocol', 'HTTP/2']]),
      P('Environment', [['Server', 'Basement NAS · v1.4.0'], ['Browser', 'Firefox 131 · Linux'], ['Client IP', '192.168.1.42'], ['Timer resolution', '0.02 ms'], ['Cross-origin isolated', 'Yes']])
    ];

    let toast = this.state.toast;
    if (delSt === 'pending') toast = { kind: 'info', icon: 'trash', t: 'Result deleted.', m: 'Removed from history in ' + this.state.delN + ' s.', undo: true };
    const commit = () => { clearInterval(this._di); this.setState({ del: 'done', toast: null }); };

    const base = {
      mobile: m, desktop: !m, L, D, hu, canEdit: !hu, found: !notFound, notFound,
      nf: delSt === 'done' ? { icon: 'trash', title: 'Result deleted', body: 'It has been removed from history in this browser.' } : { icon: 'search', title: 'Result not found', body: 'This result isn’t in this browser’s history. It may have been deleted, or saved in a different browser.' },
      dimOp: delSt === 'pending' ? '0.45' : '1',
      tiles, loadRows, rpm, rpmSub: cont ? 'round trips per minute, download only' : 'round trips per minute, one per direction',
      fit: [['Streaming', 'tv', 'Great', 'ok', 'circle-check'], ['Gaming', 'gamepad', 'Good', 'ok', 'circle-check'], ['Video calls', 'video', 'Great', 'ok', 'circle-check']].map(([label, icon, rating, tone, ricon]) => ({ label, icon, rating, cls: 'sbadge ' + tone, ricon })),
      conf, confGroups, params, summary, inc, denied,
      note: this.state.note ?? D.note,
      setNote: e => this.setState({ note: e.target.value }),
      toggleInc: () => this.setState({ inc: !inc }),
      shareBlocks: [{ k: '↓ DOWNLOAD', c: 'var(--series-download)', n: rn(D.down), u: 'Mbit/s' }, { k: '↑ UPLOAD', c: 'var(--series-upload)', n: rn(D.up), u: D.up == null ? '' : 'Mbit/s' }],
      shareFoot: [IDLE.toFixed(1) + ' ms idle', jit(JIT) + ' ms jitter', worstStr],
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
      share: () => {
        if (navigator.share) navigator.share({ title: 'BitGauge result', text: summary }).catch(() => {});
        else this.toast({ kind: 'info', icon: 'info', t: 'Sharing isn’t available in this browser.', m: 'Use Download image or Copy instead.' });
      },
      dlImg: () => this.toast({ kind: 'ok', icon: 'circle-check', t: 'Image downloaded.', m: D.file + '.png' }),
      dlJson: () => {
        const obj = { format: 'bitgauge-result', version: 1, startedAt: D.abs, label: D.label, note: this.state.note ?? D.note, preset: D.preset, server: { name: D.server, version: '1.4.0' },
          download_bps: Math.round(D.down), upload_bps: D.up, idle_latency_ms: IDLE, jitter_ms: JIT, grade: 'B', params: params.flatMap(g => g.rows) };
        try { const u = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' })); const a = document.createElement('a'); a.href = u; a.download = D.file + '.json'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 1000); } catch (e) {}
        this.toast({ kind: 'ok', icon: 'circle-check', t: 'JSON downloaded.', m: D.file + '.json' });
      }
    };
    if (!BG) return Object.assign(base, { charts: [] });

    // ---------- charts ----------
    const EV = {
      extended: { icon: 'timer', c: 'var(--info)', fg: 'var(--info-fg)', bd: 'var(--info-border)', t: 'Extended' },
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
      const S = split(o.pts), H = g.plotB - g.plotT;
      const segs = S.map(s => { const l = path(s, Y); return { line: l, area: l + 'L' + X(s[s.length - 1][0]).toFixed(1) + ' ' + g.plotB + 'L' + X(s[0][0]).toFixed(1) + ' ' + g.plotB + 'Z' }; });
      const gaps = []; for (let i = 1; i < S.length; i++) { const x0 = X(S[i - 1][S[i - 1].length - 1][0]), x1 = X(S[i][0][0]); gaps.push({ x: x0.toFixed(1), w: (x1 - x0).toFixed(1), y: g.plotT, h: H }); }
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
    const TCOLS = ['2 s windows', 'Known', 'Throughput', 'Latency (median)'];
    const TFOOT = 'From warm-up end (1.5 s). Throughput = bytes ÷ known time; “—” = no known time in that window. Full samples are in the JSON export.';
    const cw = m ? 309 : 320, ch = m ? 150 : 170, sp = m ? 'auto' : 'span 1', wide = m ? 309 : 690;
    const ping = tidy(BG.lat(4, 3.1, 3.1, 1.9, 0.1, 0.4), 0, 2);
    const pingRows = [0, 5, 10, 15].map(s => { const g = ping.slice(s, s + 5).map(p => p[1]); return [cL((s + 1) + '–' + (s + 5)), cV(BG.ms(med(g)) + ' ms'), cK(BG.ms(Math.min(...g)) + ' ms'), cK(BG.ms(Math.max(...g)) + ' ms')]; });
    const idle = mk({ key: 'idle', title: 'Idle latency', icon: 'activity', c: 'var(--series-latency)', pts: ping, xMax: 2, ms: true, meta: '20 pings · median 3.1 ms', w: wide, h: m ? 100 : 120, span: m ? 'auto' : 'span 2',
      cols: ['Pings', 'Median', 'Min', 'Max'], rows: pingRows, foot: 'Groups of 5 pings in send order. No warm-up for latency.' });
    let charts;
    if (cont) {
      const cpts = cells.map(c => [(c.a + c.b) / 2, c.v]), clat = cells.map(c => [(c.a + c.b) / 2, c.l]);
      const crow = cells.map(c => [cL(mmss(c.a) + '–' + mmss(c.b)), cK(c.known + ' s'), cV(rs(c.v)), cV(c.l == null ? '—' : BG.ms(c.l) + ' ms')]);
      charts = [mk({ key: 'down', title: 'Download', icon: 'arrow-down', c: 'var(--series-download)', pts: cpts, lat: clat, xMax: 1680, xStep: 300, xLabel: t => Math.round(t / 60) + 'm', wu: CWU, wuText: '0–0:03',
        marks: [[CEND, 'cap']], meta: '27:43 · 1 min cells · 6 streams', w: wide, h: m ? 150 : 190, span: m ? 'auto' : 'span 2', gapLabel: 'Unknown cells',
        cols: ['1 min averages', 'Known', 'Throughput', 'Latency (median)'], rows: crow, foot: 'One row per stored cell, from warm-up end (0:03). The last cell is shorter because the data cap ended the run. “—” = no known time.' }), idle];
    } else {
      const dEnd = 12, uEnd = 16, WU = 1.5;
      const dPts = tidy(BG.thr(3, 612e6, dEnd), WU, dEnd), dLat = tidy(BG.lat(5, 3.1, 18, dEnd, 0.25), WU, dEnd);
      const uPts = tidy(BG.thr(7, 438e6, uEnd), WU, uEnd).map(p => p[0] > 7.4 + 1e-6 && p[0] < 9.6 - 1e-6 ? [p[0], null] : p), uLat = tidy(BG.lat(9, 3.1, 42, uEnd, 0.25), WU, uEnd);
      charts = [
        mk({ key: 'down', title: 'Download', icon: 'arrow-down', c: 'var(--series-download)', pts: dPts, lat: dLat, xMax: dEnd, wu: WU, wuText: '0–1.5 s', meta: '12 s · 6 streams', w: cw, h: ch, span: sp,
          cols: TCOLS, rows: winRows(dPts, dLat, WU, dEnd), foot: TFOOT }),
        mk({ key: 'up', title: 'Upload', icon: 'arrow-up', c: 'var(--series-upload)', pts: uPts, lat: uLat, xMax: uEnd, wu: WU, wuText: '0–1.5 s', marks: [[7.4, 'error'], [12, 'extended']], meta: '16 s · 6 streams', w: cw, h: ch, span: sp, gapLabel: 'No known data (failed request)',
          cols: TCOLS, rows: winRows(uPts, uLat, WU, uEnd), foot: TFOOT }),
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
          <Nav variant="top" active="history" />
        ) : null}
        {v.mobile ? (
          <Nav variant="mobile-top" active="history" />
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
                <button className="btn secondary" onClick={v.dlJson}><bg-icon name="file-json" size="15" />Download JSON</button>
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
                      <span aria-label="Bufferbloat grade B, mild" style={{ width: "52px", height: "52px", boxSizing: "border-box", borderRadius: "var(--radius-lg)", border: "1px solid var(--ok-border)", background: "var(--ok-bg)", color: "var(--ok-fg)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-mono)", fontWeight: "600", fontSize: "24px" }}>
                        B
                      </span>
                      <span style={{ fontSize: "var(--text-caption)", color: "var(--fg-muted)" }}>Mild bufferbloat · latency rises under load but stays usable.</span>
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
                                <span style={{ position: "absolute", left: `${k?.wu?.x ?? ""}px`, top: `${k?.wu?.y ?? ""}px`, width: `${k?.wu?.w ?? ""}px`, height: `${k?.wu?.h ?? ""}px`, boxSizing: "border-box", borderRight: "1px dashed var(--border-strong)", background: "repeating-linear-gradient(135deg, var(--border-default) 0 1px, transparent 1px 5px)" }} />
                              ) : null}
                              {(k?.gaps || []).map((gp, $index) => (
                                <React.Fragment key={$index}>
                                  <span style={{ position: "absolute", left: `${gp?.x ?? ""}px`, top: `${gp?.y ?? ""}px`, width: `${gp?.w ?? ""}px`, height: `${gp?.h ?? ""}px`, boxSizing: "border-box", borderLeft: "1px dashed var(--border-strong)", borderRight: "1px dashed var(--border-strong)" }} />
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
                                <span style={{ width: "14px", height: "10px", boxSizing: "border-box", borderRight: "1px dashed var(--border-strong)", background: "repeating-linear-gradient(135deg, var(--border-strong) 0 1px, transparent 1px 4px)" }} />
                                {k?.wuLabel}
                              </span>
                            ) : null}
                            {k?.hasGaps ? (
                              <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                <span style={{ width: "12px", height: "10px", boxSizing: "border-box", borderLeft: "1px dashed var(--border-strong)", borderRight: "1px dashed var(--border-strong)" }} />
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
                            <span style={{ color: "var(--fg)", overflow: "hidden", textOverflow: "ellipsis" }}>{v.D?.label}{" ·"}</span>
                          ) : null}
                          <span>{v.D?.short}</span>
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
                          <span style={{ width: "30px", height: "30px", boxSizing: "border-box", borderRadius: "var(--radius-sm)", border: "1px solid var(--ok-border)", background: "var(--ok-bg)", color: "var(--ok-fg)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-mono)", fontWeight: "600", fontSize: "15px" }}>
                            B
                          </span>
                          <span style={{ display: "flex", flexDirection: "column", fontSize: "9px", lineHeight: "1.25" }}>
                            <span style={{ fontWeight: "600" }}>Mild</span>
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
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: "8px" }}>
                      <button className="btn secondary" onClick={v.share} title="Opens the system share sheet where the browser supports it" style={{ justifyContent: "center" }}>
                        <bg-icon name="share" size="15" />
                        Share
                      </button>
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
          <Nav variant="mobile-bottom" active="history" />
        ) : null}
      </div>
    );
  }
}

window.ResultDetail = ResultDetail;
