import React from 'react';
import { Icon } from '../brand/Icon.jsx';
const cx = (...a) => a.filter(Boolean).join(' ');
export function Button({ variant = 'secondary', size = 'md', icon, iconOnly = false, kbd, disabled = false, disabledReason, children, className, ...rest }) {
  const iconSize = size === 'lg' ? 16 : size === 'sm' ? 14 : 15;
  const soft = !!disabledReason && disabled;
  const btn = <button type="button" className={cx('btn', variant, size !== 'md' && size, iconOnly && 'icon', className)} disabled={disabled && !soft} aria-disabled={soft ? 'true' : undefined} {...rest}>
    {icon ? <Icon name={icon} size={iconSize} /> : null}{iconOnly ? null : children}
    {kbd ? <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-micro)', opacity: 0.8, color: variant === 'primary' ? 'var(--primary-fg)' : 'var(--fg-subtle)' }}>{kbd}</span> : null}
  </button>;
  if (!soft) return btn;
  return <span className="has-tip" style={{ display: 'inline-flex' }}>{btn}<span className="tip" role="tooltip">{disabledReason}</span></span>;
}
