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
 * PhaseChart — Result-detail per-phase chart card (charts.md): stored series with null gaps (never interpolated),
 * warm-up as a hatched, excluded interval (--chart-hatch), event chips (cancelled, cap, extended, lost), latency
 * under load dashed on its own axis, and the "Chart / Table" toggle — the table (children) is the text alternative.
 * The plot's aria-label is "<title> chart: <summary>" (`summary`, required: the data, without the title).
 */
export interface PhaseChartMark {
  t: number;
  label: string;
  icon: string;
  /** line colour */ c: string;
  /** chip border */ bd?: string;
  /** chip text */ fg?: string;
}

export interface PhaseChartProps {
  title: string;
  icon: string;
  color: string;
  meta?: string;
  /** Title heading level; the chart is a region named by it. @default 2 */
  headingLevel?: 1 | 2 | 3 | 4 | 5 | 6;
  summary: string;
  /** [t s, value | null]; nulls are gaps. */
  pts: Array<[number, number | null]>;
  lat?: Array<[number, number | null]>;
  xMax: number;
  ms?: boolean;
  xStep?: number;
  xLabel?: (t: number) => string;
  units?: "bits" | "bytes";
  width: number;
  height?: number;
  warmup?: { t1: number; label: string } | null;
  marks?: PhaseChartMark[];
  gapLabel?: string;
  view?: "chart" | "table";
  onViewChange?: (v: "chart" | "table") => void;
  className?: string;
  style?: React.CSSProperties;
  /** Table view content. */
  children?: React.ReactNode;
}

export declare function PhaseChart(props: PhaseChartProps): JSX.Element;
