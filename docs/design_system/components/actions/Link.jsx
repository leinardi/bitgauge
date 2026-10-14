import React from 'react';
import { Icon } from '../brand/Icon.jsx';
export function Link({ href = '#', icon, external = false, children, className, ...rest }) {
  return <a href={href} className={'link' + (className ? ' ' + className : '')} {...rest}>
    {icon ? <Icon name={icon} size={13} /> : null}{children}{external ? <Icon name="external-link" size={12} /> : null}
  </a>;
}
