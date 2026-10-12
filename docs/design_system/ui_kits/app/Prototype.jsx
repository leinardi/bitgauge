/* BitGauge web UI kit — Prototype
 * ThemeSync mirrors the active theme onto <html> so content outside the app wrapper (Demo panel, scrollbars) follows it. */
function ThemeSync({ theme }) { React.useEffect(() => { document.documentElement.setAttribute('data-theme', theme); }, [theme]); return null; }
/*
 * Props:
 *   scenario: "normal" | "error" | "slow" | "autostart" | "continuous"  (default "normal")
 *   speed: "1" | "2" | "4"  (default "1")
 *   mobile: boolean  (default false)
 * Theme, units and every test setting are real product state: they live here,
 * are changed from Settings (theme also from the header) and persist in this
 * browser, like the product does.
 */
const PREFS_KEY = 'bitgauge-kit-prefs';
const DESKTOP_MIN = 1140;
const CHIP_ICONS = { 'Preset': 'gauge', 'Parallel streams': 'layers', 'Download duration': 'timer', 'Upload duration': 'timer', 'Phases': 'list', 'Phase order': 'arrow-up-down', 'Data cap': 'database', 'Units': 'sliders', 'Auto-start': 'play', 'Warm-up': 'hourglass', 'Ping count': 'activity', 'Overhead': 'sliders' };
class Prototype extends React.Component {
  state = Object.assign({ screen: 'test', ts: 'idle', p: null, hv: 'populated', theme: 'dark', settings: null, changed: [] },
    (() => { try { return JSON.parse(localStorage.getItem(PREFS_KEY) || '{}'); } catch (e) { return {}; } })());
  savePrefs(patch) {
    this.setState(patch, () => { try { const { theme, settings, changed } = this.state; localStorage.setItem(PREFS_KEY, JSON.stringify({ theme, settings, changed: changed.map(c => ({ k: c.k, v: c.v })) })); } catch (e) {} });
  }
  onSettings(st, changed) {
    const patch = { settings: Object.assign({}, st, { copied: false, confirm: false }), changed: (changed || []).map(c => ({ k: c.k, v: c.v })) };
    if (st.theme && st.theme !== this.state.theme) patch.theme = st.theme;
    this.savePrefs(patch);
  }
  prefs() {
    const s = this.state.settings, ch = (this.state.changed || []).filter(c => c.k !== 'Theme');
    return {
      units: (s && s.units) || 'bits',
      overhead: s && s.overhead && s.overhead !== '0' ? s.overhead : false,
      custom: ch.some(c => c.k !== 'Units'),
      chips: ch.length ? ch.map(c => ({ t: c.k === 'Preset' ? c.v : c.k + ' · ' + c.v, icon: CHIP_ICONS[c.k] || 'sliders' })) : null
    };
  }
  SEQ = {
    normal: { segs: [['connecting', 0.6, 0.6], ['latency', 2, 2], ['download', 12, 12], ['upload', 12, 12]], end: 'complete' },
    error: { segs: [['connecting', 0.6, 0.6], ['latency', 2, 2], ['download', 6.4, 12]], end: 'error' },
    slow: { segs: [['connecting', 0.6, 0.6], ['slow', 20, 20]], end: 'slowdone' },
    countdown: { segs: [['countdown', 3, 3]], end: null, then: 'normal' },
    continuous: { segs: [], end: 'continuous' }
  };
  scen() { return this.props.scenario || 'normal'; }
  speed() { return parseFloat(this.props.speed || '1') || 1; }
  componentDidMount() {
    this._k = e => {
      if (e.defaultPrevented || e.isComposing || e.keyCode === 229) return;
      // Escape stops a run or cancels the countdown from anywhere (dialogs handle their own Escape first).
      if (e.key === 'Escape') { if (this.running() || this.state.ts === 'continuous') this.stop(); return; }
      if (e.key !== 'Enter' || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      if (this.state.screen !== 'test' || this.running()) return;
      if (document.querySelector('dialog[open], [role="dialog"], [role="alertdialog"], [aria-modal="true"]')) return;
      // Only from the page body or a non-interactive element; focused links/buttons/fields keep native Enter.
      const t = e.target;
      if (t && t.closest && t.closest('a[href], button, input, select, textarea, summary, [contenteditable]:not([contenteditable="false"]), [role="button"], [role="link"], [role="menuitem"], [role="tab"], [role="checkbox"], [role="radio"], [role="switch"], [role="option"], [role="combobox"], [role="textbox"]')) return;
      e.preventDefault(); this.start();
    };
    window.addEventListener('keydown', this._k);
    // Desktop layouts are fully supported from DESKTOP_MIN px; narrower windows switch to the mobile layout.
    this._rs = () => { const n = window.innerWidth < DESKTOP_MIN; if (n !== this.state.narrow) this.setState({ narrow: n }); };
    window.addEventListener('resize', this._rs);
    this._rs();
    this.reset();
  }
  componentDidUpdate(pp) { if (pp.scenario !== this.props.scenario) this.reset(); }
  componentWillUnmount() { clearInterval(this._t); window.removeEventListener('keydown', this._k); window.removeEventListener('resize', this._rs); }
  running() { return !!this._t; }
  halt() { clearInterval(this._t); this._t = null; }
  reset() {
    this.halt();
    if (this.scen() === 'autostart') this.run('countdown');
    else this.setState({ ts: 'idle', p: null });
  }
  start(forceNormal) {
    const s = this.scen();
    this.run(forceNormal || s === 'autostart' ? 'normal' : s);
  }
  run(name) {
    this.halt();
    const q = this.SEQ[name];
    if (!q.segs.length) { this.setState({ screen: 'test', ts: q.end, p: null }); return; }
    let i = 0, el = 0;
    this.setState({ screen: 'test', ts: q.segs[0][0], p: 0 });
    this._t = setInterval(() => {
      el += 0.1 * this.speed();
      const seg = q.segs[i];
      if (el >= seg[1]) {
        i++; el = 0;
        if (i >= q.segs.length) {
          this.halt();
          if (q.then) return this.run(q.then);
          return this.setState({ ts: q.end, p: null });
        }
      }
      const cur = q.segs[i];
      this.setState({ ts: cur[0], p: Math.min(1, el / cur[2]) });
    }, 100);
  }
  stop() {
    if (!this.running() && this.state.ts !== 'continuous') return;
    const ts = this.state.ts;
    this.halt();
    // Upload needs a confirmed steady window ≥ 3 s (warm-up ends ~4 s) for a partial value.
    const late = ts === 'upload' && (this.state.p || 0) * 12 >= 8.5;
    this.setState({ ts: ts === 'upload' ? (late ? 'cancelled-late' : 'cancelled') : 'idle', p: null });
  }
  setTheme(theme) { this.savePrefs({ theme, settings: this.state.settings ? Object.assign({}, this.state.settings, { theme }) : this.state.settings }); }
  go(screen, extra) { this.setState(Object.assign({ screen }, extra || {})); window.scrollTo(0, 0); }
  route(t, el) {
    const S = this.state.screen, has = (...a) => a.some(x => t === x), sw = (...a) => a.some(x => t.startsWith(x));
    if (t === 'BitGauge home' || t === 'Test') return this.go('test');
    if (t === 'History') return this.go('history', { hv: 'populated' });
    if (t === 'Settings') return this.go('settings');
    if (t === 'About') return this.go('about');
    if (has('Light', 'Dark', 'Follow system')) return this.setTheme(t === 'Light' ? 'light' : t === 'Dark' ? 'dark' : 'system');
    if (sw('Theme:')) { const o = ['light', 'dark', 'system'], c = this.theme(); return this.setTheme(o[(o.indexOf(c) + 1) % 3]); }
    if (sw('Retry test')) return this.start(true);
    if (sw('Start test', 'Start now', 'Run again', 'Start a test')) return this.start();
    if (sw('Stop test')) return this.stop();
    if (sw('Details', 'Last test')) return this.go('result');
    if (sw('Keep as incomplete')) return this.go('history', { hv: 'populated' });
    if (sw('Edit', 'Change cap')) return this.go('settings');
    if (S === 'test' && t === 'Cancel') { this.halt(); return this.setState({ ts: 'idle', p: null }); }
    if (S === 'history') {
      const hv = this.state.hv, set = v => this.setState({ hv: v });
      if (t === 'Compare') return set('compare');
      if (has('Done', 'Close', 'Cancel', 'Apply', 'Dismiss', 'Choose another file', 'Export JSON first', 'Clear selection')) return set('populated');
      if (t === 'Clear all') return set('confirm');
      if (sw('Clear 48')) return set('empty');
      if (sw('Export JSON', 'Export CSV')) return set('populated');
      if (sw('Export')) return set(hv === 'export' ? 'populated' : 'export');
      if (sw('Last 30 days')) return set(hv === 'daterange' ? 'populated' : 'daterange');
      if (sw('Import JSON')) return set('importerror');
      if (el.tagName === 'A' && el.closest('main')) return this.go('result');
    }
  }
  theme() { return this.state.theme || 'dark'; }
  renderVals() {
    const m = (!!this.props.mobile && this.props.mobile !== 'false') || !!this.state.narrow;
    const th = this.theme();
    const sysDark = typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches;
    const S = this.state.screen;
    return {
      ts: this.state.ts, p: this.state.p, hv: this.state.hv, mobile: m, theme: th,
      themeAttr: th === 'system' ? (sysDark ? 'dark' : 'light') : th,
      frameW: m && !this.state.narrow ? '390px' : 'none', frameBd: m && !this.state.narrow ? '1px solid var(--border-subtle)' : 'none',
      testExtra: Object.assign(this.prefs(), this.props.testExtra), saved: this.state.settings, onSettings: (st, ch) => this.onSettings(st, ch), historyExtra: this.props.historyExtra, resultExtra: this.props.resultExtra, settingsExtra: this.props.settingsExtra, aboutExtra: this.props.aboutExtra,
      isTest: S === 'test', isHistory: S === 'history', isResult: S === 'result', isSettings: S === 'settings', isAbout: S === 'about',
      onClick: e => {
        const el = e.target.closest && e.target.closest('a,button');
        if (!el) return;
        if (el.tagName === 'A' && el.getAttribute('href') === '#') e.preventDefault();
        const t = (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim();
        this.route(t, el);
      }
    };
  }
  render() {
    const v = this.renderVals();
    return (
      <BGPrefs.Provider value={{ theme: v.theme }}>
      <ThemeSync theme={v.themeAttr} />
      <div data-theme={v.themeAttr} onClickCapture={v.onClick} style={{ minHeight: "100vh", background: "var(--bg-base)", color: "var(--fg)", fontFamily: "var(--font-sans)", display: "flex", justifyContent: "center" }}>
        <div style={{ width: "100%", maxWidth: v.frameW, minHeight: "100vh", display: "flex", flexDirection: "column", borderLeft: v.frameBd, borderRight: v.frameBd }}>
          {v.isTest ? (
            <TestScreen state={v.ts} progress={v.p} mobile={v.mobile} theme={v.theme} {...(v.testExtra || {})} />
          ) : null}
          {v.isHistory ? (
            <History variant={v.hv} mobile={v.mobile} {...(v.historyExtra || {})} />
          ) : null}
          {v.isResult ? (
            <ResultDetail mobile={v.mobile} {...(v.resultExtra || {})} />
          ) : null}
          {v.isSettings ? (
            <Settings mobile={v.mobile} preset="standard" theme={v.theme} saved={v.saved} onSettings={v.onSettings} {...(v.settingsExtra || {})} />
          ) : null}
          {v.isAbout ? (
            <About mobile={v.mobile} {...(v.aboutExtra || {})} />
          ) : null}
        </div>
      </div>
      </BGPrefs.Provider>
    );
  }
}

window.Prototype = Prototype;
