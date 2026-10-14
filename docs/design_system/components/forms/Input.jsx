import React from 'react';
import { Icon } from '../brand/Icon.jsx';
const cx = (...a) => a.filter(Boolean).join(' ');
export function Input({ icon, suffix, mono = false, size = 'md', invalid = false, error, label, className, style, ...rest }) {
  const shell = <div className={cx('input', mono && 'mono', size === 'sm' && 'sm', (invalid || error) && 'invalid', className)} style={style}>
    {icon ? <Icon name={icon} size={size === 'sm' ? 13 : 15} /> : null}<input aria-invalid={invalid || !!error || undefined} {...rest} />{suffix ? <span className="sfx">{suffix}</span> : null}
  </div>;
  if (!label && !error) return shell;
  return <label className="field">
    {label ? <span className="field-l">{label}</span> : null}
    {shell}
    {error ? <span className="fmsg"><Icon name="circle-alert" size={12} />{error}</span> : null}
  </label>;
}
// Inline field error, linked from its input with aria-describedby (the input keeps focus; Tab leaves as usual).
export function FieldError({ id, children, style }) {
  return <span className="fmsg" id={id} style={style}><Icon name="circle-alert" size={12} />{children}</span>;
}
