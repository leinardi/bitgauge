/* BitGauge web UI kit — App
 * Mounts the clickable prototype and the Demo state panel.
 * The panel is kit-only debug scaffolding: it drives scenarios and forces the
 * states the product reaches through real conditions (offline, base-path
 * mismatch, fallbacks, history variants…). It is not a product control.
 * Anything the product itself lets you change (theme, units, test settings,
 * chart/table toggles, share, keep in history) is changed in the UI, not here.
 */
const DEMO_KEY = 'bitgauge-kit-demo';
const CONF_OPTS = [['normal', 'normal'], ['low:ramp-unsettled', 'low · ramp unsettled'], ['low:unstable', 'low · unstable'], ['low:ramp-unsettled,unstable', 'low · ramp unsettled, unstable'], ['low:insufficient-samples,unstable', 'low · insufficient samples, unstable'], ['cpu-bound', 'CPU-bound']];
const DEMO_DEFAULTS = {
  scenario: 'normal', speed: '1', mobile: false,
  testState: '', scope: 'v0.2', cpu: false, llGap: 'none', wsClose: false, browser: 'Firefox', uploadPauses: false,
  errKind: 'requests', probe: 'auto', resp: 'ok', timerRes: '0.1',
  historyVariant: '', resultState: 'result', resultKind: 'standard', resultDemo: 'none', resultOverhead: '0', resultConfDown: 'normal', resultConfUp: 'normal',
  openspeedtest: true, librespeed: true, networkquality: true, aboutUnreachable: false
};
const TEST_STATES = ['idle', 'countdown', 'connecting', 'latency', 'download', 'upload', 'complete', 'upload-interrupted', 'error', 'error-early', 'cancelled', 'cancelled-late', 'cancelled-latency', 'cancelled-download', 'cancelled-slow', 'cancelled-slow-up', 'slow', 'slowdone', 'continuous', 'cont-warmup', 'cont-done', 'offline', 'basepath', 'ws-fallback', 'insufficient', 'param-ignored'];
// v0.3-only Force-state entries (Continuous); hidden, not renamed, in v0.1 and v0.2.
const V03_STATES = ['continuous', 'cont-warmup', 'cont-done'];
const SCOPES = ['v0.1', 'v0.2', 'v0.3'];
// no-steady-window and no-probe-path never reach a complete run (measurement §11.1, §11.4): the Test screen and Result
// detail draw them on a run stopped in the upload, partial and not saved.
const LL_GAPS = [['none', 'measured'], ['no-steady-window', 'no steady window · stopped 3.1 s into upload'], ['insufficient-samples', 'fewer than 10 samples'], ['reservation-broken', 'HTTP/1.1 reservation not held'], ['no-probe-path', 'no latency probe · WebSocket lost, stopped 0.8 s into upload']];
const HISTORY_VARIANTS = ['populated', 'single', 'select3', 'deleted', 'compare', 'confirm', 'export', 'daterange', 'loading', 'nomatch', 'empty', 'unavailable', 'importing', 'importresult', 'importerror', 'safari'];

function DemoSelect({ label, value, options, onChange }) {
  return (
    <label className="demo-row">
      <span>{label}</span>
      <span className="input sm">
        <select value={value} onChange={e => onChange(e.target.value)}>
          {options.map(o => Array.isArray(o)
            ? <option key={o[0]} value={o[0]}>{o[1]}</option>
            : <option key={o} value={o}>{o}</option>)}
        </select>
      </span>
    </label>
  );
}
function DemoSeg({ label, value, options, onChange }) {
  return (
    <div className="demo-row">
      <span>{label}</span>
      <div className="seg seg-sm">
        {options.map(([k, l]) => (
          <button key={k} type="button" className={'seg-btn' + (value === k ? ' on' : '')} onClick={() => onChange(k)}>{l}</button>
        ))}
      </div>
    </div>
  );
}
function DemoCheck({ label, value, onChange }) {
  return (
    <label className="demo-chk"><input type="checkbox" checked={!!value} onChange={e => onChange(e.target.checked)} />{label}</label>
  );
}

