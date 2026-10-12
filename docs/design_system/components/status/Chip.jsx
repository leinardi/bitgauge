import React from 'react';
import { Icon } from '../brand/Icon.jsx';
export function Chip({ selected = false, icon, count, sort = false, onClick, children }) {
  const cls = 'chip' + (selected ? ' on' : '') + (sort ? ' sort' : '');
  const inner = <>{icon ? <Icon name={icon} size={14} /> : null}{children}{count != null ? <span className="n">{count}</span> : null}</>;
  return onClick ? <button type="button" className={cls} aria-pressed={selected} onClick={onClick}>{inner}</button> : <span className={cls}>{inner}</span>;
}
