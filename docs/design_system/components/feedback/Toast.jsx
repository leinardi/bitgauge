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

const DEF = { ok: "circle-check", info: "info", warn: "triangle-alert", danger: "circle-x" };

export function Toast({ tone = "ok", icon, title, message, action, onDismiss, animate = true }) {
  return <div className={"toast " + tone + (animate ? "" : " static")} role="status" aria-live="polite">
    <span className="i"><Icon name={icon || DEF[tone]} size={16} /></span>
    <div className="tb">
      <div className="t">{title}</div>
      {message ? <div className="m">{message}</div> : null}</div>
    {action}
    {onDismiss ?
        <button type="button" className="btn ghost sm icon" aria-label="Dismiss" onClick={onDismiss}><Icon name="x" size={14} /></button> : null}
  </div>;
}

export function ToastRegion({ aboveTabBar = false, children }) {
  return children ? <div className={"toast-region" + (aboveTabBar ? " above-tabbar" : "")}>{children}</div> : null;
}
