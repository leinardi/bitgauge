import React from 'react';
export function Tooltip({ content, align = 'center', open, children }) {
  return <span className={'has-tip' + (align === 'end' ? ' tip-end' : '')}>{children}<span className={'tip' + (open ? ' open' : '')} role="tooltip">{content}</span></span>;
}
