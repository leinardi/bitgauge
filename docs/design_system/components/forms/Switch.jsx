import React from 'react';
export function Switch({ checked = false, onChange, label, disabled = false }) {
  const sw = <button type="button" role="switch" aria-checked={checked} disabled={disabled} className={'switch' + (checked ? ' on' : '')} onClick={() => onChange && onChange(!checked)} style={{ padding: 0, opacity: disabled ? 0.45 : 1 }}><span className="knob"></span></button>;
  if (!label) return sw;
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)' }}>{sw}<span style={{ fontSize: 'var(--text-sm)', color: checked ? 'var(--fg)' : 'var(--fg-muted)' }}>{label}</span></span>;
}
