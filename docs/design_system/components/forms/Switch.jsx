import React from 'react';
export function Switch({ checked = false, onChange, label, disabled = false, ...rest }) {
  const sw = <button type="button" role="switch" aria-checked={checked} disabled={disabled} className={'switch' + (checked ? ' on' : '')} onClick={() => onChange && onChange(!checked)} {...rest}><span className="knob"></span></button>;
  if (!label) return sw;
  return <label className={'switch-l' + (checked ? ' on' : '')}>{sw}<span>{label}</span></label>;
}
