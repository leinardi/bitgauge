import React from 'react';
import { Icon } from '../brand/Icon.jsx';
// Floating panel anchored under its trigger (export menu, date range). role "menu" or "dialog"; named by label.
export function Popover({ trigger, open = false, role = 'dialog', label, width = 300, align = 'end', children }) {
  return <span className="pop-wrap">{trigger}{open ? <div role={role} aria-label={label} className={'pop' + (align === 'start' ? ' start' : '')} style={{ width }}>{children}</div> : null}</span>;
}
// Single-choice rows (role="radio") with an optional mono count and a check on the selected row.
export function OptionRows({ label, options = [], selected, onSelect }) {
  return <div role="radiogroup" aria-label={label} className="optrows">{options.map(o => { const on = o.value === selected;
    return <button key={o.value} type="button" role="radio" aria-checked={on} className="menu-item" onClick={() => onSelect && onSelect(o.value)}>
      <span className="lb">{o.label}</span>{o.meta != null ? <span className="mt">{o.meta}</span> : null}<span className="ck">{on ? <Icon name="check" size={14} stroke={2.25} /> : null}</span>
    </button>; })}</div>;
}
