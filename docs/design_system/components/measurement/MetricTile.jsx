import React from 'react';
const NOTE = { partial: 'var(--warn-fg)', incomplete: 'var(--warn-fg)', 'low-confidence': 'var(--warn-fg)' };
export function MetricTile({ label, value, unit, note, state = 'done', accent }) {
  const empty = state === 'empty' || value == null;
  const word = state === 'live' && value == null;
  return <div className="card" style={{ padding: 'var(--space-3-5) var(--space-4)' }}>
    <div className="ds-eyebrow" style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 6 }}>{accent ? <span style={{ width: 8, height: 2, borderRadius: 1, background: accent }}></span> : null}{label}</div>
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-1)', marginTop: 'var(--space-1-5)', minHeight: 34 }}>
      {word ? <span className="mono" style={{ fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--fg-subtle)' }}>warming up</span>
        : <span className="mono" style={{ fontSize: 24, fontWeight: 500, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', color: empty ? 'var(--fg-subtle)' : 'var(--fg)' }}>{empty ? '—' : value}</span>}
      {!empty && unit ? <span className="mono" style={{ fontSize: 'var(--text-caption)', color: 'var(--fg-muted)' }}>{unit}</span> : null}
    </div>
    <div style={{ fontSize: 'var(--text-caption)', color: NOTE[state] || 'var(--fg-subtle)' }}>{note ?? (state === 'done' ? '' : state.replace('-', ' '))}</div>
  </div>;
}
