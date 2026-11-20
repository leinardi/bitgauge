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

const DEF = { info: "info", warn: "triangle-alert", danger: "circle-x", ok: "circle-check", neutral: "circle-minus" };

export function Notice({ tone = "info", icon, title, children, actions, live = true, attached = false }) {
  return <div className={"signal " + tone + (attached ? " attached" : "")} role={tone === "danger" ? "alert" : live ? "status" : undefined}>
    <span className="ic"><Icon name={icon || DEF[tone]} size={16} /></span>
    <div className="body"><span className="st">{title}</span>{children ? <span className="sd">{children}</span> : null}</div>
    {actions ? <div className="sa">{actions}</div> : null}
  </div>;
}
