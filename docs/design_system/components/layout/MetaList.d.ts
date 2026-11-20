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
 * MetaList — label / value rows (`<dl>`): Test meta (data used, duration, browser), About facts,
 * base-path facts. Optional row icon and sub-label; values in mono; a missing value renders "—" in --fg-subtle.
 * With `title` it renders as a tile card with an eyebrow ("Test", "Session"). `columns` lays rows out in a grid.
 * Stat — one labelled value for horizontal strips (connection info: Client IP, Protocol, Streams).
 */
export interface MetaRow {
  key?: string;
  icon?: string;
  label: React.ReactNode;
  sub?: React.ReactNode;
  /** Mono value. null/undefined/"—" renders the empty dash. */
  value?: React.ReactNode;
  tone?: "danger";
}

export interface MetaListProps {
  rows: MetaRow[];
  /** @default 1 */
  columns?: number;
  /** Card eyebrow; renders the list as a tile card. */
  title?: string;
  compact?: boolean;
  /** Facts layout: label left, value right, no icons, tighter rows (About, base-path error). */
  facts?: boolean;
  /** Placement only. */
  className?: string;
  style?: React.CSSProperties;
}

export declare function MetaList(props: MetaListProps): JSX.Element;

export interface StatProps {
  label: string;
  value?: React.ReactNode;
  /** Subtle qualifier after the value: "IPv4", "auto · plateau: cap". */
  sub?: React.ReactNode;
  /** Custom value (e.g. the context Menu). */
  children?: React.ReactNode;
}

export declare function Stat(props: StatProps): JSX.Element;
