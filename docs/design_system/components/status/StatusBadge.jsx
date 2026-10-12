import React from 'react';
import { Icon } from '../brand/Icon.jsx';
const DEF = { ok: 'circle-check', warn: 'triangle-alert', danger: 'circle-x', info: 'info', neutral: 'circle-dashed' };
export function StatusBadge({ tone = 'neutral', icon, dashed = false, children }) {
  return <span className={'sbadge ' + tone} style={dashed ? { borderStyle: 'dashed' } : undefined}><Icon name={icon || DEF[tone]} size={13} />{children}</span>;
}
