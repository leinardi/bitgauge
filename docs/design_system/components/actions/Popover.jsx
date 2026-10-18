import React from 'react';
import { Icon } from '../brand/Icon.jsx';
import { useModal, useDismiss } from '../dialog/Modal.jsx';
// Floating panel anchored under its trigger (export menu, date range). role "menu" or "dialog"; named by label.
// Escape and a click outside call onClose. Non-modal by default; `modal` (menus) makes the page inert and traps focus.
export function Popover({ trigger, open = false, role = 'dialog', label, width = 300, align = 'end', modal = false, onClose, children }) {
  const ref = React.useRef(null), wrap = React.useRef(null);
  useModal(ref, open && modal, { onOutside: onClose });
  useDismiss(wrap, open && !modal, onClose);
  return <span ref={wrap} className="pop-wrap" onKeyDown={e => { if (e.key === 'Escape' && open && onClose) { e.stopPropagation(); onClose(); } }}>{trigger}{open ? <div ref={ref} role={role} aria-label={label} aria-modal={modal && role === 'dialog' ? 'true' : undefined} className={'pop' + (align === 'start' ? ' start' : '')} style={{ width }}>{children}</div> : null}</span>;
}
// Single-choice rows (role="radio") with an optional mono count and a check on the selected row.
export function OptionRows({ label, options = [], selected, onSelect }) {
  return <div role="radiogroup" aria-label={label} className="optrows">{options.map(o => { const on = o.value === selected;
    return <button key={o.value} type="button" role="radio" aria-checked={on} className="menu-item" onClick={() => onSelect && onSelect(o.value)}>
      <span className="lb">{o.label}</span>{o.meta != null ? <span className="mt">{o.meta}</span> : null}<span className="ck">{on ? <Icon name="check" size={14} stroke={2.25} /> : null}</span>
    </button>; })}</div>;
}
