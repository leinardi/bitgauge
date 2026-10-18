/* BitGauge web UI kit — History
 * Props:
 *   variant: "populated" | "single" | "select3" | "deleted" | "compare" | "confirm" | "export" | "daterange" | "loading" | "nomatch" | "empty" | "unavailable" | "importing" | "importresult" | "importerror" | "safari"  (default "populated")
 *   mobile: boolean  (default false)
 *   whyOpen: boolean  (default false)
 *   caps: version scope from the Prototype (caps.quality false before v0.3: no RPM row in Compare)
 */
class History extends React.Component {
  state = { why: null };
  renderVals() {
    const why = this.state.why ?? (this.props.whyOpen === true || this.props.whyOpen === 'true');
    const m = !!this.props.mobile && this.props.mobile !== 'false';
    const v = this.props.variant || 'populated';
    const is = k => v === k;
    const BG = window.BG;
    const Q = !this.props.caps || !!this.props.caps.quality;
    const L = m ? { pad: 'var(--space-4) var(--space-4) var(--space-6)', gap: 'var(--space-3-5)', h1: 'var(--text-3xl)', chipWrap: 'nowrap', filterML: '0', legendML: '0', cardPad: '14px', trendCols: 'minmax(0,1fr)', tw: 311, th: 120, thpx: '120px', tL: '12px', tR: '12px', tB: '76px', cfAlign: 'flex-end', cfTop: '0', cfW: '100%', cfRad: 'var(--radius-xl) var(--radius-xl) 0 0' }
      : { pad: 'var(--space-6) var(--space-10) var(--space-12)', gap: 'var(--space-4-5)', h1: 'var(--text-4xl)', chipWrap: 'wrap', filterML: 'auto', legendML: 'auto', cardPad: '16px 20px', trendCols: 'repeat(3, minmax(0,1fr))', tw: 340, th: 130, thpx: '130px', tL: 'auto', tR: '24px', tB: '24px', cfAlign: 'flex-start', cfTop: '140px', cfW: '460px', cfRad: 'var(--radius-xl)' };
    const empty = is('empty'), unavail = is('unavailable'), loading = is('loading'), nomatch = is('nomatch'), deleted = is('deleted');
    const hasData = !empty && !unavail && !loading;
    const single = is('single');
    const total = single ? 1 : deleted ? 46 : is('importresult') ? 60 : 48;
    // [date, label, down, up, lat, jit, grade, flag, day, protocol, status]
    const R = [
      ['2026-10-08 08:41', 'VPN via 5G', 640e3, 210e3, 48, 9.4, 'D', 'Low confidence', 23, 'HTTP/2', 'complete'],
      ['2026-10-07 19:12', 'VPN · hotel Wi-Fi', 38.4e6, 12.1e6, 61, 4.2, 'C', null, 22, 'HTTP/1.1', 'complete'],
      ['2026-10-05 12:30', 'VPN via 5G', 84.2e6, 21.7e6, 39, 6.8, 'C', null, 20, 'HTTP/2', 'complete'],
      ['2026-10-02 09:05', 'VPN · office', 241e6, 198e6, 14, 1.9, 'B', null, 17, 'HTTP/1.1', 'complete'],
      ['2026-09-29 22:47', 'VPN via 5G', 52.9e6, null, 44, 7.1, 'D', null, 14, 'HTTP/2', 'partial'],
      ['2026-09-26 18:20', 'VPN · office', 233e6, 187e6, 15, 2.2, 'B', null, 11, 'HTTP/2', 'complete'],
      ['2026-09-21 07:58', 'VPN via 5G', null, null, 41, 5.9, null, null, 6, 'HTTP/2', 'error'],
      ['2026-09-17 13:14', 'VPN · café', 19.6e6, 4.1e6, 72, 11.3, 'F', null, 2, 'HTTP/2', 'complete']
    ];
    const selIdx = is('select3') ? [1, 3, 5] : deleted || single ? [] : [3, 5];
    let list = R.map((r, i) => ({ r, i, sel: selIdx.includes(i) }));
    if (deleted) list = list.filter(x => x.i !== 3 && x.i !== 5);
    // single: fresh install, first result taken today (18 Oct = day 33)
    if (single) list = [{ r: ['2026-10-18 09:14'].concat(R[3].slice(1, 8), [33], R[3].slice(9)), i: 3, sel: false }];
    const selN = selIdx.length;
    const tone = { 'A+': 'ok', A: 'ok', B: 'ok', C: 'warn', D: 'warn', F: 'danger' };
    const GW = { 'A+': 'Minimal', A: 'Low', B: 'Mild', C: 'Moderate', D: 'High', F: 'Severe' };
    const fr = b => b == null ? { n: '—', u: '' } : BG ? BG.rate(b) : { n: '', u: '' };
    const ST = { complete: ['Complete', 'pill neutral', false], partial: ['Partial', 'pill warn', true], error: ['Error', 'pill danger', true] };
    const rows = list.map(({ r, sel }) => {
      const [d, label, down, up, lat, jit, grade, flag, , proto, st] = r;
      const dn = fr(down), un = fr(up), t = grade ? tone[grade] : null, S = ST[st];
      return { d, label, down: dn.n, du: dn.u, up: un.n, uu: un.u, lat: String(lat), jit: jit < 10 ? jit.toFixed(1) : String(Math.round(jit)), grade: grade || '—', gAria: grade ? 'Grade ' + grade + ' · ' + GW[grade] + ' bufferbloat' : 'No grade', flag, proto,
        st: S[0], stCls: S[1], stDot: S[2], stM: st !== 'complete', sel, unsel: !sel, selAria: sel ? 'true' : 'false', cls: sel ? 'rowlink sel' : 'rowlink', ctx: 'VPN', cicon: 'shield',
        gbd: t ? `var(--${t}-border)` : 'var(--border-subtle)', gbg: t ? `var(--${t}-bg)` : 'transparent', gfg: t ? `var(--${t}-fg)` : 'var(--fg-subtle)',
        cardBd: sel ? 'var(--primary-border)' : 'var(--border-subtle)', cardBg: sel ? 'var(--primary-bg)' : 'var(--surface-2)' };
    });
    const colDefs = [['Date', 'left', true], ['Label', 'left'], ['Context', 'left'], ['Protocol', 'left'], ['Status', 'left'], ['Download', 'right'], ['Upload', 'right'], ['Latency', 'right'], ['Jitter', 'right'], ['Grade', 'center']];
    const cols = colDefs.map(([t, align, on]) => ({ t, align, on: !!on, aria: on ? 'descending' : 'none', icon: on ? 'chevron-down' : 'arrow-up-down', c: on ? 'var(--primary-text)' : 'var(--fg-subtle)' }));
    const chip = ([t, n, on]) => ({ t, n, cls: on ? 'chip on' : 'chip', pressed: on ? 'true' : 'false' });
    const byLabel = l => list.filter(x => x.r[1] === l).length;
    const chipGroups = [
      { t: 'Context', aria: 'Filter by context label', chips: (single ? [['All', total], ['VPN', 1, true]] : [['All', total], ['LAN', 21], ['VPN', list.length, true], ['Wi-Fi', 13], ['Mobile', 6]]).map(chip) },
      { t: 'Label', aria: 'Filter by label', chips: [['Any label', list.length, true], ['VPN via 5G', byLabel('VPN via 5G')], ['VPN · office', byLabel('VPN · office')], ['VPN · hotel Wi-Fi', byLabel('VPN · hotel Wi-Fi')], ['VPN · café', byLabel('VPN · café')]].filter(c => c[1] > 0).map(chip) }
    ];

    const pts = list.slice().reverse().map(({ r, sel }) => ({ day: r[8], down: r[2], up: r[3], lat: r[4], done: r[10] === 'complete', sel }));
    // Axis rules (components/charts.md § Trend chart axes)
    // X: [d0, d1] = date filter window; "All time" = first result → today, min 7 days ending today.
    const [d0, d1] = single ? [27, 33] : [1, 24];
    const xTicks = single ? [[27, '12 Oct'], [30, '15 Oct'], [33, 'Today']] : [[2, '17 Sep'], [9, '24 Sep'], [16, '1 Oct'], [23, '8 Oct']];
    const nice = v => { const p = Math.pow(10, Math.floor(Math.log10(v))); return [1, 2, 2.5, 5, 10].map(k => k * p).find(n => n >= v); };
    const mkTrend = (key, title, icon, c, log) => {
      const w = L.tw, h = L.th, pl = 40, pr = 8, pt = 6, pb = 20, W = w - pl - pr, H = h - pt - pb;
      const X = d => pl + W * (d - d0) / (d1 - d0);
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
        if (val == null) { pen = false; return; }
        const x = X(p.day).toFixed(1), y = Y(val).toFixed(1);
        line += (pen ? 'L' : 'M') + x + ' ' + y; pen = true;
        if (!p.done) hollow++;
        P.push({ x, y, r: p.sel ? 4.5 : p.done ? 3 : 3.5, fill: p.done ? c : 'var(--surface-2)' });
      });
      const xt = xTicks.map(([d, t]) => ({ x: X(d).toFixed(1), t }));
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
    const params = [['Label', 'VPN · office', 'VPN · office'], ['Preset', 'Standard', 'Standard'], ['Protocol', 'HTTP/2', 'HTTP/1.1'], ['Streams', 'Auto', 'Auto'], ['Duration · download', '10–20 s', '10–20 s'], ['Duration · upload', '15–25 s', '15–25 s'], ['Browser', 'Firefox 131', 'Safari 18']]
      .map(([k, a, b]) => { const diff = a !== b, crit = diff && CRIT.includes(k); return Object.assign({ k, a, b, diff, crit }, ch('', crit ? 'crit' : diff ? 'differs' : 'same', diff ? 'differs' : 'same')); });
    const metrics = [
      ['Download', '233 Mbit/s', '241 Mbit/s', '+3.4%', 'better'], ['Upload', '187 Mbit/s', '198 Mbit/s', '+5.9%', 'better'],
      ['Idle latency', '15 ms', '14 ms', '−1 ms', 'better'], ['Jitter', '2.2 ms', '1.9 ms', '−0.3 ms', 'better'],
      ['Loaded latency · download', '31 ms', '29 ms', '−2 ms', 'better'], ['Loaded latency · upload', '58 ms', '71 ms', '+13 ms', 'worse'],
      ['Bufferbloat grade', 'B · Mild', 'B · Mild', '', 'same', 'same · +43 ms vs +57 ms']
    ].concat(Q ? [
      ['HTTP loaded responsiveness — connection sharing not verifiable', '980 RPM · HTTP/2', 'needs HTTP/2 or HTTP/3 at the reverse proxy · HTTP/1.1', '', 'differs', 'not comparable']
    ] : []).map(([k, a, b, d, w, dw]) => Object.assign({ k, a, b }, ch(d, w, dw)));
    const cmpWarn = params.filter(p => p.crit).map(p => `different ${p.k.toLowerCase()} (${p.a} vs ${p.b})`).join('; ');
    const cmpRows = [{ head: true, row: false, k: 'Parameters' }, ...params.map(p => Object.assign({ head: false, row: true }, p)), { head: true, row: false, k: 'Results' }, ...metrics.map(p => Object.assign({ head: false, row: true }, p))];
    const cmpCards = [
      { id: 'A', aria: 'Result A', label: 'VPN · office', date: '2026-09-26 18:20', params: params.map(p => ({ k: p.k, v: p.a, ch: false })), metrics: metrics.map(p => ({ k: p.k, v: p.a, ch: false })) },
      { id: 'B', aria: 'Result B', label: 'VPN · office', date: '2026-10-02 09:05', params: params.map(p => ({ k: p.k, v: p.b, ch: p.diff, dc: p.dc, di: p.di, dw: p.dw })), metrics: metrics.map(p => ({ k: p.k, v: p.b, ch: true, d: p.d, dc: p.dc, di: p.di, dw: p.dw })) }
    ];

