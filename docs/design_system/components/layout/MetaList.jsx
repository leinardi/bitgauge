import React from 'react';
import { Icon } from '../brand/Icon.jsx';
// Label / value rows. Values are mono; "—" renders in --fg-subtle.
export function MetaList({ rows = [], columns = 1, title, compact = false, facts = false, className, style }) {
  const list = <dl className={'mlist' + (facts ? ' facts' : '')} style={columns > 1 ? { gridTemplateColumns: 'repeat(' + columns + ', minmax(0, 1fr))' } : undefined}>
    {rows.map((r, i) => <div className={'mrow' + (r.node ? ' node' : '')} key={r.key || i}>
      {r.icon ? <span className="ic" aria-hidden="true"><Icon name={r.icon} size={15} /></span> : null}
      <dt className="lb"><span>{r.label}</span>{r.sub ? <span className="sub">{r.sub}</span> : null}</dt>
      {r.node ? <dd className="val">{r.node}</dd> : <dd className={'val' + (r.value == null || r.value === '—' ? ' empty' : '') + (r.tone === 'danger' ? ' danger' : '')}>{r.value ?? '—'}</dd>}
    </div>)}
  </dl>;
  if (!title) return list;
  return <div className={'card tile' + (compact ? ' compact' : '') + (className ? ' ' + className : '')} style={style}><span className="ds-eyebrow">{title}</span>{list}</div>;
}
// One labelled value in a horizontal strip (connection info): eyebrow label, mono value, subtle qualifier.
export function Stat({ label, value, sub, children }) {
  return <div className="stat"><span className="ds-eyebrow">{label}</span>{children || <span className="stat-v">{value}{sub ? <span className="stat-s">{sub}</span> : null}</span>}</div>;
}
