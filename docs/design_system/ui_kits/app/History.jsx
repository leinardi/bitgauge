/* BitGauge web UI kit — History
 * Props:
 *   variant: "populated" | "single" | "select3" | "deleted" | "compare" | "confirm" | "export" | "daterange" | "loading" | "nomatch" | "empty" | "unavailable" | "importing" | "importresult" | "importerror" | "safari"  (default "populated")
 *   mobile: boolean  (default false)
 *   whyOpen: boolean  (default false)
 *   compareB: "h1" | "h2"  (default "h1") — Compare demo: B over HTTP/1.1 (RPM not comparable) or HTTP/2 (measured)
 */
// Row action menu (screens.md: open, delete).
const HISTORY_ROW_ACTIONS = [{ value: 'open', label: 'Open', icon: 'chevron-right' }, { value: 'delete', label: 'Delete', icon: 'trash', danger: true }];
class History extends React.Component {
  state = { why: null, usage: null };
  componentDidMount() {
    // Header: the storage this origin uses, where the browser reports it (screens.md §3).
    const s = navigator.storage;
    if (s && s.estimate) s.estimate().then(e => { if (e && e.usage != null) this.setState({ usage: e.usage }); }).catch(() => {});
  }
  renderVals() {
    const why = this.state.why ?? (this.props.whyOpen === true || this.props.whyOpen === 'true');
    const m = !!this.props.mobile && this.props.mobile !== 'false';
    const v = this.props.variant || 'populated';
    const is = k => v === k;
    const BG = window.BG;
    const L = m ? { pad: 'var(--space-4) var(--space-4) var(--space-6)', gap: 'var(--space-3-5)', h1: 'var(--text-3xl)', chipWrap: 'nowrap', filterML: '0', filterW: '100%', searchFlex: '1 1 160px', searchW: 'auto', legendML: '0', cardPad: '14px', trendCols: 'minmax(0,1fr)', tw: 311, th: 120, thpx: '120px', tL: '12px', tR: '12px', tB: '76px', cfAlign: 'flex-end', cfTop: '0', cfW: '100%', cfRad: 'var(--radius-xl) var(--radius-xl) 0 0' }
      : { pad: 'var(--space-6) var(--space-10) var(--space-12)', gap: 'var(--space-4-5)', h1: 'var(--text-4xl)', chipWrap: 'wrap', filterML: 'auto', filterW: 'auto', searchFlex: '0 0 auto', searchW: '220px', legendML: 'auto', cardPad: '16px 20px', trendCols: 'repeat(3, minmax(0,1fr))', tw: 340, th: 130, thpx: '130px', tL: 'auto', tR: '24px', tB: '24px', cfAlign: 'flex-start', cfTop: '140px', cfW: '460px', cfRad: 'var(--radius-xl)' };
    const empty = is('empty'), unavail = is('unavailable'), loading = is('loading'), nomatch = is('nomatch'), deleted = is('deleted');
    const hasData = !empty && !unavail && !loading;
    const single = is('single');
    const total = single ? 1 : deleted ? 46 : is('importresult') ? 60 : 48;
    // [startedAt (ISO instant), label, down, up, lat, jit, grade, flag, protocol, status]
    const R = [
      ['2026-10-08T06:41:00.000Z', 'VPN via 5G', 640e3, 210e3, 48, 9.4, 'D', 'Low confidence', 'HTTP/2', 'complete'],
      ['2026-10-07T17:12:00.000Z', 'VPN · hotel Wi-Fi', 38.4e6, 12.1e6, 61, 4.2, 'C', null, 'HTTP/1.1', 'complete'],
      ['2026-10-05T10:30:00.000Z', 'VPN via 5G', 84.2e6, 21.7e6, 39, 6.8, 'C', null, 'HTTP/2', 'complete'],
      ['2026-10-02T07:05:00.000Z', 'VPN · office', 241e6, 198e6, 14, 1.9, 'B', null, 'HTTP/1.1', 'complete'],
      ['2026-09-29T20:47:00.000Z', 'VPN via 5G', 52.9e6, null, 44, 7.1, 'D', null, 'HTTP/2', 'partial'],
      ['2026-09-26T16:20:00.000Z', 'VPN · office', 233e6, 187e6, 15, 2.2, 'B', null, 'HTTP/2', 'complete'],
      ['2026-09-21T05:58:00.000Z', 'VPN via 5G', null, null, 41, 5.9, null, null, 'HTTP/2', 'error'],
      ['2026-09-17T11:14:00.000Z', 'VPN · café', 19.6e6, 4.1e6, 72, 11.3, 'F', null, 'HTTP/2', 'complete']
    ];
    const selIdx = is('select3') ? [1, 3, 5] : deleted || single ? [] : [3, 5];
    let list = R.map((r, i) => ({ r, i, sel: selIdx.includes(i) }));
    if (deleted) list = list.filter(x => x.i !== 3 && x.i !== 5);
    // single: fresh install, first result taken today
    if (single) list = [{ r: ['2026-10-08T07:14:00.000Z'].concat(R[3].slice(1)), i: 3, sel: false }];
    const selN = selIdx.length;
    const tone = { 'A+': 'ok', A: 'ok', B: 'ok', C: 'warn', D: 'warn', F: 'danger' };
    const GW = { 'A+': 'Minimal', A: 'Low', B: 'Mild', C: 'Moderate', D: 'High', F: 'Severe' };
    const fr = b => b == null ? { n: '—', u: '' } : BG ? BG.rate(b) : { n: '', u: '' };
    const ST = { complete: ['Complete', 'pill neutral', false], partial: ['Partial', 'pill warn', true], error: ['Error', 'pill danger', true] };
    const rows = list.map(({ r, sel }) => {
      const [d, label, down, up, lat, jit, grade, flag, proto, st] = r;
      const dn = fr(down), un = fr(up), t = grade ? tone[grade] : null, S = ST[st];
      return { iso: d, d: BG ? BG.date(d, 'dateTime') : d, label, down: dn.n, du: dn.u, up: un.n, uu: un.u, lat: String(lat), jit: jit < 10 ? jit.toFixed(1) : String(Math.round(jit)), grade: grade || '—', gAria: grade ? 'Grade ' + grade + ' · ' + GW[grade] + ' bufferbloat' : 'No grade', flag, proto,
        st: S[0], stCls: S[1], stDot: S[2], stM: st !== 'complete', sel, unsel: !sel, selAria: sel ? 'true' : 'false', cls: sel ? 'rowlink sel' : 'rowlink', ctx: 'VPN', cicon: 'shield',
        gbd: t ? `var(--${t}-border)` : 'var(--border-subtle)', gbg: t ? `var(--${t}-bg)` : 'transparent', gfg: t ? `var(--${t}-fg)` : 'var(--fg-subtle)',
        cardBd: sel ? 'var(--primary-border)' : 'var(--border-subtle)', cardBg: sel ? 'var(--primary-bg)' : 'var(--surface-2)', cardSub: sel ? 'var(--fg-muted)' : undefined };
    });
    const colDefs = [['Date', 'left', true], ['Label', 'left'], ['Context', 'left'], ['Protocol', 'left'], ['Status', 'left'], ['Download', 'right'], ['Upload', 'right'], ['Latency', 'right'], ['Jitter', 'right'], ['Grade', 'center']];
    const cols = colDefs.map(([t, align, on]) => ({ t, align, on: !!on, aria: on ? 'descending' : 'none', icon: on ? 'chevron-down' : 'arrow-up-down', c: on ? 'var(--primary-text)' : 'var(--fg-subtle)' }));
    const chip = ([t, n, on]) => ({ t, n, cls: on ? 'chip on' : 'chip', pressed: on ? 'true' : 'false' });
    const byLabel = l => list.filter(x => x.r[1] === l).length;
    const chipGroups = [
      { t: 'Context', aria: 'Filter by context label', chips: (single ? [['All', total], ['VPN', 1, true]] : [['All', total], ['LAN', 21], ['VPN', list.length, true], ['Wi-Fi', 13], ['Mobile', 6]]).map(chip) },
      { t: 'Label', aria: 'Filter by label', chips: [['Any label', list.length, true], ['VPN via 5G', byLabel('VPN via 5G')], ['VPN · office', byLabel('VPN · office')], ['VPN · hotel Wi-Fi', byLabel('VPN · hotel Wi-Fi')], ['VPN · café', byLabel('VPN · café')]].filter(c => c[1] > 0).map(chip) }
    ];

    // Each point sits at its result's instant (ms), so it always falls on its row's date.
    const pts = list.slice().reverse().map(({ r, sel }) => ({ t: Date.parse(r[0]), down: r[2], up: r[3], lat: r[4], done: r[9] === 'complete', sel }));
    // Axis rules (components/charts.md § Trend chart axes)
    // X: [T0, T1) = the date filter's window in local calendar days, from the start of its first day to the end of today.
    // "All time" = first result → today, min 7 days. Day ticks sit mid-day, step back from today (3 / 10 days) and the
    // last reads "Today"; spans over a month tick on the 1st of each month. Results outside the window are not drawn.
    const TODAY = '2026-10-08'; // the kit's "today", a local calendar date
    const dayAt = (s, n) => { const [y, mo, d] = s.split('-').map(Number); return new Date(y, mo - 1, d + n); };
    const isoDay = BG ? BG.isoDay : d => d.toISOString().slice(0, 10);
    const custom = nomatch ? ['2026-10-02', TODAY] : null; // no-match: a custom range (screens.md: range=<from>..<to>)
    const span = custom ? Math.round((dayAt(custom[1], 0) - dayAt(custom[0], 0)) / 864e5) + 1 : single ? 7 : 30;
    const fromDay = custom ? custom[0] : isoDay(dayAt(TODAY, -(span - 1))), toDay = custom ? custom[1] : TODAY;
    const T0 = dayAt(fromDay, 0).getTime(), T1 = dayAt(toDay, 1).getTime();
    const fmtD = (v, k) => BG ? BG.date(v, k) : String(v);
    const xTicks = [];
    if (span <= 31) {
      const step = span <= 7 ? 3 : 10;
      for (let n = 0; n < span; n += step) { const a = dayAt(toDay, -n), b = dayAt(toDay, -n + 1), iso = isoDay(a); xTicks.unshift({ ms: (a.getTime() + b.getTime()) / 2, iso, t: iso === TODAY ? 'Today' : fmtD(iso, 'day') }); }
    } else {
      const s = new Date(T0), months = []; for (let d = new Date(s.getFullYear(), s.getMonth() + 1, 1); d.getTime() < T1; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) months.push(d);
      const k = Math.ceil(months.length / 4);
      months.filter((_, i) => i % k === 0).forEach(d => { const iso = isoDay(d).slice(0, 7); xTicks.push({ ms: d.getTime(), iso, t: fmtD(iso, 'month') }); });
      const a = dayAt(TODAY, 0), mid = (a.getTime() + dayAt(TODAY, 1).getTime()) / 2;
      while (xTicks.length && mid - xTicks[xTicks.length - 1].ms < (T1 - T0) / 8) xTicks.pop();
      xTicks.push({ ms: mid, iso: TODAY, t: 'Today' });
    }
    const nice = v => { const p = Math.pow(10, Math.floor(Math.log10(v))); return [1, 2, 2.5, 5, 10].map(k => k * p).find(n => n >= v); };
    const mkTrend = (key, title, icon, c, log) => {
      const w = L.tw, h = L.th, pl = 40, pr = 8, pt = 6, pb = 20, W = w - pl - pr, H = h - pt - pb;
      const X = t => pl + W * (t - T0) / (T1 - T0);
      const vals = pts.map(p => p[key]).filter(v => v != null);
      let Y, grid;
      if (log) {
        // whole decades around the data, at least 2 decades
        const hi = Math.ceil(Math.log10(Math.max(...vals))); let lo = Math.floor(Math.log10(Math.min(...vals))); if (hi - lo < 2) lo = hi - 2;
        Y = v => pt + H * (1 - (Math.log10(v) - lo) / (hi - lo));
        grid = Array.from({ length: hi - lo + 1 }, (_, i) => Math.pow(10, lo + i)).map(v => ({ y: Y(v).toFixed(1), t: v >= 1e9 ? (v / 1e9) + 'G' : v >= 1e6 ? (v / 1e6) + 'M' : v >= 1e3 ? (v / 1e3) + 'k' : String(v) }));
      } else {
        // 0 → max(80 ms, nice(max × 1.25))
        const top = Math.max(80, nice(Math.max(...vals) * 1.25));
        Y = v => pt + H * (1 - v / top); grid = [0, top / 2, top].map(v => ({ y: Y(v).toFixed(1), t: v + (v === top ? ' ms' : '') }));
      }
      const P = []; let line = '', pen = false, hollow = 0;
      pts.forEach(p => {
        const val = p[key];
        if (val == null || p.t < T0 || p.t >= T1) { pen = false; return; }
        const x = X(p.t).toFixed(1), y = Y(val).toFixed(1);
        line += (pen ? 'L' : 'M') + x + ' ' + y; pen = true;
        if (!p.done) hollow++;
        P.push({ x, y, r: p.sel ? 4.5 : p.done ? 3 : 3.5, fill: p.done ? c : 'var(--surface-2)' });
      });
      const xt = xTicks.map(k => ({ x: X(k.ms).toFixed(1), t: k.t, iso: k.iso }));
      let lbl = null;
      if (P.length === 1) { const v = vals[0], f = log ? fr(v) : { n: String(v), u: 'ms' }; lbl = { x: P[0].x, y: P[0].y, t: f.n + ' ' + f.u }; }
      return { title, icon, c, w, h, grid, pts: P, line, xt, lbl, x0: pl, x1: pl + W, lx: pl - 6, xy: h - 14, scale: log ? 'log' : 'linear',
        aria: `${title} trend, ${P.length} results, ${hollow} partial or error` };
    };
    let trends = [mkTrend('down', 'Download', 'arrow-down', 'var(--series-download)', true), mkTrend('up', 'Upload', 'arrow-up', 'var(--series-upload)', true), mkTrend('lat', 'Idle latency', 'activity', 'var(--series-latency)', false)];
    if (m) trends = trends.slice(0, 1);

    const ch = (d, w, dw) => ({ dc: w === 'better' ? 'var(--ok-fg)' : w === 'worse' || w === 'crit' ? 'var(--warn-fg)' : w === 'differs' ? 'var(--fg-muted)' : 'var(--fg-subtle)',
      di: w === 'better' ? 'trending-up' : w === 'worse' || w === 'crit' ? 'triangle-alert' : w === 'differs' ? 'info' : 'minus', d, dw: dw || w });
    const CRIT = ['Label', 'Preset', 'Protocol'];
    // compareB "h2" (demo): B ran over HTTP/2 too, so the download RPM is compared (both measured); default "h1" keeps B on
    // HTTP/1.1, both responsiveness rows "not comparable".
    const B2 = this.props.compareB === 'h2';
    const params = [['Label', 'VPN · office', 'VPN · office'], ['Context', 'VPN', 'VPN'], ['Preset', 'Standard', 'Standard'], ['Protocol', 'HTTP/2', B2 ? 'HTTP/2' : 'HTTP/1.1'], ['Streams', 'Auto', 'Auto'], ['Data cap', 'Off', 'Off'], ['Browser', 'Firefox 131', 'Safari 18']]
      .map(([k, a, b]) => { const diff = a !== b, crit = diff && CRIT.includes(k); return Object.assign({ k, a, b, diff, crit }, ch('', crit ? 'crit' : diff ? 'differs' : 'same', diff ? 'differs' : 'same')); });
    // Rates (download, upload, peak): B against A in percent, one decimal, within ±2 % reads "same" (screens.md §3).
    const rs = b => { const f = fr(b); return f.n + ' ' + f.u; };
    const rate = (k, a, b) => { const p = (b - a) / a * 100; return [k, rs(a), rs(b), (p < 0 ? '−' : '+') + Math.abs(p).toFixed(1) + '\u00a0%', Math.abs(p) <= 2 ? 'same' : p > 0 ? 'better' : 'worse']; };
    // Probe timeouts, data used and duration: both values, no judgment.
    const plain = (k, a, b) => [k, a, b, '', 'none'];
    const RPMS = { measured: 'measured', uncertain: 'uncertain', unavailable_h1: 'needs HTTP/2 or HTTP/3 at the reverse proxy', unavailable_insufficient: 'not enough samples' };
    const rpmV = x => (x.rpm != null ? x.rpm.toLocaleString('en-US') + ' RPM · ' : '') + RPMS[x.state] + ' · ' + x.proto;
    const rpmRow = (dir, a, b) => {
      const k = 'HTTP loaded responsiveness — connection sharing not verifiable · ' + dir;
      if (a.state !== 'measured' || b.state !== 'measured') return [k, rpmV(a), rpmV(b), '', 'differs', 'not comparable'];
      const p = (b.rpm - a.rpm) / a.rpm * 100;
      return [k, rpmV(a), rpmV(b), (p < 0 ? '−' : '+') + Math.abs(p).toFixed(1) + '\u00a0%', Math.abs(p) <= 2 ? 'same' : p > 0 ? 'better' : 'worse'];
    };
    const BANDS = ['bad', 'poor', 'average', 'good', 'great'], cap = s => s[0].toUpperCase() + s.slice(1);
    const bandRow = (k, a, b) => {
      if (!a || !b) return ['Quality · ' + k, a ? cap(a) : 'not scored', b ? cap(b) : 'not scored', '', 'differs', 'not comparable'];
      const d = BANDS.indexOf(b) - BANDS.indexOf(a);
      return ['Quality · ' + k, cap(a), cap(b), '', d === 0 ? 'same' : d > 0 ? 'better' : 'worse'];
    };
    const metrics = [
      rate('Download', 233e6, 241e6), rate('Peak · download', 262e6, 268e6), rate('Upload', 187e6, 198e6), rate('Peak · upload', 211e6, 214e6),
      ['Idle latency', '15 ms', '14 ms', '−1 ms', 'better'], ['Jitter', '2.2 ms', '1.9 ms', '−0.3 ms', 'better'], plain('Idle probe timeouts', '0.0\u00a0%', '0.5\u00a0%'),
      ['Loaded latency · download', '31 ms', '29 ms', '−2 ms', 'better'], ['Loaded latency · upload', '58 ms', '71 ms', '+13 ms', 'worse'],
      ['Bufferbloat grade', 'B · Mild', 'B · Mild', '', 'same', 'same · +43 ms vs +57 ms']
    ].concat([
      // screens.md §3: one responsiveness row per direction, the RPM compared (higher better, ±2 % same) only
      // when both sides are measured; otherwise both states and "not comparable". A runs over HTTP/2, B over HTTP/1.1.
      rpmRow('download', { state: 'measured', rpm: 980, proto: 'HTTP/2' }, B2 ? { state: 'measured', rpm: 1010, proto: 'HTTP/2' } : { state: 'unavailable_h1', proto: 'HTTP/1.1' }),
      rpmRow('upload', { state: 'uncertain', rpm: 610, proto: 'HTTP/2' }, B2 ? { state: 'measured', rpm: 640, proto: 'HTTP/2' } : { state: 'unavailable_h1', proto: 'HTTP/1.1' }),
      // One row per quality-score experience, compared by band order (great best, bad worst).
      bandRow('Streaming', 'good', 'good'), bandRow('Gaming', 'good', 'average'), bandRow('Video calls', 'average', 'good')
    ]).concat([plain('Data used', '1.21 GB', '1.27 GB'), plain('Duration', '48 s', '47 s')])
      .map(([k, a, b, d, w, dw]) => Object.assign({ k, a, b, nj: w === 'none' }, w === 'none' ? {} : ch(d, w, dw)));
    const cmpWarn = params.filter(p => p.crit).map(p => `different ${p.k.toLowerCase()} (${p.a} vs ${p.b})`).join('; ');
    const cmpGroups = [{ k: 'Parameters', rows: params }, { k: 'Results', rows: metrics }].map((g, gi, all) => ({ k: g.k, rows: g.rows.map((p, i) => Object.assign({ last: gi === all.length - 1 && i === g.rows.length - 1 }, p)) }));
    const cmpCards = [
      { id: 'A', aria: 'Result A', label: 'VPN · office', iso: R[5][0], date: fmtD(R[5][0], 'dateTime'), params: params.map(p => ({ k: p.k, v: p.a, ch: false })), metrics: metrics.map(p => ({ k: p.k, v: p.a, ch: false })) },
      { id: 'B', aria: 'Result B', label: 'VPN · office', iso: R[3][0], date: fmtD(R[3][0], 'dateTime'), params: params.map(p => ({ k: p.k, v: p.b, ch: p.diff, dc: p.dc, di: p.di, dw: p.dw })), metrics: metrics.map(p => ({ k: p.k, v: p.b, ch: !p.nj, d: p.d, dc: p.dc, di: p.di, dw: p.dw })) }
    ];

    const shownN = list.length;
    // Selection summary: two → "<label> · Sep 26 and Oct 2" (shared label only), more → their date range.
    const selR = selIdx.map(i => R[i]), selD = selR.map(r => r[0]).sort();
    const selSummary = !BG || !selN ? '' : selN === 2 ? <>{selR[0][1] === selR[1][1] ? selR[0][1] + ' · ' : ''}{BG.timeList(selD, 'day')}</> : BG.timeRange(selD[0], selD[selD.length - 1], 'day');
    const rangeEl = custom && BG ? BG.timeRange(custom[0], custom[1], 'date') : null;
    const used = this.state.usage != null && BG && BG.bytes ? ' · ' + BG.bytes(this.state.usage) + ' used' : '';
    const countText = empty ? '0 results' : unavail ? 'Not saved in this window' : loading ? 'Loading…' : (nomatch ? `0 of ${total} shown` : `${shownN} of ${total} shown`) + used;
    const sk = (w, f) => ({ w, f });
    return {
      rootH: m && (is('compare') || is('confirm')) ? '100%' : 'auto', rootOv: m && (is('compare') || is('confirm')) ? 'hidden' : 'visible',
      mobile: m, desktop: !m, L, total, shownN, countText,
      isEmpty: empty, unavailable: unavail, loading, hasData, showFilters: hasData, noMatch: nomatch, showResults: hasData && !nomatch,
      showOrigin: !unavail, safari: is('safari'), importing: is('importing'), importResult: is('importresult'), importError: is('importerror'),
      importDisabled: unavail || loading || is('importing'), importLabel: is('importing') ? 'Importing…' : 'Import JSON',
      whyOpen: why, whyAria: why ? 'true' : 'false', toggleWhy: () => this.setState({ why: !why }),
      // CSV (frontend.md §5, not in the export): one row per result; the RPM columns are per direction —
      // downloadRpm, downloadRpmState, uploadRpm, uploadRpmState — with each Continuous direction's minimum and maximum.
      exportFormats: [{ t: 'Export JSON', s: 'Full samples · re-importable', icon: 'file-json' }, { t: 'Export CSV', s: 'One row per test · summary only', icon: 'file-text' }],
      rows: m ? rows.slice(0, 6) : rows, cols, chipGroups, trends, trendMeta: single || !list.length ? (single ? '1 result · today' : '') : <>{shownN + ' results · '}{BG ? BG.timeRange(list[list.length - 1].r[0], list[0].r[0], 'day') : null}</>,
      hasSel: selN > 0, selN, cmpDisabled: selN !== 2, cmpHint: selN > 0 && selN !== 2,
      selSummary,
      toast: deleted,
      cmpGroups, cmpCards, cmpWarn, showCompareD: is('compare') && !m, showCompareM: is('compare') && m, showConfirm: is('confirm'),
      showExport: is('export'), exportAria: is('export') ? 'true' : 'false', showDate: is('daterange'), dateAria: is('daterange') ? 'true' : 'false',
      dateLabel: custom ? <span>{rangeEl}</span> : single ? 'All time' : 'Last 30 days', fromDate: fromDay, toDate: toDay, searchVal: nomatch ? 'airport' : '',
      noMatchText: nomatch ? <>{'Nothing with context VPN dated '}{rangeEl}{` matches “airport”. All ${total} results are still in history.`}</> : '',
      noop: () => {},
      skChips: [56, 64, 64, 72, 76].map(n => ({ w: n + 'px' })), skTrends: m ? [1] : [1, 2, 3],
      skRows: (m ? [1, 2, 3, 4] : [1, 2, 3, 4, 5, 6, 7, 8]).map(() => ({ cols: [sk('16px', 'none'), sk('110px', 'none'), sk('auto', '1'), sk('52px', 'none'), sk('56px', 'none'), sk('64px', 'none'), sk('80px', 'none'), sk('80px', 'none'), sk('56px', 'none'), sk('52px', 'none'), sk('26px', 'none')] })),
      trendSingle: single,
      ranges: (single ? [['Last 7 days', 1], ['Last 30 days', 1], ['Last 90 days', 1], ['All time', 1, true]] : [['Last 7 days', 4], ['Last 30 days', 8, !nomatch], ['Last 90 days', 8], ['All time', 8]]).map(([t, n, on]) => ({ t, n, on: !!on, aria: on ? 'true' : 'false', bg: on ? 'var(--primary-bg)' : 'transparent', c: on ? 'var(--primary-text)' : 'var(--fg)' }))
    };
  }
    render() {
    const v = this.renderVals();
    return (
      <div style={{ position: "relative", background: "var(--bg-base)", color: "var(--fg)", fontFamily: "var(--font-sans)", minHeight: "100%", height: v.rootH, overflow: v.rootOv, display: "flex", flexDirection: "column" }}>
        {v.desktop ? (
          <Nav variant="top" active="history" status={this.props.srvStatus || "connected"} />
        ) : null}
        {v.mobile ? (
          <Nav variant="mobile-top" active="history" status={this.props.srvStatus || "connected"} />
        ) : null}
        <main style={{ flex: "1", width: "100%", maxWidth: "var(--layout-max)", margin: "0 auto", boxSizing: "border-box", padding: v.L?.pad, display: "flex", flexDirection: "column", gap: v.L?.gap }}>
          <header style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "var(--space-3) var(--space-4)" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: "var(--space-2-5)" }}>
              <h1 style={{ margin: "0", fontSize: v.L?.h1, fontWeight: "var(--weight-semibold)", letterSpacing: "var(--tracking-tight)" }}>History</h1>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-sm)", color: "var(--fg-subtle)" }}>{v.countText}</span>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)", marginLeft: "auto" }}>
              <DS.Button size="sm" icon="upload" disabled={v.importDisabled}>{v.importLabel}</DS.Button>
              {v.hasData ? (
                <>
                  <DS.Popover open={!!v.showExport} modal onClose={this.props.onDismiss} role="menu" label="Export" width={320}
                    trigger={<DS.Button size="sm" icon="download" iconAfter="chevron-down" aria-haspopup="menu" aria-expanded={v.exportAria}>Export</DS.Button>}>
                      {(v.exportFormats || []).map((f, $index) => (
                        <React.Fragment key={$index}>
                          <div role="group" aria-label={f?.t} style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", padding: "var(--space-2) var(--space-2-5)" }}>
                            <div style={{ display: "flex", alignItems: "flex-start", gap: "var(--space-2-5)" }}>
                              <span style={{ color: "var(--fg-muted)", display: "flex", marginTop: "1px" }}><DS.Icon name={f?.icon} size={16} /></span>
                              <span style={{ display: "flex", flexDirection: "column", gap: "var(--space-0-5)" }}>
                                <span style={{ fontSize: "var(--text-sm)", fontWeight: "var(--weight-semibold)", color: "var(--fg)" }}>{f?.t}</span>
                                <span style={{ fontSize: "var(--text-caption)", color: "var(--fg-subtle)" }}>{f?.s}</span>
                              </span>
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: "var(--space-1-5)", paddingLeft: "26px" }}>
                              <DS.Button size="sm" block role="menuitem">{'All results (' + v.total + ')'}</DS.Button>
                              <DS.Button size="sm" block role="menuitem">{'Current filter (' + v.shownN + ')'}</DS.Button>
                            </div>
                          </div>
                        </React.Fragment>
                      ))}
                      <div role="separator" className="pop-sep" />
                      <div style={{ display: "flex", alignItems: "flex-start", gap: "var(--space-2)", padding: "var(--space-1-5) var(--space-2-5) var(--space-1)" }}>
                        <span style={{ color: "var(--warn)", display: "flex", marginTop: "1px" }}><DS.Icon name="triangle-alert" size={13} stroke={2} /></span>
                        <span style={{ fontSize: "var(--text-micro)", color: "var(--fg-muted)", lineHeight: "var(--lh-compact)" }}>
                          Contains client IP addresses, labels and notes. Files are created in your browser.
                        </span>
                      </div>
                    </DS.Popover>
                  <DS.Button variant="danger" size="sm" icon="trash">Clear all</DS.Button>
                </>
              ) : null}
            </div>
          </header>
          {v.showOrigin ? (
            <DS.Notice tone="info" icon="hard-drive" live={false}
              title={<>{"Stored only in this browser, for "}<span className="ds-num">{BG.KIT.origin}</span></>}
              actions={<DS.Button variant="ghost" size="sm" aria-expanded={v.whyAria} onClick={v.toggleWhy}>Why?</DS.Button>}>
              {v.whyOpen ? "Browsers keep site data per address — scheme, host and port. Opening BitGauge at another address, such as http://192.168.1.10:8080, shows a separate, empty history. The server keeps no results. Export JSON to move them." : null}
            </DS.Notice>
          ) : null}
          {v.safari ? (
            <DS.Notice tone="warn" title="Safari may delete this history" live={false}
              actions={<><DS.Button size="sm" icon="download">Export JSON</DS.Button><DS.Button variant="ghost" size="sm" iconOnly icon="x" aria-label="Dismiss" /></>}>
              Safari removes site data for sites you haven't opened in 7 days of browsing. Export a JSON copy to keep your results.
            </DS.Notice>
          ) : null}
          {v.importing ? (
            <DS.Notice tone="neutral" icon="upload" title={<>{"Importing "}<span className="ds-num">bitgauge-2026-10-01.json</span></>}
              actions={<DS.Button variant="ghost" size="sm">Cancel</DS.Button>}>
              <span className="ds-num">Checking 9 of 16 results…</span>
              <span role="progressbar" aria-label="Import progress" aria-valuemin="0" aria-valuemax="16" aria-valuenow="9" className="ph-bar" style={{ display: "block", marginTop: "var(--space-1-5)" }}><span style={{ width: "56%", background: "var(--primary)" }}></span></span>
            </DS.Notice>
          ) : null}
          {v.importResult ? (
            <DS.Notice tone="ok" title={<>{"Imported "}<span className="ds-num">bitgauge-2026-10-01.json</span></>}
              actions={<DS.Button variant="ghost" size="sm" iconOnly icon="x" aria-label="Dismiss" />}>
              12 added, 3 skipped as duplicates, 1 rejected: result 16: schema version 3 is newer than this app
              <span style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-1-5)", marginTop: "var(--space-1-5)" }}>
                <DS.StatusPill tone="ok" size="sm">12 added</DS.StatusPill><DS.StatusPill tone="neutral" size="sm" dot={false}>3 skipped</DS.StatusPill><DS.StatusPill tone="warn" size="sm">1 rejected</DS.StatusPill>
              </span>
            </DS.Notice>
          ) : null}
          {v.importError ? (
            <DS.Notice tone="danger" icon="file-json" title={<>{"Couldn't import "}<span className="ds-num">bitgauge-2026-10-01.csv</span></>}
              actions={<><DS.Button size="sm" icon="upload">Choose another file</DS.Button><DS.Button variant="ghost" size="sm" iconOnly icon="x" aria-label="Dismiss" /></>}>
              Import accepts BitGauge JSON exports only. CSV exports are summaries and can't be restored. Nothing in your history was changed.
            </DS.Notice>
          ) : null}
          {v.isEmpty ? (
            <DS.Card as="section" padded={false}>
              <DS.EmptyState icon="history" title="No results yet" actions={<><DS.Button variant="primary" icon="play">Start a test</DS.Button>
                  <DS.Button variant="secondary" icon="upload">Import JSON</DS.Button></>}>Each finished test is saved here automatically, with its label and note. Run a test on this device, or import a JSON export from another browser.</DS.EmptyState>
            </DS.Card>
          ) : null}
          {v.unavailable ? (
            <DS.Card as="section" padded={false}>
              <DS.EmptyState icon="hard-drive" title="History isn't available in this window" actions={<><DS.Button variant="primary" icon="play">Start a test</DS.Button></>}>History is unavailable in this browser mode — results are not saved. The browser isn't letting this site store data, usually because this is a private window. Tests still run, and you can download each result as JSON. Open BitGauge in a normal window to keep history.</DS.EmptyState>
            </DS.Card>
          ) : null}
          {v.loading ? (
            <div aria-busy="true" style={{ display: "flex", flexDirection: "column", gap: v.L?.gap }}>
              <span role="status" className="sr-only">Loading history</span>
              <div style={{ display: "flex", gap: "var(--space-1-5)", overflow: "hidden" }}>
                {(v.skChips || []).map((c, $index) => (
                  <React.Fragment key={$index}>
                    <DS.Skeleton width={c?.w} height={"28px"} style={{ flex: "none", borderRadius: "var(--radius-full)" }} />
                  </React.Fragment>
                ))}
              </div>
              <DS.Card as="section" padded={false} style={{ padding: v.L?.cardPad, display: "flex", flexDirection: "column", gap: "var(--space-3-5)" }}>
                <DS.Skeleton width={"180px"} height={"14px"} />
                <div style={{ display: "grid", gridTemplateColumns: v.L?.trendCols, gap: "var(--space-5)" }}>
                  {(v.skTrends || []).map((t, $index) => (
                    <React.Fragment key={$index}>
                      <DS.Skeleton height={v.L?.thpx} />
                    </React.Fragment>
                  ))}
                </div>
              </DS.Card>
              {v.desktop ? (
                <DS.Card as="section" padded={false} style={{ overflow: "hidden" }}>
                  <div style={{ height: "38px", borderBottom: "1px solid var(--border-default)" }} />
                  {(v.skRows || []).map((sr, $index) => (
                    <React.Fragment key={$index}>
                      <div className="skel-row">
                        {(sr?.cols || []).map((sc, $index) => (
                          <React.Fragment key={$index}>
                            <DS.Skeleton width={sc?.w} height={"12px"} style={{ flex: sc?.f }} />
                          </React.Fragment>
                        ))}
                      </div>
                    </React.Fragment>
                  ))}
                </DS.Card>
              ) : null}
              {v.mobile ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                  {(v.skRows || []).map((sr, $index) => (
                    <React.Fragment key={$index}>
                      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2-5)", padding: "var(--space-3-5)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border-subtle)", background: "var(--surface-2)" }}>
                        <DS.Skeleton width={"60%"} height={"13px"} />
                        <DS.Skeleton width={"90%"} height={"12px"} />
                      </div>
                    </React.Fragment>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
          {v.showFilters ? (
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "var(--space-2) var(--space-2-5)" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", minWidth: "0", maxWidth: "100%" }}>
                {(v.chipGroups || []).map((g, $index) => (
                  <React.Fragment key={$index}>
                    <div role="group" aria-label={g?.aria} style={{ display: "flex", alignItems: "center", gap: "var(--space-1-5)", flexWrap: v.L?.chipWrap, overflowX: "auto", maxWidth: "100%" }}>
                      <span aria-hidden="true" style={{ flex: "none", width: "56px", fontFamily: "var(--font-cond)", fontWeight: "var(--weight-semibold)", fontSize: "var(--text-micro)", letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--fg-subtle)" }}>
                        {g?.t}
                      </span>
                      {(g?.chips || []).map((c, $index) => (
                        <React.Fragment key={$index}>
                          <button className={c?.cls} aria-pressed={c?.pressed} style={{ flex: "none" }}>{c?.t}{" "}<span className="n">{c?.n}</span></button>
                        </React.Fragment>
                      ))}
                    </div>
                  </React.Fragment>
                ))}
              </div>
              <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap", marginLeft: v.L?.filterML, width: v.L?.filterW }}>
                <DS.Popover open={!!v.showDate} onClose={this.props.onDismiss} role="dialog" label="Date range" width={300}
                    trigger={<DS.Button size="sm" icon="calendar" iconAfter="chevron-down" aria-haspopup="dialog" aria-expanded={v.dateAria}>{v.dateLabel}</DS.Button>}>
                      <DS.OptionRows label="Preset range" options={(v.ranges || []).map(rg => ({ value: rg.t, label: rg.t, meta: rg.n }))} selected={((v.ranges || []).find(rg => rg.on) || {}).t} />
                      <div className="pop-sep" />
                      <span id="hist-range-h" className="ds-eyebrow" style={{ padding: "var(--space-1) var(--space-2-5) var(--space-0-5)" }}>
                        Custom range
                      </span>
                      <div role="group" aria-labelledby="hist-range-h" style={{ display: "flex", alignItems: "center", gap: "var(--space-1-5)", padding: "var(--space-1) var(--space-2-5) var(--space-2)" }}>
                        <DS.Input type="date" size="sm" mono style={{ flex: "1", minWidth: "0" }} value={v.fromDate} max={v.toDate} aria-label="From date" onChange={v.noop} />
                        <span aria-hidden="true" style={{ color: "var(--fg-subtle)" }}>–</span>
                        <DS.Input type="date" size="sm" mono style={{ flex: "1", minWidth: "0" }} value={v.toDate} min={v.fromDate} max="2026-10-08" aria-label="To date" onChange={v.noop} />
                      </div>
                      <div className="pop-foot">
                        <DS.Button variant="ghost" size="sm">Cancel</DS.Button>
                        <DS.Button variant="primary" size="sm">Apply</DS.Button>
                      </div>
                    </DS.Popover>
                <DS.Input type="search" size="sm" icon="search" style={{ flex: v.L?.searchFlex, width: v.L?.searchW, minWidth: "0" }} placeholder="Search labels and notes" aria-label="Search" value={v.searchVal} onChange={v.noop} />
              </div>
            </div>
          ) : null}
          {v.noMatch ? (
            <DS.Card as="section" padded={false}>
              <DS.EmptyState icon="search" title="No results match these filters" actions={<><DS.Button variant="secondary" icon="x">Clear filters</DS.Button></>}>{v.noMatchText}</DS.EmptyState>
            </DS.Card>
          ) : null}
          {v.showResults ? (
            <>
              <DS.Card as="section" labelledBy="trend-h" padded={false} style={{ padding: v.L?.cardPad, display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "var(--space-2) var(--space-3-5)" }}>
                <h2 id="trend-h" style={{ margin: "0", fontSize: "var(--text-base)", fontWeight: "var(--weight-semibold)" }}>Trend</h2>
                <DS.Chip size="sm" icon="shield">VPN</DS.Chip>
                <span style={{ fontSize: "var(--text-caption)", color: "var(--fg-subtle)" }}>{v.trendMeta}</span>
                <div role="list" aria-label="Legend" style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-1-5) var(--space-3-5)", marginLeft: v.L?.legendML, fontSize: "var(--text-caption)", color: "var(--fg-muted)" }}>
                  <span role="listitem" style={{ display: "flex", alignItems: "center", gap: "var(--space-1-5)" }}>
                    <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "var(--fg-muted)" }} />
                    Complete
                  </span>
                  <span role="listitem" style={{ display: "flex", alignItems: "center", gap: "var(--space-1-5)" }}>
                    <span style={{ width: "8px", height: "8px", boxSizing: "border-box", borderRadius: "50%", border: "1.5px solid var(--fg-muted)" }} />
                    Partial or error
                  </span>
                </div>
                {v.mobile ? (
                  <DS.Segmented size="sm" ariaLabel="Metric" options={["Download", "Upload", "Latency"]} value="Download" />
                ) : null}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: v.L?.trendCols, gap: "var(--space-5)" }}>
                {(v.trends || []).map((tr, $index) => (
                  <React.Fragment key={$index}>
                    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", minWidth: "0" }}>
                      <span style={{ display: "flex", alignItems: "center", gap: "var(--space-1-5)", fontSize: "var(--text-caption)", color: "var(--fg-muted)" }}>
                        <span style={{ color: tr?.c, display: "flex" }}><DS.Icon name={tr?.icon} size={13} stroke={2} /></span>
                        {tr?.title}
                        <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", color: "var(--fg-subtle)" }}>{tr?.scale}</span>
                      </span>
                      <div style={{ position: "relative" }}>
                        <svg width={tr?.w} height={tr?.h} style={{ display: "block", overflow: "visible" }} role="img" aria-label={tr?.aria}>
                          {(tr?.grid || []).map((gl, $index) => (
                            <React.Fragment key={$index}>
                              <line x1={tr?.x0} y1={gl?.y} x2={tr?.x1} y2={gl?.y} style={{ stroke: "var(--border-subtle)" }} />
                            </React.Fragment>
                          ))}
                          <path d={tr?.line} style={{ fill: "none", stroke: tr?.c, strokeWidth: "1.5", strokeLinejoin: "round" }} />
                          {(tr?.pts || []).map((p, $index) => (
                            <React.Fragment key={$index}>
                              <circle cx={p?.x} cy={p?.y} r={p?.r} style={{ fill: p?.fill, stroke: tr?.c, strokeWidth: "1.5" }} />
                            </React.Fragment>
                          ))}
                        </svg>
                        <div aria-hidden="true" style={{ position: "absolute", inset: "0", pointerEvents: "none", fontFamily: "var(--font-mono)", fontSize: "var(--text-nano)", color: "var(--fg-subtle)" }}>
                          {(tr?.grid || []).map((gl, $index) => (
                            <React.Fragment key={$index}>
                              <span style={{ position: "absolute", left: `${tr?.lx ?? ""}px`, top: `${gl?.y ?? ""}px`, transform: "translate(-100%,-50%)" }}>{gl?.t}</span>
                            </React.Fragment>
                          ))}
                          {(tr?.xt || []).map((xt, $index) => (
                            <React.Fragment key={$index}>
                              <span style={{ position: "absolute", left: `${xt?.x ?? ""}px`, top: `${tr?.xy ?? ""}px`, transform: "translateX(-50%)", whiteSpace: "nowrap" }}>
                                <time dateTime={xt?.iso}>{xt?.t}</time>
                              </span>
                            </React.Fragment>
                          ))}
                          {tr?.lbl ? (
                            <span style={{ position: "absolute", left: `${tr.lbl.x}px`, top: `${tr.lbl.y}px`, transform: "translate(calc(-100% - 8px),-50%)", whiteSpace: "nowrap", fontSize: "var(--text-caption)", color: "var(--fg)" }}>{tr.lbl.t}</span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </React.Fragment>
                ))}
              </div>
              {v.trendSingle ? (
                <span style={{ fontSize: "var(--text-caption)", color: "var(--fg-subtle)" }}>Trends appear from the second result.</span>
              ) : null}
            </DS.Card>
              {v.desktop ? (
              <DS.Card as="section" label="Results" padded={false} style={{ overflow: "hidden", position: "relative" }}>
                <table className="tbl">
                  <thead>
                    <tr>
                      <th style={{ width: "36px" }}>
                        <span style={{ position: "absolute", width: "1px", height: "1px", overflow: "hidden", clip: "rect(0 0 0 0)" }}>Select</span>
                      </th>
                      {(v.cols || []).map((h, $index) => (
                        <React.Fragment key={$index}>
                          <th aria-sort={h?.aria} style={{ textAlign: h?.align }}>
                            <button style={{ all: "unset", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "var(--space-1)", color: h?.c }}>
                              {h?.t}
                              {h?.on ? (
                                <DS.Icon name="chevron-down" size={12} stroke={2} />
                              ) : null}
                            </button>
                          </th>
                        </React.Fragment>
                      ))}
                      <th style={{ width: "40px" }} />
                    </tr>
                  </thead>
                  <tbody>
                    {(v.rows || []).map((r, $index) => (
                      <React.Fragment key={$index}>
                        <tr className={r?.cls} style={{ "--fg-subtle": r?.cardSub }}>
                          <td>
                            {r?.sel ? (
                              <span role="checkbox" aria-checked="true" aria-label={`Select ${r?.label ?? ""}, ${r?.d ?? ""}`} tabIndex="0" style={{ width: "16px", height: "16px", borderRadius: "4px", background: "var(--primary)", color: "var(--primary-fg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                <DS.Icon name="check" size={12} stroke={3} />
                              </span>
                            ) : null}
                            {r?.unsel ? (
                              <span role="checkbox" aria-checked="false" aria-label={`Select ${r?.label ?? ""}, ${r?.d ?? ""}`} tabIndex="0" style={{ width: "16px", height: "16px", boxSizing: "border-box", borderRadius: "4px", border: "1.5px solid var(--border-strong)", display: "block" }} />
                            ) : null}
                          </td>
                          <td style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-caption)", color: "var(--fg-muted)", whiteSpace: "nowrap" }}><time dateTime={r?.iso}>{r?.d}</time></td>
                          <td>
                            <span style={{ display: "flex", alignItems: "center", gap: "var(--space-1-5) var(--space-2)", flexWrap: "wrap" }}>
                              <a href="#" style={{ color: "var(--fg)", fontWeight: "var(--weight-medium)", textDecoration: "none" }}>{r?.label}</a>
                              {r?.flag ? (
                                <DS.StatusPill tone="warn" size="sm">{r?.flag}</DS.StatusPill>
                              ) : null}
                            </span>
                          </td>
                          <td>
                            <span className="pill neutral" style={{ height: "20px", gap: "var(--space-1)", color: "var(--fg-muted)" }}>
                              <DS.Icon name={r?.cicon} size={11} stroke={2} />
                              {r?.ctx}
                            </span>
                          </td>
                          <td style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-caption)", color: "var(--fg-muted)", whiteSpace: "nowrap" }}>{r?.proto}</td>
                          <td>
                            <span className={r?.stCls} style={{ height: "20px", fontSize: "var(--text-nano)", padding: "0 var(--space-2)" }}>
                              {r?.stDot ? (
                                <span className="d" />
                              ) : null}
                              {r?.st}
                            </span>
                          </td>
                          <td className="num" style={{ whiteSpace: "nowrap" }}>{r?.down}{" "}<span style={{ color: "var(--fg-subtle)", fontSize: "var(--text-micro)" }}>{r?.du}</span></td>
                          <td className="num" style={{ whiteSpace: "nowrap" }}>{r?.up}{" "}<span style={{ color: "var(--fg-subtle)", fontSize: "var(--text-micro)" }}>{r?.uu}</span></td>
                          <td className="num" style={{ whiteSpace: "nowrap" }}>{r?.lat}{" "}<span style={{ color: "var(--fg-subtle)", fontSize: "var(--text-micro)" }}>ms</span></td>
                          <td className="num" style={{ whiteSpace: "nowrap" }}>{r?.jit}{" "}<span style={{ color: "var(--fg-subtle)", fontSize: "var(--text-micro)" }}>ms</span></td>
                          <td style={{ textAlign: "center" }}>
                            <span role="img" aria-label={r?.gAria} title={r?.gAria} style={{ display: "inline-flex", width: "26px", height: "22px", boxSizing: "border-box", alignItems: "center", justifyContent: "center", borderRadius: "var(--radius-sm)", border: `1px solid ${r?.gbd ?? ""}`, background: r?.gbg, color: r?.gfg, fontFamily: "var(--font-mono)", fontWeight: "var(--weight-semibold)", fontSize: "var(--text-caption)" }}>
                              {r?.grade}
                            </span>
                          </td>
                          <td>
                            <DS.Menu label={`Actions for ${r?.label ?? ""}`} align="end" placement={(v.rows || []).indexOf(r) >= (v.rows || []).length - 2 ? 'top' : 'bottom'} options={HISTORY_ROW_ACTIONS}
                              trigger={<DS.Button variant="ghost" size="sm" iconOnly icon="ellipsis" aria-label={`Actions for ${r?.label ?? ""}`} />} />
                          </td>
                        </tr>
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
                {v.hasSel ? (
                  <div role="toolbar" aria-label="Selection" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "var(--space-2) var(--space-3)", padding: "var(--space-2-5) var(--space-3-5)", borderTop: "1px solid var(--border-default)", background: "var(--surface-1)" }}>
                    <span style={{ fontSize: "var(--text-sm)", fontWeight: "var(--weight-semibold)" }}>{v.selN}{" selected"}</span>
                    <span style={{ fontSize: "var(--text-caption)", color: "var(--fg-subtle)" }}>{v.selSummary}</span>
                    <div style={{ marginLeft: "auto", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "var(--space-2)" }}>
                      {v.cmpHint ? (
                        <span id="cmp-hint" style={{ display: "flex", alignItems: "center", gap: "var(--space-1-5)", fontSize: "var(--text-caption)", color: "var(--fg-muted)" }}>
                          <DS.Icon name="info" size={13} />
                          Compare needs exactly 2
                        </span>
                      ) : null}
                      <DS.Button variant="ghost" size="sm">Clear selection</DS.Button>
                      <DS.Button variant="danger" size="sm" icon="trash">Delete selected</DS.Button>
                      <DS.Button variant="primary" size="sm" icon="git-compare" disabled={v.cmpDisabled} aria-describedby="cmp-hint">Compare</DS.Button>
                    </div>
                  </div>
                ) : null}
              </DS.Card>
            ) : null}
              {v.mobile ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "var(--text-caption)", color: "var(--fg-subtle)" }}>
                  <span>Newest first</span>
                  <DS.Button variant="ghost" size="sm" icon="sort-desc">Sort</DS.Button>
                </div>
                {(v.rows || []).map((r, $index) => (
                  <React.Fragment key={$index}>
                    <div className={r?.sel ? "tinted" : undefined} style={{ display: "flex", alignItems: "stretch", borderRadius: "var(--radius-lg)", border: `1px solid ${r?.cardBd ?? ""}`, background: r?.cardBg, "--fg-subtle": r?.cardSub }}>
                      <button role="checkbox" aria-checked={r?.selAria} aria-label={`Select ${r?.label ?? ""}, ${r?.d ?? ""}`} style={{ all: "unset", boxSizing: "border-box", flex: "none", width: "44px", minHeight: "44px", display: "flex", justifyContent: "center", paddingTop: "var(--space-3-5)", cursor: "pointer" }}>
                        {r?.sel ? (
                          <span style={{ width: "18px", height: "18px", borderRadius: "4px", background: "var(--primary)", color: "var(--primary-fg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <DS.Icon name="check" size={12} stroke={3} />
                          </span>
                        ) : null}
                        {r?.unsel ? (
                          <span style={{ width: "18px", height: "18px", boxSizing: "border-box", borderRadius: "4px", border: "1.5px solid var(--border-strong)", display: "block" }} />
                        ) : null}
                      </button>
                      <a href="#" style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "var(--space-2-5)", padding: "var(--space-3) 0", color: "var(--fg)", textDecoration: "none", minHeight: "44px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-0-5)", minWidth: "0", flex: "1" }}>
                          <span style={{ fontWeight: "var(--weight-semibold)", fontSize: "var(--text-sm)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {r?.label}
                          </span>
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-micro)", color: "var(--fg-subtle)" }}><time dateTime={r?.iso}>{r?.d}</time>{" · "}{r?.proto}</span>
                        </div>
                        {r?.flag ? (
                          <DS.StatusPill tone="warn" size="sm">{r?.flag}</DS.StatusPill>
                        ) : null}
                        {r?.stM ? (
                          <span className={r?.stCls} style={{ height: "18px", fontSize: "var(--text-nano)", padding: "0 7px" }}><span className="d" />{r?.st}</span>
                        ) : null}
                        <span role="img" aria-label={r?.gAria} title={r?.gAria} style={{ display: "inline-flex", width: "28px", height: "24px", boxSizing: "border-box", alignItems: "center", justifyContent: "center", borderRadius: "var(--radius-sm)", border: `1px solid ${r?.gbd ?? ""}`, background: r?.gbg, color: r?.gfg, fontFamily: "var(--font-mono)", fontWeight: "var(--weight-semibold)", fontSize: "var(--text-caption)" }}>
                          {r?.grade}
                        </span>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: "var(--space-2)", fontFamily: "var(--font-mono)", fontSize: "var(--text-sm)" }}>
                        <span style={{ display: "flex", alignItems: "center", gap: "var(--space-1)" }}>
                          <span style={{ color: "var(--primary-text)", display: "flex" }}><DS.Icon name="arrow-down" size={12} stroke={2.25} /></span>
                          {r?.down}
                          <span style={{ color: "var(--fg-subtle)", fontSize: "var(--text-nano)" }}>{r?.du}</span>
                        </span>
                        <span style={{ display: "flex", alignItems: "center", gap: "var(--space-1)" }}>
                          <span style={{ color: "var(--series-upload)", display: "flex" }}><DS.Icon name="arrow-up" size={12} stroke={2.25} /></span>
                          {r?.up}
                          <span style={{ color: "var(--fg-subtle)", fontSize: "var(--text-nano)" }}>{r?.uu}</span>
                        </span>
                        <span style={{ display: "flex", alignItems: "center", gap: "var(--space-1)" }}>
                          <span style={{ color: "var(--series-latency)", display: "flex" }}><DS.Icon name="activity" size={12} stroke={2.25} /></span>
                          {r?.lat}
                          <span style={{ color: "var(--fg-subtle)", fontSize: "var(--text-nano)" }}>ms</span>
                        </span>
                      </div>
                    </a>
                      <DS.Menu label={`Actions for ${r?.label ?? ""}`} align="end" options={HISTORY_ROW_ACTIONS} style={{ flex: "none", alignSelf: "flex-start" }}
                        trigger={<DS.Button variant="ghost" iconOnly icon="ellipsis" aria-label={`Actions for ${r?.label ?? ""}`} style={{ flex: "none", width: "44px", height: "44px", marginTop: "var(--space-1)" }}></DS.Button>} />
                    </div>
                  </React.Fragment>
                ))}
                {v.hasSel ? (
                  <div role="toolbar" aria-label="Selection" style={{ position: "sticky", bottom: "12px", display: "flex", alignItems: "center", gap: "var(--space-1)", padding: "var(--space-1-5) var(--space-1-5) var(--space-1-5) var(--space-3-5)", borderRadius: "var(--radius-lg)", background: "var(--surface-3)", border: "1px solid var(--border-default)", boxShadow: "var(--shadow-md)" }}>
                    <span style={{ fontSize: "var(--text-sm)", fontWeight: "var(--weight-semibold)", marginRight: "auto" }}>{v.selN}{" selected"}</span>
                    <DS.Button variant="ghost" iconOnly icon="x" aria-label="Clear selection" style={{ width: "44px", height: "44px" }}></DS.Button>
                    <DS.Button variant="ghost" iconOnly icon="trash" aria-label="Delete selected" style={{ width: "44px", height: "44px", color: "var(--danger-fg)" }}></DS.Button>
                    {v.cmpHint ? (
                      <span id="cmp-hint" className="sr-only">Compare needs exactly 2</span>
                    ) : null}
                    <DS.Button variant="primary" icon="git-compare" disabled={v.cmpDisabled} aria-describedby={v.cmpHint ? "cmp-hint" : undefined} style={{ height: "44px" }}>Compare</DS.Button>
                  </div>
                ) : null}
              </div>
            ) : null}
            </>
          ) : null}
        </main>
        {v.mobile ? (
          <div style={{ marginTop: "auto", height: "64px", flex: "none" }}><div style={{ position: "fixed", left: "0", right: "0", bottom: "0", zIndex: "var(--z-nav)" }}><Nav variant="mobile-bottom" active="history" status={this.props.srvStatus || "connected"} /></div></div>
        ) : null}
        {v.toast ? (
          <div style={{ position: "absolute", left: v.L?.tL, right: v.L?.tR, bottom: v.L?.tB, zIndex: "50", display: "flex", justifyContent: "flex-end" }}>
            <DS.Toast tone="info" icon="trash" title="2 results deleted." message="Removed from history in 8 s." action={<DS.Button size="sm" icon="undo-2">Undo</DS.Button>} onDismiss={() => {}} />
          </div>
        ) : null}
        {v.showCompareD ? (
          <DS.Dialog size="xl" flush icon="git-compare" title="Compare results" onClose={this.props.onDismiss || (() => {})} align="top" body={<>
              {v.cmpWarn ? (
                <div role="note" style={{ display: "flex", alignItems: "flex-start", gap: "var(--space-2-5)", padding: "var(--space-2-5) var(--space-5)", background: "var(--warn-bg)", borderBottom: "1px solid var(--warn-border)", fontSize: "var(--text-sm)", lineHeight: "var(--lh-normal)" }}>
                  <span style={{ color: "var(--warn)", display: "flex", marginTop: "var(--space-0-5)" }}><DS.Icon name="triangle-alert" size={15} stroke={2} /></span>
                  <span style={{ color: "var(--fg)" }}><b style={{ fontWeight: "var(--weight-semibold)", color: "var(--warn-fg)" }}>Not directly comparable:</b>{" "}{v.cmpWarn}</span>
                </div>
              ) : null}
              <table className="tbl" style={{ tableLayout: "fixed" }}>
                <thead>
                  <tr>
                    <th scope="col" style={{ width: "30%", background: "var(--surface-2)" }}>Metric</th>
                    {(v.cmpCards || []).map((cd, $index) => (
                      <th key={$index} scope="col" style={{ background: "var(--surface-2)", textAlign: "right" }}>
                        <a href="#" style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "var(--space-0-5)", textTransform: "none", letterSpacing: "0", textDecoration: "none" }}>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-1)", fontFamily: "var(--font-sans)", fontSize: "var(--text-sm)", color: "var(--fg)", fontWeight: "var(--weight-semibold)" }}>{cd?.id}{" · "}{cd?.label}<span style={{ color: "var(--fg-subtle)", display: "flex" }}><DS.Icon name="chevron-right" size={13} stroke={2} /></span></span>
                          <time dateTime={cd?.iso} style={{ fontFamily: "var(--font-mono)", fontWeight: "var(--weight-regular)", color: "var(--fg-subtle)" }}>{cd?.date}</time>
                        </a>
                      </th>
                    ))}
                    <th scope="col" style={{ background: "var(--surface-2)", textAlign: "right", width: "24%" }}>Change</th>
                  </tr>
                </thead>
                {(v.cmpGroups || []).map((g, $index) => (
                  <tbody key={$index}>
                    <tr>
                      <th colSpan="4" scope="rowgroup" style={{ position: "static", background: "transparent", paddingTop: "var(--space-3-5)", paddingBottom: "var(--space-1-5)", borderBottom: "1px solid var(--border-subtle)", letterSpacing: "var(--tracking-caps)" }}>
                        {g?.k}
                      </th>
                    </tr>
                    {(g?.rows || []).map((c, $index) => (
                      <tr key={$index}>
                        <th scope="row" style={{ position: "static", background: "transparent", fontFamily: "var(--font-sans)", fontSize: "var(--text-sm)", fontWeight: "var(--weight-regular)", textTransform: "none", letterSpacing: "normal", color: "var(--fg-muted)", padding: "var(--density-cell-padding-y) var(--space-3-5)", borderBottom: c?.last ? "0" : "1px solid var(--border-subtle)" }}>{c?.k}</th>
                        <td className="num" style={{ whiteSpace: "normal" }}>{c?.a}</td>
                        <td className="num" style={{ color: "var(--fg)", whiteSpace: "normal" }}>{c?.b}</td>
                        <td style={{ textAlign: "right" }}>
                          {c?.nj ? null : (
                            <span style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-1-5)", color: c?.dc, fontSize: "var(--text-caption)" }}>
                              <DS.Icon name={c?.di} size={13} stroke={2} />
                              {c?.d ? (
                                <span style={{ fontFamily: "var(--font-mono)" }}>{c?.d}</span>
                              ) : null}
                              <span>{c?.dw}</span>
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                ))}
              </table>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--space-2)", padding: "var(--space-3-5) var(--space-5)", borderTop: "1px solid var(--border-subtle)" }}>
                <DS.Button variant="secondary" icon="copy">Copy comparison</DS.Button>
                <DS.Button variant="primary">Done</DS.Button>
              </div>
            </>}>Change is B relative to A</DS.Dialog>
        ) : null}
        {v.showCompareM ? (
          <DS.Modal role="dialog" aria-modal="true" aria-labelledby="cmpm-t" onKeyDown={e => { if (e.key === 'Escape' && this.props.onDismiss) { e.stopPropagation(); this.props.onDismiss(); } }} style={{ position: "absolute", inset: "0", zIndex: "40", background: "var(--bg-base)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", padding: "var(--space-1-5) var(--space-2) var(--space-1-5) var(--space-4)", borderBottom: "1px solid var(--border-subtle)" }}>
              <div style={{ display: "flex", flexDirection: "column", flex: "1", minWidth: "0" }}>
                <h2 id="cmpm-t" style={{ margin: "0", fontSize: "var(--text-lg)", fontWeight: "var(--weight-semibold)" }}>Compare results</h2>
                <span style={{ fontSize: "var(--text-caption)", color: "var(--fg-subtle)" }}>Change is shown on B, relative to A</span>
              </div>
              <DS.Button variant="ghost" iconOnly icon="x" aria-label="Close" style={{ width: "44px", height: "44px" }}></DS.Button>
            </div>
            <div style={{ flex: "1", minHeight: "0", overflowY: "auto", display: "flex", flexDirection: "column", gap: "var(--space-3)", padding: "var(--space-3) 0 var(--space-4)" }}>
              {v.cmpWarn ? (
                <div role="note" style={{ margin: "0 var(--space-4)", display: "flex", alignItems: "flex-start", gap: "var(--space-2-5)", padding: "var(--space-2-5) var(--space-3)", borderRadius: "var(--radius-md)", background: "var(--warn-bg)", border: "1px solid var(--warn-border)", fontSize: "var(--text-sm)", lineHeight: "var(--lh-normal)" }}>
                  <span style={{ color: "var(--warn)", display: "flex", marginTop: "var(--space-0-5)" }}><DS.Icon name="triangle-alert" size={15} stroke={2} /></span>
                  <span style={{ color: "var(--fg)" }}><b style={{ fontWeight: "var(--weight-semibold)", color: "var(--warn-fg)" }}>Not directly comparable:</b>{" "}{v.cmpWarn}</span>
                </div>
              ) : null}
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-1)", padding: "0 var(--space-2)" }}>
                <DS.Button variant="ghost" iconOnly icon="chevron-left" aria-label="Previous result" disabled={true} style={{ width: "44px", height: "44px" }}></DS.Button>
                <div style={{ flex: "1", display: "flex", flexDirection: "column", alignItems: "center", gap: "var(--space-1-5)" }}>
                  <span aria-live="polite" style={{ fontSize: "var(--text-caption)", color: "var(--fg-muted)" }}>Result A · 1 of 2</span>
                  <span aria-hidden="true" style={{ display: "flex", gap: "var(--space-1-5)" }}>
                    <span style={{ width: "16px", height: "4px", borderRadius: "2px", background: "var(--primary)" }} />
                    <span style={{ width: "6px", height: "4px", borderRadius: "2px", background: "var(--border-strong)" }} />
                  </span>
                </div>
                <DS.Button variant="ghost" iconOnly icon="chevron-right" aria-label="Next result" style={{ width: "44px", height: "44px" }}></DS.Button>
              </div>
              <div role="group" aria-label="Results, swipe to page" style={{ display: "flex", gap: "var(--space-2-5)", overflowX: "auto", scrollSnapType: "x mandatory", padding: "0 var(--space-4)", scrollPadding: "0 16px" }}>
                {(v.cmpCards || []).map((cd, $index) => (
                  <React.Fragment key={$index}>
                    <section aria-label={cd?.aria} style={{ flex: "0 0 calc(100% - 28px)", boxSizing: "border-box", scrollSnapAlign: "start", display: "flex", flexDirection: "column", padding: "var(--space-3-5)", borderRadius: "var(--radius-lg)", background: "var(--surface-2)", border: "1px solid var(--border-subtle)" }}>
                      <a href="#" style={{ display: "flex", alignItems: "center", gap: "var(--space-2-5)", minHeight: "44px", paddingBottom: "var(--space-2-5)", color: "var(--fg)", textDecoration: "none" }}>
                        <span style={{ flex: "none", width: "26px", height: "26px", borderRadius: "var(--radius-sm)", background: "var(--surface-3)", border: "1px solid var(--border-default)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-mono)", fontWeight: "var(--weight-semibold)", fontSize: "var(--text-caption)" }}>
                          {cd?.id}
                        </span>
                        <span style={{ display: "flex", flexDirection: "column", minWidth: "0", flex: "1" }}>
                          <span style={{ fontSize: "var(--text-sm)", fontWeight: "var(--weight-semibold)" }}>{cd?.label}</span>
                          <time dateTime={cd?.iso} style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-micro)", color: "var(--fg-subtle)" }}>{cd?.date}</time>
                        </span>
                        <span style={{ flex: "none", color: "var(--fg-subtle)", display: "flex" }}><DS.Icon name="chevron-right" size={16} stroke={2} /></span>
                      </a>
                      <span style={{ padding: "var(--space-2) 0 var(--space-1)", fontFamily: "var(--font-cond)", fontWeight: "var(--weight-semibold)", fontSize: "var(--text-micro)", letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--fg-subtle)" }}>
                        Parameters
                      </span>
                      {(cd?.params || []).map((p, $index) => (
                        <React.Fragment key={$index}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "var(--space-3)", padding: "7px 0", borderTop: "1px solid var(--border-subtle)", fontSize: "var(--text-sm)" }}>
                            <span style={{ color: "var(--fg-muted)" }}>{p?.k}</span>
                            <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "var(--space-0-5)", textAlign: "right" }}>
                              <span style={{ fontFamily: "var(--font-mono)" }}>{p?.v}</span>
                              {p?.ch ? (
                                <span style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-1)", color: p?.dc, fontSize: "var(--text-micro)" }}>
                                  <DS.Icon name={p?.di} size={11} stroke={2} />
                                  {p?.dw}
                                </span>
                              ) : null}
                            </span>
                          </div>
                        </React.Fragment>
                      ))}
                      <span style={{ padding: "var(--space-3) 0 var(--space-1)", fontFamily: "var(--font-cond)", fontWeight: "var(--weight-semibold)", fontSize: "var(--text-micro)", letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--fg-subtle)" }}>
                        Results
                      </span>
                      {(cd?.metrics || []).map((p, $index) => (
                        <React.Fragment key={$index}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "var(--space-3)", padding: "7px 0", borderTop: "1px solid var(--border-subtle)", fontSize: "var(--text-sm)" }}>
                            <span style={{ color: "var(--fg-muted)" }}>{p?.k}</span>
                            <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "var(--space-0-5)", textAlign: "right" }}>
                              <span style={{ fontFamily: "var(--font-mono)" }}>{p?.v}</span>
                              {p?.ch ? (
                                <span style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-1)", color: p?.dc, fontSize: "var(--text-micro)" }}>
                                  <DS.Icon name={p?.di} size={11} stroke={2} />
                                  {p?.d ? (
                                    <span style={{ fontFamily: "var(--font-mono)" }}>{p?.d}</span>
                                  ) : null}
                                  {p?.dw}
                                </span>
                              ) : null}
                            </span>
                          </div>
                        </React.Fragment>
                      ))}
                    </section>
                  </React.Fragment>
                ))}
              </div>
            </div>
            <div style={{ display: "flex", gap: "var(--space-2)", padding: "var(--space-2-5) var(--space-4) var(--space-4)", borderTop: "1px solid var(--border-subtle)", background: "var(--surface-1)" }}>
              <DS.Button variant="secondary" icon="copy" style={{ flex: "1", height: "44px", justifyContent: "center" }}>Copy</DS.Button>
              <DS.Button variant="primary" style={{ flex: "1", height: "44px", justifyContent: "center" }}>Done</DS.Button>
            </div>
          </DS.Modal>
        ) : null}
        {v.showConfirm ? (
          <DS.Dialog tone="danger" icon="trash" title="Clear all history?" align={v.mobile ? 'top' : 'center'} footerStack={v.mobile} onClose={this.props.onDismiss || (() => {})}
            footer={v.desktop ? <><DS.Button variant="ghost" icon="download">Export JSON first</DS.Button><span style={{ flex: "1" }} /><DS.Button>Cancel</DS.Button><DS.Button variant="danger-solid" icon="trash">Clear 48 results</DS.Button></>
              : <><DS.Button variant="ghost" touch>Cancel</DS.Button><DS.Button icon="download" touch>Export JSON first</DS.Button><DS.Button variant="danger-solid" icon="trash" touch>Clear 48 results</DS.Button></>}>
            {"This removes "}<b>48 results</b>{" with their labels and notes from this browser. This cannot be undone. Export first if you want a copy."}
          </DS.Dialog>
        ) : null}
      </div>
    );
  }
}

window.History = History;
