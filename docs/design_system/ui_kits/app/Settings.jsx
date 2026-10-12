/* BitGauge web UI kit — Settings
 * Props:
 *   mobile: boolean  (default false)
 *   preset: "quick" | "standard" | "extended" | "continuous"  (default "extended")
 *   advanced: boolean  (default false)
 *   invalid: boolean  (default false)
 *   confirmReset: boolean  (default false)
 */
class Settings extends React.Component {
  state = this.initState();

  P() {
    return {
      quick: { t: 'Quick', icon: 'zap', d: 'Fixed 3 streams · 5–10 s per direction · 10 pings', streams: 'fixed', n: 3, dl: [5, 10], ul: [5, 10], pings: 10 },
      standard: { t: 'Standard', icon: 'gauge', d: 'Auto streams · 10–20 s down, 12–25 s up · 20 pings', streams: 'auto', dl: [10, 20], ul: [12, 25], pings: 20, def: true },
      extended: { t: 'Extended', icon: 'timer', d: 'Auto streams · 20–40 s per direction · 50 pings', streams: 'auto', dl: [20, 40], ul: [20, 40], pings: 50 },
      continuous: { t: 'Continuous', icon: 'infinity', d: 'One direction until stopped', streams: 'auto', pings: 20 }
    };
  }
  on(v) { return !!v && v !== 'false' && v !== '0'; }
  defaults() {
    return { preset: 'standard', dir: 'download', runLimit: false, runUnit: 'h', phases: { latency: true, download: true, upload: true }, order: 'down', ov: {}, v: { capMB: 500, countdown: 3, warmS: 2, runVal: 1 }, cap: false, units: 'bits', theme: 'system', autostart: false, warm: 'auto', overhead: '0', drafts: {}, err: {} };
  }
  initState() {
    const p = this.props || {};
    // Real product state: the prototype keeps the saved settings and passes them back in.
    if (p.saved) return Object.assign(this.defaults(), p.saved, { theme: p.theme || p.saved.theme, advOpen: !!p.saved.advOpen, confirm: false, copied: false, drafts: {}, err: {} });
    const preset = p.preset || 'extended';
    if (p.onSettings) return Object.assign(this.defaults(), { preset, theme: p.theme || 'system', advOpen: this.on(p.advanced), confirm: false, incRun: false, copied: false });
    const st = Object.assign(this.defaults(), { preset, ov: { streams: 'fixed', n: 4 }, cap: true, advOpen: this.on(p.advanced), confirm: this.on(p.confirmReset), incRun: false, copied: false });
    if (preset === 'continuous') { st.runLimit = true; st.v.runVal = 2; }
    const P = this.P()[preset];
    if (this.on(p.invalid) && P.dl) { st.drafts = { dlMin: String(P.dl[1] + 10) }; st.err = { dlMin: 'Must be at most the maximum (' + P.dl[1] + ' s). Not saved · Esc restores ' + P.dl[0] + ' s.' }; }
    return st;
  }
  componentDidUpdate(pp, ps) {
    const p = this.props;
    if (p.onSettings) {
      if (pp.theme !== p.theme && p.theme && p.theme !== this.state.theme) this.setState({ theme: p.theme });
      else if (ps !== this.state) p.onSettings(this.state, this._changed);
      return;
    }
    if (pp.preset !== p.preset || pp.invalid !== p.invalid) this.setState(this.initState());
    else {
      if (pp.advanced !== p.advanced) this.setState({ advOpen: this.on(p.advanced) });
      if (pp.confirmReset !== p.confirmReset) this.setState({ confirm: this.on(p.confirmReset) });
    }
  }
  pv(st) { const P = this.P()[st.preset]; return { dlMin: P.dl && P.dl[0], dlMax: P.dl && P.dl[1], ulMin: P.ul && P.ul[0], ulMax: P.ul && P.ul[1], pings: P.pings }; }
  eff(k, st) { if (k in st.ov) return st.ov[k]; const pv = this.pv(st); if (k in pv) return pv[k]; return st.v[k]; }
  unitOf(k, st) { return k === 'capMB' ? 'MB' : k === 'pings' ? 'pings' : k === 'runVal' ? ({ m: 'min', h: 'h', d: 'days' })[st.runUnit] : 's'; }
  validate(k, str, st) {
    const R = { dlMin: [1, 600], dlMax: [1, 600], ulMin: [1, 600], ulMax: [1, 600], capMB: [1, 100000], countdown: [1, 30], pings: [1, 100], warmS: [0.5, 10, true], runVal: ({ m: [1, 10080], h: [1, 168], d: [1, 7] })[st.runUnit] }[k];
    const s = String(str).trim(), n = Number(s), u = this.unitOf(k, st);
    let msg = null;
    if (s === '' || !isFinite(n) || (!R[2] && !Number.isInteger(n)) || n < R[0] || n > R[1]) msg = k === 'runVal' ? 'Run length must be 1 minute to 7 days.' : 'Enter a ' + (R[2] ? '' : 'whole ') + 'number from ' + R[0] + ' to ' + R[1] + '.';
    else if (/Min$/.test(k) && n > this.eff(k.replace('Min', 'Max'), st)) msg = 'Must be at most the maximum (' + this.eff(k.replace('Min', 'Max'), st) + ' s).';
    else if (/Max$/.test(k) && n < this.eff(k.replace('Max', 'Min'), st)) msg = 'Must be at least the minimum (' + this.eff(k.replace('Max', 'Min'), st) + ' s).';
    return msg ? msg + ' Not saved · Esc restores ' + this.eff(k, st) + ' ' + u + '.' : null;
  }
  drop(o, k) { const c = Object.assign({}, o); delete c[k]; return c; }
  check(k, el) {
    const st = this.state, str = st.drafts[k];
    if (str === undefined) return;
    const e = this.validate(k, str, st);
    if (e) { this.setState({ err: Object.assign({}, st.err, { [k]: e }) }); if (el) setTimeout(() => el.focus(), 0); return; }
    const n = Number(String(str).trim());
    this.setState(s => {
      const pv = this.pv(s), out = { drafts: this.drop(s.drafts, k), err: this.drop(s.err, k) };
      if (k in pv) { const ov = Object.assign({}, s.ov); if (n === pv[k]) delete ov[k]; else ov[k] = n; out.ov = ov; }
      else out.v = Object.assign({}, s.v, { [k]: n });
      return out;
    });
  }
  field(k) {
    const st = this.state, e = st.err[k], d = st.drafts[k];
    return {
      val: d !== undefined ? d : String(this.eff(k, st)), bad: !!e, err: e || '', eid: 'err-' + k, desc: e ? 'err-' + k : undefined,
      cls: 'input mono' + (e ? ' invalid focused' : ''), aria: e ? 'true' : 'false',
      onChange: ev => { const val = ev.target.value; this.setState(s => { const out = { drafts: Object.assign({}, s.drafts, { [k]: val }) }; if (s.err[k]) { const ne = this.validate(k, val, s); out.err = ne ? Object.assign({}, s.err, { [k]: ne }) : this.drop(s.err, k); } return out; }); },
      onBlur: ev => this.check(k, ev.target),
      onKeyDown: ev => { if (ev.key === 'Enter') { ev.preventDefault(); this.check(k, ev.target); } else if (ev.key === 'Escape') this.setState(s => ({ drafts: this.drop(s.drafts, k), err: this.drop(s.err, k) })); }
    };
  }
  seg(opts, cur, set) { return opts.map(o => ({ t: o[1], icon: o[2], c: o[3], cls: 'seg-btn' + (o[0] === cur ? ' on' : ''), aria: o[0] === cur ? 'true' : 'false', on: () => set(o[0]) })); }
  sw(isOn, toggle) { return { cls: 'switch' + (isOn ? ' on' : ''), aria: isOn ? 'true' : 'false', on: toggle }; }
  resetOv(keys, extra) { this.setState(s => { const ov = Object.assign({}, s.ov), drafts = Object.assign({}, s.drafts), err = Object.assign({}, s.err); keys.forEach(k => { delete ov[k]; delete drafts[k]; delete err[k]; }); return Object.assign({ ov, drafts, err }, extra || {}); }); }

