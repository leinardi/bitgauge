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

import { BUCKET_MS } from '@/engine/stats/units'

// Adaptive request size (measurement.md section 3): each request on a stream is sized to take
// about 1 s at the rate the stream saw on its last completed request.

const KIB = 1024

/** The first request on every stream. */
export const FIRST_SIZE = 64 * KIB

/** Below this, per-request overhead dominates; it is also the smallest request ever issued. */
export const SIZE_FLOOR = 16 * KIB

/** The time a request is sized to take. */
const TARGET_MS = 1000

/** A request grows at most this much over its predecessor on the same stream. */
const MAX_GROWTH = 8

/**
 * rate_s in bytes per second: `bytes` over the transfer time, which is the server duration on
 * upload and the first-to-last chunk time on download, with a floor of one bucket.
 */
export function streamRate(bytes: number, transferMs: number): number {
  return (bytes * 1000) / Math.max(transferMs, BUCKET_MS)
}

/**
 * The size of the next request on a stream, or null when the data cap leaves less than the floor
 * and no request may be issued.
 *
 * @param rate the stream's rate_s in bytes per second; ignored for the first request
 * @param prev the size of the stream's previous request, or null for its first
 * @param floor the size floor, 16 KiB
 * @param cap the server's per-request limit from GET /info
 * @param budget what the data cap still allows, after data used and every request in flight; null
 *   without a data cap
 */
export function nextSize(
  rate: number,
  prev: number | null,
  floor: number,
  cap: number,
  budget: number | null,
): number | null {
  const size =
    prev === null
      ? Math.min(FIRST_SIZE, cap)
      : Math.min(Math.max(Math.round((rate * TARGET_MS) / 1000), floor), MAX_GROWTH * prev, cap)
  if (budget === null) {
    return size
  }
  return budget < floor ? null : Math.min(size, Math.floor(budget))
}
