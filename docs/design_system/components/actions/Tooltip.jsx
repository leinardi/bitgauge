import React from 'react';
export function Tooltip({ content, align = 'center', open, children }) {
  return <span className={'has-tip' + (align === 'end' ? ' tip-end' : '')} style={{ display: 'inline-flex' }}>{children}<span className="tip" role="tooltip" style={open ? { opacity: 1 } : undefined}>{content}</span></span>;
}
