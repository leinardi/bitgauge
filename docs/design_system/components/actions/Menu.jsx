import React from 'react';
import { Icon } from '../brand/Icon.jsx';
// Menu button + menu of single-choice (menuitemradio) or action (menuitem) rows.
export function Menu({ label, value, icon, hint, options = [], selected, onSelect, open: openProp, onOpenChange, align = 'start', footer, trigger }) {
  const [openState, setOpenState] = React.useState(false);
  const open = openProp ?? openState;
  const setOpen = o => { if (openProp == null) setOpenState(o); onOpenChange && onOpenChange(o); };
  const btn = React.useRef(null);
  const close = () => { setOpen(false); btn.current && btn.current.focus(); };
  const radio = selected !== undefined;
  const name = label + (value != null ? ': ' + value : '') + (hint ? ', ' + hint : '');
  return <span className="menu-wrap" onKeyDown={e => { if (e.key === 'Escape' && open) { e.stopPropagation(); close(); } }}>
    {trigger ? React.cloneElement(trigger, { ref: btn, 'aria-haspopup': 'menu', 'aria-expanded': open, onClick: () => setOpen(!open) })
      : <button ref={btn} type="button" className="menu-trigger" aria-haspopup="menu" aria-expanded={open} aria-label={name} onClick={() => setOpen(!open)}>
        {icon ? <Icon name={icon} size={12} stroke={2} /> : null}{value}<span className="chev"><Icon name="chevron-down" size={12} stroke={2} /></span>
      </button>}
    {hint && !trigger ? <span className="menu-hint" aria-hidden="true">{hint}</span> : null}
    {open ? <div role="menu" aria-label={label} className={'menu' + (align === 'end' ? ' end' : '')}>
      {options.map(o => { const on = radio && o.value === selected;
        return <button key={o.value} type="button" role={radio ? 'menuitemradio' : 'menuitem'} aria-checked={radio ? on : undefined} className={'menu-item' + (o.danger ? ' danger' : '')}
          onClick={() => { onSelect && onSelect(o.value); if (!o.keepOpen) close(); }}>
          {o.icon ? <span className="ic"><Icon name={o.icon} size={14} /></span> : null}<span className="lb">{o.label}</span>
          {on ? <span className="ck"><Icon name="check" size={14} stroke={2} /></span> : null}
        </button>; })}
      {footer ? <div className="menu-foot">{footer}</div> : null}
    </div> : null}
  </span>;
}