  renderVals() {
    const s = this.state, m = this.on(this.props.mobile), PR = this.P(), P = PR[s.preset], D = this.defaults();
    const isCont = s.preset === 'continuous', timed = !isCont;
    const set = o => this.setState(o);
    const sm = s.ov.streams || P.streams, pn = P.n || 4, n = s.ov.n != null ? s.ov.n : pn;
    const streamsLbl = (mode, k) => mode === 'auto' ? 'Auto' : mode === 'single' ? 'Single' : 'Fixed · ' + k;
    const dur = (a, b) => a + '–' + b + ' s';
    const e = k => this.eff(k, s);
    const dirName = s.dir === 'download' ? 'download' : 'upload';
    const runStr = s.v.runVal + ({ m: ' min', h: ' h', d: ' d' })[s.runUnit];
    const phOn = s.phases, phAll = phOn.latency && phOn.download && phOn.upload;

    const C = {
      streams: sm !== P.streams || (sm === 'fixed' && n !== pn),
      dl: timed && ('dlMin' in s.ov || 'dlMax' in s.ov), ul: timed && ('ulMin' in s.ov || 'ulMax' in s.ov),
      phases: !phAll, cap: s.cap, units: s.units !== 'bits', theme: s.theme !== 'system',
      auto: s.autostart || s.v.countdown !== 3, warm: s.warm !== 'auto', pings: 'pings' in s.ov, overhead: s.overhead !== '0'
    };
    const changed = [];
    const add = (k, d, v, reset) => changed.push({ k, d, v, reset, label: 'Reset ' + k.toLowerCase() });
    if (s.preset !== 'standard') add('Preset', 'Standard', P.t + (isCont ? ' · ' + dirName + (s.runLimit ? ' · ' + runStr : '') : ''), () => set({ preset: 'standard', drafts: {}, err: {} }));
    if (C.streams) add('Parallel streams', streamsLbl(P.streams, pn), streamsLbl(sm, n), () => this.resetOv(['streams', 'n']));
    if (C.dl) add('Download duration', dur(P.dl[0], P.dl[1]), dur(e('dlMin'), e('dlMax')), () => this.resetOv(['dlMin', 'dlMax']));
    if (C.ul) add('Upload duration', dur(P.ul[0], P.ul[1]), dur(e('ulMin'), e('ulMax')), () => this.resetOv(['ulMin', 'ulMax']));
    if (C.phases) add('Phases', 'All three', ['latency', 'download', 'upload'].filter(k => phOn[k]).map(k => k[0].toUpperCase() + k.slice(1)).join(', '), () => set({ phases: D.phases }));
    if (s.order === 'up') add('Phase order', 'Download first', 'Upload first', () => set({ order: 'down' }));
    if (C.cap) add('Data cap', 'Off', s.v.capMB + ' MB', () => set({ cap: false, v: Object.assign({}, s.v, { capMB: 500 }) }));
    if (C.units) add('Units', 'Bits', 'Bytes', () => set({ units: 'bits' }));
    if (C.theme) add('Theme', 'System', s.theme === 'light' ? 'Light' : 'Dark', () => set({ theme: 'system' }));
    if (C.auto) add('Auto-start', 'Off · 3 s', (s.autostart ? 'On' : 'Off') + ' · ' + s.v.countdown + ' s', () => set({ autostart: false, v: Object.assign({}, s.v, { countdown: 3 }) }));
    if (C.warm) add('Warm-up', 'Auto', 'Fixed · ' + s.v.warmS + ' s', () => set({ warm: 'auto' }));
    if (C.pings) add('Ping count', String(P.pings), String(e('pings')), () => this.resetOv(['pings']));
    if (C.overhead) add('Overhead', 'None', s.overhead + ' %', () => set({ overhead: '0' }));
    this._changed = changed;

    const q = [];
    if (s.preset !== 'standard') q.push('preset=' + s.preset);
    if (isCont && s.dir === 'upload') q.push('dir=up');
    if (isCont && s.runLimit) q.push('for=' + s.v.runVal + s.runUnit);
    if (C.phases) q.push('phases=' + ['latency', 'download', 'upload'].filter(k => phOn[k]).map(k => ({ latency: 'ping', download: 'down', upload: 'up' })[k]).join(','));
    if (s.order === 'up') q.push('order=up');
    if (C.streams) q.push('streams=' + (sm === 'fixed' ? n : sm === 'single' ? 1 : 'auto'));
    if (C.dl) q.push('down=' + e('dlMin') + '-' + e('dlMax'));
    if (C.ul) q.push('up=' + e('ulMin') + '-' + e('ulMax'));
    if (C.cap) q.push('cap=' + s.v.capMB + 'MB');
    if (C.pings) q.push('pings=' + e('pings'));
    if (C.warm) q.push('warmup=' + s.v.warmS);
    if (C.overhead) q.push('overhead=' + s.overhead);
    if (s.incRun) q.push('run=1');
    const url = 'https://speed.home.lan/' + (q.length ? '?' + q.join('&') : '');

    const presets = Object.keys(PR).map(k => {
      const p = PR[k], sel = k === s.preset, pick = () => { if (!sel) set({ preset: k, drafts: {}, err: {} }); };
      return { t: p.t, icon: p.icon, d: p.d, def: !!p.def, pick, key: ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); pick(); } }, aria: sel ? 'true' : 'false', bd: sel ? 'var(--primary-border)' : 'var(--border-default)', bg: sel ? 'var(--primary-bg)' : 'var(--surface-1)', ic: sel ? 'var(--primary-text)' : 'var(--fg-subtle)', ring: sel ? '5px solid var(--primary)' : '1.5px solid var(--border-strong)', dot: sel ? 'var(--surface-2)' : 'transparent' };
    });
    const onCount = Object.values(phOn).filter(Boolean).length;
    const phases = [['latency', 'Latency', 'activity', 'var(--series-latency)'], ['download', 'Download', 'arrow-down', 'var(--series-download)'], ['upload', 'Upload', 'arrow-up', 'var(--series-upload)']].map(([k, t, icon, c]) => {
      const v = phOn[k], dis = isCont || (v && onCount === 1);
      return { t, icon, c, on2: v, aria: v ? 'true' : 'false', dis, bg: v ? 'var(--primary)' : 'transparent', bd: v ? 'none' : '1.5px solid var(--border-strong)', on: () => { if (!dis) set({ phases: Object.assign({}, phOn, { [k]: !v }) }); } };
    });
    const orderOk = timed && phOn.download && phOn.upload;
    const errKeys = Object.keys(s.err);
    const F = {};
    ['dlMin', 'dlMax', 'ulMin', 'ulMax', 'capMB', 'countdown', 'pings', 'warmS', 'runVal'].forEach(k => { F[k] = this.field(k); });

    return {
      mobile: m, desktop: !m, stop: ev => ev.stopPropagation(),
      L: m ? { pad: '16px 16px 24px', cols: 'minmax(0,1fr)', h1: 'var(--text-3xl)', presetCols: 'minmax(0,1fr)', orderMl: '0', cfAlign: 'flex-end', cfTop: '0', cfW: '100%', cfRad: 'var(--radius-xl) var(--radius-xl) 0 0' }
           : { pad: '24px 40px 48px', cols: 'minmax(0,1fr) 340px', h1: 'var(--text-4xl)', presetCols: 'repeat(2, minmax(0,1fr))', orderMl: 'auto', cfAlign: 'flex-start', cfTop: '160px', cfW: '460px', cfRad: 'var(--radius-xl)' },
      allSaved: !errKeys.length, hasErr: !!errKeys.length, errCountLabel: errKeys.length === 1 ? '1 value not saved' : errKeys.length + ' values not saved',
      presets, isCont, timed, C, F, phases,
      S: {
        dir: this.seg([['download', 'Download', 'arrow-down', 'var(--series-download)'], ['upload', 'Upload', 'arrow-up', 'var(--series-upload)']], s.dir, v => set({ dir: v })),
        order: this.seg([['down', 'Download first'], ['up', 'Upload first']], s.order, v => set({ order: v })),
        streams: this.seg([['auto', 'Auto'], ['fixed', 'Fixed'], ['single', 'Single']], sm, v => this.setState(st => { const ov = Object.assign({}, st.ov); if (v === this.P()[st.preset].streams) delete ov.streams; else ov.streams = v; return { ov }; })),
        units: this.seg([['bits', 'Bits · Mbit/s'], ['bytes', 'Bytes · MB/s']], s.units, v => set({ units: v })),
        theme: this.seg([['light', 'Light', 'sun'], ['dark', 'Dark', 'moon'], ['system', 'System', 'monitor']], s.theme, v => set({ theme: v })),
        warm: this.seg([['auto', 'Auto'], ['fixed', 'Fixed']], s.warm, v => set({ warm: v }))
      },
      phasesOpacity: isCont ? '0.45' : '1', orderOpacity: orderOk ? '1' : '0.45', orderPe: orderOk ? 'auto' : 'none',
      phasesHelp: isCont ? 'Continuous runs one direction. Phases apply to the timed presets.' : 'Latency always runs first. At least one phase stays on.',
      runSw: this.sw(s.runLimit, () => set({ runLimit: !s.runLimit, drafts: this.drop(s.drafts, 'runVal'), err: this.drop(s.err, 'runVal') })), runLimit: s.runLimit, noRunLimit: !s.runLimit, runUnit: s.runUnit,
      setRunUnit: ev => { const u = ev.target.value, max = { m: 10080, h: 168, d: 7 }[u]; set({ runUnit: u, v: Object.assign({}, s.v, { runVal: Math.min(s.v.runVal, max) }), drafts: this.drop(s.drafts, 'runVal'), err: this.drop(s.err, 'runVal') }); },
      isFixed: sm === 'fixed', n, nMin: n <= 1, nMax: n >= 6,
      nDec: () => this.setState(st => { const ov = Object.assign({}, st.ov), nv = Math.max(1, n - 1); if (nv === pn) delete ov.n; else ov.n = nv; return { ov }; }),
      nInc: () => this.setState(st => { const ov = Object.assign({}, st.ov), nv = Math.min(6, n + 1); if (nv === pn) delete ov.n; else ov.n = nv; return { ov }; }),
      capSw: this.sw(s.cap, () => set({ cap: !s.cap })), capOff: !s.cap, capOpacity: s.cap ? '1' : '0.45',
      autoSw: this.sw(s.autostart, () => set({ autostart: !s.autostart })), autoOff: !s.autostart, autoOpacity: s.autostart ? '1' : '0.45',
      advOpen: s.advOpen, advAria: s.advOpen ? 'true' : 'false', advIcon: s.advOpen ? 'chevron-up' : 'chevron-down', toggleAdv: () => set({ advOpen: !s.advOpen }),
      advSummary: 'Warm-up, ping count, overhead compensation',
      warmFixed: s.warm === 'fixed', pingsHelp: 'Preset default: ' + P.pings + '.',
      overhead: s.overhead, setOverhead: ev => set({ overhead: ev.target.value }),
      overheadOpts: [['0', 'None · 0 %'], ['6', 'LibreSpeed default · 6 %'], ['5.13', 'IPv6 · 5.13 %'], ['3.69', 'Alternative · 3.69 %'], ['8.1', 'Alternative 2 · 8.1 %']].map(([v, t]) => ({ v, t })),
      url, copyIcon: s.copied ? 'check' : 'copy',
      copyUrl: () => { try { navigator.clipboard && navigator.clipboard.writeText(url); } catch (x) {} set({ copied: true }); clearTimeout(this._ct); this._ct = setTimeout(() => this.setState({ copied: false }), 1500); },
      incRun: s.incRun, incRunAria: s.incRun ? 'true' : 'false', incRunBg: s.incRun ? 'var(--primary)' : 'transparent', incRunBd: s.incRun ? 'none' : '1.5px solid var(--border-strong)', toggleIncRun: () => set({ incRun: !s.incRun }),
      changed, changedCount: String(changed.length), hasChanges: changed.length > 0, noChanges: changed.length === 0,
      confirm: s.confirm, openReset: () => set({ confirm: true }), closeReset: () => set({ confirm: false }),
      doReset: () => this.setState(Object.assign(this.defaults(), { confirm: false })),
      resetLine: (changed.length === 1 ? '1 setting returns to its default: ' : changed.length + ' settings return to their defaults: ') + changed.map(c => c.k).join(', ') + '. Your test history is not affected.'
    };
  }
  render() {
    const v = this.renderVals();
    return (
      <div style={{ position: "relative", background: "var(--bg-base)", color: "var(--fg)", fontFamily: "var(--font-sans)", minHeight: "100%", display: "flex", flexDirection: "column" }}>
        {v.desktop ? (
          <Nav variant="top" active="settings" />
        ) : null}
        {v.mobile ? (
          <Nav variant="mobile-top" active="settings" />
        ) : null}
        <main style={{ flex: "1", width: "100%", maxWidth: "1200px", margin: "0 auto", boxSizing: "border-box", padding: v.L?.pad, display: "grid", gridTemplateColumns: v.L?.cols, gap: "24px", alignItems: "start" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "16px", minWidth: "0" }}>
            <header style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <h1 style={{ margin: "0", fontSize: v.L?.h1, fontWeight: "600", letterSpacing: "var(--tracking-tight)" }}>Settings</h1>
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px 12px", fontSize: "var(--text-sm)", color: "var(--fg-subtle)" }}>
                {v.allSaved ? (
                  <span role="status" style={{ display: "inline-flex", alignItems: "center", gap: "5px", color: "var(--ok-fg)" }}>
                    <bg-icon name="circle-check" size="14" />
                    Saved
                  </span>
                ) : null}
                {v.hasErr ? (
                  <span role="status" style={{ display: "inline-flex", alignItems: "center", gap: "5px", color: "var(--danger-fg)" }}>
                    <bg-icon name="circle-alert" size="14" />
                    {v.errCountLabel}
                  </span>
                ) : null}
                <span>Changes save automatically in this browser and apply to the next test.</span>
              </div>
            </header>
            <section className="card" aria-labelledby="s-preset">
              <div className="card-h"><bg-icon name="gauge" size="15" /><span className="t" id="s-preset">Test preset</span></div>
              <div className="card-b" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <div role="radiogroup" aria-labelledby="s-preset" style={{ display: "grid", gridTemplateColumns: v.L?.presetCols, gap: "10px" }}>
                  {(v.presets || []).map((p, $index) => (
                    <React.Fragment key={$index}>
                      <div role="radio" aria-checked={p?.aria} tabIndex="0" onClick={p?.pick} onKeyDown={p?.key} style={{ display: "flex", flexDirection: "column", gap: "6px", padding: "12px 14px", borderRadius: "var(--radius-md)", border: `1px solid ${p?.bd ?? ""}`, background: p?.bg, cursor: "pointer", minHeight: "44px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <span style={{ color: p?.ic, display: "flex" }}><bg-icon name={p?.icon} size="16" /></span>
                          <span style={{ fontSize: "var(--text-sm)", fontWeight: "600" }}>{p?.t}</span>
                          {p?.def ? (
                            <span className="pill neutral" style={{ height: "18px", fontSize: "10px", padding: "0 7px" }}>Default</span>
                          ) : null}
                          <span style={{ marginLeft: "auto", width: "16px", height: "16px", boxSizing: "border-box", borderRadius: "50%", border: p?.ring, display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: p?.dot }} />
                          </span>
                        </div>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-caption)", color: "var(--fg-muted)", lineHeight: "1.45" }}>{p?.d}</span>
                      </div>
                    </React.Fragment>
                  ))}
                </div>
                {v.isCont ? (
                  <div style={{ display: "flex", flexDirection: "column", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", background: "var(--surface-1)" }}>
                    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "10px 20px", padding: "12px 14px", borderBottom: "1px solid var(--border-subtle)" }}>
                      <div style={{ flex: "1 1 200px", display: "flex", flexDirection: "column", gap: "3px" }}>
                        <span style={{ fontSize: "var(--text-sm)", fontWeight: "600" }}>Direction</span>
                        <span style={{ fontSize: "var(--text-caption)", color: "var(--fg-subtle)", lineHeight: "1.45" }}>
                          Continuous measures one direction until you stop it.
                        </span>
                      </div>
                      <div className="seg" role="radiogroup" aria-label="Continuous direction">
                        {(v.S?.dir || []).map((o, $index) => (
                          <React.Fragment key={$index}>
                            <button className={o?.cls} role="radio" aria-checked={o?.aria} onClick={o?.on} style={{ whiteSpace: "nowrap" }}>
                              <span style={{ color: o?.c, display: "flex" }}><bg-icon name={o?.icon} size="14" stroke="2" /></span>
                              {o?.t}
                            </button>
                          </React.Fragment>
                        ))}
                      </div>
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "10px 20px", padding: "12px 14px" }}>
                      <div style={{ flex: "1 1 200px", display: "flex", flexDirection: "column", gap: "3px" }}>
                        <span style={{ fontSize: "var(--text-sm)", fontWeight: "600" }}>Run length</span>
                        <span style={{ fontSize: "var(--text-caption)", color: "var(--fg-subtle)", lineHeight: "1.45" }}>
                          Optional. No limit by default. 1 minute to 7 days.
                        </span>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "6px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <button className={v.runSw?.cls} role="switch" aria-checked={v.runSw?.aria} aria-label="Stop after a set time" onClick={v.runSw?.on}>
                            <span className="knob" />
                          </button>
                          {v.runLimit ? (
                            <>
                              <label className={v.F?.runVal?.cls} style={{ width: "72px", height: "34px" }}>
                              <input value={v.F?.runVal?.val} aria-label="Run length" aria-invalid={v.F?.runVal?.aria} aria-describedby={v.F?.runVal?.desc} onChange={v.F?.runVal?.onChange} onBlur={v.F?.runVal?.onBlur} onKeyDown={v.F?.runVal?.onKeyDown} />
                            </label>
                              <label className="input" style={{ width: "112px", height: "34px" }}>
                              <select aria-label="Run length unit" value={v.runUnit} onChange={v.setRunUnit}>
                                <option value="m">minutes</option>
                                <option value="h">hours</option>
                                <option value="d">days</option>
                              </select>
                              <bg-icon name="chevron-down" size="14" />
                            </label>
                            </>
                          ) : null}
                          {v.noRunLimit ? (
                            <span style={{ fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>No limit</span>
                          ) : null}
                        </div>
                        {v.F?.runVal?.bad ? (
                          <span className="fmsg" id={v.F?.runVal?.eid} style={{ maxWidth: "280px" }}><bg-icon name="circle-alert" size="12" />{v.F?.runVal?.err}</span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ) : null}
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "10px 16px", opacity: v.phasesOpacity }}>
                  <span style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>
                    Phases
                    {v.C?.phases ? (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "var(--text-micro)", fontWeight: "500", color: "var(--primary-text)" }}>
                        <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--primary)" }} />
                        changed
                      </span>
                    ) : null}
                  </span>
                  {(v.phases || []).map((ph, $index) => (
                    <React.Fragment key={$index}>
                      <button role="checkbox" aria-checked={ph?.aria} disabled={ph?.dis} onClick={ph?.on} style={{ all: "unset", boxSizing: "border-box", display: "flex", alignItems: "center", gap: "8px", fontSize: "var(--text-sm)", minHeight: "32px", cursor: "pointer" }}>
                        <span style={{ width: "16px", height: "16px", boxSizing: "border-box", borderRadius: "4px", background: ph?.bg, border: ph?.bd, color: "var(--primary-fg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          {ph?.on2 ? (
                            <bg-icon name="check" size="12" stroke="3" />
                          ) : null}
                        </span>
                        <span style={{ color: ph?.c, display: "flex" }}><bg-icon name={ph?.icon} size="14" stroke="2" /></span>
                        {ph?.t}
                      </button>
                    </React.Fragment>
                  ))}
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginLeft: v.L?.orderMl, opacity: v.orderOpacity, pointerEvents: v.orderPe }}>
                    <span style={{ fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>Order</span>
                    <div className="seg" role="radiogroup" aria-label="Phase order">
                      {(v.S?.order || []).map((o, $index) => (
                        <React.Fragment key={$index}>
                          <button className={o?.cls} role="radio" aria-checked={o?.aria} onClick={o?.on} style={{ whiteSpace: "nowrap" }}>{o?.t}</button>
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                  <span style={{ flexBasis: "100%", fontSize: "var(--text-micro)", color: "var(--fg-subtle)" }}>{v.phasesHelp}</span>
                </div>
              </div>
            </section>
            <section className="card" aria-labelledby="s-conn">
              <div className="card-h"><bg-icon name="layers" size="15" /><span className="t" id="s-conn">Connections and limits</span></div>
              <div style={{ display: "flex", flexDirection: "column" }}>
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "10px 20px", padding: "14px 16px", borderBottom: "1px solid var(--border-subtle)" }}>
                  <div style={{ flex: "1 1 240px", display: "flex", flexDirection: "column", gap: "3px" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "var(--text-sm)", fontWeight: "600" }}>
                      Parallel streams
                      {v.C?.streams ? (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "var(--text-micro)", fontWeight: "500", color: "var(--primary-text)" }}>
                          <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--primary)" }} />
                          changed
                        </span>
                      ) : null}
                    </span>
                    <span style={{ fontSize: "var(--text-caption)", color: "var(--fg-subtle)", lineHeight: "1.45" }}>
                      Auto ramps 1 → 2 → 4 → 6 streams and stops when adding streams no longer helps. Fixed runs 1–6. Single shows one connection.
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                    <div className="seg" role="radiogroup" aria-label="Parallel streams">
                      {(v.S?.streams || []).map((o, $index) => (
                        <React.Fragment key={$index}>
                          <button className={o?.cls} role="radio" aria-checked={o?.aria} onClick={o?.on}>{o?.t}</button>
                        </React.Fragment>
                      ))}
                    </div>
                    {v.isFixed ? (
                      <div role="group" aria-label="Stream count" style={{ display: "flex", alignItems: "center", border: "1px solid var(--border-default)", borderRadius: "var(--radius-md)", height: "34px", overflow: "hidden", background: "var(--surface-1)" }}>
                        <button className="btn ghost icon sm" aria-label="Fewer streams" disabled={v.nMin} onClick={v.nDec} style={{ height: "32px", width: "32px", borderRadius: "0" }}>
                          <bg-icon name="minus" size="14" />
                        </button>
                        <span aria-live="polite" style={{ width: "34px", textAlign: "center", fontFamily: "var(--font-mono)", fontSize: "var(--text-sm)" }}>{v.n}</span>
                        <button className="btn ghost icon sm" aria-label="More streams" disabled={v.nMax} onClick={v.nInc} style={{ height: "32px", width: "32px", borderRadius: "0" }}>
                          <bg-icon name="plus" size="14" />
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
                {v.timed ? (
                  <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", gap: "12px 20px", padding: "14px 16px", borderBottom: "1px solid var(--border-subtle)" }}>
                    <div style={{ flex: "1 1 240px", display: "flex", flexDirection: "column", gap: "3px" }}>
                      <span style={{ fontSize: "var(--text-sm)", fontWeight: "600" }}>Duration per direction</span>
                      <span style={{ fontSize: "var(--text-caption)", color: "var(--fg-subtle)", lineHeight: "1.45" }}>
                        A direction ends after the minimum once results are stable, and runs up to the maximum on slow or noisy links.
                      </span>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <span style={{ width: "118px", display: "flex", alignItems: "center", gap: "6px", fontSize: "var(--text-sm)" }}>
                            <span style={{ color: "var(--series-download)", display: "flex" }}><bg-icon name="arrow-down" size="14" stroke="2" /></span>
                            Download
                            {v.C?.dl ? (
                              <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "var(--text-micro)", fontWeight: "500", color: "var(--primary-text)" }}>
                                <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--primary)" }} />
                                custom
                              </span>
                            ) : null}
                          </span>
                          <label className={v.F?.dlMin?.cls} style={{ width: "76px", height: "34px" }}>
                            <input value={v.F?.dlMin?.val} aria-label="Download minimum seconds" aria-invalid={v.F?.dlMin?.aria} aria-describedby={v.F?.dlMin?.desc} onChange={v.F?.dlMin?.onChange} onBlur={v.F?.dlMin?.onBlur} onKeyDown={v.F?.dlMin?.onKeyDown} />
                            <span style={{ color: "var(--fg-subtle)" }}>s</span>
                          </label>
                          <span style={{ color: "var(--fg-subtle)" }}>–</span>
                          <label className={v.F?.dlMax?.cls} style={{ width: "76px", height: "34px" }}>
                            <input value={v.F?.dlMax?.val} aria-label="Download maximum seconds" aria-invalid={v.F?.dlMax?.aria} aria-describedby={v.F?.dlMax?.desc} onChange={v.F?.dlMax?.onChange} onBlur={v.F?.dlMax?.onBlur} onKeyDown={v.F?.dlMax?.onKeyDown} />
                            <span style={{ color: "var(--fg-subtle)" }}>s</span>
                          </label>
                        </div>
                        {v.F?.dlMin?.bad ? (
                          <span className="fmsg" id={v.F?.dlMin?.eid} style={{ maxWidth: "320px" }}><bg-icon name="circle-alert" size="12" />{v.F?.dlMin?.err}</span>
                        ) : null}
                        {v.F?.dlMax?.bad ? (
                          <span className="fmsg" id={v.F?.dlMax?.eid} style={{ maxWidth: "320px" }}><bg-icon name="circle-alert" size="12" />{v.F?.dlMax?.err}</span>
                        ) : null}
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <span style={{ width: "118px", display: "flex", alignItems: "center", gap: "6px", fontSize: "var(--text-sm)" }}>
                            <span style={{ color: "var(--series-upload)", display: "flex" }}><bg-icon name="arrow-up" size="14" stroke="2" /></span>
                            Upload
                            {v.C?.ul ? (
                              <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "var(--text-micro)", fontWeight: "500", color: "var(--primary-text)" }}>
                                <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--primary)" }} />
                                custom
                              </span>
                            ) : null}
                          </span>
                          <label className={v.F?.ulMin?.cls} style={{ width: "76px", height: "34px" }}>
                            <input value={v.F?.ulMin?.val} aria-label="Upload minimum seconds" aria-invalid={v.F?.ulMin?.aria} aria-describedby={v.F?.ulMin?.desc} onChange={v.F?.ulMin?.onChange} onBlur={v.F?.ulMin?.onBlur} onKeyDown={v.F?.ulMin?.onKeyDown} />
                            <span style={{ color: "var(--fg-subtle)" }}>s</span>
                          </label>
                          <span style={{ color: "var(--fg-subtle)" }}>–</span>
                          <label className={v.F?.ulMax?.cls} style={{ width: "76px", height: "34px" }}>
                            <input value={v.F?.ulMax?.val} aria-label="Upload maximum seconds" aria-invalid={v.F?.ulMax?.aria} aria-describedby={v.F?.ulMax?.desc} onChange={v.F?.ulMax?.onChange} onBlur={v.F?.ulMax?.onBlur} onKeyDown={v.F?.ulMax?.onKeyDown} />
                            <span style={{ color: "var(--fg-subtle)" }}>s</span>
                          </label>
                        </div>
                        {v.F?.ulMin?.bad ? (
                          <span className="fmsg" id={v.F?.ulMin?.eid} style={{ maxWidth: "320px" }}><bg-icon name="circle-alert" size="12" />{v.F?.ulMin?.err}</span>
                        ) : null}
                        {v.F?.ulMax?.bad ? (
                          <span className="fmsg" id={v.F?.ulMax?.eid} style={{ maxWidth: "320px" }}><bg-icon name="circle-alert" size="12" />{v.F?.ulMax?.err}</span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ) : null}
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "10px 20px", padding: "14px 16px" }}>
                  <div style={{ flex: "1 1 240px", display: "flex", flexDirection: "column", gap: "3px" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "var(--text-sm)", fontWeight: "600" }}>
                      Data cap per test
                      {v.C?.cap ? (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "var(--text-micro)", fontWeight: "500", color: "var(--primary-text)" }}>
                          <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--primary)" }} />
                          changed
                        </span>
                      ) : null}
                    </span>
                    <span style={{ fontSize: "var(--text-caption)", color: "var(--fg-subtle)", lineHeight: "1.45" }}>
                      Useful on metered mobile links. A direction stops early when the cap is reached and the result is marked.
                    </span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "6px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <button className={v.capSw?.cls} role="switch" aria-checked={v.capSw?.aria} aria-label="Data cap" onClick={v.capSw?.on}>
                        <span className="knob" />
                      </button>
                      <label className={v.F?.capMB?.cls} style={{ width: "110px", height: "34px", opacity: v.capOpacity }}>
                        <input value={v.F?.capMB?.val} disabled={v.capOff} aria-label="Data cap in MB" aria-invalid={v.F?.capMB?.aria} aria-describedby={v.F?.capMB?.desc} onChange={v.F?.capMB?.onChange} onBlur={v.F?.capMB?.onBlur} onKeyDown={v.F?.capMB?.onKeyDown} />
                        <span style={{ color: "var(--fg-subtle)" }}>MB</span>
                      </label>
                    </div>
                    {v.F?.capMB?.bad ? (
                      <span className="fmsg" id={v.F?.capMB?.eid} style={{ maxWidth: "280px" }}><bg-icon name="circle-alert" size="12" />{v.F?.capMB?.err}</span>
                    ) : null}
                  </div>
                </div>
              </div>
            </section>
            <section className="card" aria-labelledby="s-disp">
              <div className="card-h"><bg-icon name="monitor" size="15" /><span className="t" id="s-disp">Display and behaviour</span></div>
              <div style={{ display: "flex", flexDirection: "column" }}>
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "10px 20px", padding: "14px 16px", borderBottom: "1px solid var(--border-subtle)" }}>
                  <div style={{ flex: "1 1 240px" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "var(--text-sm)", fontWeight: "600" }}>
                      Units
                      {v.C?.units ? (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "var(--text-micro)", fontWeight: "500", color: "var(--primary-text)" }}>
                          <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--primary)" }} />
                          changed
                        </span>
                      ) : null}
                    </span>
                  </div>
                  <div className="seg" role="radiogroup" aria-label="Units">
                    {(v.S?.units || []).map((o, $index) => (
                      <React.Fragment key={$index}>
                        <button className={o?.cls} role="radio" aria-checked={o?.aria} onClick={o?.on} style={{ whiteSpace: "nowrap" }}>{o?.t}</button>
                      </React.Fragment>
                    ))}
                  </div>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "10px 20px", padding: "14px 16px", borderBottom: "1px solid var(--border-subtle)" }}>
                  <div style={{ flex: "1 1 240px" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "var(--text-sm)", fontWeight: "600" }}>
                      Theme
                      {v.C?.theme ? (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "var(--text-micro)", fontWeight: "500", color: "var(--primary-text)" }}>
                          <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--primary)" }} />
                          changed
                        </span>
                      ) : null}
                    </span>
                  </div>
                  <div className="seg" role="radiogroup" aria-label="Theme">
                    {(v.S?.theme || []).map((o, $index) => (
                      <React.Fragment key={$index}>
                        <button className={o?.cls} role="radio" aria-checked={o?.aria} onClick={o?.on}><bg-icon name={o?.icon} size="14" />{o?.t}</button>
                      </React.Fragment>
                    ))}
                  </div>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "10px 20px", padding: "14px 16px", borderBottom: "1px solid var(--border-subtle)" }}>
                  <div style={{ flex: "1 1 240px", display: "flex", flexDirection: "column", gap: "3px" }}>
                    <span style={{ fontSize: "var(--text-sm)", fontWeight: "600" }}>Language</span>
                    <span style={{ fontSize: "var(--text-caption)", color: "var(--fg-subtle)", lineHeight: "1.45" }}>Only shipped languages are listed.</span>
                  </div>
                  <label className="input" style={{ width: "200px", height: "34px" }}>
                    <bg-icon name="languages" size="14" />
                    <select aria-label="Language"><option>English</option></select>
                    <bg-icon name="chevron-down" size="14" />
                  </label>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "10px 20px", padding: "14px 16px" }}>
                  <div style={{ flex: "1 1 240px", display: "flex", flexDirection: "column", gap: "3px" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "var(--text-sm)", fontWeight: "600" }}>
                      Auto-start on page load
                      {v.C?.auto ? (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "var(--text-micro)", fontWeight: "500", color: "var(--primary-text)" }}>
                          <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--primary)" }} />
                          changed
                        </span>
                      ) : null}
                    </span>
                    <span style={{ fontSize: "var(--text-caption)", color: "var(--fg-subtle)", lineHeight: "1.45" }}>
                      {"Shows a countdown first, so you can cancel. Also available as "}
                      <span style={{ fontFamily: "var(--font-mono)" }}>?run=1</span>
                      .
                    </span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "6px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <button className={v.autoSw?.cls} role="switch" aria-checked={v.autoSw?.aria} aria-label="Auto-start" onClick={v.autoSw?.on}>
                        <span className="knob" />
                      </button>
                      <label className={v.F?.countdown?.cls} style={{ width: "96px", height: "34px", opacity: v.autoOpacity }}>
                        <input value={v.F?.countdown?.val} disabled={v.autoOff} aria-label="Countdown seconds" aria-invalid={v.F?.countdown?.aria} aria-describedby={v.F?.countdown?.desc} onChange={v.F?.countdown?.onChange} onBlur={v.F?.countdown?.onBlur} onKeyDown={v.F?.countdown?.onKeyDown} />
                        <span style={{ color: "var(--fg-subtle)" }}>s</span>
                      </label>
                    </div>
                    {v.F?.countdown?.bad ? (
                      <span className="fmsg" id={v.F?.countdown?.eid} style={{ maxWidth: "280px" }}><bg-icon name="circle-alert" size="12" />{v.F?.countdown?.err}</span>
                    ) : null}
                  </div>
                </div>
              </div>
            </section>
            <section className="card" aria-labelledby="s-adv">
              <button aria-expanded={v.advAria} aria-controls="adv-body" onClick={v.toggleAdv} style={{ all: "unset", boxSizing: "border-box", width: "100%", cursor: "pointer", display: "flex", alignItems: "center", gap: "10px", padding: "12px 16px", minHeight: "44px" }}>
                <span style={{ color: "var(--fg-subtle)", display: "flex" }}><bg-icon name="sliders" size="15" /></span>
                <span id="s-adv" style={{ fontSize: "var(--text-base)", fontWeight: "600" }}>Advanced</span>
                <span style={{ fontSize: "var(--text-caption)", color: "var(--fg-subtle)", minWidth: "0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {v.advSummary}
                </span>
                <span style={{ marginLeft: "auto", color: "var(--fg-subtle)", display: "flex" }}><bg-icon name={v.advIcon} size="16" /></span>
              </button>
              {v.advOpen ? (
                <div id="adv-body" style={{ borderTop: "1px solid var(--border-subtle)", display: "flex", flexDirection: "column" }}>
                  <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "10px 20px", padding: "14px 16px", borderBottom: "1px solid var(--border-subtle)" }}>
                    <div style={{ flex: "1 1 240px", display: "flex", flexDirection: "column", gap: "3px" }}>
                      <span style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "var(--text-sm)", fontWeight: "600" }}>
                        Warm-up
                        {v.C?.warm ? (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "var(--text-micro)", fontWeight: "500", color: "var(--primary-text)" }}>
                            <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--primary)" }} />
                            changed
                          </span>
                        ) : null}
                      </span>
                      <span style={{ fontSize: "var(--text-caption)", color: "var(--fg-subtle)", lineHeight: "1.45" }}>
                        Auto ends warm-up once throughput settles. Samples during warm-up are discarded.
                      </span>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "6px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <div className="seg" role="radiogroup" aria-label="Warm-up">
                          {(v.S?.warm || []).map((o, $index) => (
                            <React.Fragment key={$index}>
                              <button className={o?.cls} role="radio" aria-checked={o?.aria} onClick={o?.on}>{o?.t}</button>
                            </React.Fragment>
                          ))}
                        </div>
                        {v.warmFixed ? (
                          <label className={v.F?.warmS?.cls} style={{ width: "84px", height: "34px" }}>
                            <input value={v.F?.warmS?.val} aria-label="Warm-up seconds" aria-invalid={v.F?.warmS?.aria} aria-describedby={v.F?.warmS?.desc} onChange={v.F?.warmS?.onChange} onBlur={v.F?.warmS?.onBlur} onKeyDown={v.F?.warmS?.onKeyDown} />
                            <span style={{ color: "var(--fg-subtle)" }}>s</span>
                          </label>
                        ) : null}
                      </div>
                      {v.F?.warmS?.bad ? (
                        <span className="fmsg" id={v.F?.warmS?.eid} style={{ maxWidth: "280px" }}><bg-icon name="circle-alert" size="12" />{v.F?.warmS?.err}</span>
                      ) : null}
                    </div>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "10px 20px", padding: "14px 16px", borderBottom: "1px solid var(--border-subtle)" }}>
                    <div style={{ flex: "1 1 240px", display: "flex", flexDirection: "column", gap: "3px" }}>
                      <span style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "var(--text-sm)", fontWeight: "600" }}>
                        Ping count
                        {v.C?.pings ? (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "var(--text-micro)", fontWeight: "500", color: "var(--primary-text)" }}>
                            <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--primary)" }} />
                            changed
                          </span>
                        ) : null}
                      </span>
                      <span style={{ fontSize: "var(--text-caption)", color: "var(--fg-subtle)", lineHeight: "1.45" }}>
                        {"Used for idle latency and jitter. "}{v.pingsHelp}
                      </span>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "6px" }}>
                      <label className={v.F?.pings?.cls} style={{ width: "110px", height: "34px" }}>
                        <input value={v.F?.pings?.val} aria-label="Ping count" aria-invalid={v.F?.pings?.aria} aria-describedby={v.F?.pings?.desc} onChange={v.F?.pings?.onChange} onBlur={v.F?.pings?.onBlur} onKeyDown={v.F?.pings?.onKeyDown} />
                        <span style={{ color: "var(--fg-subtle)" }}>pings</span>
                      </label>
                      {v.F?.pings?.bad ? (
                        <span className="fmsg" id={v.F?.pings?.eid} style={{ maxWidth: "280px" }}><bg-icon name="circle-alert" size="12" />{v.F?.pings?.err}</span>
                      ) : null}
                    </div>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "10px 20px", padding: "14px 16px" }}>
                    <div style={{ flex: "1 1 240px", display: "flex", flexDirection: "column", gap: "3px" }}>
                      <span style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "var(--text-sm)", fontWeight: "600" }}>
                        Overhead compensation
                        {v.C?.overhead ? (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "var(--text-micro)", fontWeight: "500", color: "var(--primary-text)" }}>
                            <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--primary)" }} />
                            changed
                          </span>
                        ) : null}
                      </span>
                      <span style={{ fontSize: "var(--text-caption)", color: "var(--fg-subtle)", lineHeight: "1.45" }}>
                        Adds estimated protocol overhead to measured throughput. Shown next to every number when not 0 %.
                      </span>
                      {v.C?.overhead ? (
                        <span style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "4px", fontSize: "var(--text-caption)", color: "var(--fg-subtle)" }}>
                          Shown as
                          <span style={{ fontFamily: "var(--font-mono)", color: "var(--fg)" }}>941.2 Mbit/s</span>
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-micro)", color: "var(--fg-muted)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-full)", padding: "1px 7px" }}>
                            +{v.overhead}{" % overhead"}
                          </span>
                        </span>
                      ) : null}
                    </div>
                    <label className="input" style={{ width: "240px", height: "34px" }}>
                      <select aria-label="Overhead compensation" value={v.overhead} onChange={v.setOverhead}>
                        {(v.overheadOpts || []).map((o, $index) => (
                          <React.Fragment key={$index}>
                            <option value={o?.v}>{o?.t}</option>
                          </React.Fragment>
                        ))}
                      </select>
                      <bg-icon name="chevron-down" size="14" />
                    </label>
                  </div>
                </div>
              ) : null}
            </section>
          </div>
          <aside style={{ display: "flex", flexDirection: "column", gap: "16px", minWidth: "0" }}>
            <section className="card" aria-labelledby="s-share">
              <div className="card-h"><bg-icon name="link" size="15" /><span className="t" id="s-share">Shareable link</span></div>
              <div className="card-b" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <span style={{ fontSize: "var(--text-caption)", color: "var(--fg-subtle)", lineHeight: "1.45" }}>
                  Opens BitGauge with the test settings that differ from defaults. Units and theme stay on each device.
                </span>
                <div style={{ display: "flex", gap: "6px" }}>
                  <label className="input mono sm" style={{ flex: "1", minWidth: "0", height: "34px" }}>
                    <input readOnly value={v.url} aria-label="Shareable URL" style={{ fontSize: "var(--text-caption)" }} />
                  </label>
                  <button className="btn secondary icon" aria-label="Copy link" onClick={v.copyUrl}><bg-icon name={v.copyIcon} size="15" /></button>
                </div>
                <button role="checkbox" aria-checked={v.incRunAria} onClick={v.toggleIncRun} style={{ all: "unset", boxSizing: "border-box", display: "flex", alignItems: "center", gap: "8px", fontSize: "var(--text-caption)", color: "var(--fg-muted)", minHeight: "32px", cursor: "pointer" }}>
                  <span style={{ width: "16px", height: "16px", flex: "none", boxSizing: "border-box", borderRadius: "4px", background: v.incRunBg, border: v.incRunBd, color: "var(--primary-fg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {v.incRun ? (
                      <bg-icon name="check" size="12" stroke="3" />
                    ) : null}
                  </span>
                  <span>{"Include "}<span style={{ fontFamily: "var(--font-mono)" }}>run=1</span>{" (start automatically)"}</span>
                </button>
              </div>
            </section>
            <section className="card" aria-labelledby="s-changed">
              <div className="card-h">
                <bg-icon name="sliders" size="15" />
                <span className="t" id="s-changed">Changed from defaults</span>
                <span className="right" style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-caption)", color: "var(--fg-subtle)" }}>
                  {v.changedCount}
                </span>
              </div>
              {v.hasChanges ? (
                <div style={{ padding: "4px 16px 4px" }}>
                  {(v.changed || []).map((c, $index) => (
                    <React.Fragment key={$index}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px 0", borderBottom: "1px solid var(--border-subtle)" }}>
                        <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column" }}>
                          <span style={{ fontSize: "var(--text-sm)" }}>{c?.k}</span>
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-micro)", color: "var(--fg-subtle)" }}>{"default "}{c?.d}</span>
                        </span>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-caption)", color: "var(--primary-text)", textAlign: "right" }}>{c?.v}</span>
                        <button className="btn ghost icon sm" aria-label={c?.label} title={c?.label} onClick={c?.reset} style={{ width: "28px" }}>
                          <bg-icon name="rotate-ccw" size="13" />
                        </button>
                      </div>
                    </React.Fragment>
                  ))}
                </div>
              ) : null}
              {v.noChanges ? (
                <div style={{ padding: "14px 16px 2px", fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>Everything is at its default.</div>
              ) : null}
              <div style={{ padding: "12px 16px" }}>
                <button className="btn danger sm" disabled={v.noChanges} onClick={v.openReset} style={{ width: "100%", justifyContent: "center" }}>
                  <bg-icon name="rotate-ccw" size="14" />
                  Reset all to defaults
                </button>
              </div>
            </section>
          </aside>
        </main>
        {v.mobile ? (
          <div style={{ marginTop: "auto", position: "sticky", bottom: "0", zIndex: "var(--z-nav)" }}><Nav variant="mobile-bottom" active="settings" /></div>
        ) : null}
        {v.confirm ? (
          <div onClick={v.closeReset} style={{ position: "absolute", inset: "0", zIndex: "40", background: "var(--scrim)", backdropFilter: "blur(2px)", display: "flex", alignItems: v.L?.cfAlign, justifyContent: "center", paddingTop: v.L?.cfTop }}>
            <div className="modal" role="alertdialog" aria-modal="true" aria-labelledby="rst-t" aria-describedby="rst-d" onClick={v.stop} style={{ width: v.L?.cfW, maxWidth: "100%", maxHeight: "none", boxSizing: "border-box", borderRadius: v.L?.cfRad }}>
              <div className="mh">
                <div className="mi danger"><bg-icon name="rotate-ccw" size="17" /></div>
                <div><div className="mt" id="rst-t">Reset all settings?</div><div className="md" id="rst-d">{v.resetLine}</div></div>
              </div>
              <div className="mf">
                <span style={{ flex: "1" }} />
                <button className="btn secondary" onClick={v.closeReset}>Cancel</button>
                <button className="btn danger" onClick={v.doReset}><bg-icon name="rotate-ccw" size="14" />Reset all</button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    );
  }
}

window.Settings = Settings;
