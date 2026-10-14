import React from 'react';
// The one place a screen's spoken status lives: visually hidden, polite, not the 10 Hz readout.
export function LiveRegion({ message, assertive = false }) {
  return <div className="sr-only" role={assertive ? 'alert' : 'status'} aria-live={assertive ? 'assertive' : 'polite'} aria-atomic="true">{message || ''}</div>;
}
