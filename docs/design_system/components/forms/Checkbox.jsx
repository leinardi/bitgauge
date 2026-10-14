import React from 'react';
import { Icon } from '../brand/Icon.jsx';
// Checkbox — role="checkbox" button (Reka UI Checkbox): 16 px box, teal when checked, optional glyph before the label.
export function Checkbox({ checked = false, onChange, disabled = false, icon, iconColor, size = 'md', children }) {
  return <button type="button" role="checkbox" aria-checked={checked} disabled={disabled} className={'cbx' + (size === 'sm' ? ' sm' : '')} onClick={() => onChange && onChange(!checked)}>
    <span className={'box' + (checked ? ' on' : '')} aria-hidden="true">{checked ? <Icon name="check" size={12} stroke={3} /> : null}</span>
    {icon ? <span className="ic" style={iconColor ? { color: iconColor } : undefined}><Icon name={icon} size={14} stroke={2} /></span> : null}
    <span>{children}</span>
  </button>;
}
// ChoiceCard — one option of a card radio group (preset picker). Put several in a role="radiogroup".
export function ChoiceCard({ selected = false, icon, title, badge, children, onSelect }) {
  return <div role="radio" aria-checked={selected} tabIndex={0} className={'choice' + (selected ? ' on' : '')} onClick={onSelect}
    onKeyDown={e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); onSelect && onSelect(); } }}>
    <div className="choice-h">{icon ? <span className="ic"><Icon name={icon} size={16} /></span> : null}<span className="t">{title}</span>{badge}<span className="rd" aria-hidden="true"><span></span></span></div>
    {children ? <span className="choice-d">{children}</span> : null}
  </div>;
}
