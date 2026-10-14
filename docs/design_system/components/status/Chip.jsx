import React from 'react';
import { Icon } from '../brand/Icon.jsx';
export function Chip({ selected = false, changed = false, icon, count, sort = false, size = 'md', onClick, children }) {
  const cls = 'chip' + (selected ? ' on' : '') + (changed ? ' changed' : '') + (sort ? ' sort' : '') + (size === 'sm' ? ' sm' : '');
  const inner = <>{icon ? <Icon name={icon} size={size === 'sm' ? 12 : 14} stroke={size === 'sm' ? 2 : 1.75} /> : null}{children}{count != null ? <span className="n">{count}</span> : null}</>;
  return onClick ? <button type="button" className={cls} aria-pressed={sort ? undefined : selected} onClick={onClick}>{inner}</button> : <span className={cls}>{inner}</span>;
}
// "changed" marker next to a setting that differs from the server default (screens.md §4).
export function ChangedMark() { return <span className="chgd"><span className="d" aria-hidden="true"></span>changed</span>; }
