/* BitGauge web UI kit — Settings
 * Props:
 *   mobile: boolean  (default false)
 *   preset: "quick" | "standard" | "extended" | "continuous"  (default "extended")
 *   advanced: boolean  (default false)
 *   invalid: boolean  (default false)
 *   confirmReset: boolean  (default false)
 *   streamsMax: number  (server's streams.max; default 6)
 */
class Settings extends React.Component {
  state = this.initState();

  P() {
    return {
      quick: { t: 'Quick', icon: 'zap', d: 'Fixed 3 streams · 5–10 s per direction · 10 pings', streams: 'fixed', n: 3, dl: [5, 10], ul: [5, 10], pings: 10 },
      standard: { t: 'Standard', icon: 'gauge', d: 'Auto streams · 10–20 s down, 15–25 s up · 20 pings', streams: 'auto', dl: [10, 20], ul: [15, 25], pings: 20, def: true },
      extended: { t: 'Extended', icon: 'timer', d: 'Auto streams · 20–40 s per direction · 50 pings', streams: 'auto', dl: [20, 40], ul: [20, 40], pings: 50 },
      continuous: { t: 'Continuous', icon: 'infinity', d: 'Auto streams, Standard ramp · one direction until stopped · 20 pings', streams: 'auto', pings: 20 }
    };
  }
  on(v) { return !!v && v !== 'false' && v !== '0'; }
  defaults() {
    return { preset: 'standard', dir: 'download', runLimit: false, runUnit: 'h', phases: { latency: true, download: true, upload: true }, order: 'down', ov: {}, v: { capMB: 500, countdown: 3, warmS: 2, runVal: null }, cap: false, label: '', nDraft: null, units: 'bits', theme: 'system', autostart: false, warm: 'auto', overhead: '0', drafts: {}, err: {}, keepAsk: null };
  }
  initState() {
    const p = this.props || {};
    // Real product state: the prototype keeps the saved settings and passes them back in.
    if (p.saved) return Object.assign(this.defaults(), p.saved, { theme: p.theme || p.saved.theme, advOpen: !!p.saved.advOpen, confirm: false, copied: false, drafts: {}, err: {}, keepAsk: null });
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
    const R = { dlMin: [5, 600], dlMax: [5, 600], ulMin: [5, 600], ulMax: [5, 600], capMB: [1, 100000], countdown: [1, 30], pings: [6, 200], warmS: [1, 60], runVal: ({ m: [1, 10080], h: [1, 168], d: [1, 7] })[st.runUnit] }[k];
    const s = String(str).trim(), n = Number(s), u = this.unitOf(k, st);
    // Run length: empty is valid and means none (screens.md §4); a value is a whole number of the unit, 60 s to 7 days.
    if (k === 'runVal' && s === '') return null;
    const cur = this.eff(k, st), restore = cur == null ? 'no run length' : cur + ' ' + u;
    let msg = null;
    if (s === '' || !isFinite(n) || (!R[2] && !Number.isInteger(n)) || n < R[0] || n > R[1]) msg = k === 'runVal' ? 'Run length must be 1 minute to 7 days.' : /^(dl|ul)/.test(k) ? 'Enter whole seconds from 5 s to 10 min (600 s).' : 'Enter a ' + (R[2] ? '' : 'whole ') + 'number from ' + R[0] + ' to ' + R[1] + '.';
    else if (/Min$/.test(k) && n > this.eff(k.replace('Min', 'Max'), st)) msg = 'Must be at most the maximum (' + this.eff(k.replace('Min', 'Max'), st) + ' s).';
    else if (/Max$/.test(k) && n < this.eff(k.replace('Max', 'Min'), st)) msg = 'Must be at least the minimum (' + this.eff(k.replace('Max', 'Min'), st) + ' s).';
    return msg ? msg + ' Not saved · Esc restores ' + restore + '.' : null;
  }
  drop(o, k) { const c = Object.assign({}, o); delete c[k]; return c; }
  check(k, el) {
    const st = this.state, str = st.drafts[k];
    if (str === undefined) return;
    const e = this.validate(k, str, st);
    if (e) { this.setState({ err: Object.assign({}, st.err, { [k]: e }) }); return; } // error shown, focus stays free: Tab moves on
    const n = String(str).trim() === '' ? null : Number(String(str).trim());
    this.setState(s => {
      const pv = this.pv(s), out = { drafts: this.drop(s.drafts, k), err: this.drop(s.err, k) };
      if (k in pv) { const ov = Object.assign({}, s.ov); if (n === pv[k]) delete ov[k]; else ov[k] = n; out.ov = ov; }
      else out.v = Object.assign({}, s.v, { [k]: n });
      return out;
    });
  }
  field(k) {
    const st = this.state, e = st.err[k], d = st.drafts[k], cur = this.eff(k, st);
    return {
      val: d !== undefined ? d : cur == null ? '' : String(cur), bad: !!e, err: e || '', eid: 'err-' + k, desc: e ? 'err-' + k : undefined,
      // Invalid keeps its error styling; the focus ring comes from :focus-within only, so Tab moves it on.
      cls: 'input mono' + (e ? ' invalid' : ''), aria: e ? 'true' : 'false',
      onChange: ev => { const val = ev.target.value; this.setState(s => { const out = { drafts: Object.assign({}, s.drafts, { [k]: val }) }; if (s.err[k]) { const ne = this.validate(k, val, s); out.err = ne ? Object.assign({}, s.err, { [k]: ne }) : this.drop(s.err, k); } return out; }); },
      onBlur: ev => this.check(k, ev.target),
      onKeyDown: ev => { if (ev.key === 'Enter') { ev.preventDefault(); this.check(k, ev.target); } else if (ev.key === 'Escape') this.setState(s => ({ drafts: this.drop(s.drafts, k), err: this.drop(s.err, k) })); }
    };
  }
  seg(opts, cur, set) { return opts.map(o => ({ t: o[1], icon: o[2], c: o[3], cls: 'seg-btn' + (o[0] === cur ? ' on' : ''), aria: o[0] === cur ? 'true' : 'false', on: () => set(o[0]) })); }
  sw(isOn, toggle) { return { cls: 'switch' + (isOn ? ' on' : ''), aria: isOn ? 'true' : 'false', on: toggle }; }
  resetOv(keys, extra) { this.setState(s => { const ov = Object.assign({}, s.ov), drafts = Object.assign({}, s.drafts), err = Object.assign({}, s.err); keys.forEach(k => { delete ov[k]; delete drafts[k]; delete err[k]; }); return Object.assign({ ov, drafts, err }, extra || {}); }); }

