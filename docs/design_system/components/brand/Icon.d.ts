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

/** Lucide outline glyph from the BitGauge set. 1.75 px stroke, currentColor. */
export interface IconProps {
  /** Glyph name, e.g. "arrow-down", "activity", "circle-check", "wifi-off". Unknown names render a dashed placeholder square. */
  name: string;
  /** Pixel size (14–20 in UI). @default 16 */
  size?: number;
  /** Stroke width. @default 1.75 */
  stroke?: number;
  className?: string;
  style?: React.CSSProperties;
}

export declare function Icon(props: IconProps): JSX.Element;

export declare const ICON_NAMES: string[];
