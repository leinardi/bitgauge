import React from 'react';
import { StatusBadge } from '../status/StatusBadge.jsx';
import { Link } from '../actions/Link.jsx';
// The reason is also shown as visible text by the slot (MetaList row `sub`): a tooltip is not seen on touch.
export const NOT_MEASURED_REASON = "Browsers can't see packet loss over TCP";
export function NotMeasured({ href = '#', reason = NOT_MEASURED_REASON, link = true }) {
  return <span className="notmeasured">
    <StatusBadge tone="neutral" dashed size="sm" title={reason}>Not measured</StatusBadge>
    {link ? <NotMeasuredWhy href={href} reason={reason} /> : null}
  </span>;
}
// The "Why?" link alone, to sit after the visible reason line (MetaList row `sub`).
export function NotMeasuredWhy({ href = '#', reason = NOT_MEASURED_REASON }) {
  return <Link href={href} title={reason} aria-label={'Why packet loss is not measured: ' + reason}>Why?</Link>;
}
