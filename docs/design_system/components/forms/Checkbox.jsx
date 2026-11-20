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

// Checkbox — role="checkbox" button (Reka UI Checkbox): 16 px box, teal when checked, optional glyph before the label.
export function Checkbox({ checked = false, onChange, disabled = false, icon, iconColor, size = "md", children }) {
  return <button type="button" role="checkbox" aria-checked={checked} disabled={disabled} className={"cbx" + (size === "sm" ? " sm" : "")}
                 onClick={() => onChange && onChange(!checked)}>
    <span className={"box" + (checked ? " on" : "")} aria-hidden="true">{checked ? <Icon name="check" size={12} stroke={3} /> : null}</span>
    {icon ? <span className="ic" style={iconColor ? { color: iconColor } : undefined}><Icon name={icon} size={14} stroke={2} /></span> : null}
    <span>{children}</span>
  </button>;
}

// ChoiceCard — one option of a card radio group (preset picker). Put several in a role="radiogroup".
// disabledReason: shown but not selectable (aria-disabled, stays focusable so the tooltip is reachable).
export function ChoiceCard({ selected = false, icon, title, badge, children, onSelect, disabledReason }) {
  const tipId = React.useId(), dis = !!disabledReason;
  const pick = dis ? undefined : onSelect;
  const el = <div role="radio" aria-checked={selected && !dis} aria-disabled={dis || undefined} aria-describedby={dis ? tipId : undefined}
                  tabIndex={0} className={"choice" + (selected && !dis ? " on" : "")} onClick={pick}
                  onKeyDown={e => {
                    if (e.key === " " || e.key === "Enter") {
                      e.preventDefault();
                      pick && pick();
                    }
                  }}>
    <div className="choice-h">{icon ? <span className="ic"><Icon name={icon} size={16} /></span> : null}<span className="t">{title}</span>{badge}<span
        className="rd" aria-hidden="true"><span></span></span></div>
    {children ? <span className="choice-d">{children}</span> : null}
  </div>;
  if (!dis) return el;
  return <span className="has-tip block">{el}<span className="tip" role="tooltip" id={tipId}>{disabledReason}</span></span>;
}
