import React from 'react';
import { Icon } from '../brand/Icon.jsx';
import { StatusPill } from '../status/StatusPill.jsx';
// tiles.md LoadCard — grade letter + words (never colour alone) + basis, loaded latency per direction, RPM (v0.3, optional).
export const GRADES = {
  'A+': { tone: 'ok', text: 'Minimal bufferbloat' }, A: { tone: 'ok', text: 'Low bufferbloat' }, B: { tone: 'ok', text: 'Mild bufferbloat' },
  C: { tone: 'warn', text: 'Moderate bufferbloat' }, D: { tone: 'warn', text: 'High bufferbloat' }, F: { tone: 'danger', text: 'Severe bufferbloat' }
};
const DIR = { download: ['arrow-down', 'var(--series-download)'], upload: ['arrow-up', 'var(--series-upload)'] };
export function GradeBadge({ grade, text }) {
  const G = grade ? GRADES[grade] : null;
  const words = text || (G ? G.text : 'Graded after upload');
  return <div className="grade">
    <span className={'grade-l ' + (G ? G.tone : 'none')} role="img" aria-label={G ? 'Bufferbloat grade ' + grade + ', ' + words : 'Bufferbloat grade pending'}>{grade || '—'}</span>
    <div className="grade-s">
      <div className="grade-strip" aria-hidden="true">{Object.keys(GRADES).map(g => <span key={g} className={g === grade ? 'on ' + GRADES[g].tone : undefined}>{g}</span>)}</div>
      <span className="grade-t">{words}</span>
    </div>
  </div>;
}
function NumU({ value, unit, live, uncertain }) {
  const none = value == null || value === '—';
  return <span className={'num-u' + (none ? ' none' : live ? ' live' : uncertain ? ' uncertain' : '')}>{none ? '—' : value}{!none && unit ? <span className="u">{unit}</span> : null}</span>;
}
export function LoadCard({ grade, gradeText, basis, rows = [], responsiveness, compact = false, className, style }) {
  const r = responsiveness;
  return <div className={'card tile load' + (compact ? ' compact' : '') + (className ? ' ' + className : '')} style={style}>
    <div className="load-g"><span className="ds-eyebrow">Bufferbloat</span><GradeBadge grade={grade} text={gradeText} />{basis ? <span className="grade-b">{basis}</span> : null}</div>
    <div className="load-r">
      {rows.map((x, i) => <div className="lrow" key={i}>
        <span className="ic" style={{ color: DIR[x.dir][1] }}><Icon name={DIR[x.dir][0]} size={14} stroke={2} /></span>
        <div className="lb"><span>{x.label}</span><span className="sub">{x.sub}</span></div>
        <NumU value={x.value} unit="ms" live={x.live} />
      </div>)}
      {r ? <div className="rpm">
        <div className="rpm-h">
          <span className="ic" style={{ color: 'var(--fg-subtle)', marginTop: 2 }}><Icon name="gauge" size={14} stroke={2} /></span>
          <div className="lb"><span>HTTP loaded responsiveness — connection sharing not verifiable</span>{r.note ? <span className="sub">{r.note}</span> : null}</div>
          <div className="tags">{r.tag ? <StatusPill size="sm" tone="warn">{r.tag}</StatusPill> : null}{r.protocol ? <span className="proto">{r.protocol}</span> : null}</div>
        </div>
        <div className="rpm-d">{(r.dirs || []).map((d, i) => <div key={i}>
          <span className="ic" style={{ color: DIR[d.dir][1] }}><Icon name={DIR[d.dir][0]} size={12} stroke={2.25} /></span>
          {d.value != null ? <NumU value={d.value} unit="RPM" uncertain={d.uncertain} /> : <span className="txt">{d.text || '—'}</span>}
        </div>)}</div>
      </div> : null}
    </div>
  </div>;
}
