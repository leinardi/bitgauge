import React from 'react';
import { Icon } from '../brand/Icon.jsx';
const DEF = { ok: 'circle-check', info: 'info', warn: 'triangle-alert', danger: 'circle-x' };
export function Toast({ tone = 'ok', icon, title, message, action, animate = true }) {
  return <div className={'toast ' + tone} role="status" style={animate ? undefined : { opacity: 1, transform: 'none', animation: 'none' }}>
    <span className="i"><Icon name={icon || DEF[tone]} size={16} /></span>
    <div style={{ flex: 1 }}><div className="t">{title}</div>{message ? <div className="m">{message}</div> : null}</div>
    {action}
  </div>;
}
