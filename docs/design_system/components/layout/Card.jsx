import React from 'react';
import { Icon } from '../brand/Icon.jsx';
export function Card({ title, icon, actions, children, padded = true, style }) {
  return <div className="card" style={{ overflow: 'hidden', ...style }}>
    {title ? <div className="card-h">{icon ? <span className="ico" style={{ display: 'inline-flex' }}><Icon name={icon} size={15} /></span> : null}<span className="t">{title}</span>{actions ? <span className="right">{actions}</span> : null}</div> : null}
    {padded ? <div className="card-b">{children}</div> : children}
  </div>;
}
