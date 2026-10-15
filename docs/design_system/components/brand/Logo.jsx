import React from 'react';
const FULL = (d, u, l) => '<path d="M14.32 53.68 A25 25 0 1 1 49.68 53.68" fill="none" stroke="currentColor" stroke-opacity=".14" stroke-width="5" stroke-linecap="round"/>'
  + '<path d="M14.32 53.68 A25 25 0 1 1 53.65 23.5" fill="none" style="stroke:' + d + '" stroke-width="5" stroke-linecap="round"/>'
  + '<path d="M19.98 48.02 A17 17 0 0 1 32 19" fill="none" style="stroke:' + u + '" stroke-width="5" stroke-linecap="round"/>'
  + '<path d="M25.64 42.36 A9 9 0 0 1 27.5 28.21" fill="none" style="stroke:' + l + '" stroke-width="4" stroke-dasharray="2.6 3"/>';
const SMALL = (d, u) => '<path d="M15.03 48.97 A24 24 0 1 1 48.97 48.97" fill="none" stroke="currentColor" stroke-opacity=".2" stroke-width="7" stroke-linecap="round"/>'
  + '<path d="M15.03 48.97 A24 24 0 1 1 54.35 23.24" fill="none" style="stroke:' + d + '" stroke-width="7" stroke-linecap="round"/>'
  + '<path d="M23.51 40.49 A12 12 0 0 1 32 20" fill="none" style="stroke:' + u + '" stroke-width="7" stroke-linecap="round"/>';
// Wordmark text size per mark size (header 28 → lg, compact header 26 → md, About 40 → xl, share image 15 → sm).
const WM = s => s >= 36 ? 'xl' : s >= 27 ? 'lg' : s >= 20 ? 'md' : 'sm';
// The mark is hidden from assistive technology whenever a visible name sits next to it (wordmark, or `decorative`).
export function Logo({ size = 28, variant = 'color', geometry, wordmark = false, wordmarkSize, href, label = 'BitGauge home', decorative = false, style }) {
  const g = geometry || (size <= 20 ? 'small' : 'full');
  const hidden = wordmark || decorative;
  const c = variant === 'mono' ? ['currentColor', 'currentColor', 'currentColor'] : ['var(--series-download)', 'var(--series-upload)', 'var(--series-latency)'];
  const mark = <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden={hidden ? 'true' : undefined} role={hidden ? undefined : 'img'} aria-label={hidden ? undefined : 'BitGauge'} style={{ display: 'block', flex: 'none', color: variant === 'mono' ? undefined : 'var(--fg)' }} dangerouslySetInnerHTML={{ __html: g === 'small' ? SMALL(c[0], c[1]) : FULL(...c) }} />;
  if (!wordmark) return <span style={{ display: 'inline-flex', lineHeight: 0, ...style }}>{mark}</span>;
  const inner = <>{mark}<span>Bit<span className="g">Gauge</span></span></>;
  const cls = 'wm ' + (wordmarkSize || WM(size));
  return href ? <a className={cls} href={href} aria-label={label} style={style}>{inner}</a> : <span className={cls} style={style}>{inner}</span>;
}
