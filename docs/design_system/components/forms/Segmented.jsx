import React from 'react';
import { Icon } from '../brand/Icon.jsx';
export function Segmented({ options, value, onChange, size = 'md', ariaLabel }) {
  return <div className={'seg' + (size === 'sm' ? ' seg-sm' : '')} role="radiogroup" aria-label={ariaLabel}>
    {options.map(o => { const opt = typeof o === 'string' ? { value: o, label: o } : o; const on = opt.value === value;
      return <button key={opt.value} type="button" role="radio" aria-checked={on} className={'seg-btn' + (on ? ' on' : '')} onClick={() => onChange && onChange(opt.value)}>{opt.icon ? <Icon name={opt.icon} size={14} /> : null}{opt.label}</button>; })}
  </div>;
}
