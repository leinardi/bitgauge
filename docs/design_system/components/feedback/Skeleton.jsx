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

export function Skeleton({ width = "100%", height = 12, style }) {
  return <div className="skel" style={{ width, height, ...style }} aria-hidden="true"></div>;
}

export function SkeletonRows({ rows = 3, columns = [90, "1fr", 48] }) {
  return <div aria-busy="true">{Array.from({ length: rows }, (_, i) => <div className="skel-row" key={i}>{columns.map((c, j) => <Skeleton key={j}
                                                                                                                                          width={c === "1fr" ? undefined : c}
                                                                                                                                          style={c === "1fr" ? { flex: 1 } : undefined} />)}</div>)}</div>;
}
