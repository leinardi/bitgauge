import React from 'react';
import { Icon } from '../brand/Icon.jsx';
const DEF = { ok: 'circle-check', info: 'info', warn: 'triangle-alert', danger: 'circle-x' };
export function Toast({ tone = 'ok', icon, title, message, action, onDismiss, animate = true }) {
  return <div className={'toast ' + tone + (animate ? '' : ' static')} role="status" aria-live="polite">
    <span className="i"><Icon name={icon || DEF[tone]} size={16} /></span>
    <div className="tb"><div className="t">{title}</div>{message ? <div className="m">{message}</div> : null}</div>
    {action}
    {onDismiss ? <button type="button" className="btn ghost sm icon" aria-label="Dismiss" onClick={onDismiss}><Icon name="x" size={14} /></button> : null}
  </div>;
}
export function ToastRegion({ aboveTabBar = false, children }) {
  return children ? <div className={'toast-region' + (aboveTabBar ? ' above-tabbar' : '')}>{children}</div> : null;
}
