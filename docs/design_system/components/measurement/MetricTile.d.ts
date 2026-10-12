/**
 * MetricTile — one measured value with its qualifier. See components/tiles.md.
 * @startingPoint section="Measurement" subtitle="Download / upload / latency tiles in every state" viewport="700x260"
 */
export interface MetricTileProps {
  /** Eyebrow, e.g. "Download". */
  label: string;
  /** Formatted number (3 significant digits). Omit for empty "—". */
  value?: string | number;
  /** Separate, smaller unit: "Mbit/s", "ms". */
  unit?: string;
  /** Qualifier line, e.g. "peak 640 Mbit/s". Defaults to the state name for non-done states. */
  note?: React.ReactNode;
  /** @default "done" */
  state?: 'empty' | 'live' | 'done' | 'partial' | 'incomplete' | 'low-confidence';
  /** Series colour swatch next to the label, e.g. "var(--series-download)". */
  accent?: string;
}
export declare function MetricTile(props: MetricTileProps): JSX.Element;