    const shownN = list.length;
    const countText = empty ? '0 results' : unavail ? 'Not saved in this window' : loading ? 'Loading…' : nomatch ? `0 of ${total} shown` : `${shownN} of ${total} shown`;
    const sk = (w, f) => ({ w, f });
    return {
      rootH: m && (is('compare') || is('confirm')) ? '100%' : 'auto', rootOv: m && (is('compare') || is('confirm')) ? 'hidden' : 'visible',
      mobile: m, desktop: !m, L, total, shownN, countText,
      isEmpty: empty, unavailable: unavail, loading, hasData, showFilters: hasData, noMatch: nomatch, showResults: hasData && !nomatch,
      showOrigin: !unavail, safari: is('safari'), importing: is('importing'), importResult: is('importresult'), importError: is('importerror'),
      importDisabled: unavail || is('importing'), importLabel: is('importing') ? 'Importing…' : 'Import JSON',
      whyOpen: why, whyAria: why ? 'true' : 'false', toggleWhy: () => this.setState({ why: !why }),
      exportFormats: [{ t: 'Export JSON', s: 'Full samples · re-importable', icon: 'file-json' }, { t: 'Export CSV', s: 'One row per test · summary only', icon: 'file-text' }],
      rows: m ? rows.slice(0, 6) : rows, cols, chipGroups, trends, trendMeta: single ? '1 result · today' : `${shownN} results · 17 Sep – 8 Oct`,
      hasSel: selN > 0, selN, cmpDisabled: selN !== 2, cmpHint: selN > 0 && selN !== 2,
      selSummary: selN === 2 ? 'VPN · office · 26 Sep and 2 Oct' : '26 Sep – 7 Oct',
      toast: deleted,
      cmpRows, cmpCards, cmpWarn, showCompareD: is('compare') && !m, showCompareM: is('compare') && m, showConfirm: is('confirm'),
      showExport: is('export'), exportAria: is('export') ? 'true' : 'false', showDate: is('daterange'), dateAria: is('daterange') ? 'true' : 'false',
      dateLabel: nomatch ? 'Last 7 days' : single ? 'All time' : 'Last 30 days', searchVal: nomatch ? 'airport' : '',
      noMatchText: nomatch ? `Nothing with context VPN in the last 7 days matches “airport”. All ${total} results are still in history.` : '',
      noop: () => {},
      skChips: [56, 64, 64, 72, 76].map(n => ({ w: n + 'px' })), skTrends: m ? [1] : [1, 2, 3],
      skRows: (m ? [1, 2, 3, 4] : [1, 2, 3, 4, 5, 6, 7, 8]).map(() => ({ cols: [sk('16px', 'none'), sk('110px', 'none'), sk('auto', '1'), sk('52px', 'none'), sk('56px', 'none'), sk('64px', 'none'), sk('80px', 'none'), sk('80px', 'none'), sk('56px', 'none'), sk('52px', 'none'), sk('26px', 'none')] })),
      trendSingle: single,
      ranges: (single ? [['Last 7 days', 1], ['Last 30 days', 1], ['Last 90 days', 1], ['All time', 1, true]] : [['Last 7 days', 3], ['Last 30 days', 8, true], ['Last 90 days', 8], ['All time', 8]]).map(([t, n, on]) => ({ t, n, on: !!on, aria: on ? 'true' : 'false', bg: on ? 'var(--primary-bg)' : 'transparent', c: on ? 'var(--primary-text)' : 'var(--fg)' }))
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
                  <DS.Popover open={!!v.showExport} role="menu" label="Export" width={320}
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
                      <div className="pop-sep" />
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
              12 added, 3 skipped as duplicates, 1 rejected: schema version 3 is newer than this app
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
              <DS.EmptyState icon="hard-drive" title="History isn't available in this window" actions={<><DS.Button variant="primary" icon="play">Start a test</DS.Button></>}>The browser isn't letting this site store data — usually because this is a private window. Tests still run, and you can copy or download each result, but nothing is saved here. Open BitGauge in a normal window to keep history.</DS.EmptyState>
            </DS.Card>
          ) : null}
          {v.loading ? (
            <div aria-busy="true" aria-label="Loading history" style={{ display: "flex", flexDirection: "column", gap: v.L?.gap }}>
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
              <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap", marginLeft: v.L?.filterML }}>
                <DS.Popover open={!!v.showDate} role="dialog" label="Date range" width={300}
                    trigger={<DS.Button size="sm" icon="calendar" iconAfter="chevron-down" aria-haspopup="dialog" aria-expanded={v.dateAria}>{v.dateLabel}</DS.Button>}>
                      <DS.OptionRows label="Preset range" options={(v.ranges || []).map(rg => ({ value: rg.t, label: rg.t, meta: rg.n }))} selected={((v.ranges || []).find(rg => rg.on) || {}).t} />
                      <div className="pop-sep" />
                      <span className="ds-eyebrow" style={{ padding: "var(--space-1) var(--space-2-5) var(--space-0-5)" }}>
                        Custom range
                      </span>
                      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-1-5)", padding: "var(--space-1) var(--space-2-5) var(--space-2)" }}>
                        <DS.Input size="sm" mono style={{ flex: "1", minWidth: "0" }} value="2026-09-08" aria-label="From date" onChange={v.noop} />
                        <span style={{ color: "var(--fg-subtle)" }}>–</span>
                        <DS.Input size="sm" mono style={{ flex: "1", minWidth: "0" }} value="2026-10-08" aria-label="To date" onChange={v.noop} />
                      </div>
                      <div className="pop-foot">
                        <DS.Button variant="ghost" size="sm">Cancel</DS.Button>
                        <DS.Button variant="primary" size="sm">Apply</DS.Button>
                      </div>
                    </DS.Popover>
                {v.desktop ? (
                  <DS.Input size="sm" icon="search" style={{ width: "220px" }} placeholder="Search labels and notes" aria-label="Search" value={v.searchVal} onChange={v.noop} />
                ) : null}
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
              <DS.Card as="section" label="Trend" padded={false} style={{ padding: v.L?.cardPad, display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "var(--space-2) var(--space-3-5)" }}>
                <span style={{ fontSize: "var(--text-base)", fontWeight: "var(--weight-semibold)" }}>Trend</span>
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
                                {xt?.t}
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
                        <tr className={r?.cls}>
                          <td>
                            {r?.sel ? (
                              <span role="checkbox" aria-checked="true" tabIndex="0" style={{ width: "16px", height: "16px", borderRadius: "4px", background: "var(--primary)", color: "var(--primary-fg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                <DS.Icon name="check" size={12} stroke={3} />
                              </span>
                            ) : null}
                            {r?.unsel ? (
                              <span role="checkbox" aria-checked="false" tabIndex="0" style={{ width: "16px", height: "16px", boxSizing: "border-box", borderRadius: "4px", border: "1.5px solid var(--border-strong)", display: "block" }} />
                            ) : null}
                          </td>
                          <td style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-caption)", color: "var(--fg-muted)", whiteSpace: "nowrap" }}>{r?.d}</td>
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
                          <td className="num">{r?.down}{" "}<span style={{ color: "var(--fg-subtle)", fontSize: "var(--text-micro)" }}>{r?.du}</span></td>
                          <td className="num">{r?.up}{" "}<span style={{ color: "var(--fg-subtle)", fontSize: "var(--text-micro)" }}>{r?.uu}</span></td>
                          <td className="num">{r?.lat}{" "}<span style={{ color: "var(--fg-subtle)", fontSize: "var(--text-micro)" }}>ms</span></td>
                          <td className="num">{r?.jit}{" "}<span style={{ color: "var(--fg-subtle)", fontSize: "var(--text-micro)" }}>ms</span></td>
                          <td style={{ textAlign: "center" }}>
                            <span role="img" aria-label={r?.gAria} title={r?.gAria} style={{ display: "inline-flex", width: "26px", height: "22px", boxSizing: "border-box", alignItems: "center", justifyContent: "center", borderRadius: "var(--radius-sm)", border: `1px solid ${r?.gbd ?? ""}`, background: r?.gbg, color: r?.gfg, fontFamily: "var(--font-mono)", fontWeight: "var(--weight-semibold)", fontSize: "var(--text-caption)" }}>
                              {r?.grade}
                            </span>
                          </td>
                          <td>
                            <DS.Button variant="ghost" size="sm" iconOnly icon="ellipsis" aria-label={`Actions for ${r?.label ?? ""}`} aria-haspopup="menu" />
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
                    <div style={{ display: "flex", alignItems: "stretch", borderRadius: "var(--radius-lg)", border: `1px solid ${r?.cardBd ?? ""}`, background: r?.cardBg }}>
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
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-micro)", color: "var(--fg-subtle)" }}>{r?.d}{" · "}{r?.proto}</span>
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
                      <DS.Button variant="ghost" iconOnly icon="ellipsis" aria-label={`Actions for ${r?.label ?? ""}`} aria-haspopup="menu" style={{ flex: "none", width: "44px", height: "44px", marginTop: "var(--space-1)" }}></DS.Button>
                    </div>
                  </React.Fragment>
                ))}
                {v.hasSel ? (
                  <div role="toolbar" aria-label="Selection" style={{ position: "sticky", bottom: "12px", display: "flex", alignItems: "center", gap: "var(--space-1)", padding: "var(--space-1-5) var(--space-1-5) var(--space-1-5) var(--space-3-5)", borderRadius: "var(--radius-lg)", background: "var(--surface-3)", border: "1px solid var(--border-default)", boxShadow: "var(--shadow-md)" }}>
                    <span style={{ fontSize: "var(--text-sm)", fontWeight: "var(--weight-semibold)", marginRight: "auto" }}>{v.selN}{" selected"}</span>
                    <DS.Button variant="ghost" iconOnly icon="x" aria-label="Clear selection" style={{ width: "44px", height: "44px" }}></DS.Button>
                    <DS.Button variant="ghost" iconOnly icon="trash" aria-label="Delete selected" style={{ width: "44px", height: "44px", color: "var(--danger-fg)" }}></DS.Button>
                    <DS.Button variant="primary" icon="git-compare" disabled={v.cmpDisabled} style={{ height: "44px" }}>Compare</DS.Button>
                  </div>
                ) : null}
              </div>
            ) : null}
            </>
          ) : null}
        </main>
        {v.mobile ? (
          <div style={{ marginTop: "auto", position: "sticky", bottom: "0", zIndex: "var(--z-nav)" }}><Nav variant="mobile-bottom" active="history" status={this.props.srvStatus || "connected"} /></div>
        ) : null}
        {v.toast ? (
          <div style={{ position: "absolute", left: v.L?.tL, right: v.L?.tR, bottom: v.L?.tB, zIndex: "50", display: "flex", justifyContent: "flex-end" }}>
            <DS.Toast tone="info" icon="trash" title="2 results deleted." message="Removed from history in 8 s." action={<DS.Button size="sm" icon="undo-2">Undo</DS.Button>} onDismiss={() => {}} />
          </div>
        ) : null}
        {v.showCompareD ? (
          <DS.Dialog size="xl" flush icon="git-compare" title="Compare results" onClose={() => {}} align="top" body={<>
              {v.cmpWarn ? (
                <div role="note" style={{ display: "flex", alignItems: "flex-start", gap: "var(--space-2-5)", padding: "var(--space-2-5) var(--space-5)", background: "var(--warn-bg)", borderBottom: "1px solid var(--warn-border)", fontSize: "var(--text-sm)", lineHeight: "var(--lh-normal)" }}>
                  <span style={{ color: "var(--warn)", display: "flex", marginTop: "var(--space-0-5)" }}><DS.Icon name="triangle-alert" size={15} stroke={2} /></span>
                  <span style={{ color: "var(--fg)" }}><b style={{ fontWeight: "var(--weight-semibold)", color: "var(--warn-fg)" }}>Not directly comparable:</b>{" "}{v.cmpWarn}</span>
                </div>
              ) : null}
              <table className="tbl" style={{ tableLayout: "fixed" }}>
                <thead>
                  <tr>
                    <th style={{ width: "30%", background: "var(--surface-2)" }}>Metric</th>
                    <th style={{ background: "var(--surface-2)", textAlign: "right" }}>
                      <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "var(--space-0-5)", textTransform: "none", letterSpacing: "0" }}>
                        <span style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-sm)", color: "var(--fg)", fontWeight: "var(--weight-semibold)" }}>A · VPN · office</span>
                        <span style={{ fontFamily: "var(--font-mono)", fontWeight: "var(--weight-regular)", color: "var(--fg-subtle)" }}>2026-09-26 18:20</span>
                      </span>
                    </th>
                    <th style={{ background: "var(--surface-2)", textAlign: "right" }}>
                      <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "var(--space-0-5)", textTransform: "none", letterSpacing: "0" }}>
                        <span style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-sm)", color: "var(--fg)", fontWeight: "var(--weight-semibold)" }}>B · VPN · office</span>
                        <span style={{ fontFamily: "var(--font-mono)", fontWeight: "var(--weight-regular)", color: "var(--fg-subtle)" }}>2026-10-02 09:05</span>
                      </span>
                    </th>
                    <th style={{ background: "var(--surface-2)", textAlign: "right", width: "24%" }}>Change</th>
                  </tr>
                </thead>
                <tbody>
                  {(v.cmpRows || []).map((c, $index) => (
                    <React.Fragment key={$index}>
                      {c?.head ? (
                        <tr>
                          <td style={{ paddingTop: "var(--space-3-5)", paddingBottom: "var(--space-1-5)", fontFamily: "var(--font-cond)", fontWeight: "var(--weight-semibold)", fontSize: "var(--text-micro)", letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--fg-subtle)" }}>
                            {c?.k}
                          </td>
                          <td />
                          <td />
                          <td />
                        </tr>
                      ) : null}
                      {c?.row ? (
                        <tr>
                          <td style={{ color: "var(--fg-muted)" }}>{c?.k}</td>
                          <td className="num" style={{ whiteSpace: "normal" }}>{c?.a}</td>
                          <td className="num" style={{ color: "var(--fg)", whiteSpace: "normal" }}>{c?.b}</td>
                          <td style={{ textAlign: "right" }}>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-1-5)", color: c?.dc, fontSize: "var(--text-caption)" }}>
                              <DS.Icon name={c?.di} size={13} stroke={2} />
                              {c?.d ? (
                                <span style={{ fontFamily: "var(--font-mono)" }}>{c?.d}</span>
                              ) : null}
                              <span>{c?.dw}</span>
                            </span>
                          </td>
                        </tr>
                      ) : null}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--space-2)", padding: "var(--space-3-5) var(--space-5)", borderTop: "1px solid var(--border-subtle)" }}>
                <DS.Button variant="secondary" icon="copy">Copy comparison</DS.Button>
                <DS.Button variant="primary">Done</DS.Button>
              </div>
            </>}>Change is B relative to A</DS.Dialog>
        ) : null}
        {v.showCompareM ? (
          <div role="dialog" aria-modal="true" aria-labelledby="cmpm-t" style={{ position: "absolute", inset: "0", zIndex: "40", background: "var(--bg-base)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", padding: "var(--space-1-5) var(--space-2) var(--space-1-5) var(--space-4)", borderBottom: "1px solid var(--border-subtle)" }}>
              <div style={{ display: "flex", flexDirection: "column", flex: "1", minWidth: "0" }}>
                <span id="cmpm-t" style={{ fontSize: "var(--text-lg)", fontWeight: "var(--weight-semibold)" }}>Compare results</span>
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
                      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2-5)", paddingBottom: "var(--space-2-5)" }}>
                        <span style={{ width: "26px", height: "26px", borderRadius: "var(--radius-sm)", background: "var(--surface-3)", border: "1px solid var(--border-default)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-mono)", fontWeight: "var(--weight-semibold)", fontSize: "var(--text-caption)" }}>
                          {cd?.id}
                        </span>
                        <div style={{ display: "flex", flexDirection: "column", minWidth: "0" }}>
                          <span style={{ fontSize: "var(--text-sm)", fontWeight: "var(--weight-semibold)" }}>{cd?.label}</span>
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-micro)", color: "var(--fg-subtle)" }}>{cd?.date}</span>
                        </div>
                      </div>
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
          </div>
        ) : null}
        {v.showConfirm ? (
          <DS.Dialog tone="danger" icon="trash" title="Clear all history?" align={v.mobile ? 'top' : 'center'} footerStack={v.mobile} onClose={() => {}}
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
