import React from 'react';
import { Icon } from '../brand/Icon.jsx';
const DEF = { info: 'info', warn: 'triangle-alert', danger: 'circle-x', ok: 'circle-check', neutral: 'circle-minus' };
export function Notice({ tone = 'info', icon, title, children, actions, live = true, attached = false }) {
  return <div className={'signal ' + tone + (attached ? ' attached' : '')} role={tone === 'danger' ? 'alert' : live ? 'status' : undefined}>
    <span className="ic"><Icon name={icon || DEF[tone]} size={16} /></span>
    <div className="body"><span className="st">{title}</span>{children ? <span className="sd">{children}</span> : null}</div>
    {actions ? <div className="sa">{actions}</div> : null}
  </div>;
}
