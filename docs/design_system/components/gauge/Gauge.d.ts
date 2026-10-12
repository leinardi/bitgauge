/**
 * Gauge — place on a --surface-2 card (the track is --surface-3, invisible on --bg-base in light theme). 270° log arc over a 4-decade window (rate) or 1–1000 ms (latency). See components/gauge.md.
 * The engine supplies values only; this component picks and shifts the window from the value stream (2 s hold, one decade per shift) and names it in the caption.
 * @startingPoint section="Measurement" subtitle="Live speed gauge with readout, range band and peak tick" viewport="700x380"
 */
export interface GaugeProps {
  /** Pixel size (300 desktop, ~240 mobile). Tick labels are hidden below 220. @default 300 */
  size?: number;
  /** Current gauge value: bit/s (rate, bits), B/s (rate, bytes) or ms. Omit for idle. */
  value?: number;
  /** @default "rate" */
  mode?: 'rate' | 'ms';
  /** Rate unit system. Bytes mode expects `value` in B/s and uses the byte windows. @default "bits" */
  units?: 'bits' | 'bytes';
  /** UI-held start decade k (window [10^k, 10^(k+4))). Pass the first direction's final window to start the second direction there; never comes from the engine. @default 6 (bits) / 5 (bytes) */
  startDecade?: number;
  /** Called with the new decade k after each window shift, so the UI can carry it to the next direction. */
  onWindowChange?: (k: number) => void;
  /** Recent-range band (same unit as value). */
  bandLo?: number;
  bandHi?: number;
  /** Peak tick. */
  peak?: number;
  /** Inner upload arc on completion. */
  inner?: number;
  /** Arc colour. @default "var(--series-download)" */
  color?: string;
  /** "Download", "Upload · sending", "Latency". */
  eyebrow?: string;
  eyebrowIcon?: string;
  /** Formatted readout text, e.g. "612". Always exact; never clamped to the window. */
  readout?: string;
  unit?: string;
  /** Extra mono line below the dial, under the window caption, e.g. "median 3.1 · ping 12 of 20". */
  sub?: string;
  /** Readout font size. @default size × 0.193 (58 at 300) */
  numSize?: number;
}
export declare function Gauge(props: GaugeProps): JSX.Element;
