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

/** Shimmering placeholder matching final layout; refreshes keep content instead. */
export interface SkeletonProps {
  /** @default "100%" */
  width?: number | string;
  /** @default 12 */
  height?: number | string;
  style?: React.CSSProperties;
}

export declare function Skeleton(props: SkeletonProps): JSX.Element;

export interface SkeletonRowsProps {
  /** @default 3 */
  rows?: number;
  /** Column widths in px, or "1fr" to flex. @default [90, "1fr", 48] */
  columns?: Array<number | "1fr">;
}

export declare function SkeletonRows(props: SkeletonRowsProps): JSX.Element;
