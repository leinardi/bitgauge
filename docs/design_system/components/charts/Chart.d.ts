/**
 * Chart — throughput / latency chart (Test live chart; Result detail per-phase charts). Contract: components/charts.md.
 * Visual definition: charts/charts.css. Production: uPlot with the same series, axes and hooks.
 * Accessibility contract (decided here, once): the plot is role="img" and its aria-label is a SUMMARY of the
 * data ("Throughput, download 590 Mbit/s so far, 7.5 of 10 s; warm-up shaded"), never a static title.
 * `summary` is required. Result-detail charts add the "Chart / table" toggle as the text alternative.
 * Series colours: download --series-download solid; upload received solid + sending faint; latency dashed on
 * its own right axis. Warm-up (live) is a --chart-band band with --chart-hatch edges and a "Warm-up" legend entry.
 */
export interface ChartSeries { pts: Array<[number, number]>; color: string; /** Faint "sending" line. */ faint?: boolean; }
export interface ChartData {
  xMax: number; yMax?: number;
  /** Plot milliseconds (latency samples) instead of rates. */
  ms?: boolean;
  series: ChartSeries[];
  /** Latency under load, own right axis, dashed. */
  lat?: Array<[number, number]>;
  /** "Now" line while live. */
  now?: number;
  /** Phase separators. */
  seps?: Array<{ t: number; label: string }>;
  /** Steady windows (partial results). */
  wins?: Array<{ t0: number; t1: number; label: string }>;
  /** Event marks: extended, data cap, cancelled, error. */
  marks?: Array<{ t: number; label: string; c?: string }>;
  /** Live warm-up bands. */
  bands?: Array<{ t0: number; t1: number }>;
  xStep?: number;
  xLabel?: (t: number) => string;
}
export interface ChartLegendItem { label: string; color: string; dashed?: boolean; faint?: boolean; }
export interface ChartProps {
  title: string;
  /** Mono meta on the right, e.g. "7.5 s / 10 s". */
  meta?: string;
  legend?: ChartLegendItem[];
  /** Required accessible summary of what the plot shows now. */
  summary: string;
  /** Empty-state text over the plot. */
  empty?: string;
  data: ChartData;
  /** @default 300 (150 compact) */
  height?: number;
  compact?: boolean;
  /** Default event-mark colour. @default "var(--fg-muted)" */
  markColor?: string;
  /** Dot at the live end of the last series. @default true */
  endDot?: boolean;
  /** @default "bits" */
  units?: 'bits' | 'bytes';
}
export declare function Chart(props: ChartProps): JSX.Element;
