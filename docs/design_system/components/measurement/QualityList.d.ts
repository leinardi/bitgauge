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
 * QualityList — Streaming, Gaming, Video calls → Great / Good / Average / Poor / Bad (AIM bands), each as a
 * StatusBadge with icon and band name, plus the fixed note "Upper bound: packet loss is not measured".
 * A band that can't be computed names the missing input ("needs loaded latency"). Contract: tiles.md.
 */
export interface QualityListProps {
  /** Bands in the order streaming, gaming, video calls; null where not computed. */
  bands?: Array<"Great" | "Good" | "Average" | "Poor" | "Bad" | null>;
  /** Text per row (or one for all) when a band is missing, e.g. "needs download". */
  missing?: string | string[];
  /** Basis tag when only one direction has a loaded-latency increase: "download only". */
  basis?: string;
  compact?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export declare function QualityList(props: QualityListProps): JSX.Element;

export declare const QUALITY: Record<string, { tone: "ok" | "warn" | "danger"; icon: string }>;
