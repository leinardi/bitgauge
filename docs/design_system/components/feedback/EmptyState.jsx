import React from 'react';
import { Icon } from '../brand/Icon.jsx';
export function EmptyState({ icon = 'history', title, children, actions, style }) {
  return <div className="empty" style={style}>
    <div className="eg"><Icon name={icon} size={20} /></div>
    <div className="et">{title}</div>
    {children ? <div className="em">{children}</div> : null}
    {actions ? <div className="ea">{actions}</div> : null}
  </div>;
}
