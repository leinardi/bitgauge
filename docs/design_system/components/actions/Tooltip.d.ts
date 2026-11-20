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

/** Small hover/focus tooltip above its trigger. */
export interface TooltipProps {
  content: React.ReactNode;
  /** "end" anchors to the trigger's right edge. @default "center" */
  align?: "center" | "end";
  /** Force visible (for docs/previews). */
  open?: boolean;
  children: React.ReactNode;
}

export declare function Tooltip(props: TooltipProps): JSX.Element;
