/*
 * This file is part of BitGauge.
 *
 * Copyright (c) 2026 Roberto Leinardi
 *
 * BitGauge is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * BitGauge is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with BitGauge.  If not, see <http://www.gnu.org/licenses/>.
 */

import React from "react";

export function Table({ columns, rows, selected = [], onRowClick, flip = false }) {
  return <table className={"tbl" + (flip ? " flip" : "")}>
    <thead>
    <tr>{columns.map(c => <th key={c.key} className={c.num ? "num" : undefined} style={c.width ? { width: c.width } : undefined}>{c.label}</th>)}</tr>
    </thead>
    <tbody>{rows.map((r, i) => <tr key={r.id ?? i} className={(onRowClick ? "rowlink" : "") + (selected.includes(r.id ?? i) ? " sel" : "")}
                                   onClick={onRowClick ? () => onRowClick(r) : undefined}>
      {columns.map(c => <td key={c.key} data-label={c.label} className={c.num ? "num" : undefined}>{c.render ? c.render(r) : r[c.key]}</td>)}
    </tr>)}</tbody>
  </table>;
}
