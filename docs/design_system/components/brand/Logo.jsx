import React from 'react';
const FULL = (d, u, l) => '<path d="M14.32 53.68 A25 25 0 1 1 49.68 53.68" fill="none" stroke="currentColor" stroke-opacity=".14" stroke-width="5" stroke-linecap="round"/>'
  + '<path d="M14.32 53.68 A25 25 0 1 1 53.65 23.5" fill="none" style="stroke:' + d + '" stroke-width="5" stroke-linecap="round"/>'
  + '<path d="M19.98 48.02 A17 17 0 0 1 32 19" fill="none" style="stroke:' + u + '" stroke-width="5" stroke-linecap="round"/>'
  + '<path d="M25.64 42.36 A9 9 0 0 1 27.5 28.21" fill="none" style="stroke:' + l + '" stroke-width="4" stroke-dasharray="2.6 3"/>';
const SMALL = (d, u) => '<path d="M15.03 48.97 A24 24 0 1 1 48.97 48.97" fill="none" stroke="currentColor" stroke-opacity=".2" stroke-width="7" stroke-linecap="round"/>'
  + '<path d="M15.03 48.97 A24 24 0 1 1 54.35 23.24" fill="none" style="stroke:' + d + '" stroke-width="7" stroke-linecap="round"/>'
  + '<path d="M23.51 40.49 A12 12 0 0 1 32 20" fill="none" style="stroke:' + u + '" stroke-width="7" stroke-linecap="round"/>';
export function Logo({ size = 28, variant = 'color', geometry, wordmark = false, style }) {
  const g = geometry || (size <= 20 ? 'small' : 'full');
  const c = variant === 'mono' ? ['currentColor', 'currentColor', 'currentColor'] : ['var(--series-download)', 'var(--series-upload)', 'var(--series-latency)'];
  const mark = <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden={wordmark ? 'true' : undefined} role={wordmark ? undefined : 'img'} aria-label={wordmark ? undefined : 'BitGauge'} style={{ display: 'block', flex: 'none' }} dangerouslySetInnerHTML={{ __html: g === 'small' ? SMALL(c[0], c[1]) : FULL(...c) }} />;
  if (!wordmark) return <span style={{ display: 'inline-flex', lineHeight: 0, ...style }}>{mark}</span>;
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: Math.round(size * 0.32), fontFamily: 'var(--font-sans)', fontWeight: 600, fontSize: Math.round(size * 0.6), letterSpacing: '-0.01em', color: 'var(--fg)', ...style }}>{mark}<span>Bit<span style={{ color: 'var(--primary-text)' }}>Gauge</span></span></span>;
}
