import React from 'react';
import { Icon } from '../brand/Icon.jsx';
// Native select in the Input shell (36 px; sm 28). Options: strings or { value, label }.
export function Select({ icon, options = [], size = 'md', mono = false, className, style, ...rest }) {
  return <label className={'input select' + (size === 'sm' ? ' sm' : '') + (mono ? ' mono' : '') + (className ? ' ' + className : '')} style={style}>
    {icon ? <Icon name={icon} size={14} /> : null}
    <select {...rest}>{options.map(o => { const x = typeof o === 'object' ? o : { value: o, label: o }; return <option key={x.value} value={x.value}>{x.label}</option>; })}</select><Icon name="chevron-down" size={14} />
  </label>;
}
