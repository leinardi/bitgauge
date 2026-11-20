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
// phase-indicator.md — icon + "state · detail" carry the state, never colour alone.
const ST = {
  pending: { icon: "circle-dashed", c: "var(--fg-subtle)" },
  done: { icon: "circle-check", c: "var(--ok)" },
  failed: { icon: "circle-x", c: "var(--danger)" },
  cancelled: { icon: "circle-minus", c: "var(--fg-subtle)" },
  skipped: { icon: "circle-minus", c: "var(--fg-subtle)" },
  capped: { icon: "triangle-alert", c: "var(--fg-subtle)" }
};
const DIR = {
  download: { icon: "arrow-down", c: "var(--series-download)" },
  upload: { icon: "arrow-up", c: "var(--series-upload)" },
  latency: { icon: "activity", c: "var(--series-latency)" }
};
const NAME = { latency: "Idle latency", download: "Download", upload: "Upload" };
const BAR = { failed: "var(--danger)", capped: "var(--fg-subtle)", cancelled: "var(--fg-subtle)" };

export function PhaseStep({ phase = "download", label, state = "pending", progress = 0, detail, stacked = false, as = "div" }) {
  const s = state === "active" ? DIR[phase] : ST[state];
  const fill = state === "pending" || state === "skipped" ? 0 : state === "done" ? 1 : Math.max(0, Math.min(1, progress));
  const T = as;
  return <T className={"ph" + (stacked ? " stacked" : "")} aria-current={state === "active" ? "step" : undefined}>
    <div className="ph-r">
      <span className="ic" style={{ color: s.c }}><Icon name={s.icon} size={15} /></span>
      <span className="nm">{label || NAME[phase]}</span>
      <span className="mt">{state}{detail ? " · " + detail : ""}</span>
    </div>
    <div className="ph-bar" aria-hidden="true"><span style={{ width: Math.round(fill * 100) + "%", background: BAR[state] || DIR[phase].c }}></span>
    </div>
  </T>;
}

export function PhaseIndicator({ steps = [], compact = false }) {
  return <ol className={"phases" + (compact ? " compact" : "")} aria-label="Test phases"
             style={{ gridTemplateColumns: "repeat(" + Math.max(1, steps.length) + ", minmax(0, 1fr))" }}>
    {steps.map((s, i) => <PhaseStep key={s.phase + i} {...s} stacked={compact} as="li" />)}
  </ol>;
}
