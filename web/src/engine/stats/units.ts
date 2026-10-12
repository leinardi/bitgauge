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

// Unit conversions for the engine's raw numbers (measurement.md section 14). The engine reports
// bits per second, unrounded; scaling to kbit/s, Mbit/s or Gbit/s, the bytes option and the three
// significant digits are the UI's.

/** The length of a bucket and of a server grid cell (measurement.md section 2). */
export const BUCKET_MS = 100

const BITS_PER_BYTE = 8
const MS_PER_SECOND = 1000

export function bitsFromBytes(bytes: number): number {
  return bytes * BITS_PER_BYTE
}

export function bytesFromBits(bits: number): number {
  return bits / BITS_PER_BYTE
}

/** The rate of `bytes` moved in `ms` milliseconds, in bits per second. */
export function bitsPerSecond(bytes: number, ms: number): number {
  if (!(ms > 0)) {
    throw new RangeError(`duration ${ms} ms is not positive`)
  }
  return (bitsFromBytes(bytes) * MS_PER_SECOND) / ms
}

/** The rate of one bucket holding `bytes`, in bits per second. */
export function bucketRate(bytes: number): number {
  return bitsPerSecond(bytes, BUCKET_MS)
}
