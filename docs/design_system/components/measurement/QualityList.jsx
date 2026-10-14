import React from 'react';
import { Icon } from '../brand/Icon.jsx';
import { StatusBadge } from '../status/StatusBadge.jsx';
import { NotMeasured } from './NotMeasured.jsx';
// tiles.md QualityList — band name + icon, never colour alone.
export const QUALITY = { Great: { tone: 'ok', icon: 'circle-check' }, Good: { tone: 'ok', icon: 'check' }, Average: { tone: 'warn', icon: 'circle-minus' }, Poor: { tone: 'warn', icon: 'circle-alert' }, Bad: { tone: 'danger', icon: 'circle-x' } };
const ROWS = [['Streaming', 'tv'], ['Gaming', 'gamepad'], ['Video calls', 'video']];
export function QualityList({ bands = [], missing = [], basis, packetLoss = false, compact = false, className, style }) {
  return <div className={'card tile qlist' + (compact ? ' compact' : '') + (className ? ' ' + className : '')} style={style}>
    <span className="ds-eyebrow">Good for{basis ? <span className="chip sm">{basis}</span> : null}</span>
    {ROWS.map(([label, icon], i) => { const b = bands[i]; const Q = b ? QUALITY[b] : null;
      return <div className="qrow" key={label}><span className="ic"><Icon name={icon} size={16} /></span><span className="lb">{label}</span>
        {Q ? <StatusBadge tone={Q.tone} icon={Q.icon}>{b}</StatusBadge> : <span className="none">{(Array.isArray(missing) ? missing[i] : missing) || '—'}</span>}</div>; })}
    {packetLoss ? <div className="qrow"><span className="ic"><Icon name="signal" size={16} /></span><span className="lb">Packet loss</span><NotMeasured /></div> : null}
    <span className="foot"><Icon name="info" size={12} />Upper bound: packet loss is not measured</span>
  </div>;
}
