import React from 'react';
export function StatusPill({ tone = 'neutral', size = 'md', dot = true, dashed = false, children }) {
  return <span className={'pill ' + tone + (size === 'sm' ? ' sm' : '') + (dot ? '' : ' nodot') + (dashed ? ' dashed' : '')}>{dot ? <span className="d" aria-hidden="true"></span> : null}{children}</span>;
}
