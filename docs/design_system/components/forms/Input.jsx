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

const cx = (...a) => a.filter(Boolean).join(" ");

export function Input({ icon, suffix, mono = false, size = "md", invalid = false, error, label, className, style, ...rest }) {
  const shell = <div className={cx("input", mono && "mono", size === "sm" && "sm", (invalid || error) && "invalid", className)} style={style}>
    {icon ? <Icon name={icon} size={size === "sm" ? 13 : 15} /> : null}<input aria-invalid={invalid || !!error || undefined} {...rest} />{suffix ?
      <span className="sfx">{suffix}</span> : null}
  </div>;
  if (!label && !error) return shell;
  return <label className="field">
    {label ? <span className="field-l">{label}</span> : null}
    {shell}
    {error ? <span className="fmsg"><Icon name="circle-alert" size={12} />{error}</span> : null}
  </label>;
}

// Inline field error, linked from its input with aria-describedby (the input keeps focus; Tab leaves as usual).
export function FieldError({ id, children, style }) {
  return <span className="fmsg" id={id} style={style}><Icon name="circle-alert" size={12} />{children}</span>;
}
