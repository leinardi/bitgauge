import React from 'react';
import { Icon } from '../brand/Icon.jsx';
const cx = (...a) => a.filter(Boolean).join(' ');
export function Input({ icon, mono = false, size = 'md', invalid = false, error, label, className, style, ...rest }) {
  const shell = <div className={cx('input', mono && 'mono', size === 'sm' && 'sm', invalid || error ? 'invalid' : '', className)} style={style}>
    {icon ? <Icon name={icon} size={15} /> : null}<input aria-invalid={invalid || !!error || undefined} {...rest} />
  </div>;
  if (!label && !error) return shell;
  return <label className="field">
    {label ? <span style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-medium)', color: 'var(--fg)' }}>{label}</span> : null}
    {shell}
    {error ? <span className="fmsg"><Icon name="circle-alert" size={12} />{error}</span> : null}
  </label>;
}
