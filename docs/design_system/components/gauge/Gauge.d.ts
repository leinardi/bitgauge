/**
 * Gauge — place on a --surface-2 card (the track is --surface-3, invisible on --bg-base in light theme). 270° log arc over a 4-decade window (rate) or 1–1000 ms (latency). See components/gauge.md.
 * @startingPoint section="Measurement" subtitle="Live speed gauge with readout, range band and peak tick" viewport="700x340"
 */
export interface GaugeProps {
  /** Pixel size (300 desktop, ~240 mobile). Tick labels are hidden below 220. @default 300 */
  size?: number;
  /** Current value in bit/s (rate) or ms. Omit for idle. */
  value?: number;
  /** Window from the engine. @default 1e6 / 1 (ms) */
  lo?: number;
  /** @default 1e10 / 1000 (ms) */
  hi?: number;
  /** @default "rate" */
  mode?: 'rate' | 'ms';
  /** Recent-range band. */
  bandLo?: number;
  bandHi?: number;
  /** Peak tick. */
  peak?: number;
  /** Inner upload arc on completion. */
  inner?: number;
  /** Arc colour. @default "var(--series-download)" */
  color?: string;
  /** "Download", "Upload", "Latency". */
  eyebrow?: string;
  eyebrowIcon?: string;
  /** Formatted readout text, e.g. "612". */
  readout?: string;
  unit?: string;
  /** Mono sub-line, e.g. "log scale · 1 Mbit/s – 10 Gbit/s · auto". */
  sub?: string;
  /** Readout font size. @default size × 0.193 (58 at 300) */
  numSize?: number;
}
export declare function Gauge(props: GaugeProps): JSX.Element;
