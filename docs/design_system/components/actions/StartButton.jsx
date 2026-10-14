import React from 'react';
import { Button } from './Button.jsx';
// The Start / Stop control: one button that changes role (features/ui/screens.md §1).
const ROLE = {
  start: { label: 'Start test', icon: 'play', variant: 'primary', kbd: 'Enter' },
  stop: { label: 'Stop test', icon: 'square', variant: 'secondary', kbd: 'Esc' },
  again: { label: 'Run again', icon: 'rotate-ccw', variant: 'primary', kbd: 'Enter' },
  retry: { label: 'Retry test', icon: 'refresh-cw', variant: 'primary', kbd: 'Enter' },
  now: { label: 'Start now', icon: 'play', variant: 'primary', kbd: 'Enter' }
};
export const START_ROLES = Object.keys(ROLE);
export function StartButton({ role = 'start', compact = false, disabledReason, onClick, label }) {
  const r = ROLE[role] || ROLE.start;
  return <Button className="start" variant={r.variant} size="xl" icon={r.icon} kbd={compact ? undefined : r.kbd} block={compact} touch={compact}
    disabled={!!disabledReason} disabledReason={disabledReason} onClick={onClick}>{label || r.label}</Button>;
}
