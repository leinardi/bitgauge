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

let n = 0;

export function Card({
                       title,
                       icon,
                       actions,
                       children,
                       padded = true,
                       clip = true,
                       as = "div",
                       headingLevel = 2,
                       label,
                       labelledBy,
                       className,
                       style
                     }) {
  const [hid] = React.useState(() => "bg-card-" + (++n));
  const T = as, H = "h" + Math.min(6, Math.max(1, headingLevel));
  // A titled <section> is a region named by its heading unless a label is given.
  const named = labelledBy || (!label && title && as === "section" ? hid : undefined);
  return <T className={"card" + (clip ? " clip" : "") + (className ? " " + className : "")} aria-label={label} aria-labelledby={named} style={style}>
    {title ? <div className="card-h">{icon ? <span className="ico"><Icon name={icon} size={15} /></span> : null}<H className="t"
                                                                                                                   id={hid}>{title}</H>{actions ?
        <span className="right">{actions}</span> : null}</div> : null}
    {padded ? <div className="card-b">{children}</div> : children}
  </T>;
}
