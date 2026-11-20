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

/**
 * PhaseStep — one step of the phase indicator: state icon, phase name, mono "state · detail", 4 px bar.
 * PhaseIndicator — the `<ol aria-label="Test phases">` of 1–3 steps in configured order.
 * Contract: components/phase-indicator.md. The meta line is always "<state>[ · <detail>]".
 */
export interface PhaseStepProps {
  /** @default "download" */
  phase?: "latency" | "download" | "upload";
  /** Override the name. Default "Idle latency" / "Download" / "Upload". The info phase shows as label "Connecting…" on the first step. */
  label?: string;
  /** @default "pending" */
  state?: "pending" | "active" | "done" | "failed" | "cancelled" | "skipped" | "capped";
  /** 0–1 (active / failed / cancelled / capped). */
  progress?: number;
  /** After the state: "~10–20 s", "4.6 s left", "3.1 ms", "interrupted", "3.1 s", "data cap". */
  detail?: string;
  /** Meta wraps under the name (narrow layout). */
  stacked?: boolean;
}

export declare function PhaseStep(props: PhaseStepProps): JSX.Element;

export interface PhaseIndicatorProps {
  steps: PhaseStepProps[];
  /** Narrow layout: tighter gap, stacked steps. */
  compact?: boolean;
}

export declare function PhaseIndicator(props: PhaseIndicatorProps): JSX.Element;
