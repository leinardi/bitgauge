/* BitGauge web UI kit — History
 * Props:
 *   variant: "populated" | "select3" | "deleted" | "compare" | "confirm" | "export" | "daterange" | "loading" | "nomatch" | "empty" | "unavailable" | "importing" | "importresult" | "importerror" | "safari"  (default "populated")
 *   mobile: boolean  (default false)
 *   whyOpen: boolean  (default false)
 */
class History extends React.Component {
  state = { why: null };
  renderVals() {
    const why = this.state.why ?? (this.props.whyOpen === true || this.props.whyOpen === 'true');
    const m = !!this.props.mobile && this.props.mobile !== 'false';
    const v = this.props.variant || 'populated';
    const is = k => v === k;
    const BG = window.BG;
    const L = m ? { pad: '16px 16px 24px', gap: '14px', h1: 'var(--text-3xl)', chipWrap: 'nowrap', filterML: '0', legendML: '0', cardPad: '14px', trendCols: 'minmax(0,1fr)', tw: 311, th: 120, thpx: '120px', tL: '12px', tR: '12px', tB: '76px', cfAlign: 'flex-end', cfTop: '0', cfW: '100%', cfRad: 'var(--radius-xl) var(--radius-xl) 0 0' }
      : { pad: '24px 40px 48px', gap: '18px', h1: 'var(--text-4xl)', chipWrap: 'wrap', filterML: 'auto', legendML: 'auto', cardPad: '16px 20px', trendCols: 'repeat(3, minmax(0,1fr))', tw: 340, th: 130, thpx: '130px', tL: 'auto', tR: '24px', tB: '24px', cfAlign: 'flex-start', cfTop: '140px', cfW: '460px', cfRad: 'var(--radius-xl)' };
    const empty = is('empty'), unavail = is('unavailable'), loading = is('loading'), nomatch = is('nomatch'), deleted = is('deleted');
    const hasData = !empty && !unavail && !loading;
    const total = deleted ? 46 : is('importresult') ? 60 : 48;
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
    const selIdx = is('select3') ? [1, 3, 5] : deleted ? [] : [3, 5];
    let list = R.map((r, i) => ({ r, i, sel: selIdx.includes(i) }));
    if (deleted) list = list.filter(x => x.i !== 3 && x.i !== 5);
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
      { t: 'Context', aria: 'Filter by context label', chips: [['All', total], ['LAN', 21], ['VPN', list.length, true], ['Wi-Fi', 13], ['Mobile', 6]].map(chip) },
      { t: 'Label', aria: 'Filter by label', chips: [['Any label', list.length, true], ['VPN via 5G', byLabel('VPN via 5G')], ['VPN · office', byLabel('VPN · office')], ['VPN · hotel Wi-Fi', byLabel('VPN · hotel Wi-Fi')], ['VPN · café', byLabel('VPN · café')]].filter(c => c[1] > 0).map(chip) }
    ];

    const pts = list.slice().reverse().map(({ r, sel }) => ({ day: r[8], down: r[2], up: r[3], lat: r[4], done: r[10] === 'complete', sel }));
    const mkTrend = (key, title, icon, c, log) => {
      const w = L.tw, h = L.th, pl = 40, pr = 8, pt = 6, pb = 20, W = w - pl - pr, H = h - pt - pb;
      const X = d => pl + W * (d - 1) / 23;
      let Y, grid;
      if (log) { const lo = 5, hi = 9; Y = v => pt + H * (1 - (Math.log10(v) - lo) / (hi - lo)); grid = [1e5, 1e6, 1e7, 1e8, 1e9].map(v => ({ y: Y(v).toFixed(1), t: v >= 1e9 ? '1G' : v >= 1e6 ? (v / 1e6) + 'M' : (v / 1e3) + 'k' })); }
      else { Y = v => pt + H * (1 - v / 80); grid = [0, 40, 80].map(v => ({ y: Y(v).toFixed(1), t: v + (v === 80 ? ' ms' : '') })); }
      const P = []; let line = '', pen = false, hollow = 0;
      pts.forEach(p => {
        const val = p[key];
        if (val == null) { pen = false; return; }
        const x = X(p.day).toFixed(1), y = Y(val).toFixed(1);
        line += (pen ? 'L' : 'M') + x + ' ' + y; pen = true;
        if (!p.done) hollow++;
        P.push({ x, y, r: p.sel ? 4.5 : p.done ? 3 : 3.5, fill: p.done ? c : 'var(--surface-2)' });
      });
      const xt = [[2, '17 Sep'], [9, '24 Sep'], [16, '1 Oct'], [23, '8 Oct']].map(([d, t]) => ({ x: X(d).toFixed(1), t }));
      return { title, icon, c, w, h, grid, pts: P, line, xt, x0: pl, x1: pl + W, lx: pl - 6, xy: h - 14, scale: log ? 'log' : 'linear',
        aria: `${title} trend, ${P.length} results, ${hollow} partial or error` };
    };
    let trends = [mkTrend('down', 'Download', 'arrow-down', 'var(--series-download)', true), mkTrend('up', 'Upload', 'arrow-up', 'var(--series-upload)', true), mkTrend('lat', 'Idle latency', 'activity', 'var(--series-latency)', false)];
    if (m) trends = trends.slice(0, 1);

