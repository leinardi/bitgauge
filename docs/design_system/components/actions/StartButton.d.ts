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
 * StartButton — the Test screen's single run control. One button that changes role (Start, Stop, Run again,
 * Retry, Start now; features/ui/screens.md §1). xl Button: 46 px, min-width --start-w on desktop with the
 * Enter / Esc hint; full width, 52 px, no hint in the compact layout.
 * The hint is decorative (aria-keyshortcuts); the accessible name is the label only.
 */
export interface StartButtonProps {
  /** @default "start" */
  role?: "start" | "stop" | "again" | "retry" | "now";
  /** Narrow layout: full width, touch height, no keyboard hint. */
  compact?: boolean;
  /** Disables the button (kept focusable) and explains why, e.g. "Server unreachable — use Retry first". */
  disabledReason?: string;
  /** Override the role's label (labels are i18n keys in production). */
  label?: string;
  onClick?: () => void;
}

export declare function StartButton(props: StartButtonProps): JSX.Element;

export declare const START_ROLES: string[];
