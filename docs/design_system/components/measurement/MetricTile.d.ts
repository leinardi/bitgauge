/**
 * MetricTile — one measured value with its qualifier. Contract: components/tiles.md. Visual: measurement.css `.tile`.
 * States follow the result object's direction status (measurement.md §17: measured → done, partial,
 * insufficient-data, skipped, error) plus the live UI states (empty, warming-up, live) and the
 * low-confidence qualifier. Non-done states carry a status pill; the qualifier line carries the reason.
 * @startingPoint section="Measurement" subtitle="Download / upload / latency tiles in every state" viewport="700x260"
 */
export interface MetricTileProps {
  /** Eyebrow, e.g. "Download". */
  label: string;
  /** Leading glyph: "arrow-down", "arrow-up", "activity", "trending-up", "database". */
  icon?: string;
  /** Glyph colour: a series token for directions ("var(--series-download)"); default --fg-subtle. */
  accent?: string;
  /** Formatted number (3 significant digits). Never shown for empty, warming-up, insufficient-data, skipped or error. */
  value?: string | number;
  /** Separate, smaller mono unit: "Mbit/s", "ms". */
  unit?: string;
  /** Qualifier line (mono). Defaults to the state word. Error: "error · connection lost". Live: "peak 640". */
  note?: React.ReactNode;
  /** Secondary lines: overhead compensation, data used, min / median / p90. */
  notes?: React.ReactNode[];
  /** @default "done" */
  state?: 'empty' | 'warming-up' | 'live' | 'done' | 'partial' | 'insufficient-data' | 'low-confidence' | 'skipped' | 'error';
  /** Override the state pill's text, e.g. "Partial — stopped early". */
  tag?: string;
  /** Narrow layout: 24 px value, tighter padding. */
  compact?: boolean;
  /** Placement only (grid-column). */
  className?: string;
  style?: React.CSSProperties;
}
export declare function MetricTile(props: MetricTileProps): JSX.Element;
