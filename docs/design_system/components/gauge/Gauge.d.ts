/**
 * Gauge — place on a --surface-2 card (the track is --surface-3, invisible on --bg-base in light theme).
 * 270° log arc over a 4-decade window (rate) or 1–1000 ms (latency). Contract: components/gauge.md.
 * The engine supplies values only; this component picks and shifts the window from the value stream
 * (2 s hold, one decade per shift) and names it in the caption under the dial.
 * Modes: rate | ms. States: live (value + needle), countdown, idle, connecting, cancelled, error, offline.
 * Accessibility: the dial is aria-hidden; the readout text is the accessible value. The Gauge renders no
 * live region — the screen's single LiveRegion announces phase changes and the throttled rate.
 * @startingPoint section="Measurement" subtitle="Live speed gauge with readout, range band and peak tick" viewport="700x380"
 */
export interface GaugeProps {
  /** Pixel size. @default 300 (272 when compact). Tick labels are hidden below 220. */
  size?: number;
  /** Narrow layout: 272 px, readout --type-gauge-readout-compact (46 px). */
  compact?: boolean;
  /** Current value: bit/s (rate, bits), B/s (rate, bytes) or ms. Cancelled: the final value (arc, no needle). */
  value?: number;
  /** @default "rate" */
  mode?: 'rate' | 'ms';
  /** Rate unit system. Bytes mode expects `value` in B/s. @default "bits" */
  units?: 'bits' | 'bytes';
  /**
   * live: value arc, needle, band, peak · countdown: primary ring drains over countdownTotal, readout = whole seconds left ·
   * idle / connecting / cancelled / error / offline: textual readout (icon, title, message, detail, action). @default "live"
   */
  state?: 'live' | 'countdown' | 'idle' | 'connecting' | 'cancelled' | 'error' | 'offline';
  /** UI-held start decade k. Pass the first direction's final window to start the second there. @default 6 (bits) / 5 (bytes) */
  startDecade?: number;
  onWindowChange?: (k: number) => void;
  /** Recent-range band (min–max of the last 10 values). */
  bandLo?: number;
  bandHi?: number;
  /** Peak tick (download p90 so far; none while upload runs). */
  peak?: number;
  /** Inner upload arc on completion. */
  inner?: number;
  /** Text for the inner arc so it is not colour-only, e.g. "438 Mbit/s upload". */
  innerLabel?: string;
  /** Arc colour. @default "var(--series-download)" */
  color?: string;
  /** "Download", "Upload · sending", "Latency", "Auto-start in". */
  eyebrow?: string;
  eyebrowIcon?: string;
  /** Formatted readout, e.g. "612". Always exact; never clamped to the window. */
  readout?: string;
  /** Unit span. Countdown: [singular, plural], e.g. ["second", "seconds"]. */
  unit?: string | [string, string];
  /** Mono line inside the dial under the unit: "median 3.1 · ping 12 of 20", "avg so far 590 · peak 612", "Esc cancels". */
  note?: string;
  /** Mono line under the window caption (e.g. overhead compensation). */
  sub?: string;
  /** Appended to the window caption: "session average", "tick p90, last hour". */
  captionNote?: string;
  /** Textual states. */
  title?: string;
  message?: string;
  /** Mono detail under the message, e.g. "last sample 575 Mbit/s". */
  detail?: string;
  icon?: string;
  /** e.g. <Button size="sm" icon="refresh-cw">Retry</Button> (offline). */
  action?: React.ReactNode;
  /** Countdown length in s. @default 3 */
  countdownTotal?: number;
  /** Seconds left (fractional). */
  countdownLeft?: number;
}
export declare function Gauge(props: GaugeProps): JSX.Element;
