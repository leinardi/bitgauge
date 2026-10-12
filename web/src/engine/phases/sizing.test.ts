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

// Adaptive request size, measurement.md section 3 and its examples.

import { describe, expect, it } from 'vitest'

import { FIRST_SIZE, SIZE_FLOOR, nextSize, streamRate } from '@/engine/phases/sizing'

const KIB = 1024
const MIB = 1024 * KIB
const CAP = 256 * MIB

/** The time `bytes` take at `bytesPerSecond`, in milliseconds. */
function transferMs(bytes: number, bytesPerSecond: number): number {
  return (bytes * 1000) / bytesPerSecond
}

describe('nextSize', () => {
  it('starts every stream at 64 KiB', () => {
    expect(FIRST_SIZE).toBe(64 * KIB)
    expect(nextSize(0, null, SIZE_FLOOR, CAP, null)).toBe(64 * KIB)
  })

  it('sizes a 500 kbit/s stream to about 1 s: 61 KiB, then about 61 KiB again', () => {
    const link = 62_500 // 500 kbit/s in bytes per second
    const first = FIRST_SIZE
    const second = nextSize(streamRate(first, transferMs(first, link)), first, SIZE_FLOOR, CAP, null) ?? 0
    expect(second).toBe(62_500)
    expect(second / KIB).toBeCloseTo(61, 0)

    const third = nextSize(streamRate(second, transferMs(second, link)), second, SIZE_FLOOR, CAP, null)
    expect(third).toBe(62_500)
  })

  it('halves the size when two streams share the 500 kbit/s', () => {
    const perStream = 31_250
    const size = nextSize(streamRate(FIRST_SIZE, transferMs(FIRST_SIZE, perStream)), FIRST_SIZE, SIZE_FLOOR, CAP, null)
    expect(size).toBe(31_250)
    expect((size ?? 0) / KIB).toBeCloseTo(30.5, 1)
  })

  it('grows 64 KiB, 512 KiB, 4 MiB, 32 MiB, 256 MiB (cap) at 10 Gbit/s', () => {
    const link = 1.25e9
    const sizes = [FIRST_SIZE]
    for (let step = 0; step < 5; step++) {
      const prev = sizes.at(-1) ?? 0
      sizes.push(nextSize(streamRate(prev, transferMs(prev, link)), prev, SIZE_FLOOR, CAP, null) ?? 0)
    }
    expect(sizes).toEqual([64 * KIB, 512 * KIB, 4 * MIB, 32 * MIB, 256 * MIB, 256 * MIB])
  })

  it('never grows more than 8x in one step', () => {
    expect(nextSize(1e12, SIZE_FLOOR, SIZE_FLOOR, CAP, null)).toBe(8 * SIZE_FLOOR)
  })

  it('shrinks without limit down to the 16 KiB floor', () => {
    expect(SIZE_FLOOR).toBe(16 * KIB)
    expect(nextSize(20_000, 128 * MIB, SIZE_FLOOR, CAP, null)).toBe(20_000)
    expect(nextSize(1_000, 64 * KIB, SIZE_FLOOR, CAP, null)).toBe(SIZE_FLOOR)
  })

  it("never exceeds the server's per-request cap from GET /info", () => {
    expect(nextSize(1e12, 4 * MIB, SIZE_FLOOR, 1 * MIB, null)).toBe(1 * MIB)
    expect(nextSize(0, null, SIZE_FLOOR, 64 * KIB, null)).toBe(64 * KIB)
  })

  it('shrinks a request to what the data cap still allows', () => {
    expect(nextSize(1e9, 4 * MIB, SIZE_FLOOR, CAP, 40_000)).toBe(40_000)
    expect(nextSize(0, null, SIZE_FLOOR, CAP, 20_000)).toBe(20_000)
    expect(nextSize(1e9, 4 * MIB, SIZE_FLOOR, CAP, SIZE_FLOOR)).toBe(SIZE_FLOOR)
  })

  it('issues no request when less than the floor remains under the data cap', () => {
    expect(nextSize(1e9, 4 * MIB, SIZE_FLOOR, CAP, SIZE_FLOOR - 1)).toBeNull()
    expect(nextSize(0, null, SIZE_FLOOR, CAP, 0)).toBeNull()
  })
})

describe('streamRate', () => {
  it('divides the bytes by the transfer time, with a floor of one bucket', () => {
    expect(streamRate(62_500, 1000)).toBe(62_500)
    expect(streamRate(65_536, 50)).toBe(655_360)
    expect(streamRate(65_536, 0)).toBe(655_360)
  })
})
