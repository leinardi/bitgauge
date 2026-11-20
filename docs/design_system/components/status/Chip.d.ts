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

/** Pill chip for settings summaries, filters (with count) and suggested labels. */
export interface ChipProps {
  /** Selected filter (primary tint, aria-pressed). */
  selected?: boolean;
  /** A setting that differs from the server default (settings summary). Same tint as selected; static. */
  changed?: boolean;
  icon?: string;
  /** Mono count after the label (filter chips). */
  count?: number;
  /** Borderless sort-control variant. */
  sort?: boolean;
  /** md 30 px · sm 24 px (settings summary, suggested labels). @default "md" */
  size?: "md" | "sm";
  /** Makes it a toggle button (aria-pressed). */
  onClick?: () => void;
  children: React.ReactNode;
}

export declare function Chip(props: ChipProps): JSX.Element;

/** "changed" marker (dot + word, --primary-text) beside a setting that differs from the server default. */
export interface ChangedMarkProps {
}

export declare function ChangedMark(props: ChangedMarkProps): JSX.Element;
