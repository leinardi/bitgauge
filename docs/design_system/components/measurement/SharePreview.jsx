import React from 'react';
import { Icon } from '../brand/Icon.jsx';
import { Logo } from '../brand/Logo.jsx';
import { GRADES } from './LoadCard.jsx';
// share-panel.md "Share image layout". The image is drawn on a fixed 480 × 252 box (--share-w/-h) and scaled into
// its frame: fluid in the share panel, 2.5× (1200 × 630) with size="full".
const SHARE_W = 480, SHARE_SCALE = 2.5;
const STATUS = { partial: ['partial', ''], 'insufficient-data': ['insufficient data', 'warn'], skipped: ['skipped', ''], error: ['error', 'danger'] };
const REASON = { 'ramp-unsettled': 'ramp unsettled', 'insufficient-samples': 'insufficient samples', unstable: 'unstable' };
const SOURCE = { 'http-h2': 'HTTP/2 probe', 'http-h3': 'HTTP/3 probe', 'http-h1-reserved': 'HTTP/1.1 reserved' };
const DIR = { download: ['↓ DOWNLOAD', 'var(--series-download)', 'Download'], upload: ['↑ UPLOAD', 'var(--series-upload)', 'Upload'] };
// A direction reports a number when measured, or partial with a value (measurement §17).
export const shareHasNumber = b => b.value != null && b.value !== '' && b.value !== '—' && (!b.status || b.status === 'measured' || b.status === 'partial');
// The block's qualifier lines, in fixed order: status, confidence, overhead compensation. Confidence and overhead
// qualify a number, so they appear only on a block that has one.
export function shareQualifiers(b, overhead) {
  const q = [], has = shareHasNumber(b), c = b.confidence;
  if (b.status && b.status !== 'measured') { const s = STATUS[b.status] || [b.status, '']; q.push({ text: s[0], tone: s[1] }); }
  if (has && c && c.level === 'low') q.push({ text: 'low confidence' + (c.reasons && c.reasons.length ? ': ' + c.reasons.map(r => REASON[r] || r).join(', ') : ''), tone: 'warn' });
  if (has && c && c.level === 'cpu-bound') q.push({ text: 'limited by this device’s CPU', tone: 'warn' });
  if (has && overhead) q.push({ text: '+' + overhead + ' % overhead compensation', tone: '' });
  return q;
}
// The loaded-latency foot item: increase, then its direction, any source other than the WebSocket, and the idle path
// when idle latency ran on the other path (idleSource, measurement §11.4) — worded as the Result detail words it.
const IDLE_PATH = { websocket: 'vs idle over WebSocket', http: 'vs idle over HTTP' };
export function shareLoaded(l) {
  if (!l || !l.increase) return '';
  const q = [l.dir, SOURCE[l.source], IDLE_PATH[l.idleSource]].filter(Boolean);
  return l.increase + ' under load' + (q.length ? ' (' + q.join(', ') + ')' : '');
}
// The copied text: the same lines as the image (flows.md §8), from the same props, so neither says more than the other.
export function shareSummary({ head, blocks = [], grade, basis, overhead = 0, idle, jitter, loaded, where, when }) {
  const lines = ['BitGauge' + (head ? ' · ' + head : '')];
  if (when) lines.push(when);
  blocks.forEach(b => {
    const d = DIR[b.dir] || [], has = shareHasNumber(b), q = shareQualifiers(b, overhead).map(x => x.text);
    lines.push((b.name || d[2] || b.label) + ' ' + (has ? b.value + ' ' + b.unit : '—') + (q.length ? ' (' + q.join('; ') + ')' : ''));
  });
  const lat = [idle ? 'Idle latency ' + idle : '', jitter ? 'Jitter ' + jitter : ''].filter(Boolean);
  if (lat.length) lines.push(lat.join(' · '));
  const l = shareLoaded(loaded);
  if (l) lines.push('Loaded latency ' + l.replace(' under load', ''));
  const G = grade ? GRADES[grade] : null;
  if (G) lines.push('Bufferbloat grade ' + grade + ' · ' + G.text + (basis === 'download' ? ' (download only)' : basis === 'upload' ? ' (upload only)' : ''));
  if (where) lines.push('Server: ' + where);
  return lines;
}
// Namespace-visible helpers (only capitalised exports reach window.<Namespace>), as Format does for numbers.
export const ShareFormat = { summary: p => shareSummary(p), qualifiers: (b, o) => shareQualifiers(b, o), loaded: l => shareLoaded(l), hasNumber: b => shareHasNumber(b) };
export function SharePreview({ head, blocks = [], grade, basis, overhead = 0, idle, jitter, loaded, foot = [], where, when, size = 'fluid', label }) {
  const fit = React.useRef(null);
  const full = size === 'full';
  const [k, setK] = React.useState(full ? SHARE_SCALE : 1);
  React.useLayoutEffect(() => {
    if (full) { setK(SHARE_SCALE); return; }
    const el = fit.current; if (!el || typeof ResizeObserver === 'undefined') return;
    const set = () => setK(el.clientWidth / SHARE_W); set();
    const ro = new ResizeObserver(set); ro.observe(el); return () => ro.disconnect();
  }, [full]);
  const G = grade ? GRADES[grade] : null;
  const B = blocks.map(b => {
    const d = DIR[b.dir] || [];
    const has = shareHasNumber(b);
    return { label: b.label || d[0], color: b.color || d[1], name: b.name || d[2] || b.label, has, value: has ? b.value : '—', unit: has ? b.unit : '', q: shareQualifiers(b, overhead) };
  });
  const basisT = basis === 'download' ? 'download only' : basis === 'upload' ? 'upload only' : '';
  const F = [idle ? idle + ' idle' : '', jitter ? jitter + ' jitter' : '', shareLoaded(loaded)].concat(foot).filter(Boolean);
  const aria = label || ['Share image: BitGauge' + (head ? ' · ' + head : '')]
    .concat(B.map(b => b.name + ' ' + (b.has ? b.value + ' ' + b.unit : 'no number') + (b.q.length ? ' (' + b.q.map(x => x.text).join('; ') + ')' : '')))
    .concat(G ? ['Bufferbloat ' + grade + ', ' + G.text + (basisT ? ', ' + basisT : '')] : [], F, [where, when].filter(Boolean).join(' · ')).filter(Boolean).join(', ');
  // Middle band: the number row, its qualifier stacks and the grade form one group, centred between header and foot.
  return <div ref={fit} data-theme="dark" className={'sharep-fit' + (full ? ' full' : '')} role="img" aria-label={aria}>
    <div className="sharep" style={{ transform: 'scale(' + k + ')' }}>
      <div className="sharep-h"><Logo size={20} wordmark />{head ? <span className="hd">{head}</span> : null}</div>
      <div className="sharep-m"><div className="sharep-b">{B.map((b, i) => <React.Fragment key={i}>
        <span className="k" style={{ gridColumn: i + 1, color: b.color }}>{b.label}</span>
        <span className={'n' + (b.has ? '' : ' none')} style={{ gridColumn: i + 1 }}>{b.value}{b.unit ? <span className="u">{b.unit}</span> : null}</span>
        {b.q.length ? <span className="q" style={{ gridColumn: i + 1 }}>{b.q.map((x, j) => <span key={j} className={x.tone}>{x.text}</span>)}</span> : null}
      </React.Fragment>)}
      {G ? <span className="sharep-g"><span className={'grade-l ' + G.tone}>{grade}</span><span className="w"><b>{G.text.split(' ')[0]}</b><span>bufferbloat</span>{basisT ? <span>{basisT}</span> : null}</span></span> : null}</div></div>
      <div className="sharep-f">{F.map((f, i) => <span key={i}>{f}</span>)}{where || when ? <span className="w">{where ? <span className="srv">{where}</span> : null}{where && when ? '\u00a0·\u00a0' : ''}{when || ''}</span> : null}</div>
    </div>
  </div>;
}
// The idle-state "last result" line: when, headline numbers, label, link to its detail (screens.md §1).
export function LastResult({ when, values, label, href = '#' }) {
  return <a className="lastres" href={href}><Icon name="history" size={13} />{'Last test ' + when + ' · '}<span className="v">{values}</span>{label ? ' · ' + label : ''}<span className="go">View</span></a>;
}
