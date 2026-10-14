import React from 'react';
import { StatusBadge } from '../status/StatusBadge.jsx';
import { Link } from '../actions/Link.jsx';
const WHY = "Browsers can't see packet loss over TCP";
export function NotMeasured({ href = '#', reason = WHY }) {
  return <span className="notmeasured">
    <StatusBadge tone="neutral" dashed size="sm" title={reason}>Not measured</StatusBadge>
    <Link href={href} title={reason} aria-label={'Why packet loss is not measured: ' + reason}>Why?</Link>
  </span>;
}
