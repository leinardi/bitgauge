import React from 'react';
import { Icon } from '../brand/Icon.jsx';
export function EmptyState({ icon = 'history', title, headingLevel = 2, children, actions, style }) {
  const H = 'h' + Math.min(6, Math.max(1, headingLevel));
  return <div className="empty-state" style={style}>
    <div className="eg"><Icon name={icon} size={20} /></div>
    <H className="et">{title}</H>
    {children ? <div className="em">{children}</div> : null}
    {actions ? <div className="ea">{actions}</div> : null}
  </div>;
}
