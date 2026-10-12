import React from 'react';
export function Skeleton({ width = '100%', height = 12, style }) {
  return <div className="skel" style={{ width, height, ...style }} aria-hidden="true"></div>;
}
export function SkeletonRows({ rows = 3, columns = [90, '1fr', 48] }) {
  return <div aria-busy="true">{Array.from({ length: rows }, (_, i) => <div className="skel-row" key={i}>{columns.map((c, j) => <Skeleton key={j} width={c === '1fr' ? undefined : c} style={c === '1fr' ? { flex: 1 } : undefined} />)}</div>)}</div>;
}
