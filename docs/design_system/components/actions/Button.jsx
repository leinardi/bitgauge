import React from 'react';
import { Icon } from '../brand/Icon.jsx';
const cx = (...a) => a.filter(Boolean).join(' ');
const ICON = { sm: 14, md: 15, lg: 16, xl: 16 };
let n = 0;
export function Button({ variant = 'secondary', size = 'md', icon, iconAfter, iconOnly = false, kbd, block = false, touch = false, href, disabled = false, disabledReason, tipAlign = 'center', children, className, ...rest }) {
  const [tipId] = React.useState(() => 'bg-tip-' + (++n));
  const soft = !!disabledReason && disabled;
  const cls = cx('btn', variant, size !== 'md' && size, iconOnly && 'icon', block && 'block', touch && 'touch', className);
  const isz = ICON[size] || 15;
  const inner = <>
    {icon ? <Icon name={icon} size={isz} stroke={size === 'xl' ? 2 : 1.75} /> : null}
    {iconOnly ? null : children}
    {iconAfter ? <Icon name={iconAfter} size={isz - 1} /> : null}
    {kbd ? <span className="kbd" aria-hidden="true">{kbd}</span> : null}
  </>;
  const a11y = { 'aria-keyshortcuts': kbd || undefined, 'aria-disabled': soft ? 'true' : undefined, 'aria-describedby': soft ? tipId : undefined };
  const el = href && !disabled
    ? <a className={cls} href={href} {...a11y} {...rest}>{inner}</a>
    : <button type="button" className={cls} disabled={disabled && !soft} {...a11y} {...rest}>{inner}</button>;
  if (!soft) return el;
  return <span className={cx('has-tip', tipAlign === 'end' && 'tip-end', block && 'block')}>{el}<span className="tip" role="tooltip" id={tipId}>{disabledReason}</span></span>;
}
