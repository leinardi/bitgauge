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

import { describe, expect, it } from 'vitest'

import { BUCKET_MS, bitsFromBytes, bitsPerSecond, bucketRate, bytesFromBits } from '@/engine/stats/units'

describe('units', () => {
  it('converts between bytes and bits', () => {
    expect(bitsFromBytes(1)).toBe(8)
    expect(bitsFromBytes(125_000)).toBe(1_000_000)
    expect(bytesFromBits(1_000_000)).toBe(125_000)
    expect(bytesFromBits(bitsFromBytes(65_536))).toBe(65_536)
  })

  it('gives rates in bits per second, decimal', () => {
    // 125 000 bytes in one second is 1 Mbit/s (1 Mbit/s = 10^6 bit/s).
    expect(bitsPerSecond(125_000, 1000)).toBe(1_000_000)
    expect(bitsPerSecond(1_250, 100)).toBe(100_000)
    expect(() => bitsPerSecond(1, 0)).toThrow(RangeError)
    expect(() => bitsPerSecond(1, -100)).toThrow(RangeError)
  })

  it('rates a bucket over its 100 ms', () => {
    expect(BUCKET_MS).toBe(100)
    expect(bucketRate(0)).toBe(0)
    expect(bucketRate(6_250)).toBe(500_000)
  })

  it('leaves the rounding to three significant digits to the UI', () => {
    // 5 904 bytes in a bucket is 472 320 bit/s; the engine keeps every digit.
    expect(bucketRate(5_904)).toBe(472_320)
    expect(bitsPerSecond(1_000, 3)).toBeCloseTo(2_666_666.666_666_7, 6)
  })
})
