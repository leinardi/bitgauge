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
import { Icon } from "../brand/Icon.jsx";

export function Chip({ selected = false, changed = false, icon, count, sort = false, size = "md", onClick, children }) {
  const cls = "chip" + (selected ? " on" : "") + (changed ? " changed" : "") + (sort ? " sort" : "") + (size === "sm" ? " sm" : "");
  const inner = <>{icon ? <Icon name={icon} size={size === "sm" ? 12 : 14} stroke={size === "sm" ? 2 : 1.75} /> : null}{children}{count != null ?
      <span className="n">{count}</span> : null}</>;
  return onClick ? <button type="button" className={cls} aria-pressed={sort ? undefined : selected} onClick={onClick}>{inner}</button> :
      <span className={cls}>{inner}</span>;
}

// "changed" marker next to a setting that differs from the server default (screens.md §4).
export function ChangedMark() {
  return <span className="chgd"><span className="d" aria-hidden="true"></span>changed</span>;
}
