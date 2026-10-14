import React from 'react';
import { Icon } from '../brand/Icon.jsx';
export function Card({ title, icon, actions, children, padded = true, clip = true, as = 'div', label, labelledBy, className, style }) {
  const T = as;
  return <T className={'card' + (clip ? ' clip' : '') + (className ? ' ' + className : '')} aria-label={label} aria-labelledby={labelledBy} style={style}>
    {title ? <div className="card-h">{icon ? <span className="ico"><Icon name={icon} size={15} /></span> : null}<span className="t">{title}</span>{actions ? <span className="right">{actions}</span> : null}</div> : null}
    {padded ? <div className="card-b">{children}</div> : children}
  </T>;
}