  renderVals() {
    const s = this.state, m = this.on(this.props.mobile), PR = this.P(), D = this.defaults();
    const P = PR[s.preset];
    const isCont = s.preset === 'continuous', timed = !isCont;
    const set = o => this.setState(o);
    // Fixed count runs 1 to the server's streams.max (GET /info); the fixture's server gives 6.
    const nCap = Math.max(1, Number(this.props.streamsMax) || 6);
    const setN = nv => this.setState(st => { const ov = Object.assign({}, st.ov), pn2 = this.P()[st.preset].n || 3; nv = Math.min(nCap, Math.max(1, nv)); if (nv === pn2) delete ov.n; else ov.n = nv; return { ov, nDraft: null }; });
    const sm = s.ov.streams || P.streams, pn = P.n || 3, n = s.ov.n != null ? s.ov.n : pn;
    const streamsLbl = (mode, k) => mode === 'auto' ? 'Auto' : mode === 'single' ? 'Single' : 'Fixed · ' + k;
    const dur = (a, b) => a + '–' + b + ' s';
    const e = k => this.eff(k, s);
    const dirName = s.dir === 'download' ? 'download' : 'upload';
    const runSet = s.runLimit && s.v.runVal != null;
    const runStr = runSet ? s.v.runVal + ({ m: ' min', h: ' h', d: ' d' })[s.runUnit] : '';
    // Continuous: the directions give way to its one direction; only idle latency stays a choice.
    const phOn = isCont ? { latency: s.phases.latency, download: s.dir === 'download', upload: s.dir === 'upload' } : s.phases;
    const phAll = isCont ? phOn.latency : phOn.latency && phOn.download && phOn.upload;

    const C = {
      streams: sm !== P.streams || (sm === 'fixed' && n !== pn),
      dl: timed && ('dlMin' in s.ov || 'dlMax' in s.ov), ul: timed && ('ulMin' in s.ov || 'ulMax' in s.ov),
      phases: !phAll, cap: s.cap, units: s.units !== 'bits', theme: s.theme !== 'system',
      label: s.label.trim() !== '', auto: s.autostart || s.v.countdown !== 3, warm: s.warm !== 'auto', pings: 'pings' in s.ov, overhead: s.overhead !== '0'
    };
    const changed = [];
    const add = (k, d, v, reset) => changed.push({ k, d, v, reset, label: 'Reset ' + k.toLowerCase() });
    if (s.preset !== 'standard') add('Preset', 'Standard', P.t + (isCont ? ' · ' + dirName + (runSet ? ' · ' + runStr : '') : ''), () => set({ preset: 'standard', dir: 'download', runLimit: false, runUnit: 'h', v: Object.assign({}, s.v, { runVal: null }), drafts: {}, err: {} }));
    if (C.streams) add('Parallel streams', streamsLbl(P.streams, pn), streamsLbl(sm, n), () => this.resetOv(['streams', 'n']));
    if (C.dl) add('Download duration', dur(P.dl[0], P.dl[1]), dur(e('dlMin'), e('dlMax')), () => this.resetOv(['dlMin', 'dlMax']));
    if (C.ul) add('Upload duration', dur(P.ul[0], P.ul[1]), dur(e('ulMin'), e('ulMax')), () => this.resetOv(['ulMin', 'ulMax']));
    if (C.phases) add('Phases', 'All three', ['latency', 'download', 'upload'].filter(k => phOn[k]).map(k => k[0].toUpperCase() + k.slice(1)).join(', '), () => set({ phases: isCont ? Object.assign({}, s.phases, { latency: true }) : D.phases }));
    if (s.order === 'up') add('Phase order', 'Download first', 'Upload first', () => set({ order: 'down' }));
    if (C.cap) add('Data cap', 'Off', s.v.capMB + ' MB', () => set({ cap: false, v: Object.assign({}, s.v, { capMB: 500 }) }));
    if (C.label) add('Result label', 'None', s.label.trim(), () => set({ label: '' }));
    if (C.units) add('Units', 'Bits', 'Bytes', () => set({ units: 'bits' }));
    if (C.theme) add('Theme', 'System', s.theme === 'light' ? 'Light' : 'Dark', () => set({ theme: 'system' }));
    if (C.auto) add('Auto-start', 'Off · 3 s', (s.autostart ? 'On' : 'Off') + ' · ' + s.v.countdown + ' s', () => set({ autostart: false, v: Object.assign({}, s.v, { countdown: 3 }) }));
    if (C.warm) add('Warm-up', 'Auto', 'Fixed · ' + s.v.warmS + ' s', () => set({ warm: 'auto' }));
    if (C.pings) add('Ping count', String(P.pings), String(e('pings')), () => this.resetOv(['pings']));
    if (C.overhead) add('Overhead compensation', 'None', '+' + s.overhead + ' %', () => set({ overhead: '0' }));
    this._changed = changed;

    // url-params.md §2, in table order: run, test, preset, duration, streams, cap, units, lang, theme, label.
    const q = [];
    if (s.incRun) q.push('run=1');
    // `test` always includes idle latency; a set without it is named in "Not in the link".
    const test = isCont ? (s.dir === 'upload' ? 'upload' : null) : phOn.download && phOn.upload ? null : phOn.download ? 'download' : phOn.upload ? 'upload' : 'latency';
    const phLinked = phOn.latency;
    if (test) q.push('test=' + test);
    if (s.preset !== 'standard') q.push('preset=' + s.preset);
    if (isCont && runSet) q.push('duration=' + s.v.runVal * ({ m: 60, h: 3600, d: 86400 })[s.runUnit]);
    if (C.streams) q.push('streams=' + (sm === 'fixed' ? n : sm));
    if (C.cap) q.push('cap=' + s.v.capMB + 'MB');
    if (C.units) q.push('units=' + s.units);
    if (C.theme) q.push('theme=' + s.theme);
    if (C.label) q.push('label=' + encodeURIComponent(s.label.trim()));
    const LINKED = ['Preset', 'Parallel streams', 'Data cap', 'Result label', 'Units', 'Theme'].concat(phLinked ? ['Phases'] : []);
    const notInUrl = changed.filter(c => !LINKED.includes(c.k)).map(c => c.k);
    const url = 'https://speed.home.lan/' + (q.length ? '?' + q.join('&') : '');

    const presets = Object.keys(PR).map(k => {
      const p = PR[k], sel = k === s.preset, pick = () => { if (sel) return; if (k !== 'continuous' && (C.dl || C.ul)) set({ keepAsk: k }); else set({ preset: k, drafts: {}, err: {} }); };
      return { t: p.t, icon: p.icon, d: p.d, def: !!p.def, pick, key: ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); pick(); } }, aria: sel ? 'true' : 'false', bd: sel ? 'var(--primary-border)' : 'var(--border-default)', bg: sel ? 'var(--primary-bg)' : 'var(--surface-1)', ic: sel ? 'var(--primary-text)' : 'var(--fg-subtle)', ring: sel ? '5px solid var(--primary)' : '1.5px solid var(--border-strong)', dot: sel ? 'var(--surface-2)' : 'transparent' };
    });
    const onCount = Object.values(phOn).filter(Boolean).length;
    const phases = [['latency', 'Latency', 'activity', 'var(--series-latency)'], ['download', 'Download', 'arrow-down', 'var(--series-download)'], ['upload', 'Upload', 'arrow-up', 'var(--series-upload)']].map(([k, t, icon, c]) => {
      const v = phOn[k], dis = isCont ? k !== 'latency' : v && onCount === 1;
      return { t, icon, c, on2: v, aria: v ? 'true' : 'false', dis, bg: v ? 'var(--primary)' : 'transparent', bd: v ? 'none' : '1.5px solid var(--border-strong)', on: () => { if (!dis) set({ phases: Object.assign({}, s.phases, { [k]: !v }) }); } };
    });
    const orderOk = timed && phOn.download && phOn.upload;
    const errKeys = Object.keys(s.err);
    const F = {};
    ['dlMin', 'dlMax', 'ulMin', 'ulMax', 'capMB', 'countdown', 'pings', 'warmS', 'runVal'].forEach(k => { F[k] = this.field(k); });

    return {
      mobile: m, desktop: !m, stop: ev => ev.stopPropagation(),
      L: m ? { pad: 'var(--space-4) var(--space-4) var(--space-6)', cols: 'minmax(0,1fr)', h1: 'var(--text-3xl)', presetCols: 'minmax(0,1fr)', orderMl: '0', cfAlign: 'flex-end', cfTop: '0', cfW: '100%', cfRad: 'var(--radius-xl) var(--radius-xl) 0 0' }
           : { pad: 'var(--space-6) var(--space-10) var(--space-12)', cols: 'minmax(0,1fr) 340px', h1: 'var(--text-4xl)', presetCols: 'repeat(2, minmax(0,1fr))', orderMl: 'auto', cfAlign: 'flex-start', cfTop: '160px', cfW: '460px', cfRad: 'var(--radius-xl)' },
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
      phasesOpacity: '1', orderOpacity: orderOk ? '1' : '0.45', orderPe: orderOk ? 'auto' : 'none',
      phasesHelp: isCont ? 'Continuous runs the one direction chosen above. Idle latency runs first when it is on.' : 'Idle latency runs first. Turn off a phase to test the others; at least one stays on.',
      // Switched on, the field starts empty (no run length until a valid value is entered); switched off, it clears.
      runSw: this.sw(s.runLimit, () => set({ runLimit: !s.runLimit, v: Object.assign({}, s.v, { runVal: null }), drafts: this.drop(s.drafts, 'runVal'), err: this.drop(s.err, 'runVal') })), runLimit: s.runLimit, noRunLimit: !s.runLimit, runUnit: s.runUnit,
      setRunUnit: ev => { const u = ev.target.value, max = { m: 10080, h: 168, d: 7 }[u]; set({ runUnit: u, v: Object.assign({}, s.v, { runVal: s.v.runVal == null ? null : Math.min(s.v.runVal, max) }), drafts: this.drop(s.drafts, 'runVal'), err: this.drop(s.err, 'runVal') }); },
      isFixed: sm === 'fixed', n, nCap, nMin: n <= 1, nMax: n >= nCap, nShown: s.nDraft != null ? s.nDraft : String(n),
      nDec: () => setN(n - 1), nInc: () => setN(n + 1),
      // Spinbutton (NumberField): ↑/↓ step, Home/End jump to 1/6, typed digits commit on Enter or blur; out of range reverts.
      nType: ev => set({ nDraft: ev.target.value.replace(/[^0-9]/g, '').slice(0, 2) }),
      nCommit: () => { const d = s.nDraft; if (d == null) return; const nv = Number(d); if (d !== '' && nv >= 1 && nv <= nCap) setN(nv); else set({ nDraft: null }); },
      nKey: ev => { const k = ev.key; if (k === 'ArrowUp' || k === 'ArrowDown' || k === 'Home' || k === 'End' || k === 'PageUp' || k === 'PageDown') { ev.preventDefault(); setN(k === 'Home' ? 1 : k === 'End' ? nCap : n + (k === 'ArrowUp' || k === 'PageUp' ? 1 : -1)); } else if (k === 'Enter') { ev.preventDefault(); ev.target.blur(); } else if (k === 'Escape') set({ nDraft: null }); },
      label: s.label, setLabel: ev => set({ label: ev.target.value.slice(0, 64) }), labelCount: s.label.length + ' / 64',
      capSw: this.sw(s.cap, () => set({ cap: !s.cap })), capOff: !s.cap, capOpacity: s.cap ? '1' : '0.45',
      autoSw: this.sw(s.autostart, () => set({ autostart: !s.autostart })), autoOff: !s.autostart, autoOpacity: s.autostart ? '1' : '0.45',
      advOpen: s.advOpen, advAria: s.advOpen ? 'true' : 'false', advIcon: s.advOpen ? 'chevron-up' : 'chevron-down', toggleAdv: () => set({ advOpen: !s.advOpen }),
      advSummary: 'Warm-up, ping count, overhead compensation',
      warmFixed: s.warm === 'fixed', pingsHelp: 'Preset default: ' + P.pings + '.',
      overhead: s.overhead, setOverhead: ev => set({ overhead: ev.target.value }),
      overheadOpts: [['0', 'None · 0 %'], ['6', 'LibreSpeed default · 6 %'], ['5.13', 'IPv6 · 5.13 %'], ['3.69', 'Alternative · 3.69 %'], ['8.1', 'Alternative 2 · 8.1 %']].map(([v, t]) => ({ v, t })),
      url, notInUrl: notInUrl.join(', '), hasNotInUrl: notInUrl.length > 0, copyIcon: s.copied ? 'check' : 'copy',
      copyUrl: () => { try { navigator.clipboard && navigator.clipboard.writeText(url); } catch (x) {} set({ copied: true }); clearTimeout(this._ct); this._ct = setTimeout(() => this.setState({ copied: false }), 1500); },
      incRun: s.incRun, incRunAria: s.incRun ? 'true' : 'false', incRunBg: s.incRun ? 'var(--primary)' : 'transparent', incRunBd: s.incRun ? 'none' : '1.5px solid var(--border-strong)', toggleIncRun: () => set({ incRun: !s.incRun }),
      changed, changedCount: String(changed.length), hasChanges: changed.length > 0, noChanges: changed.length === 0,
      keepAsk: !!s.keepAsk, keepTitle: s.keepAsk ? 'Keep your custom durations?' : '',
      keepLine: s.keepAsk ? 'You set download ' + dur(e('dlMin'), e('dlMax')) + ' and upload ' + dur(e('ulMin'), e('ulMax')) + '. ' + PR[s.keepAsk].t + ' uses ' + dur(PR[s.keepAsk].dl[0], PR[s.keepAsk].dl[1]) + ' down and ' + dur(PR[s.keepAsk].ul[0], PR[s.keepAsk].ul[1]) + ' up.' : '',
      keepUse: s.keepAsk ? 'Use ' + PR[s.keepAsk].t + ' durations' : '',
      keepCustom: () => set({ preset: s.keepAsk, keepAsk: null, drafts: {}, err: {} }),
      keepPreset: () => this.resetOv(['dlMin', 'dlMax', 'ulMin', 'ulMax'], { preset: s.keepAsk, keepAsk: null }),
      keepCancel: () => set({ keepAsk: null }),
      confirm: s.confirm, openReset: () => set({ confirm: true }), closeReset: () => set({ confirm: false }),
      doReset: () => this.setState(Object.assign(this.defaults(), { confirm: false })),
      resetLine: (changed.length === 1 ? '1 setting returns to its default: ' : changed.length + ' settings return to their defaults: ') + changed.map(c => c.k).join(', ') + '. Your test history is not affected.'
    };
  }
  render() {
    const v = this.renderVals();
    // Segmented props from the option rows renderVals builds ({ t, icon, c, aria, on }).
    const seg = (opts = []) => { const cur = opts.find(o => o.aria === true || o.aria === 'true') || {};
      return { options: opts.map(o => ({ value: o.t, label: o.t, icon: o.icon, color: o.c })), value: cur.t, onChange: val => { const o = opts.find(x => x.t === val); o && o.on && o.on(); } }; };
    return (
      <div style={{ position: "relative", background: "var(--bg-base)", color: "var(--fg)", fontFamily: "var(--font-sans)", minHeight: "100%", display: "flex", flexDirection: "column" }}>
        {v.desktop ? (
          <Nav variant="top" active="settings" status={this.props.srvStatus || "connected"} />
        ) : null}
        {v.mobile ? (
          <Nav variant="mobile-top" active="settings" status={this.props.srvStatus || "connected"} />
        ) : null}
        <main style={{ flex: "1", width: "100%", maxWidth: "var(--layout-max)", margin: "0 auto", boxSizing: "border-box", padding: v.L?.pad, display: "grid", gridTemplateColumns: v.L?.cols, gap: "var(--space-6)", alignItems: "start" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)", minWidth: "0" }}>
            <header style={{ display: "flex", flexDirection: "column", gap: "var(--space-1-5)" }}>
              <h1 style={{ margin: "0", fontSize: v.L?.h1, fontWeight: "var(--weight-semibold)", letterSpacing: "var(--tracking-tight)" }}>Settings</h1>
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "var(--space-1-5) var(--space-3)", fontSize: "var(--text-sm)", color: "var(--fg-subtle)" }}>
                {v.allSaved ? (
                  <span role="status" style={{ display: "inline-flex", alignItems: "center", gap: "5px", color: "var(--ok-fg)" }}>
                    <DS.Icon name="circle-check" size={14} />
                    Saved
                  </span>
                ) : null}
                {v.hasErr ? (
                  <span role="status" style={{ display: "inline-flex", alignItems: "center", gap: "5px", color: "var(--danger-fg)" }}>
                    <DS.Icon name="circle-alert" size={14} />
                    {v.errCountLabel}
                  </span>
                ) : null}
                <span>Changes save automatically in this browser and apply to the next test.</span>
              </div>
            </header>
            <DS.Card as="section" labelledBy="s-preset" icon="gauge" title={<span id="s-preset">Test preset</span>}>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
                <div role="radiogroup" aria-labelledby="s-preset" style={{ display: "grid", gridTemplateColumns: v.L?.presetCols, gap: "var(--space-2-5)" }}>
                  {(v.presets || []).map((p, $index) => (
                    <React.Fragment key={$index}>
                      <DS.ChoiceCard selected={p?.aria === 'true' || p?.aria === true} icon={p?.icon} title={p?.t} badge={p?.def ? <DS.StatusPill size="sm" dot={false}>Default</DS.StatusPill> : null} onSelect={p?.pick}>{p?.d}</DS.ChoiceCard>
                    </React.Fragment>
                  ))}
                </div>
                {v.isCont ? (
                  <div style={{ display: "flex", flexDirection: "column", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", background: "var(--surface-1)" }}>
                    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "var(--space-2-5) var(--space-5)", padding: "var(--space-3) var(--space-3-5)", borderBottom: "1px solid var(--border-subtle)" }}>
                      <div style={{ flex: "1 1 200px", display: "flex", flexDirection: "column", gap: "3px" }}>
                        <span style={{ fontSize: "var(--text-sm)", fontWeight: "var(--weight-semibold)" }}>Direction</span>
                        <span style={{ fontSize: "var(--text-caption)", color: "var(--fg-subtle)", lineHeight: "var(--lh-compact)" }}>
                          Continuous measures one direction until you stop it.
                        </span>
                      </div>
                      <DS.Segmented ariaLabel="Continuous direction" {...seg(v.S?.dir)} />
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "var(--space-2-5) var(--space-5)", padding: "var(--space-3) var(--space-3-5)" }}>
                      <div style={{ flex: "1 1 200px", display: "flex", flexDirection: "column", gap: "3px" }}>
                        <span style={{ fontSize: "var(--text-sm)", fontWeight: "var(--weight-semibold)" }}>Run length</span>
                        <span style={{ fontSize: "var(--text-caption)", color: "var(--fg-subtle)", lineHeight: "var(--lh-compact)" }}>
                          Optional. None by default. A whole number of minutes, hours or days, 1 minute to 7 days.
                        </span>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "var(--space-1-5)" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                          <DS.Switch checked={v.runSw?.aria === 'true'} aria-label="Stop after a set time" onChange={v.runSw?.on} />
                          {v.runLimit ? (
                            <>
                              <DS.Input mono invalid={v.F?.runVal?.bad} style={{ width: "72px" }} value={v.F?.runVal?.val} placeholder="none" aria-label="Run length" aria-invalid={v.F?.runVal?.aria} aria-describedby={v.F?.runVal?.desc} onChange={v.F?.runVal?.onChange} onBlur={v.F?.runVal?.onBlur} onKeyDown={v.F?.runVal?.onKeyDown} />
                              <DS.Select aria-label="Run length unit" value={v.runUnit} onChange={v.setRunUnit} options={[{ value: 'm', label: 'minutes' }, { value: 'h', label: 'hours' }, { value: 'd', label: 'days' }]} style={{ width: "112px" }} />
                            </>
                          ) : null}
                          {v.noRunLimit ? (
                            <span style={{ fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>No limit</span>
                          ) : null}
                        </div>
                        {v.F?.runVal?.bad ? (
                          <DS.FieldError id={v.F?.runVal?.eid} style={{ maxWidth: "280px" }}>{v.F?.runVal?.err}</DS.FieldError>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ) : null}
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "var(--space-2-5) var(--space-4)", opacity: v.phasesOpacity }}>
                  <div role="group" aria-labelledby="s-phases" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "var(--space-2-5) var(--space-4)" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>
                    <span id="s-phases">Phases</span>
                    {v.C?.phases ? (
                      <DS.ChangedMark />
                    ) : null}
                  </span>
                  {(v.phases || []).map((ph, $index) => (
                    <React.Fragment key={$index}>
                      <DS.Checkbox checked={ph?.aria === 'true' || ph?.aria === true} disabled={ph?.dis} onChange={ph?.on} icon={ph?.icon} iconColor={ph?.c}>{ph?.t}</DS.Checkbox>
                    </React.Fragment>
                  ))}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", marginLeft: v.L?.orderMl, opacity: v.orderOpacity, pointerEvents: v.orderPe }}>
                    <span style={{ fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>Order</span>
                    <DS.Segmented ariaLabel="Phase order" {...seg(v.S?.order)} />
                  </div>
                  <span style={{ flexBasis: "100%", fontSize: "var(--text-micro)", color: "var(--fg-subtle)" }}>{v.phasesHelp}</span>
                </div>
              </div>
            </DS.Card>
            <DS.Card as="section" labelledBy="s-conn" icon="layers" title={<span id="s-conn">Connections and limits</span>} padded={false}>
              <div style={{ display: "flex", flexDirection: "column" }}>
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "var(--space-2-5) var(--space-5)", padding: "var(--space-3-5) var(--space-4)", borderBottom: "1px solid var(--border-subtle)" }}>
                  <div style={{ flex: "1 1 240px", display: "flex", flexDirection: "column", gap: "3px" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", fontSize: "var(--text-sm)", fontWeight: "var(--weight-semibold)" }}>
                      Parallel streams
                      {v.C?.streams ? (
                        <DS.ChangedMark />
                      ) : null}
                    </span>
                    <span style={{ fontSize: "var(--text-caption)", color: "var(--fg-subtle)", lineHeight: "var(--lh-compact)" }}>
                      Auto ramps 1 → 2 → 4 → 6 streams and stops when adding streams no longer helps. {'Fixed runs 1–' + v.nCap + '.'} Single shows one connection.
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flexWrap: "wrap" }}>
                    <DS.Segmented ariaLabel="Parallel streams" {...seg(v.S?.streams)} />
                    {v.isFixed ? (
                      <div role="group" aria-label="Stream count" style={{ display: "flex", alignItems: "center", border: "1px solid var(--border-default)", borderRadius: "var(--radius-md)", height: "34px", overflow: "hidden", background: "var(--surface-1)" }}>
                        <DS.Button variant="ghost" size="sm" iconOnly icon="minus" aria-label="Fewer streams" disabled={v.nMin} onClick={v.nDec} style={{ height: "32px", width: "32px", borderRadius: "0" }}></DS.Button>
                        <input type="text" inputMode="numeric" role="spinbutton" aria-label="Streams" aria-valuemin={1} aria-valuemax={v.nCap} aria-valuenow={v.n} value={v.nShown} onChange={v.nType} onKeyDown={v.nKey} onBlur={v.nCommit} style={{ width: "34px", height: "32px", padding: "0", border: "none", outline: "none", background: "transparent", color: "var(--fg)", textAlign: "center", fontFamily: "var(--font-mono)", fontSize: "var(--text-sm)" }} />
                        <DS.Button variant="ghost" size="sm" iconOnly icon="plus" aria-label="More streams" disabled={v.nMax} onClick={v.nInc} style={{ height: "32px", width: "32px", borderRadius: "0" }}></DS.Button>
                      </div>
                    ) : null}
                  </div>
                </div>
                {v.timed ? (
                  <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", gap: "var(--space-3) var(--space-5)", padding: "var(--space-3-5) var(--space-4)", borderBottom: "1px solid var(--border-subtle)" }}>
                    <div style={{ flex: "1 1 240px", display: "flex", flexDirection: "column", gap: "3px" }}>
                      <span style={{ fontSize: "var(--text-sm)", fontWeight: "var(--weight-semibold)" }}>Duration per direction</span>
                      <span style={{ fontSize: "var(--text-caption)", color: "var(--fg-subtle)", lineHeight: "var(--lh-compact)" }}>
                        A direction ends after the minimum once results are stable, and runs up to the maximum on slow or noisy links.
                      </span>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2-5)" }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1-5)" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                          <span style={{ width: "118px", display: "flex", alignItems: "center", gap: "var(--space-1-5)", fontSize: "var(--text-sm)" }}>
                            <span style={{ color: "var(--series-download)", display: "flex" }}><DS.Icon name="arrow-down" size={14} stroke={2} /></span>
                            Download
                            {v.C?.dl ? (
                              <span style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-1)", fontSize: "var(--text-micro)", fontWeight: "var(--weight-medium)", color: "var(--primary-text)" }}>
                                <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--primary)" }} />
                                custom
                              </span>
                            ) : null}
                          </span>
                          <DS.Input mono invalid={v.F?.dlMin?.bad} suffix="s" style={{ width: "76px" }} value={v.F?.dlMin?.val} aria-label="Download minimum seconds" aria-invalid={v.F?.dlMin?.aria} aria-describedby={v.F?.dlMin?.desc} onChange={v.F?.dlMin?.onChange} onBlur={v.F?.dlMin?.onBlur} onKeyDown={v.F?.dlMin?.onKeyDown} />
                          <span style={{ color: "var(--fg-subtle)" }}>–</span>
                          <DS.Input mono invalid={v.F?.dlMax?.bad} suffix="s" style={{ width: "76px" }} value={v.F?.dlMax?.val} aria-label="Download maximum seconds" aria-invalid={v.F?.dlMax?.aria} aria-describedby={v.F?.dlMax?.desc} onChange={v.F?.dlMax?.onChange} onBlur={v.F?.dlMax?.onBlur} onKeyDown={v.F?.dlMax?.onKeyDown} />
                        </div>
                        {v.F?.dlMin?.bad ? (
                          <DS.FieldError id={v.F?.dlMin?.eid} style={{ maxWidth: "320px" }}>{v.F?.dlMin?.err}</DS.FieldError>
                        ) : null}
                        {v.F?.dlMax?.bad ? (
                          <DS.FieldError id={v.F?.dlMax?.eid} style={{ maxWidth: "320px" }}>{v.F?.dlMax?.err}</DS.FieldError>
                        ) : null}
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1-5)" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                          <span style={{ width: "118px", display: "flex", alignItems: "center", gap: "var(--space-1-5)", fontSize: "var(--text-sm)" }}>
                            <span style={{ color: "var(--series-upload)", display: "flex" }}><DS.Icon name="arrow-up" size={14} stroke={2} /></span>
                            Upload
                            {v.C?.ul ? (
                              <span style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-1)", fontSize: "var(--text-micro)", fontWeight: "var(--weight-medium)", color: "var(--primary-text)" }}>
                                <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--primary)" }} />
                                custom
                              </span>
                            ) : null}
                          </span>
                          <DS.Input mono invalid={v.F?.ulMin?.bad} suffix="s" style={{ width: "76px" }} value={v.F?.ulMin?.val} aria-label="Upload minimum seconds" aria-invalid={v.F?.ulMin?.aria} aria-describedby={v.F?.ulMin?.desc} onChange={v.F?.ulMin?.onChange} onBlur={v.F?.ulMin?.onBlur} onKeyDown={v.F?.ulMin?.onKeyDown} />
                          <span style={{ color: "var(--fg-subtle)" }}>–</span>
                          <DS.Input mono invalid={v.F?.ulMax?.bad} suffix="s" style={{ width: "76px" }} value={v.F?.ulMax?.val} aria-label="Upload maximum seconds" aria-invalid={v.F?.ulMax?.aria} aria-describedby={v.F?.ulMax?.desc} onChange={v.F?.ulMax?.onChange} onBlur={v.F?.ulMax?.onBlur} onKeyDown={v.F?.ulMax?.onKeyDown} />
                        </div>
                        {v.F?.ulMin?.bad ? (
                          <DS.FieldError id={v.F?.ulMin?.eid} style={{ maxWidth: "320px" }}>{v.F?.ulMin?.err}</DS.FieldError>
                        ) : null}
                        {v.F?.ulMax?.bad ? (
                          <DS.FieldError id={v.F?.ulMax?.eid} style={{ maxWidth: "320px" }}>{v.F?.ulMax?.err}</DS.FieldError>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ) : null}
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "var(--space-2-5) var(--space-5)", padding: "var(--space-3-5) var(--space-4)" }}>
                  <div style={{ flex: "1 1 240px", display: "flex", flexDirection: "column", gap: "3px" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", fontSize: "var(--text-sm)", fontWeight: "var(--weight-semibold)" }}>
                      Data cap per test
                      {v.C?.cap ? (
                        <DS.ChangedMark />
                      ) : null}
                    </span>
                    <span style={{ fontSize: "var(--text-caption)", color: "var(--fg-subtle)", lineHeight: "var(--lh-compact)" }}>
                      Useful on metered mobile links. A direction stops early when the cap is reached and the result is marked.
                    </span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "var(--space-1-5)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2-5)" }}>
                      <DS.Switch checked={v.capSw?.aria === 'true'} aria-label="Data cap" onChange={v.capSw?.on} />
                      <DS.Input mono invalid={v.F?.capMB?.bad} suffix="MB" style={{ width: "110px", opacity: v.capOpacity }} value={v.F?.capMB?.val} disabled={v.capOff} aria-label="Data cap in MB" aria-invalid={v.F?.capMB?.aria} aria-describedby={v.F?.capMB?.desc} onChange={v.F?.capMB?.onChange} onBlur={v.F?.capMB?.onBlur} onKeyDown={v.F?.capMB?.onKeyDown} />
                    </div>
                    {v.F?.capMB?.bad ? (
                      <DS.FieldError id={v.F?.capMB?.eid} style={{ maxWidth: "280px" }}>{v.F?.capMB?.err}</DS.FieldError>
                    ) : null}
                  </div>
                </div>
              </div>
            </DS.Card>
            <DS.Card as="section" labelledBy="s-disp" icon="monitor" title={<span id="s-disp">Display and behavior</span>} padded={false}>
              <div style={{ display: "flex", flexDirection: "column" }}>
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "var(--space-2-5) var(--space-5)", padding: "var(--space-3-5) var(--space-4)", borderBottom: "1px solid var(--border-subtle)" }}>
                  <div style={{ flex: "1 1 240px", display: "flex", flexDirection: "column", gap: "3px" }}>
                    <label htmlFor="s-label" style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", fontSize: "var(--text-sm)", fontWeight: "var(--weight-semibold)" }}>
                      Result label
                      {v.C?.label ? (
                        <DS.ChangedMark />
                      ) : null}
                    </label>
                    <span id="s-label-d" style={{ fontSize: "var(--text-caption)", color: "var(--fg-subtle)", lineHeight: "var(--lh-compact)" }}>
                      Optional, up to 64 characters. Pre-fills the label of every result in this browser.
                    </span>
                  </div>
                  <DS.Input id="s-label" value={v.label} onChange={v.setLabel} maxLength={64} placeholder="None" aria-describedby="s-label-d" suffix={<span className="ds-mono-sm" aria-hidden="true">{v.labelCount}</span>} style={{ width: "200px" }} />
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "var(--space-2-5) var(--space-5)", padding: "var(--space-3-5) var(--space-4)", borderBottom: "1px solid var(--border-subtle)" }}>
                  <div style={{ flex: "1 1 240px" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", fontSize: "var(--text-sm)", fontWeight: "var(--weight-semibold)" }}>
                      Units
                      {v.C?.units ? (
                        <DS.ChangedMark />
                      ) : null}
                    </span>
                  </div>
                  <DS.Segmented ariaLabel="Units" {...seg(v.S?.units)} />
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "var(--space-2-5) var(--space-5)", padding: "var(--space-3-5) var(--space-4)", borderBottom: "1px solid var(--border-subtle)" }}>
                  <div style={{ flex: "1 1 240px" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", fontSize: "var(--text-sm)", fontWeight: "var(--weight-semibold)" }}>
                      Theme
                      {v.C?.theme ? (
                        <DS.ChangedMark />
                      ) : null}
                    </span>
                  </div>
                  <DS.Segmented ariaLabel="Theme" {...seg(v.S?.theme)} />
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "var(--space-2-5) var(--space-5)", padding: "var(--space-3-5) var(--space-4)", borderBottom: "1px solid var(--border-subtle)" }}>
                  <div style={{ flex: "1 1 240px", display: "flex", flexDirection: "column", gap: "3px" }}>
                    <span style={{ fontSize: "var(--text-sm)", fontWeight: "var(--weight-semibold)" }}>Language</span>
                    <span style={{ fontSize: "var(--text-caption)", color: "var(--fg-subtle)", lineHeight: "var(--lh-compact)" }}>Only shipped languages are listed.</span>
                  </div>
                  <DS.Select icon="languages" aria-label="Language" options={['English']} style={{ width: "200px" }} />
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "var(--space-2-5) var(--space-5)", padding: "var(--space-3-5) var(--space-4)" }}>
                  <div style={{ flex: "1 1 240px", display: "flex", flexDirection: "column", gap: "3px" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", fontSize: "var(--text-sm)", fontWeight: "var(--weight-semibold)" }}>
                      Auto-start on page load
                      {v.C?.auto ? (
                        <DS.ChangedMark />
                      ) : null}
                    </span>
                    <span style={{ fontSize: "var(--text-caption)", color: "var(--fg-subtle)", lineHeight: "var(--lh-compact)" }}>
                      {"Shows a countdown first, so you can cancel. Also available as "}
                      <span style={{ fontFamily: "var(--font-mono)" }}>?run=1</span>
                      .
                    </span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "var(--space-1-5)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2-5)" }}>
                      <DS.Switch checked={v.autoSw?.aria === 'true'} aria-label="Auto-start" onChange={v.autoSw?.on} />
                      <DS.Input mono invalid={v.F?.countdown?.bad} suffix="s" style={{ width: "96px", opacity: v.autoOpacity }} value={v.F?.countdown?.val} disabled={v.autoOff} aria-label="Countdown seconds" aria-invalid={v.F?.countdown?.aria} aria-describedby={v.F?.countdown?.desc} onChange={v.F?.countdown?.onChange} onBlur={v.F?.countdown?.onBlur} onKeyDown={v.F?.countdown?.onKeyDown} />
                    </div>
                    {v.F?.countdown?.bad ? (
                      <DS.FieldError id={v.F?.countdown?.eid} style={{ maxWidth: "280px" }}>{v.F?.countdown?.err}</DS.FieldError>
                    ) : null}
                  </div>
                </div>
              </div>
            </DS.Card>
            <DS.Card as="section" labelledBy="s-adv" padded={false}>
              <h2 style={{ margin: "0", font: "inherit" }}><button type="button" className="disclosure" aria-expanded={v.advAria} aria-controls="adv-body" onClick={v.toggleAdv}>
                <span className="ic"><DS.Icon name="sliders" size={15} /></span>
                <span className="t" id="s-adv">Advanced</span>
                <span className="sum">{v.advSummary}</span>
                <span className="chev"><DS.Icon name={v.advIcon} size={16} /></span>
              </button></h2>
              {v.advOpen ? (
                <div id="adv-body">
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "var(--space-2-5) var(--space-5)", padding: "var(--space-3-5) var(--space-4)", borderTop: "1px solid var(--border-subtle)" }}>
                  <div style={{ flex: "1 1 240px", display: "flex", flexDirection: "column", gap: "var(--space-0-5)" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", fontSize: "var(--text-sm)", fontWeight: "var(--weight-semibold)" }}>Warm-up{v.C?.warm ? <DS.ChangedMark /> : null}</span>
                    <span className="ds-caption" style={{ lineHeight: "var(--lh-compact)" }}>Auto ends warm-up once throughput settles. Samples during warm-up are discarded.</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "var(--space-1-5)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                      <DS.Segmented ariaLabel="Warm-up" {...seg(v.S?.warm)} />
                      {v.warmFixed ? <DS.Input mono invalid={v.F?.warmS?.bad} suffix="s" style={{ width: "84px" }} value={v.F?.warmS?.val} aria-label="Warm-up seconds" aria-describedby={v.F?.warmS?.desc} onChange={v.F?.warmS?.onChange} onBlur={v.F?.warmS?.onBlur} onKeyDown={v.F?.warmS?.onKeyDown} /> : null}
                    </div>
                    {v.F?.warmS?.bad ? <DS.FieldError id={v.F?.warmS?.eid} style={{ maxWidth: "280px" }}>{v.F?.warmS?.err}</DS.FieldError> : null}
                  </div>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "var(--space-2-5) var(--space-5)", padding: "var(--space-3-5) var(--space-4)", borderTop: "1px solid var(--border-subtle)" }}>
                  <div style={{ flex: "1 1 240px", display: "flex", flexDirection: "column", gap: "var(--space-0-5)" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", fontSize: "var(--text-sm)", fontWeight: "var(--weight-semibold)" }}>Ping count{v.C?.pings ? <DS.ChangedMark /> : null}</span>
                    <span className="ds-caption" style={{ lineHeight: "var(--lh-compact)" }}>Used for idle latency and jitter. {v.pingsHelp}</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "var(--space-1-5)" }}>
                    <DS.Input mono invalid={v.F?.pings?.bad} suffix="pings" style={{ width: "110px" }} value={v.F?.pings?.val} aria-label="Ping count" aria-describedby={v.F?.pings?.desc} onChange={v.F?.pings?.onChange} onBlur={v.F?.pings?.onBlur} onKeyDown={v.F?.pings?.onKeyDown} />
                    {v.F?.pings?.bad ? <DS.FieldError id={v.F?.pings?.eid} style={{ maxWidth: "280px" }}>{v.F?.pings?.err}</DS.FieldError> : null}
                  </div>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "var(--space-2-5) var(--space-5)", padding: "var(--space-3-5) var(--space-4)", borderTop: "1px solid var(--border-subtle)" }}>
                  <div style={{ flex: "1 1 240px", display: "flex", flexDirection: "column", gap: "var(--space-0-5)" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", fontSize: "var(--text-sm)", fontWeight: "var(--weight-semibold)" }}>Overhead compensation{v.C?.overhead ? <DS.ChangedMark /> : null}</span>
                    <span className="ds-caption" style={{ lineHeight: "var(--lh-compact)" }}>Adds estimated protocol overhead to measured throughput. Shown next to every number when not 0 %.</span>
                    {v.C?.overhead ? <span className="ds-caption" style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", marginTop: "var(--space-1)" }}>Shown as <span className="ds-num" style={{ color: "var(--fg)" }}>941 Mbit/s</span><DS.Chip size="sm">{'+' + v.overhead + ' % overhead compensation'}</DS.Chip></span> : null}
                  </div>
                  <DS.Select aria-label="Overhead compensation" value={v.overhead} onChange={v.setOverhead} options={(v.overheadOpts || []).map(o => ({ value: o.v, label: o.t }))} style={{ width: "240px" }} />
                </div>
                </div>
              ) : null}
            </DS.Card>
          </div>
          <aside style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)", minWidth: "0" }}>
            <DS.Card as="section" labelledBy="s-share" icon="link" title={<span id="s-share">Shareable link</span>}>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2-5)" }}>
                <span style={{ fontSize: "var(--text-caption)", color: "var(--fg-subtle)", lineHeight: "var(--lh-compact)" }}>
                  Opens BitGauge with the settings that differ from the defaults.
                </span>
                <div style={{ display: "flex", gap: "var(--space-1-5)" }}>
                  <DS.Input mono readOnly value={v.url} aria-label="Shareable URL" style={{ flex: "1", minWidth: "0" }} />
                  <DS.Button iconOnly icon={v.copyIcon} aria-label="Copy link" onClick={v.copyUrl} />
                </div>
                <DS.Checkbox size="sm" checked={v.incRunAria === 'true' || v.incRunAria === true} onChange={v.toggleIncRun}>{"Include "}<code className="ds-num" style={{ fontSize: "inherit" }}>run=1</code>{" (start automatically)"}</DS.Checkbox>
                {v.hasNotInUrl ? (
                  <span style={{ display: "flex", alignItems: "flex-start", gap: "var(--space-1-5)", fontSize: "var(--text-micro)", color: "var(--fg-subtle)", lineHeight: "var(--lh-compact)" }}>
                    <span style={{ display: "flex", marginTop: "1px" }}><DS.Icon name="info" size={12} /></span>
                    {"Not in the link: "}{v.notInUrl}
                  </span>
                ) : null}
              </div>
            </DS.Card>
            <DS.Card as="section" labelledBy="s-changed" icon="sliders" title={<span id="s-changed">Changed from defaults</span>} actions={<span className="ds-mono-sm">{v.changedCount}</span>} padded={false}>
              {v.hasChanges ? (
                <ul style={{ margin: "0", listStyle: "none", padding: "var(--space-1) var(--space-4) var(--space-1)" }}>
                  {(v.changed || []).map((c, $index) => (
                    <React.Fragment key={$index}>
                      <li style={{ display: "flex", alignItems: "center", gap: "var(--space-2-5)", padding: "var(--space-2) 0", borderBottom: "1px solid var(--border-subtle)" }}>
                        <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column" }}>
                          <span style={{ fontSize: "var(--text-sm)" }}>{c?.k}</span>
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-micro)", color: "var(--fg-subtle)" }}>{"default "}{c?.d}</span>
                        </span>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-caption)", color: "var(--primary-text)", textAlign: "right" }}>{c?.v}</span>
                        <DS.Button variant="ghost" size="sm" iconOnly icon="rotate-ccw" aria-label={c?.label} title={c?.label} onClick={c?.reset} style={{ width: "28px" }}></DS.Button>
                      </li>
                    </React.Fragment>
                  ))}
                </ul>
              ) : null}
              {v.noChanges ? (
                <div style={{ padding: "var(--space-3-5) var(--space-4) var(--space-0-5)", fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>Everything is at its default.</div>
              ) : null}
              <div style={{ padding: "var(--space-3) var(--space-4)" }}>
                <DS.Button variant="danger" size="sm" icon="rotate-ccw" disabled={v.noChanges} onClick={v.openReset} style={{ width: "100%", justifyContent: "center" }}>Reset all to defaults</DS.Button>
              </div>
            </DS.Card>
          </aside>
        </main>
        {v.mobile ? (
          <div style={{ marginTop: "auto", height: "64px", flex: "none" }}><div style={{ position: "fixed", left: "0", right: "0", bottom: "0", zIndex: "var(--z-nav)" }}><Nav variant="mobile-bottom" active="settings" status={this.props.srvStatus || "connected"} /></div></div>
        ) : null}
        {v.confirm ? (
          <DS.Dialog tone="danger" icon="rotate-ccw" title="Reset all settings?" onClose={v.closeReset} align={v.mobile ? 'top' : 'center'} footerStack={v.mobile}
            footer={<><DS.Button onClick={v.closeReset}>Cancel</DS.Button><DS.Button variant="danger" icon="rotate-ccw" onClick={v.doReset}>Reset all</DS.Button></>}>{v.resetLine}</DS.Dialog>
        ) : null}
        {v.keepAsk ? (
          <DS.Dialog icon="timer" title={v.keepTitle} onClose={v.keepCancel} align={v.mobile ? 'top' : 'center'} footerStack={v.mobile}
            footer={<><DS.Button variant="ghost" onClick={v.keepCancel}>Cancel</DS.Button><span style={{ flex: "1" }} /><DS.Button onClick={v.keepPreset}>{v.keepUse}</DS.Button><DS.Button variant="primary" onClick={v.keepCustom}>Keep custom durations</DS.Button></>}>{v.keepLine}</DS.Dialog>
        ) : null}
      </div>
    );
  }
}

window.Settings = Settings;
