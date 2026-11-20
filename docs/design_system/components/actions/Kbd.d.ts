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
 * Kbd — keyboard-shortcut keycap. Visual definition: components/actions/actions.css (`.kbd`, `.kbd-group`).
 * Flat outlined key: mono micro text in --fg-faint, 1px --border-default outline, --radius-xs, no fill.
 * On a primary surface (`.btn.primary`) text and outline take --primary-fg at 70% / 40%.
 *
 * Rules:
 * - One keycap per independent shortcut; a chord stays in ONE keycap ("Ctrl+K"), alternatives are separate keycaps (["/", "Ctrl+K"]).
 * - Key names: Enter, Esc, Tab, Space, Ctrl, Shift, Alt, ↑ ↓ ← →, single letters uppercase.
 * - Always decorative (aria-hidden). Expose the shortcut on the owning control with `aria-keyshortcuts`
 *   (Button's `kbd` prop does this). --fg-faint is allowed here only because the keycap is never the accessible name.
 * - Desktop layouts only; hide on touch layouts.
 */
export interface KbdProps {
  /** One key label, or several shown side by side. */
  keys: string | string[];
  className?: string;
}

export declare function Kbd(props: KbdProps): JSX.Element;
