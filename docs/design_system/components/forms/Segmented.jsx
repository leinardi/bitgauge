import React from 'react';
import { Icon } from '../brand/Icon.jsx';
export function Segmented({ options, value, onChange, size = 'md', block = false, ariaLabel }) {
  const iconOnly = options.every(o => typeof o === 'object' && o.icon && o.iconOnly);
  return <div className={'seg' + (size === 'sm' ? ' seg-sm' : '') + (iconOnly ? ' seg-icon' : '') + (block ? ' block' : '')} role="radiogroup" aria-label={ariaLabel}>
    {options.map(o => { const opt = typeof o === 'string' ? { value: o, label: o } : o; const on = opt.value === value;
      return <button key={opt.value} type="button" role="radio" aria-checked={on} aria-label={opt.iconOnly ? opt.label : undefined} className={'seg-btn' + (on ? ' on' : '')} onClick={() => onChange && onChange(opt.value)}>
        {opt.icon ? <Icon name={opt.icon} size={14} stroke={opt.color ? 2 : 1.75} style={opt.color ? { color: opt.color } : undefined} /> : null}{opt.iconOnly ? null : opt.label}</button>; })}
  </div>;
}
