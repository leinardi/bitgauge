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

export function Switch({ checked = false, onChange, label, disabled = false, ...rest }) {
  const sw = <button type="button" role="switch" aria-checked={checked} disabled={disabled} className={"switch" + (checked ? " on" : "")}
                     onClick={() => onChange && onChange(!checked)} {...rest}><span className="knob"></span></button>;
  if (!label) return sw;
  return <label className={"switch-l" + (checked ? " on" : "")}>{sw}<span>{label}</span></label>;
}
