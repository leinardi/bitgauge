import React from 'react';
export function StatusPill({ tone = 'neutral', children }) {
  return <span className={'pill ' + tone}><span className="d"></span>{children}</span>;
}