function DemoPanel({ d, set, reset }) {
  const v03 = d.scope === 'v0.3', v01 = d.scope === 'v0.1';
  const [open, setOpenRaw] = React.useState(() => localStorage.getItem(DEMO_KEY + '-open') === '1');
  const setOpen = o => { setOpenRaw(o); try { localStorage.setItem(DEMO_KEY + '-open', o ? '1' : '0'); } catch (e) {} };
  return (
    <aside className={'demo' + (open ? '' : ' closed')} aria-label="Demo state" data-modal-exempt="">
      <div className="demo-h" onClick={open ? undefined : () => setOpen(true)} style={open ? undefined : { cursor: 'pointer' }}>
        <DS.Icon name="sliders" size={14} style={{ color: 'var(--primary-text)' }} />
        <span className="t">Demo<span className="t-long"> state{open ? '' : ' \u00b7 ' + (d.mobile ? 'Mobile' : 'Auto') + ' \u00b7 ' + d.scenario}</span></span>
        {open ? <button type="button" className="btn ghost sm" onClick={reset}>Reset</button> : null}
        <button type="button" className="btn ghost sm icon" aria-label={open ? 'Collapse demo panel' : 'Expand demo panel'} onClick={() => setOpen(!open)}>
          <DS.Icon name={open ? 'chevron-up' : 'chevron-down'} size={14} />
        </button>
      </div>
      {open ? (
        <div className="demo-b">
          <div className="demo-sec">
            <span className="st">Run</span>
            <DemoSelect label="Scenario" value={!v03 && d.scenario === 'continuous' ? 'normal' : d.scenario} options={['normal', 'error', 'slow', 'autostart'].concat(v03 ? ['continuous'] : [])} onChange={v => set({ scenario: v, testState: '' })} />
            <DemoSeg label="Speed" value={d.speed} options={[['1', '1×'], ['2', '2×'], ['4', '4×']]} onChange={v => set({ speed: v })} />
            <span className="demo-note">Start with the button or Enter; Escape stops.</span>
          </div>
          <div className="demo-sec">
            <span className="st">View</span>
            <DemoSeg label="Frame" value={d.mobile ? 'm' : 'd'} options={[['d', 'Auto'], ['m', 'Mobile']]} onChange={v => set({ mobile: v === 'm' })} />
            <span className="demo-note">Auto: desktop from 1140 px wide, mobile below.</span>
            <DemoSeg label="Scope" value={d.scope} options={SCOPES.map(s => [s, s])} onChange={v => set({ scope: v })} />
            <span className="demo-note">{v01 ? 'v0.1: test only — no history, settings, share or loaded latency.' : v03 ? 'v0.3: adds RPM, quality scores, Continuous and other-client snippets.' : 'v0.2: adds history, Result detail, Settings, share, loaded latency and grade.'}</span>
          </div>
          <div className="demo-sec">
            <span className="st">Test screen</span>
            <DemoSelect label="Force state" value={d.testState} options={[['', 'follow run'], ...TEST_STATES.filter(s => v03 || !V03_STATES.includes(s))]} onChange={v => set({ testState: v })} />
            <span className="demo-note">Version scope applies to every screen and the navigation: see View.</span>
            <DemoCheck label="CPU-bound" value={d.cpu} onChange={v => set({ cpu: v })} />
            <DemoSelect label="Error kind" value={d.errKind} options={['requests', 'unreachable', 'restarted', 'network']} onChange={v => set({ errKind: v })} />
            <DemoSelect label="Latency probe" value={d.probe} options={['auto', 'WebSocket', 'HTTP/2 probe', 'HTTP/3 probe', 'HTTP/1.1 reserved']} onChange={v => set({ probe: v })} />
            {!v01 ? <DemoCheck label="WebSocket closes after idle latency" value={d.wsClose} onChange={v => set({ wsClose: v })} /> : null}
            {!v01 ? <DemoSelect label="Upload loaded lat." value={d.llGap} options={LL_GAPS} onChange={v => set({ llGap: v })} /> : null}
            {v03 ? <DemoSelect label="Responsiveness" value={d.resp} options={['ok', 'uncertain', 'needs-h2', 'not-reported', 'few-samples']} onChange={v => set({ resp: v })} /> : null}
            <DemoSelect label="Timer resolution" value={d.timerRes} options={[['0.1', '0.1 ms'], ['1', '1 ms']]} onChange={v => set({ timerRes: v })} />
          </div>
          <div className="demo-sec">
            <span className="st">Browser · Test screen and Result detail</span>
            <DemoSelect label="Browser" value={d.browser} options={['Firefox', 'Chrome', 'Safari', 'Edge']} onChange={v => set({ browser: v })} />
            <DemoCheck label="Upload pauses seen" value={d.uploadPauses} onChange={v => set({ uploadPauses: v })} />
          </div>
          <div className="demo-sec">
            <span className="st">History</span>
            <DemoSelect label="Force variant" value={d.historyVariant} options={[['', 'follow clicks'], ...HISTORY_VARIANTS]} onChange={v => set({ historyVariant: v })} />
          </div>
          <div className="demo-sec">
            <span className="st">Result detail</span>
            <DemoSelect label="State" value={d.resultState} options={['result', 'not-found', 'history-unavailable', 'not-saved-partial', 'not-saved-missing']} onChange={v => set({ resultState: v })} />
            {v03 ? <DemoSeg label="Kind" value={d.resultKind} options={[['standard', 'Standard'], ['continuous', 'Continuous']]} onChange={v => set({ resultKind: v })} /> : null}
            <DemoSelect label="Demo" value={d.resultDemo} options={['none', 'deleted', 'clipboard-denied']} onChange={v => set({ resultDemo: v })} />
            <DemoSelect label="Overhead comp." value={d.resultOverhead} options={[['0', '0 % (example)'], ['6', '+6 %'], ['5.13', '+5.13 %'], ['3.69', '+3.69 %'], ['8.1', '+8.1 %']]} onChange={v => set({ resultOverhead: v })} />
            <DemoSelect label="Download confidence" value={d.resultConfDown} options={CONF_OPTS} onChange={v => set({ resultConfDown: v })} />
            <DemoSelect label="Upload confidence" value={d.resultConfUp} options={CONF_OPTS} onChange={v => set({ resultConfUp: v })} />
          </div>
          <div className="demo-sec">
            <span className="st">About · compatibility layers</span>
            <DemoCheck label="Server unreachable" value={d.aboutUnreachable} onChange={v => set({ aboutUnreachable: v })} />
            <DemoCheck label="OpenSpeedTest" value={d.openspeedtest} onChange={v => set({ openspeedtest: v })} />
            <DemoCheck label="LibreSpeed" value={d.librespeed} onChange={v => set({ librespeed: v })} />
            <DemoCheck label="networkQuality" value={d.networkquality} onChange={v => set({ networkquality: v })} />
          </div>
        </div>
      ) : null}
    </aside>
  );
}

