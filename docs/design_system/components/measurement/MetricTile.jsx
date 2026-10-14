import React from 'react';
import { Icon } from '../brand/Icon.jsx';
import { StatusPill } from '../status/StatusPill.jsx';
// tiles.md — the number always ships with its qualifier; some states never show a number.
const NO_NUMBER = { empty: 1, 'warming-up': 1, error: 1, 'insufficient-data': 1, skipped: 1 };
const TAG = { live: ['info', 'Live'], 'warming-up': ['info', 'Live'], partial: ['warn', 'Partial'], 'insufficient-data': ['warn', 'Insufficient data'], 'low-confidence': ['warn', 'Low confidence'], error: ['danger', 'Error'] };
const Q = { partial: 'warn', 'insufficient-data': 'warn', 'low-confidence': 'warn', error: 'danger' };
const WORD = { partial: 'partial', 'insufficient-data': 'insufficient data', 'low-confidence': 'low confidence', skipped: 'skipped', error: 'error' };
export function MetricTile({ label, icon, accent, value, unit, note, notes, state = 'done', tag, compact = false, className, style }) {
  const none = NO_NUMBER[state] || value == null;
  const t = TAG[state];
  const q = note ?? WORD[state] ?? '';
  return <div className={'card tile' + (compact ? ' compact' : '') + (className ? ' ' + className : '')} style={style}>
    <div className="tile-h">
      {icon ? <span className="ic" style={accent ? { color: accent } : undefined}><Icon name={icon} size={14} stroke={2} /></span> : null}
      <span className="ds-eyebrow">{label}</span>
      {t || tag ? <StatusPill size="sm" tone={t ? t[0] : 'neutral'}>{tag || t[1]}</StatusPill> : null}
    </div>
    <div className="tile-v">
      {state === 'warming-up' ? <span className="w">warming up</span> : <span className={'n' + (none ? ' none' : '')}>{none ? '—' : value}</span>}
      {!none && unit ? <span className="u">{unit}</span> : null}
    </div>
    <span className={'tile-q' + (Q[state] ? ' ' + Q[state] : '')}>{q}</span>
    {(notes || []).map((x, i) => <span key={i} className="tile-q">{x}</span>)}
  </div>;
}
