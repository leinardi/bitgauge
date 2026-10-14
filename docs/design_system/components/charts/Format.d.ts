/**
 * Format — number formatting (tokens.md "Number formatting"): 3 significant digits, unit steps at ×1000,
 * bytes mode ÷ 8, latency precision with the timer-resolution floor. The only implementation; screens and
 * the Chart call it. The unit is always returned separately so it renders as its own span.
 */
export interface FormatApi {
  sig(x: number): string;
  /** bit/s → { n: "94.1", u: "Mbit/s" } (bytes: "11.8", "MB/s"). */
  rate(bps: number, units?: 'bits' | 'bytes'): { n: string; u: string };
  rateStr(bps: number, units?: 'bits' | 'bytes'): string;
  /** ms → "3.1", "48", "< 1" (res = timer resolution in ms, default 0.1). */
  ms(v: number, res?: number): string;
  jitter(v: number, res?: number): string;
  /** bytes → "1.23 GB". */
  bytes(b: number): string;
}
export declare const Format: FormatApi;
