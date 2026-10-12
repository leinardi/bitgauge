import React from 'react';
export function Table({ columns, rows, selected = [], onRowClick, flip = false }) {
  return <table className={'tbl' + (flip ? ' flip' : '')}>
    <thead><tr>{columns.map(c => <th key={c.key} className={c.num ? 'num' : undefined} style={c.width ? { width: c.width } : undefined}>{c.label}</th>)}</tr></thead>
    <tbody>{rows.map((r, i) => <tr key={r.id ?? i} className={(onRowClick ? 'rowlink' : '') + (selected.includes(r.id ?? i) ? ' sel' : '')} onClick={onRowClick ? () => onRowClick(r) : undefined}>
      {columns.map(c => <td key={c.key} data-label={c.label} className={c.num ? 'num' : undefined}>{c.render ? c.render(r) : r[c.key]}</td>)}
    </tr>)}</tbody>
  </table>;
}
