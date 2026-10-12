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

// Worked example A of measurement.md section 7.7: two overlapping streams with non-aligned
// starts, the counts generated from the stated steady rates.

import { describe, expect, it } from 'vitest'

import { bitsPerSecond } from '@/engine/stats/units'
import { kib, steadyTelemetry } from '@/engine/test/telemetry'
import { UploadLedger } from '@/engine/upload/watermark'
import { steadyWindow } from '@/engine/upload/window'

// r1: 64 KiB from 1050 to 2100 ms (≈ 61 KiB/s); r2: 64 KiB from 1620 to 2720 ms (≈ 58 KiB/s).
const r1 = steadyTelemetry(1050, 2100, 64 * 1024)
const r2 = steadyTelemetry(1620, 2720, 64 * 1024)

// The table's columns, in KiB rounded to one decimal, for cells 10 to 27.
const tableR1 = [3.0, ...Array<number>(10).fill(6.1)]
const tableR2 = [4.7, ...Array<number>(10).fill(5.8), 1.2]
const tableSum = [3.0, 6.1, 6.1, 6.1, 6.1, 6.1, 10.8, 11.9, 11.9, 11.9, 11.9, 5.8, 5.8, 5.8, 5.8, 5.8, 5.8, 1.2]

function roundedKib(bytes: number): number {
  return Math.round(kib(bytes) * 10) / 10
}

function ledgerOfExampleA(): UploadLedger {
  const ledger = new UploadLedger()
  const first = ledger.send(0)
  const second = ledger.send(570)
  ledger.confirm(first, 2200, r1)
  ledger.confirm(second, 2820, r2)
  return ledger
}

describe('worked example A', () => {
  it('reports each request in the cells of the table', () => {
    expect(r1.firstBucket).toBe(10)
    expect(r1.buckets.map(roundedKib)).toEqual(tableR1)
    expect(r2.firstBucket).toBe(16)
    expect(r2.buckets.map(roundedKib)).toEqual(tableR2)
    // Each request reports its whole 64 KiB; the table's rounded r2 cells add to 63.9.
    expect(r1.buckets.reduce((sum, count) => sum + count, 0)).toBe(65_536)
    expect(r2.buckets.reduce((sum, count) => sum + count, 0)).toBe(65_536)
  })

  it('sums S_up per cell over cells 10 to 27, from the unrounded counts', () => {
    const ledger = ledgerOfExampleA()

    for (let cell = 10; cell <= 27; cell++) {
      const fromR1 = r1.buckets[cell - r1.firstBucket] ?? 0
      const fromR2 = r2.buckets[cell - r2.firstBucket] ?? 0
      expect(ledger.grid.bytes(cell)).toBe(fromR1 + fromR2)
      // The table's S_up column adds the rounded columns, so it can differ by one rounding step.
      expect(Math.abs(kib(ledger.grid.bytes(cell)) - (tableSum[cell - 10] ?? Number.NaN))).toBeLessThanOrEqual(0.1)
    }
    expect(ledger.grid.bytes(9)).toBe(0)
    expect(ledger.grid.bytes(28)).toBe(0)
  })

  it('reads the headline straight off the grid for the window [1600, 2700)', () => {
    const window = steadyWindow(ledgerOfExampleA(), 1600, 2700)

    expect(window.cells).toEqual([16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26])
    expect(window.windowMs).toBe(1100)
    // Σ ≈ 93.3 KiB from the unrounded counts (the rounded cells add to 93.2).
    expect(window.bytes).toBe(95_552)
    expect(kib(window.bytes)).toBeCloseTo(93.3, 1)

    const headline = bitsPerSecond(window.bytes, window.windowMs)
    expect(kib(headline / 8)).toBeCloseTo(85, 0)
    expect(headline / 1e6).toBeCloseTo(0.69, 2)
  })

  it('reports no number from a window of two requests and 1.1 s', () => {
    const window = steadyWindow(ledgerOfExampleA(), 1600, 2700)

    // Neither request lies wholly inside the window; it is also shorter than 3 s.
    expect(window.confirmedInside).toBe(0)
    expect(window.sufficient).toBe(false)
    expect(window.bitsPerSecond).toBeUndefined()
    expect(window.peakBitsPerSecond).toBeUndefined()
  })
})
