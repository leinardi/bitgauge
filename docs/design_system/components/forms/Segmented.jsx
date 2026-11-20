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

export function Segmented({ options, value, onChange, size = "md", block = false, ariaLabel }) {
  const iconOnly = options.every(o => typeof o === "object" && o.icon && o.iconOnly);
  return <div className={"seg" + (size === "sm" ? " seg-sm" : "") + (iconOnly ? " seg-icon" : "") + (block ? " block" : "")} role="radiogroup"
              aria-label={ariaLabel}>
    {options.map(o => {
      const opt = typeof o === "string" ? { value: o, label: o } : o;
      const on = opt.value === value;
      return <button key={opt.value} type="button" role="radio" aria-checked={on} aria-label={opt.iconOnly ? opt.label : undefined}
                     className={"seg-btn" + (on ? " on" : "")} onClick={() => onChange && onChange(opt.value)}>
        {opt.icon ? <Icon name={opt.icon} size={14} stroke={opt.color ? 2 : 1.75}
                          style={opt.color ? { color: opt.color } : undefined} /> : null}{opt.iconOnly ? null : opt.label}</button>;
    })}
  </div>;
}
