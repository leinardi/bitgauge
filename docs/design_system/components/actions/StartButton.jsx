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
import { Button } from "./Button.jsx";
// The Start / Stop control: one button that changes role (features/ui/screens.md §1).
const ROLE = {
  start: { label: "Start test", icon: "play", variant: "primary", kbd: "Enter" },
  stop: { label: "Stop test", icon: "square", variant: "secondary", kbd: "Esc" },
  again: { label: "Run again", icon: "rotate-ccw", variant: "primary", kbd: "Enter" },
  retry: { label: "Retry test", icon: "refresh-cw", variant: "primary", kbd: "Enter" },
  now: { label: "Start now", icon: "play", variant: "primary", kbd: "Enter" }
};
export const START_ROLES = Object.keys(ROLE);

export function StartButton({ role = "start", compact = false, disabledReason, onClick, label }) {
  const r = ROLE[role] || ROLE.start;
  return <Button className="start" variant={r.variant} size="xl" icon={r.icon} kbd={compact ? undefined : r.kbd} block={compact} touch={compact}
                 disabled={!!disabledReason} disabledReason={disabledReason} onClick={onClick}>{label || r.label}</Button>;
}
