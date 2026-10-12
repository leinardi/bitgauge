import React from 'react';
import { Icon } from '../brand/Icon.jsx';
const DEF = { info: 'info', warn: 'triangle-alert', danger: 'circle-x', ok: 'circle-check' };
export function Notice({ tone = 'info', icon, title, children, actions }) {
  return <div className={'signal ' + tone} role={tone === 'danger' ? 'alert' : undefined}>
    <span style={{ color: 'var(--' + tone + ')', display: 'inline-flex' }}><Icon name={icon || DEF[tone]} size={16} /></span>
    <div className="body"><div className="st">{title}</div>{children ? <div style={{ fontSize: 'var(--text-caption)', color: 'var(--fg-muted)', marginTop: 2 }}>{children}</div> : null}</div>
    {actions}
  </div>;
}
