import React from 'react';
import { Icon } from '../brand/Icon.jsx';
export function Toggle({ pressed = false, onChange, icon, children }) {
  return <button type="button" aria-pressed={pressed} className={'toggle' + (pressed ? ' on' : '')} onClick={() => onChange && onChange(!pressed)}>{icon ? <Icon name={icon} size={14} /> : null}{children}</button>;
}