function App() {
  const [d, setD] = React.useState(() => {
    try { return Object.assign({}, DEMO_DEFAULTS, JSON.parse(localStorage.getItem(DEMO_KEY) || '{}')); }
    catch (e) { return Object.assign({}, DEMO_DEFAULTS); }
  });
  React.useEffect(() => { try { localStorage.setItem(DEMO_KEY, JSON.stringify(d)); } catch (e) {} }, [d]);
  const set = patch => setD(prev => Object.assign({}, prev, patch));
  // Demo values outside the chosen scope fall back to what that version can reach.
  const scope = SCOPES.includes(d.scope) ? d.scope : 'v0.2', v03 = scope === 'v0.3';
  const scenario = !v03 && d.scenario === 'continuous' ? 'normal' : d.scenario;
  const llGap = scope === 'v0.1' ? 'none' : d.llGap;
  const testExtra = { cpu: d.cpu, errKind: d.errKind, probe: d.probe, resp: v03 ? d.resp : 'ok', llGap, wsClose: scope !== 'v0.1' && d.wsClose, timerRes: d.timerRes, browser: d.browser, uploadPauses: d.uploadPauses };
  if (d.testState && (v03 || !V03_STATES.includes(d.testState))) testExtra.state = d.testState;
  const historyExtra = d.historyVariant ? { variant: d.historyVariant } : {};
  const resultExtra = { state: d.resultState, kind: v03 ? d.resultKind : 'standard', llGap, probe: d.probe, wsClose: scope !== 'v0.1' && d.wsClose, demo: d.resultDemo, overhead: d.resultOverhead, confDown: d.resultConfDown, confUp: d.resultConfUp, browser: d.browser, uploadPauses: d.uploadPauses };
  const aboutExtra = { openspeedtest: d.openspeedtest, librespeed: d.librespeed, networkquality: d.networkquality, unreachable: d.aboutUnreachable };
  return (
    <>
      <Prototype scenario={scenario} speed={d.speed} mobile={d.mobile} scope={scope}
        testExtra={testExtra} historyExtra={historyExtra} resultExtra={resultExtra} aboutExtra={aboutExtra} />
      <DemoPanel d={d} set={set} reset={() => setD(Object.assign({}, DEMO_DEFAULTS))} />
    </>
  );
}

// Mounted by index.html once window.DS is ready — never at load: this file is also swept into the design
// system bundle, where a mount would take over every consumer's #root.
window.App = App;
