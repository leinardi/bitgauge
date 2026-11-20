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

/** Segmented single-choice control (streams Auto/Fixed/Single, units Bits/Bytes, theme). role="radiogroup". */
export interface SegmentedOption {
  value: string;
  /** Visible label, or the accessible name when iconOnly. */
  label: string;
  icon?: string;
  /** Icon colour — series tokens for direction choices ("var(--series-upload)"). */
  color?: string;
  /** Show only the icon; `label` becomes its aria-label (header theme switch). */
  iconOnly?: boolean;
}

export interface SegmentedProps {
  options: Array<string | SegmentedOption>;
  value: string;
  onChange?: (value: string) => void;
  /** sm = 28 px compact. @default "md" */
  size?: "sm" | "md";
  /** Stretch to the container, equal segments (narrow layouts). */
  block?: boolean;
  /** Name of the group, e.g. "Theme". */
  ariaLabel?: string;
}

export declare function Segmented(props: SegmentedProps): JSX.Element;
