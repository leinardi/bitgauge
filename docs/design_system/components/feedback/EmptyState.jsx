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

export function EmptyState({ icon = "history", title, headingLevel = 2, children, actions, style }) {
  const H = "h" + Math.min(6, Math.max(1, headingLevel));
  return <div className="empty-state" style={style}>
    <div className="eg"><Icon name={icon} size={20} /></div>
    <H className="et">{title}</H>
    {children ? <div className="em">{children}</div> : null}
    {actions ? <div className="ea">{actions}</div> : null}
  </div>;
}
