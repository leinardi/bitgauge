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

/** The BitGauge mark: three concentric gauge arcs in the series colours (download teal, upload violet, latency blue dashed). */
export interface LogoProps {
  /** Pixel size of the mark. ≤ 20 switches to the favicon geometry. @default 28 */
  size?: number;
  /** "color" uses series tokens; "mono" draws every arc in currentColor. @default "color" */
  variant?: "color" | "mono";
  /** Force geometry. @default size <= 20 ? "small" : "full" */
  geometry?: "full" | "small";
  /** Append the wordmark: "Bit" in --fg + "Gauge" in --primary-text, IBM Plex Sans 600 (navigation.css `.wm`). @default false */
  wordmark?: boolean;
  /** Wordmark text size (sm 11 · md 15 · lg 16 · xl 18 px). @default from size: ≥36 xl, ≥27 lg, ≥20 md, else sm */
  wordmarkSize?: "sm" | "md" | "lg" | "xl";
  /** Render the wordmark as a home link. */
  href?: string;
  /** Accessible name of the home link. @default "BitGauge home" */
  label?: string;
  /** Hide the mark from assistive technology (aria-hidden, no role or name) because the product name is visible
   *  next to it, e.g. the compact AppHeader's wordmark. Wordmark mode does this already. @default false */
  decorative?: boolean;
  style?: React.CSSProperties;
}

export declare function Logo(props: LogoProps): JSX.Element;