    const ch = (d, w, dw) => ({ dc: w === 'better' ? 'var(--ok-fg)' : w === 'worse' || w === 'crit' ? 'var(--warn-fg)' : w === 'differs' ? 'var(--fg-muted)' : 'var(--fg-subtle)',
      di: w === 'better' ? 'trending-up' : w === 'worse' || w === 'crit' ? 'triangle-alert' : w === 'differs' ? 'info' : 'minus', d, dw: dw || w });
    const CRIT = ['Label', 'Preset', 'Protocol'];
    const params = [['Label', 'VPN · office', 'VPN · office'], ['Preset', 'Standard', 'Standard'], ['Protocol', 'HTTP/2', 'HTTP/1.1'], ['Streams', 'Auto', 'Auto'], ['Duration · download', '10–20 s', '10–20 s'], ['Duration · upload', '12–25 s', '12–25 s'], ['Browser', 'Firefox 131', 'Safari 18']]
      .map(([k, a, b]) => { const diff = a !== b, crit = diff && CRIT.includes(k); return Object.assign({ k, a, b, diff, crit }, ch('', crit ? 'crit' : diff ? 'differs' : 'same', diff ? 'differs' : 'same')); });
    const metrics = [
      ['Download', '233 Mbit/s', '241 Mbit/s', '+3.4%', 'better'], ['Upload', '187 Mbit/s', '198 Mbit/s', '+5.9%', 'better'],
      ['Idle latency', '15 ms', '14 ms', '−1 ms', 'better'], ['Jitter', '2.2 ms', '1.9 ms', '−0.3 ms', 'better'],
      ['Loaded latency · download', '31 ms', '29 ms', '−2 ms', 'better'], ['Loaded latency · upload', '58 ms', '71 ms', '+13 ms', 'worse'],
      ['Bufferbloat grade', 'B · Mild', 'B · Mild', '', 'same', 'same · +43 ms vs +57 ms'],
      ['HTTP loaded responsiveness — connection sharing not verifiable', '980 RPM · HTTP/2', 'needs HTTP/2 or HTTP/3 at the reverse proxy · HTTP/1.1', '', 'differs', 'not comparable']
    ].map(([k, a, b, d, w, dw]) => Object.assign({ k, a, b }, ch(d, w, dw)));
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
      rows: m ? rows.slice(0, 6) : rows, cols, chipGroups, trends, trendMeta: `${shownN} results · 17 Sep – 8 Oct`,
      hasSel: selN > 0, selN, cmpDisabled: selN !== 2, cmpHint: selN > 0 && selN !== 2,
      selSummary: selN === 2 ? 'VPN · office · 26 Sep and 2 Oct' : '26 Sep – 7 Oct',
      toast: deleted,
      cmpRows, cmpCards, cmpWarn, showCompareD: is('compare') && !m, showCompareM: is('compare') && m, showConfirm: is('confirm'),
      showExport: is('export'), exportAria: is('export') ? 'true' : 'false', showDate: is('daterange'), dateAria: is('daterange') ? 'true' : 'false',
      dateLabel: nomatch ? 'Last 7 days' : 'Last 30 days', searchVal: nomatch ? 'airport' : '',
      noMatchText: nomatch ? `Nothing with context VPN in the last 7 days matches “airport”. All ${total} results are still in history.` : '',
      noop: () => {},
      skChips: [56, 64, 64, 72, 76].map(n => ({ w: n + 'px' })), skTrends: m ? [1] : [1, 2, 3],
      skRows: (m ? [1, 2, 3, 4] : [1, 2, 3, 4, 5, 6, 7, 8]).map(() => ({ cols: [sk('16px', 'none'), sk('110px', 'none'), sk('auto', '1'), sk('52px', 'none'), sk('56px', 'none'), sk('64px', 'none'), sk('80px', 'none'), sk('80px', 'none'), sk('56px', 'none'), sk('52px', 'none'), sk('26px', 'none')] })),
      ranges: [['Last 7 days', 3], ['Last 30 days', 8, true], ['Last 90 days', 8], ['All time', 8]].map(([t, n, on]) => ({ t, n, on: !!on, aria: on ? 'true' : 'false', bg: on ? 'var(--primary-bg)' : 'transparent', c: on ? 'var(--primary-text)' : 'var(--fg)' }))
    };
  }
  componentDidMount() { if (!window.BG) { this._h = () => this.forceUpdate(); window.addEventListener('bg-lib-ready', this._h); } }
  componentWillUnmount() { if (this._h) window.removeEventListener('bg-lib-ready', this._h); }
  render() {
    const v = this.renderVals();
    return (
      <div style={{ position: "relative", background: "var(--bg-base)", color: "var(--fg)", fontFamily: "var(--font-sans)", minHeight: "100%", height: v.rootH, overflow: v.rootOv, display: "flex", flexDirection: "column" }}>
        {v.desktop ? (
          <Nav variant="top" active="history" />
        ) : null}
        {v.mobile ? (
          <Nav variant="mobile-top" active="history" />
        ) : null}
        <main style={{ flex: "1", width: "100%", maxWidth: "1200px", margin: "0 auto", boxSizing: "border-box", padding: v.L?.pad, display: "flex", flexDirection: "column", gap: v.L?.gap }}>
          <header style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "12px 16px" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: "10px" }}>
              <h1 style={{ margin: "0", fontSize: v.L?.h1, fontWeight: "600", letterSpacing: "var(--tracking-tight)" }}>History</h1>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-sm)", color: "var(--fg-subtle)" }}>{v.countText}</span>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginLeft: "auto" }}>
              <button className="btn secondary sm" disabled={v.importDisabled}><bg-icon name="upload" size="14" />{v.importLabel}</button>
              {v.hasData ? (
                <>
                  <div style={{ position: "relative" }}>
                  <button className="btn secondary sm" aria-haspopup="menu" aria-expanded={v.exportAria}>
                    <bg-icon name="download" size="14" />
                    Export
                    <bg-icon name="chevron-down" size="13" />
                  </button>
                  {v.showExport ? (
                    <div role="menu" aria-label="Export" style={{ position: "absolute", right: "0", top: "calc(100% + 6px)", zIndex: "20", background: "var(--surface-2)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-pop)", padding: "6px", display: "flex", flexDirection: "column", textAlign: "left", width: "320px" }}>
                      {(v.exportFormats || []).map((f, $index) => (
                        <React.Fragment key={$index}>
                          <div role="group" aria-label={f?.t} style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "8px 10px" }}>
                            <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
                              <span style={{ color: "var(--fg-muted)", display: "flex", marginTop: "1px" }}><bg-icon name={f?.icon} size="16" /></span>
                              <span style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                                <span style={{ fontSize: "var(--text-sm)", fontWeight: "600", color: "var(--fg)" }}>{f?.t}</span>
                                <span style={{ fontSize: "var(--text-caption)", color: "var(--fg-subtle)" }}>{f?.s}</span>
                              </span>
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: "6px", paddingLeft: "26px" }}>
                              <button className="btn secondary sm" role="menuitem" style={{ justifyContent: "center" }}>All results ({v.total})</button>
                              <button className="btn secondary sm" role="menuitem" style={{ justifyContent: "center" }}>Current filter ({v.shownN})</button>
                            </div>
                          </div>
                        </React.Fragment>
                      ))}
                      <div style={{ height: "1px", background: "var(--border-subtle)", margin: "4px 2px" }} />
                      <div style={{ display: "flex", alignItems: "flex-start", gap: "8px", padding: "6px 10px 4px" }}>
                        <span style={{ color: "var(--warn)", display: "flex", marginTop: "1px" }}><bg-icon name="triangle-alert" size="13" stroke="2" /></span>
                        <span style={{ fontSize: "var(--text-micro)", color: "var(--fg-muted)", lineHeight: "1.45" }}>
                          Contains client IP addresses, labels and notes. Files are created in your browser.
                        </span>
                      </div>
                    </div>
                  ) : null}
                </div>
                  <button className="btn danger sm"><bg-icon name="trash" size="14" />Clear all</button>
                </>
              ) : null}
            </div>
          </header>
          {v.showOrigin ? (
            <div role="note" style={{ display: "flex", alignItems: "flex-start", gap: "10px", padding: "10px 14px", borderRadius: "var(--radius-md)", background: "var(--info-bg)", border: "1px solid var(--info-border)" }}>
              <span style={{ color: "var(--info)", display: "flex", marginTop: "1px" }}><bg-icon name="hard-drive" size="16" /></span>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px", minWidth: "0", fontSize: "var(--text-sm)", lineHeight: "1.5" }}>
                <span style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "4px 8px" }}>
                  <b style={{ color: "var(--fg)", fontWeight: "600" }}>
                    {"Stored only in this browser, for "}
                    <span style={{ fontFamily: "var(--font-mono)", fontWeight: "500", overflowWrap: "anywhere" }}>https://speed.home.lan</span>
                  </b>
                  <button aria-expanded={v.whyAria} onClick={v.toggleWhy} style={{ all: "unset", cursor: "pointer", color: "var(--info-fg)", textDecoration: "underline", textUnderlineOffset: "2px" }}>
                    Why?
                  </button>
                </span>
                {v.whyOpen ? (
                  <span style={{ color: "var(--fg-muted)", maxWidth: "760px", textWrap: "pretty" }}>
                    {"Browsers keep site data per address — scheme, host and port. Opening BitGauge at another address, such as "}
                    <span style={{ fontFamily: "var(--font-mono)" }}>http://192.168.1.10:8080</span>
                    , shows a separate, empty history. The server keeps no results. Export JSON to move them.
                  </span>
                ) : null}
              </div>
            </div>
          ) : null}
          {v.safari ? (
            <div role="note" style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", gap: "10px 12px", padding: "12px 14px", borderRadius: "var(--radius-md)", border: "1px solid var(--warn-border)", background: "var(--warn-bg)" }}>
              <span style={{ color: "var(--warn)", display: "flex", marginTop: "1px" }}><bg-icon name="triangle-alert" size="17" /></span>
              <div style={{ flex: "1 1 260px", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" }}>
                <span style={{ fontSize: "var(--text-sm)", fontWeight: "600", color: "var(--warn-fg)" }}>Safari may delete this history</span>
                <span style={{ fontSize: "var(--text-sm)", color: "var(--fg-muted)", lineHeight: "1.5", textWrap: "pretty" }}>
                  Safari removes site data for sites you haven't opened in 7 days of browsing. Export a JSON copy to keep your results.
                </span>
              </div>
              <div style={{ display: "flex", gap: "6px", alignItems: "center", marginLeft: "auto" }}>
                <button className="btn secondary sm"><bg-icon name="download" size="14" />Export JSON</button>
                <button className="btn ghost icon sm" aria-label="Dismiss" style={{ width: "28px" }}><bg-icon name="x" size="14" /></button>
              </div>
            </div>
          ) : null}
          {v.importing ? (
            <div role="status" aria-live="polite" style={{ position: "relative", overflow: "hidden", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "10px 12px", padding: "12px 14px", borderRadius: "var(--radius-md)", border: "1px solid var(--border-default)", background: "var(--surface-2)" }}>
              <span style={{ color: "var(--primary-text)", display: "flex" }}><bg-icon name="upload" size="17" /></span>
              <div style={{ flex: "1 1 260px", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" }}>
                <span style={{ fontSize: "var(--text-sm)", fontWeight: "600" }}>
                  {"Importing "}
                  <span style={{ fontFamily: "var(--font-mono)", fontWeight: "500" }}>bitgauge-2026-10-01.json</span>
                </span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-caption)", color: "var(--fg-subtle)" }}>Checking 9 of 16 results…</span>
              </div>
              <button className="btn ghost sm" style={{ marginLeft: "auto" }}>Cancel</button>
              <div role="progressbar" aria-label="Import progress" aria-valuemin="0" aria-valuemax="16" aria-valuenow="9" style={{ position: "absolute", left: "0", right: "0", bottom: "0", height: "2px", background: "var(--border-subtle)" }}>
                <div style={{ width: "56%", height: "100%", background: "var(--primary)" }} />
              </div>
            </div>
          ) : null}
          {v.importResult ? (
            <div role="status" style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", gap: "10px 12px", padding: "12px 14px", borderRadius: "var(--radius-md)", border: "1px solid var(--border-default)", background: "var(--surface-2)" }}>
              <span style={{ color: "var(--ok)", display: "flex", marginTop: "1px" }}><bg-icon name="circle-check" size="17" /></span>
              <div style={{ flex: "1 1 260px", minWidth: "0", display: "flex", flexDirection: "column", gap: "6px" }}>
                <span style={{ fontSize: "var(--text-sm)", fontWeight: "600" }}>
                  {"Imported "}
                  <span style={{ fontFamily: "var(--font-mono)", fontWeight: "500" }}>bitgauge-2026-10-01.json</span>
                </span>
                <span style={{ fontSize: "var(--text-sm)", color: "var(--fg-muted)", lineHeight: "1.5" }}>
                  12 added, 3 skipped as duplicates, 1 rejected: schema version 3 is newer than this app
                </span>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                  <span className="pill ok" style={{ height: "20px" }}><span className="d" />12 added</span>
                  <span className="pill neutral" style={{ height: "20px" }}>3 skipped</span>
                  <span className="pill warn" style={{ height: "20px" }}><span className="d" />1 rejected</span>
                </div>
              </div>
              <button className="btn ghost icon sm" aria-label="Dismiss" style={{ width: "28px", marginLeft: "auto" }}><bg-icon name="x" size="14" /></button>
            </div>
          ) : null}
          {v.importError ? (
            <div role="alert" style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", gap: "10px 12px", padding: "12px 14px", borderRadius: "var(--radius-md)", border: "1px solid var(--danger-border)", background: "var(--danger-bg)" }}>
              <span style={{ color: "var(--danger)", display: "flex", marginTop: "1px" }}><bg-icon name="file-json" size="18" /></span>
              <div style={{ flex: "1 1 260px", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" }}>
                <span style={{ fontSize: "var(--text-sm)", fontWeight: "600", color: "var(--danger-fg)" }}>
                  {"Couldn't import "}
                  <span style={{ fontFamily: "var(--font-mono)", fontWeight: "500" }}>bitgauge-2026-10-01.csv</span>
                </span>
                <span style={{ fontSize: "var(--text-sm)", color: "var(--fg-muted)", lineHeight: "1.5" }}>
                  Import accepts BitGauge JSON exports only. CSV exports are summaries and can't be restored. Nothing in your history was changed.
                </span>
              </div>
              <div style={{ display: "flex", gap: "6px", alignItems: "center", marginLeft: "auto" }}>
                <button className="btn secondary sm"><bg-icon name="upload" size="14" />Choose another file</button>
                <button className="btn ghost icon sm" aria-label="Dismiss" style={{ width: "28px" }}><bg-icon name="x" size="14" /></button>
              </div>
            </div>
          ) : null}
          {v.isEmpty ? (
            <section className="card">
              <div className="empty">
                <div className="eg"><bg-icon name="history" size="22" /></div>
                <div className="et">No results yet</div>
                <div className="em">
                  Each finished test is saved here automatically, with its label and note. Run a test on this device, or import a JSON export from another browser.
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "8px", marginTop: "8px" }}>
                  <button className="btn primary"><bg-icon name="play" size="15" />Start a test</button>
                  <button className="btn secondary"><bg-icon name="upload" size="15" />Import JSON</button>
                </div>
              </div>
            </section>
          ) : null}
          {v.unavailable ? (
            <section className="card">
              <div className="empty">
                <div className="eg"><bg-icon name="hard-drive" size="22" /></div>
                <div className="et">History isn't available in this window</div>
                <div className="em">
                  The browser isn't letting this site store data — usually because this is a private window. Tests still run, and you can copy or download each result, but nothing is saved here. Open BitGauge in a normal window to keep history.
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "8px", marginTop: "8px" }}>
                  <button className="btn primary"><bg-icon name="play" size="15" />Start a test</button>
                </div>
              </div>
            </section>
          ) : null}
          {v.loading ? (
            <div aria-busy="true" aria-label="Loading history" style={{ display: "flex", flexDirection: "column", gap: v.L?.gap }}>
              <div style={{ display: "flex", gap: "6px", overflow: "hidden" }}>
                {(v.skChips || []).map((c, $index) => (
                  <React.Fragment key={$index}>
                    <span className="skel" style={{ flex: "none", width: c?.w, height: "28px", borderRadius: "var(--radius-full)" }} />
                  </React.Fragment>
                ))}
              </div>
              <section className="card" style={{ padding: v.L?.cardPad, display: "flex", flexDirection: "column", gap: "14px" }}>
                <span className="skel" style={{ width: "180px", height: "14px", display: "block" }} />
                <div style={{ display: "grid", gridTemplateColumns: v.L?.trendCols, gap: "20px" }}>
                  {(v.skTrends || []).map((t, $index) => (
                    <React.Fragment key={$index}>
                      <span className="skel" style={{ display: "block", height: v.L?.thpx }} />
                    </React.Fragment>
                  ))}
                </div>
              </section>
              {v.desktop ? (
                <section className="card" style={{ overflow: "hidden" }}>
                  <div style={{ height: "38px", borderBottom: "1px solid var(--border-default)" }} />
                  {(v.skRows || []).map((sr, $index) => (
                    <React.Fragment key={$index}>
                      <div className="skel-row">
                        {(sr?.cols || []).map((sc, $index) => (
                          <React.Fragment key={$index}>
                            <span className="skel" style={{ display: "block", height: "12px", width: sc?.w, flex: sc?.f }} />
                          </React.Fragment>
                        ))}
                      </div>
                    </React.Fragment>
                  ))}
                </section>
              ) : null}
              {v.mobile ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {(v.skRows || []).map((sr, $index) => (
                    <React.Fragment key={$index}>
                      <div style={{ display: "flex", flexDirection: "column", gap: "10px", padding: "14px", borderRadius: "var(--radius-lg)", border: "1px solid var(--border-subtle)", background: "var(--surface-2)" }}>
                        <span className="skel" style={{ display: "block", width: "60%", height: "13px" }} />
                        <span className="skel" style={{ display: "block", width: "90%", height: "12px" }} />
                      </div>
                    </React.Fragment>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
          {v.showFilters ? (
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px 10px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", minWidth: "0", maxWidth: "100%" }}>
                {(v.chipGroups || []).map((g, $index) => (
                  <React.Fragment key={$index}>
                    <div role="group" aria-label={g?.aria} style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: v.L?.chipWrap, overflowX: "auto", maxWidth: "100%" }}>
                      <span aria-hidden="true" style={{ flex: "none", width: "56px", fontFamily: "var(--font-cond)", fontWeight: "600", fontSize: "11px", letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--fg-subtle)" }}>
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
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginLeft: v.L?.filterML }}>
                <div style={{ position: "relative" }}>
                  <button className="btn secondary sm" aria-haspopup="dialog" aria-expanded={v.dateAria} style={{ height: "30px" }}>
                    <bg-icon name="calendar" size="14" />
                    {v.dateLabel}
                    <bg-icon name="chevron-down" size="13" />
                  </button>
                  {v.showDate ? (
                    <div role="dialog" aria-label="Date range" style={{ position: "absolute", right: "0", top: "calc(100% + 6px)", zIndex: "20", background: "var(--surface-2)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-pop)", padding: "6px", display: "flex", flexDirection: "column", textAlign: "left", width: "300px", gap: "2px" }}>
                      <div role="radiogroup" aria-label="Preset range" style={{ display: "flex", flexDirection: "column" }}>
                        {(v.ranges || []).map((rg, $index) => (
                          <React.Fragment key={$index}>
                            <button role="radio" aria-checked={rg?.aria} style={{ all: "unset", boxSizing: "border-box", display: "flex", alignItems: "center", gap: "10px", minHeight: "34px", padding: "0 10px", borderRadius: "var(--radius-md)", background: rg?.bg, color: rg?.c, fontSize: "var(--text-sm)", cursor: "pointer" }}>
                              {rg?.t}
                              <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: "var(--text-micro)", color: "var(--fg-subtle)" }}>{rg?.n}</span>
                              <span style={{ width: "14px", display: "flex", color: "var(--primary-text)" }}>
                                {rg?.on ? (
                                  <bg-icon name="check" size="14" stroke="2.25" />
                                ) : null}
                              </span>
                            </button>
                          </React.Fragment>
                        ))}
                      </div>
                      <div style={{ height: "1px", background: "var(--border-subtle)", margin: "4px 2px" }} />
                      <span style={{ padding: "4px 10px 2px", fontFamily: "var(--font-cond)", fontWeight: "600", fontSize: "11px", letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--fg-subtle)" }}>
                        Custom range
                      </span>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px", padding: "4px 10px 8px" }}>
                        <label className="input sm mono" style={{ flex: "1", minWidth: "0" }}><input value="2026-09-08" aria-label="From date" onChange={v.noop} /></label>
                        <span style={{ color: "var(--fg-subtle)" }}>–</span>
                        <label className="input sm mono" style={{ flex: "1", minWidth: "0" }}><input value="2026-10-08" aria-label="To date" onChange={v.noop} /></label>
                      </div>
                      <div style={{ display: "flex", justifyContent: "flex-end", gap: "6px", padding: "6px 6px 2px", borderTop: "1px solid var(--border-subtle)" }}>
                        <button className="btn ghost sm">Cancel</button>
                        <button className="btn primary sm">Apply</button>
                      </div>
                    </div>
                  ) : null}
                </div>
                {v.desktop ? (
                  <label className="input sm" style={{ height: "30px", width: "220px" }}>
                    <bg-icon name="search" size="14" />
                    <input placeholder="Search labels and notes" aria-label="Search" value={v.searchVal} onChange={v.noop} />
                  </label>
                ) : null}
              </div>
            </div>
          ) : null}
          {v.noMatch ? (
            <section className="card">
              <div className="empty">
                <div className="eg"><bg-icon name="search" size="22" /></div>
                <div className="et">No results match these filters</div>
                <div className="em">{v.noMatchText}</div>
                <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "8px", marginTop: "8px" }}>
                  <button className="btn secondary"><bg-icon name="x" size="15" />Clear filters</button>
                </div>
              </div>
            </section>
          ) : null}
          {v.showResults ? (
            <>
              <section className="card" aria-label="Trend" style={{ padding: v.L?.cardPad, display: "flex", flexDirection: "column", gap: "12px" }}>
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px 14px" }}>
                <span style={{ fontSize: "var(--text-base)", fontWeight: "600" }}>Trend</span>
                <span className="pill neutral" style={{ gap: "5px", color: "var(--fg)" }}><bg-icon name="shield" size="12" stroke="2" />VPN</span>
                <span style={{ fontSize: "var(--text-caption)", color: "var(--fg-subtle)" }}>{v.trendMeta}</span>
                <div role="list" aria-label="Legend" style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px", marginLeft: v.L?.legendML, fontSize: "var(--text-caption)", color: "var(--fg-muted)" }}>
                  <span role="listitem" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "var(--fg-muted)" }} />
                    Complete
                  </span>
                  <span role="listitem" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span style={{ width: "8px", height: "8px", boxSizing: "border-box", borderRadius: "50%", border: "1.5px solid var(--fg-muted)" }} />
                    Partial or error
                  </span>
                </div>
                {v.mobile ? (
                  <div className="seg seg-sm" role="radiogroup" aria-label="Metric">
                    <button className="seg-btn on" role="radio" aria-checked="true">Download</button>
                    <button className="seg-btn" role="radio" aria-checked="false">Upload</button>
                    <button className="seg-btn" role="radio" aria-checked="false">Latency</button>
                  </div>
                ) : null}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: v.L?.trendCols, gap: "20px" }}>
                {(v.trends || []).map((tr, $index) => (
                  <React.Fragment key={$index}>
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px", minWidth: "0" }}>
                      <span style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "var(--text-caption)", color: "var(--fg-muted)" }}>
                        <span style={{ color: tr?.c, display: "flex" }}><bg-icon name={tr?.icon} size="13" stroke="2" /></span>
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
                        <div aria-hidden="true" style={{ position: "absolute", inset: "0", pointerEvents: "none", fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--fg-subtle)" }}>
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
                        </div>
                      </div>
                    </div>
                  </React.Fragment>
                ))}
              </div>
            </section>
              {v.desktop ? (
              <section className="card" aria-label="Results" style={{ overflow: "hidden", position: "relative" }}>
                <table className="tbl">
                  <thead>
                    <tr>
                      <th style={{ width: "36px" }}>
                        <span style={{ position: "absolute", width: "1px", height: "1px", overflow: "hidden", clip: "rect(0 0 0 0)" }}>Select</span>
                      </th>
                      {(v.cols || []).map((h, $index) => (
                        <React.Fragment key={$index}>
                          <th aria-sort={h?.aria} style={{ textAlign: h?.align }}>
                            <button style={{ all: "unset", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "4px", color: h?.c }}>
                              {h?.t}
                              {h?.on ? (
                                <bg-icon name="chevron-down" size="12" stroke="2" />
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
                                <bg-icon name="check" size="12" stroke="3" />
                              </span>
                            ) : null}
                            {r?.unsel ? (
                              <span role="checkbox" aria-checked="false" tabIndex="0" style={{ width: "16px", height: "16px", boxSizing: "border-box", borderRadius: "4px", border: "1.5px solid var(--border-strong)", display: "block" }} />
                            ) : null}
                          </td>
                          <td style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-caption)", color: "var(--fg-muted)", whiteSpace: "nowrap" }}>{r?.d}</td>
                          <td>
                            <span style={{ display: "flex", alignItems: "center", gap: "6px 8px", flexWrap: "wrap" }}>
                              <a href="#" style={{ color: "var(--fg)", fontWeight: "500", textDecoration: "none" }}>{r?.label}</a>
                              {r?.flag ? (
                                <span className="pill warn" style={{ height: "18px", fontSize: "10px", padding: "0 7px" }}><span className="d" />{r?.flag}</span>
                              ) : null}
                            </span>
                          </td>
                          <td>
                            <span className="pill neutral" style={{ height: "20px", gap: "4px", color: "var(--fg-muted)" }}>
                              <bg-icon name={r?.cicon} size="11" stroke="2" />
                              {r?.ctx}
                            </span>
                          </td>
                          <td style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-caption)", color: "var(--fg-muted)", whiteSpace: "nowrap" }}>{r?.proto}</td>
                          <td>
                            <span className={r?.stCls} style={{ height: "20px", fontSize: "10px", padding: "0 8px" }}>
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
                            <span role="img" aria-label={r?.gAria} title={r?.gAria} style={{ display: "inline-flex", width: "26px", height: "22px", boxSizing: "border-box", alignItems: "center", justifyContent: "center", borderRadius: "var(--radius-sm)", border: `1px solid ${r?.gbd ?? ""}`, background: r?.gbg, color: r?.gfg, fontFamily: "var(--font-mono)", fontWeight: "600", fontSize: "var(--text-caption)" }}>
                              {r?.grade}
                            </span>
                          </td>
                          <td>
                            <button className="btn ghost icon sm" aria-label={`Actions for ${r?.label ?? ""}`} aria-haspopup="menu" style={{ width: "28px" }}>
                              <bg-icon name="ellipsis" size="15" />
                            </button>
                          </td>
                        </tr>
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
                {v.hasSel ? (
                  <div role="toolbar" aria-label="Selection" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px 12px", padding: "10px 14px", borderTop: "1px solid var(--border-default)", background: "var(--surface-1)" }}>
                    <span style={{ fontSize: "var(--text-sm)", fontWeight: "600" }}>{v.selN}{" selected"}</span>
                    <span style={{ fontSize: "var(--text-caption)", color: "var(--fg-subtle)" }}>{v.selSummary}</span>
                    <div style={{ marginLeft: "auto", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px" }}>
                      {v.cmpHint ? (
                        <span id="cmp-hint" style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "var(--text-caption)", color: "var(--fg-muted)" }}>
                          <bg-icon name="info" size="13" />
                          Compare needs exactly 2
                        </span>
                      ) : null}
                      <button className="btn ghost sm">Clear selection</button>
                      <button className="btn danger sm"><bg-icon name="trash" size="14" />Delete selected</button>
                      <button className="btn primary sm" disabled={v.cmpDisabled} aria-describedby="cmp-hint"><bg-icon name="git-compare" size="14" />Compare</button>
                    </div>
                  </div>
                ) : null}
              </section>
            ) : null}
              {v.mobile ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "var(--text-caption)", color: "var(--fg-subtle)" }}>
                  <span>Newest first</span>
                  <button className="btn ghost sm"><bg-icon name="sort-desc" size="14" />Sort</button>
                </div>
                {(v.rows || []).map((r, $index) => (
                  <React.Fragment key={$index}>
                    <div style={{ display: "flex", alignItems: "stretch", borderRadius: "var(--radius-lg)", border: `1px solid ${r?.cardBd ?? ""}`, background: r?.cardBg }}>
                      <button role="checkbox" aria-checked={r?.selAria} aria-label={`Select ${r?.label ?? ""}, ${r?.d ?? ""}`} style={{ all: "unset", boxSizing: "border-box", flex: "none", width: "44px", minHeight: "44px", display: "flex", justifyContent: "center", paddingTop: "14px", cursor: "pointer" }}>
                        {r?.sel ? (
                          <span style={{ width: "18px", height: "18px", borderRadius: "4px", background: "var(--primary)", color: "var(--primary-fg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <bg-icon name="check" size="12" stroke="3" />
                          </span>
                        ) : null}
                        {r?.unsel ? (
                          <span style={{ width: "18px", height: "18px", boxSizing: "border-box", borderRadius: "4px", border: "1.5px solid var(--border-strong)", display: "block" }} />
                        ) : null}
                      </button>
                      <a href="#" style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "10px", padding: "12px 0", color: "var(--fg)", textDecoration: "none", minHeight: "44px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: "2px", minWidth: "0", flex: "1" }}>
                          <span style={{ fontWeight: "600", fontSize: "var(--text-sm)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {r?.label}
                          </span>
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-micro)", color: "var(--fg-subtle)" }}>{r?.d}{" · "}{r?.proto}</span>
                        </div>
                        {r?.flag ? (
                          <span className="pill warn" style={{ height: "18px", fontSize: "10px", padding: "0 7px" }}><span className="d" />{r?.flag}</span>
                        ) : null}
                        {r?.stM ? (
                          <span className={r?.stCls} style={{ height: "18px", fontSize: "10px", padding: "0 7px" }}><span className="d" />{r?.st}</span>
                        ) : null}
                        <span role="img" aria-label={r?.gAria} title={r?.gAria} style={{ display: "inline-flex", width: "28px", height: "24px", boxSizing: "border-box", alignItems: "center", justifyContent: "center", borderRadius: "var(--radius-sm)", border: `1px solid ${r?.gbd ?? ""}`, background: r?.gbg, color: r?.gfg, fontFamily: "var(--font-mono)", fontWeight: "600", fontSize: "var(--text-caption)" }}>
                          {r?.grade}
                        </span>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: "8px", fontFamily: "var(--font-mono)", fontSize: "var(--text-sm)" }}>
                        <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                          <span style={{ color: "var(--primary-text)", display: "flex" }}><bg-icon name="arrow-down" size="12" stroke="2.25" /></span>
                          {r?.down}
                          <span style={{ color: "var(--fg-subtle)", fontSize: "10px" }}>{r?.du}</span>
                        </span>
                        <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                          <span style={{ color: "var(--series-upload)", display: "flex" }}><bg-icon name="arrow-up" size="12" stroke="2.25" /></span>
                          {r?.up}
                          <span style={{ color: "var(--fg-subtle)", fontSize: "10px" }}>{r?.uu}</span>
                        </span>
                        <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                          <span style={{ color: "var(--series-latency)", display: "flex" }}><bg-icon name="activity" size="12" stroke="2.25" /></span>
                          {r?.lat}
                          <span style={{ color: "var(--fg-subtle)", fontSize: "10px" }}>ms</span>
                        </span>
                      </div>
                    </a>
                      <button className="btn ghost icon" aria-label={`Actions for ${r?.label ?? ""}`} aria-haspopup="menu" style={{ flex: "none", width: "44px", height: "44px", marginTop: "4px" }}>
                        <bg-icon name="ellipsis" size="16" />
                      </button>
                    </div>
                  </React.Fragment>
                ))}
                {v.hasSel ? (
                  <div role="toolbar" aria-label="Selection" style={{ position: "sticky", bottom: "12px", display: "flex", alignItems: "center", gap: "4px", padding: "6px 6px 6px 14px", borderRadius: "var(--radius-lg)", background: "var(--surface-3)", border: "1px solid var(--border-default)", boxShadow: "var(--shadow-md)" }}>
                    <span style={{ fontSize: "var(--text-sm)", fontWeight: "600", marginRight: "auto" }}>{v.selN}{" selected"}</span>
                    <button className="btn ghost icon" aria-label="Clear selection" style={{ width: "44px", height: "44px" }}><bg-icon name="x" size="17" /></button>
                    <button className="btn ghost icon" aria-label="Delete selected" style={{ width: "44px", height: "44px", color: "var(--danger-fg)" }}>
                      <bg-icon name="trash" size="17" />
                    </button>
                    <button className="btn primary" disabled={v.cmpDisabled} style={{ height: "44px" }}><bg-icon name="git-compare" size="15" />Compare</button>
                  </div>
                ) : null}
              </div>
            ) : null}
            </>
          ) : null}
        </main>
        {v.mobile ? (
          <div style={{ marginTop: "auto", position: "sticky", bottom: "0", zIndex: "var(--z-nav)" }}><Nav variant="mobile-bottom" active="history" /></div>
        ) : null}
        {v.toast ? (
          <div style={{ position: "absolute", left: v.L?.tL, right: v.L?.tR, bottom: v.L?.tB, zIndex: "50", display: "flex", justifyContent: "flex-end" }}>
            <div className="toast info" role="status" aria-live="polite" style={{ maxWidth: "100%", boxSizing: "border-box", alignItems: "center" }}>
              <span className="i" style={{ display: "flex" }}><bg-icon name="trash" size="16" stroke="2" /></span>
              <div style={{ flex: "1", minWidth: "0" }}><div className="t">2 results deleted.</div><div className="m">Removed from history in 8 s.</div></div>
              <button className="btn secondary sm"><bg-icon name="undo-2" size="13" />Undo</button>
              <button className="btn ghost sm icon" aria-label="Dismiss"><bg-icon name="x" size="14" /></button>
            </div>
          </div>
        ) : null}
        {v.showCompareD ? (
          <div style={{ position: "absolute", inset: "0", background: "var(--scrim)", display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: "64px" }}>
            <div role="dialog" aria-modal="true" aria-labelledby="cmp-t" style={{ width: "760px", background: "var(--surface-2)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-xl)", boxShadow: "var(--shadow-pop)", overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "16px 20px", borderBottom: "1px solid var(--border-subtle)" }}>
                <span style={{ width: "34px", height: "34px", borderRadius: "var(--radius-md)", background: "var(--primary-bg)", border: "1px solid var(--primary-border)", color: "var(--primary-text)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <bg-icon name="git-compare" size="17" />
                </span>
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <span id="cmp-t" style={{ fontSize: "var(--text-lg)", fontWeight: "600" }}>Compare results</span>
                  <span style={{ fontSize: "var(--text-caption)", color: "var(--fg-subtle)" }}>Change is B relative to A</span>
                </div>
                <button className="btn ghost icon sm" aria-label="Close" style={{ marginLeft: "auto", width: "28px" }}><bg-icon name="x" size="15" /></button>
              </div>
              {v.cmpWarn ? (
                <div role="note" style={{ display: "flex", alignItems: "flex-start", gap: "10px", padding: "10px 20px", background: "var(--warn-bg)", borderBottom: "1px solid var(--warn-border)", fontSize: "var(--text-sm)", lineHeight: "1.5" }}>
                  <span style={{ color: "var(--warn)", display: "flex", marginTop: "2px" }}><bg-icon name="triangle-alert" size="15" stroke="2" /></span>
                  <span style={{ color: "var(--fg)" }}><b style={{ fontWeight: "600", color: "var(--warn-fg)" }}>Not directly comparable:</b>{" "}{v.cmpWarn}</span>
                </div>
              ) : null}
              <table className="tbl" style={{ tableLayout: "fixed" }}>
                <thead>
                  <tr>
                    <th style={{ width: "30%", background: "var(--surface-2)" }}>Metric</th>
                    <th style={{ background: "var(--surface-2)", textAlign: "right" }}>
                      <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "2px", textTransform: "none", letterSpacing: "0" }}>
                        <span style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-sm)", color: "var(--fg)", fontWeight: "600" }}>A · VPN · office</span>
                        <span style={{ fontFamily: "var(--font-mono)", fontWeight: "400", color: "var(--fg-subtle)" }}>2026-09-26 18:20</span>
                      </span>
                    </th>
                    <th style={{ background: "var(--surface-2)", textAlign: "right" }}>
                      <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "2px", textTransform: "none", letterSpacing: "0" }}>
                        <span style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-sm)", color: "var(--fg)", fontWeight: "600" }}>B · VPN · office</span>
                        <span style={{ fontFamily: "var(--font-mono)", fontWeight: "400", color: "var(--fg-subtle)" }}>2026-10-02 09:05</span>
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
                          <td style={{ paddingTop: "14px", paddingBottom: "6px", fontFamily: "var(--font-cond)", fontWeight: "600", fontSize: "11px", letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--fg-subtle)" }}>
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
                            <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", color: c?.dc, fontSize: "var(--text-caption)" }}>
                              <bg-icon name={c?.di} size="13" stroke="2" />
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
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", padding: "14px 20px", borderTop: "1px solid var(--border-subtle)" }}>
                <button className="btn secondary"><bg-icon name="copy" size="14" />Copy comparison</button>
                <button className="btn primary">Done</button>
              </div>
            </div>
          </div>
        ) : null}
        {v.showCompareM ? (
          <div role="dialog" aria-modal="true" aria-labelledby="cmpm-t" style={{ position: "absolute", inset: "0", zIndex: "40", background: "var(--bg-base)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "6px 8px 6px 16px", borderBottom: "1px solid var(--border-subtle)" }}>
              <div style={{ display: "flex", flexDirection: "column", flex: "1", minWidth: "0" }}>
                <span id="cmpm-t" style={{ fontSize: "var(--text-lg)", fontWeight: "600" }}>Compare results</span>
                <span style={{ fontSize: "var(--text-caption)", color: "var(--fg-subtle)" }}>Change is shown on B, relative to A</span>
              </div>
              <button className="btn ghost icon" aria-label="Close" style={{ width: "44px", height: "44px" }}><bg-icon name="x" size="18" /></button>
            </div>
            <div style={{ flex: "1", minHeight: "0", overflowY: "auto", display: "flex", flexDirection: "column", gap: "12px", padding: "12px 0 16px" }}>
              {v.cmpWarn ? (
                <div role="note" style={{ margin: "0 16px", display: "flex", alignItems: "flex-start", gap: "10px", padding: "10px 12px", borderRadius: "var(--radius-md)", background: "var(--warn-bg)", border: "1px solid var(--warn-border)", fontSize: "var(--text-sm)", lineHeight: "1.5" }}>
                  <span style={{ color: "var(--warn)", display: "flex", marginTop: "2px" }}><bg-icon name="triangle-alert" size="15" stroke="2" /></span>
                  <span style={{ color: "var(--fg)" }}><b style={{ fontWeight: "600", color: "var(--warn-fg)" }}>Not directly comparable:</b>{" "}{v.cmpWarn}</span>
                </div>
              ) : null}
              <div style={{ display: "flex", alignItems: "center", gap: "4px", padding: "0 8px" }}>
                <button className="btn ghost icon" aria-label="Previous result" disabled={true} style={{ width: "44px", height: "44px" }}>
                  <bg-icon name="chevron-left" size="18" />
                </button>
                <div style={{ flex: "1", display: "flex", flexDirection: "column", alignItems: "center", gap: "6px" }}>
                  <span aria-live="polite" style={{ fontSize: "var(--text-caption)", color: "var(--fg-muted)" }}>Result A · 1 of 2</span>
                  <span aria-hidden="true" style={{ display: "flex", gap: "6px" }}>
                    <span style={{ width: "16px", height: "4px", borderRadius: "2px", background: "var(--primary)" }} />
                    <span style={{ width: "6px", height: "4px", borderRadius: "2px", background: "var(--border-strong)" }} />
                  </span>
                </div>
                <button className="btn ghost icon" aria-label="Next result" style={{ width: "44px", height: "44px" }}>
                  <bg-icon name="chevron-right" size="18" />
                </button>
              </div>
              <div role="group" aria-label="Results, swipe to page" style={{ display: "flex", gap: "10px", overflowX: "auto", scrollSnapType: "x mandatory", padding: "0 16px", scrollPadding: "0 16px" }}>
                {(v.cmpCards || []).map((cd, $index) => (
                  <React.Fragment key={$index}>
                    <section aria-label={cd?.aria} style={{ flex: "0 0 calc(100% - 28px)", boxSizing: "border-box", scrollSnapAlign: "start", display: "flex", flexDirection: "column", padding: "14px", borderRadius: "var(--radius-lg)", background: "var(--surface-2)", border: "1px solid var(--border-subtle)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px", paddingBottom: "10px" }}>
                        <span style={{ width: "26px", height: "26px", borderRadius: "var(--radius-sm)", background: "var(--surface-3)", border: "1px solid var(--border-default)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-mono)", fontWeight: "600", fontSize: "var(--text-caption)" }}>
                          {cd?.id}
                        </span>
                        <div style={{ display: "flex", flexDirection: "column", minWidth: "0" }}>
                          <span style={{ fontSize: "var(--text-sm)", fontWeight: "600" }}>{cd?.label}</span>
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-micro)", color: "var(--fg-subtle)" }}>{cd?.date}</span>
                        </div>
                      </div>
                      <span style={{ padding: "8px 0 4px", fontFamily: "var(--font-cond)", fontWeight: "600", fontSize: "11px", letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--fg-subtle)" }}>
                        Parameters
                      </span>
                      {(cd?.params || []).map((p, $index) => (
                        <React.Fragment key={$index}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px", padding: "7px 0", borderTop: "1px solid var(--border-subtle)", fontSize: "var(--text-sm)" }}>
                            <span style={{ color: "var(--fg-muted)" }}>{p?.k}</span>
                            <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "2px", textAlign: "right" }}>
                              <span style={{ fontFamily: "var(--font-mono)" }}>{p?.v}</span>
                              {p?.ch ? (
                                <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", color: p?.dc, fontSize: "var(--text-micro)" }}>
                                  <bg-icon name={p?.di} size="11" stroke="2" />
                                  {p?.dw}
                                </span>
                              ) : null}
                            </span>
                          </div>
                        </React.Fragment>
                      ))}
                      <span style={{ padding: "12px 0 4px", fontFamily: "var(--font-cond)", fontWeight: "600", fontSize: "11px", letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--fg-subtle)" }}>
                        Results
                      </span>
                      {(cd?.metrics || []).map((p, $index) => (
                        <React.Fragment key={$index}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px", padding: "7px 0", borderTop: "1px solid var(--border-subtle)", fontSize: "var(--text-sm)" }}>
                            <span style={{ color: "var(--fg-muted)" }}>{p?.k}</span>
                            <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "2px", textAlign: "right" }}>
                              <span style={{ fontFamily: "var(--font-mono)" }}>{p?.v}</span>
                              {p?.ch ? (
                                <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", color: p?.dc, fontSize: "var(--text-micro)" }}>
                                  <bg-icon name={p?.di} size="11" stroke="2" />
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
            <div style={{ display: "flex", gap: "8px", padding: "10px 16px 16px", borderTop: "1px solid var(--border-subtle)", background: "var(--surface-1)" }}>
              <button className="btn secondary" style={{ flex: "1", height: "44px", justifyContent: "center" }}><bg-icon name="copy" size="14" />Copy</button>
              <button className="btn primary" style={{ flex: "1", height: "44px", justifyContent: "center" }}>Done</button>
            </div>
          </div>
        ) : null}
        {v.showConfirm ? (
          <div style={{ position: "absolute", inset: "0", zIndex: "40", background: "var(--scrim)", display: "flex", alignItems: v.L?.cfAlign, justifyContent: "center", paddingTop: v.L?.cfTop }}>
            <div className="modal" role="alertdialog" aria-modal="true" aria-labelledby="clr-t" style={{ width: v.L?.cfW, maxWidth: "100%", boxSizing: "border-box", borderRadius: v.L?.cfRad }}>
              <div className="mh">
                <div className="mi danger"><bg-icon name="trash" size="17" /></div>
                <div>
                  <div className="mt" id="clr-t">Clear all history?</div>
                  <div className="md">
                    {"This removes "}
                    <b>48 results</b>
                    {" with their labels and notes from this browser. This cannot be undone. Export first if you want a copy."}
                  </div>
                </div>
              </div>
              {v.desktop ? (
                <div className="mf">
                  <button className="btn ghost"><bg-icon name="download" size="14" />Export JSON first</button>
                  <span style={{ flex: "1" }} />
                  <button className="btn secondary">Cancel</button>
                  <button className="btn danger-solid"><bg-icon name="trash" size="14" />Clear 48 results</button>
                </div>
              ) : null}
              {v.mobile ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "4px 16px 20px" }}>
                  <button className="btn danger-solid" style={{ height: "44px", justifyContent: "center" }}><bg-icon name="trash" size="15" />Clear 48 results</button>
                  <button className="btn secondary" style={{ height: "44px", justifyContent: "center" }}>
                    <bg-icon name="download" size="15" />
                    Export JSON first
                  </button>
                  <button className="btn ghost" style={{ height: "44px", justifyContent: "center" }}>Cancel</button>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    );
  }
}

window.History = History;
