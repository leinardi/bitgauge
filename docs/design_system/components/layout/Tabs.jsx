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

export function Tabs({ tabs, value, onChange }) {
  return <div className="tabs" role="tablist">
    {tabs.map(t => {
      const tab = typeof t === "string" ? { value: t, label: t } : t;
      const on = tab.value === value;
      return <button key={tab.value} type="button" role="tab" aria-selected={on} className={"tab" + (on ? " active" : "")}
                     onClick={() => onChange && onChange(tab.value)}>{tab.icon ? <Icon name={tab.icon} size={15} /> : null}{tab.label}</button>;
    })}
  </div>;
}
