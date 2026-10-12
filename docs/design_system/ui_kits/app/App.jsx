/* BitGauge web UI kit — App
 * Mounts the clickable prototype and the Demo state panel.
 * The panel is kit-only debug scaffolding: it drives scenarios and forces the
 * states the product reaches through real conditions (offline, base-path
 * mismatch, fallbacks, history variants…). It is not a product control.
 * Anything the product itself lets you change (theme, units, test settings,
 * chart/table toggles, share, keep in history) is changed in the UI, not here.
 */
const DEMO_KEY = 'bitgauge-kit-demo';
const DEMO_DEFAULTS = {
  scenario: 'normal', speed: '1', mobile: false,
  testState: '', v01: false, cpu: false,
  errKind: 'requests', probe: 'auto', resp: 'ok', timerRes: '0.1',
  historyVariant: '', resultState: 'result', resultKind: 'standard', resultDemo: 'none', resultOverhead: '0',
  openspeedtest: true, librespeed: true, networkquality: true, aboutUnreachable: false
};
const TEST_STATES = ['idle', 'countdown', 'connecting', 'latency', 'download', 'upload', 'complete', 'error', 'error-early', 'cancelled', 'cancelled-late', 'cancelled-latency', 'cancelled-download', 'cancelled-slow', 'cancelled-slow-up', 'slow', 'slowdone', 'continuous', 'cont-warmup', 'cont-done', 'offline', 'basepath', 'ws-fallback', 'insufficient', 'param-ignored'];
const HISTORY_VARIANTS = ['populated', 'select3', 'deleted', 'compare', 'confirm', 'export', 'daterange', 'loading', 'nomatch', 'empty', 'unavailable', 'importing', 'importresult', 'importerror', 'safari'];

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
  const [open, setOpenRaw] = React.useState(() => localStorage.getItem(DEMO_KEY + '-open') === '1');
  const setOpen = o => { setOpenRaw(o); try { localStorage.setItem(DEMO_KEY + '-open', o ? '1' : '0'); } catch (e) {} };
  return (
    <aside className={'demo' + (open ? '' : ' closed')} aria-label="Demo state">
      <div className="demo-h" onClick={open ? undefined : () => setOpen(true)} style={open ? undefined : { cursor: 'pointer' }}>
        <bg-icon name="sliders" size="14" style={{ color: 'var(--primary-text)' }}></bg-icon>
        <span className="t">Demo<span className="t-long"> state{open ? '' : ' \u00b7 ' + (d.mobile ? 'Mobile' : 'Auto') + ' \u00b7 ' + d.scenario}</span></span>
        {open ? <button type="button" className="btn ghost sm" onClick={reset}>Reset</button> : null}
        <button type="button" className="btn ghost sm icon" aria-label={open ? 'Collapse demo panel' : 'Expand demo panel'} onClick={() => setOpen(!open)}>
          <bg-icon name={open ? 'chevron-down' : 'chevron-up'} size="14"></bg-icon>
        </button>
      </div>
      {open ? (
        <div className="demo-b">
          <div className="demo-sec">
            <span className="st">Run</span>
            <DemoSelect label="Scenario" value={d.scenario} options={['normal', 'error', 'slow', 'autostart', 'continuous']} onChange={v => set({ scenario: v, testState: '' })} />
            <DemoSeg label="Speed" value={d.speed} options={[['1', '1×'], ['2', '2×'], ['4', '4×']]} onChange={v => set({ speed: v })} />
            <span className="demo-note">Start with the button or Enter; Escape stops.</span>
          </div>
          <div className="demo-sec">
            <span className="st">View</span>
            <DemoSeg label="Frame" value={d.mobile ? 'm' : 'd'} options={[['d', 'Auto'], ['m', 'Mobile']]} onChange={v => set({ mobile: v === 'm' })} />
            <span className="demo-note">Auto: desktop from 1140 px wide, mobile below.</span>
          </div>
          <div className="demo-sec">
            <span className="st">Test screen</span>
            <DemoSelect label="Force state" value={d.testState} options={[['', 'follow run'], ...TEST_STATES]} onChange={v => set({ testState: v })} />
            <DemoCheck label="v0.1 scope (no history)" value={d.v01} onChange={v => set({ v01: v })} />
            <DemoCheck label="CPU-bound" value={d.cpu} onChange={v => set({ cpu: v })} />
            <DemoSelect label="Error kind" value={d.errKind} options={['requests', 'unreachable', 'restarted', 'network']} onChange={v => set({ errKind: v })} />
            <DemoSelect label="Latency probe" value={d.probe} options={['auto', 'WebSocket', 'HTTP/2 probe', 'HTTP/1.1 reserved']} onChange={v => set({ probe: v })} />
            <DemoSelect label="Responsiveness" value={d.resp} options={['ok', 'uncertain', 'needs-h2', 'not-reported', 'few-samples']} onChange={v => set({ resp: v })} />
            <DemoSelect label="Timer resolution" value={d.timerRes} options={[['0.1', '0.1 ms'], ['1', '1 ms']]} onChange={v => set({ timerRes: v })} />
          </div>
          <div className="demo-sec">
            <span className="st">History</span>
            <DemoSelect label="Force variant" value={d.historyVariant} options={[['', 'follow clicks'], ...HISTORY_VARIANTS]} onChange={v => set({ historyVariant: v })} />
          </div>
          <div className="demo-sec">
            <span className="st">Result detail</span>
            <DemoSelect label="State" value={d.resultState} options={['result', 'not-found', 'history-unavailable']} onChange={v => set({ resultState: v })} />
            <DemoSeg label="Kind" value={d.resultKind} options={[['standard', 'Standard'], ['continuous', 'Continuous']]} onChange={v => set({ resultKind: v })} />
            <DemoSelect label="Demo" value={d.resultDemo} options={['none', 'deleted', 'clipboard-denied']} onChange={v => set({ resultDemo: v })} />
            <DemoSelect label="Overhead comp." value={d.resultOverhead} options={[['0', '0 % (example)'], ['6', '+6 %'], ['5.13', '+5.13 %'], ['3.69', '+3.69 %'], ['8.1', '+8.1 %']]} onChange={v => set({ resultOverhead: v })} />
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
  const testExtra = { v01: d.v01, cpu: d.cpu, errKind: d.errKind, probe: d.probe, resp: d.resp, timerRes: d.timerRes };
  if (d.testState) testExtra.state = d.testState;
  const historyExtra = d.historyVariant ? { variant: d.historyVariant } : {};
  const resultExtra = { state: d.resultState, kind: d.resultKind, demo: d.resultDemo, overhead: d.resultOverhead };
  const aboutExtra = { openspeedtest: d.openspeedtest, librespeed: d.librespeed, networkquality: d.networkquality, unreachable: d.aboutUnreachable };
  return (
    <>
      <Prototype scenario={d.scenario} speed={d.speed} mobile={d.mobile}
        testExtra={testExtra} historyExtra={historyExtra} resultExtra={resultExtra} aboutExtra={aboutExtra} />
      <DemoPanel d={d} set={set} reset={() => setD(Object.assign({}, DEMO_DEFAULTS))} />
    </>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
