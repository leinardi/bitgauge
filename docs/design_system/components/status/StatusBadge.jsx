import React from 'react';
import { Icon } from '../brand/Icon.jsx';
const DEF = { ok: 'circle-check', warn: 'triangle-alert', danger: 'circle-x', info: 'info', neutral: 'circle-dashed' };
export function StatusBadge({ tone = 'neutral', icon, dashed = false, size = 'md', children, ...rest }) {
  return <span className={'sbadge ' + tone + (dashed ? ' dashed' : '') + (size === 'sm' ? ' sm' : '')} {...rest}><Icon name={icon || DEF[tone]} size={size === 'sm' ? 12 : 13} stroke={2} />{children}</span>;
}
