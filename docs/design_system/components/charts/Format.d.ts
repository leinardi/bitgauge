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
 * Format — number formatting (tokens.md "Number formatting"): 3 significant digits, unit steps at ×1000,
 * bytes mode ÷ 8, latency precision with the timer-resolution floor. The only implementation; screens and
 * the Chart call it. The unit is always returned separately so it renders as its own span.
 */
export interface FormatApi {
  sig(x: number): string;

  /** bit/s → { n: "94.1", u: "Mbit/s" } (bytes: "11.8", "MB/s"). */
  rate(bps: number, units?: "bits" | "bytes"): { n: string; u: string };

  rateStr(bps: number, units?: "bits" | "bytes"): string;

  /** ms → "3.1", "48", "< 1" (res = timer resolution in ms, default 0.1). */
  ms(v: number, res?: number): string;

  jitter(v: number, res?: number): string;

  /** bytes → "1.23 GB". */
  bytes(b: number): string;
}

export declare const Format: FormatApi;
