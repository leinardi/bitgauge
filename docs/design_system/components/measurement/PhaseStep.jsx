import React from 'react';
import { Icon } from '../brand/Icon.jsx';
const ST = {
  pending: { icon: 'circle-dashed', c: 'var(--fg-subtle)' },
  done: { icon: 'circle-check', c: 'var(--ok)' },
  failed: { icon: 'circle-x', c: 'var(--danger)' },
  cancelled: { icon: 'circle-minus', c: 'var(--fg-subtle)' },
  skipped: { icon: 'circle-minus', c: 'var(--fg-subtle)' },
  capped: { icon: 'triangle-alert', c: 'var(--fg-subtle)' },
};
const DIR = { download: { icon: 'arrow-down', c: 'var(--series-download)' }, upload: { icon: 'arrow-up', c: 'var(--series-upload)' }, latency: { icon: 'activity', c: 'var(--series-latency)' } };
const BAR = { failed: 'var(--danger)', capped: 'var(--fg-subtle)', cancelled: 'var(--fg-subtle)' };
export function PhaseStep({ phase = 'download', label, state = 'pending', progress = 0, detail }) {
  const s = state === 'active' ? DIR[phase] : ST[state];
  const fill = state === 'pending' || state === 'skipped' ? 0 : state === 'done' ? 1 : progress;
  const bar = BAR[state] || DIR[phase].c;
  return <div aria-current={state === 'active' ? 'step' : undefined} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
      <span style={{ color: s.c, display: 'inline-flex' }}><Icon name={s.icon} size={15} /></span>
      <span style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-semibold)' }}>{label || phase[0].toUpperCase() + phase.slice(1)}</span>
      <span className="mono" style={{ marginLeft: 'auto', fontSize: 'var(--text-caption)', color: 'var(--fg-subtle)' }}>{state}{detail ? ' · ' + detail : ''}</span>
    </div>
    <div style={{ height: 4, borderRadius: 2, background: 'var(--surface-3)', overflow: 'hidden' }}><div style={{ height: '100%', width: Math.round(fill * 100) + '%', background: bar, transition: 'width var(--dur-base) var(--ease-out)' }}></div></div>
  </div>;
}
