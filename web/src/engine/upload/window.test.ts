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

// The headline, the peak and the minimum window of measurement.md section 7.6, on requests whose
// telemetry is written out cell by cell.

import { describe, expect, it } from 'vitest'

import { UploadGrid } from '@/engine/upload/grid'
import { UploadLedger } from '@/engine/upload/watermark'
import { steadyWindow } from '@/engine/upload/window'

/** One stream of back-to-back requests, each `cellsPerRequest` cells long; cell i holds counts[i]. */
function sequentialRequests(counts: readonly number[], cellsPerRequest: number): UploadLedger {
  const ledger = new UploadLedger()
  for (let first = 0; first < counts.length; first += cellsPerRequest) {
    const id = ledger.send(first * 100 - 50)
    const buckets = counts.slice(first, first + cellsPerRequest)
    ledger.confirm(id, (first + buckets.length) * 100 + 50, {
      firstBucket: first,
      buckets,
      startMs: first * 100,
      durationMs: buckets.length * 100,
    })
  }
  return ledger
}

// Cell i holds 1000 × (i + 1) bytes: 40 cells in four requests of 1 s.
const rising = Array.from({ length: 40 }, (_, cell) => 1000 * (cell + 1))

describe('steadyWindow', () => {
  it('reports the headline and the p90 peak of a sufficient window', () => {
    const window = steadyWindow(sequentialRequests(rising, 10), 0, 3000)

    expect(window.cells).toHaveLength(30)
    expect(window.windowMs).toBe(3000)
    expect(window.confirmedInside).toBe(3)
    expect(window.sufficient).toBe(true)
    // Σ 1000 × (1 + … + 30) = 465 000 bytes over 3 s.
    expect(window.bytes).toBe(465_000)
    expect(window.bitsPerSecond).toBe(1_240_000)
    // p90 of 1000 … 30 000: rank 0.9 × 29 = 26.1, so 27 000 + 0.1 × 1000 = 27 100 bytes in a
    // 100 ms cell, 2 168 000 bit/s.
    expect(window.peakBitsPerSecond).toBeCloseTo(2_168_000, 6)
  })

  it('needs three confirmed requests wholly inside the window', () => {
    // [100, 3100): still 30 cells, but the first request lost its cell 0 and the fourth has only
    // cell 30 inside, so two requests lie wholly inside.
    const window = steadyWindow(sequentialRequests(rising, 10), 100, 3100)

    expect(window.windowMs).toBe(3000)
    expect(window.confirmedInside).toBe(2)
    expect(window.sufficient).toBe(false)
    expect(window.bitsPerSecond).toBeUndefined()
    expect(window.peakBitsPerSecond).toBeUndefined()
  })

  it('needs at least 3000 ms of full cells', () => {
    const ledger = sequentialRequests(rising, 5)

    const short = steadyWindow(ledger, 0, 2900)
    expect(short.windowMs).toBe(2900)
    expect(short.confirmedInside).toBe(5)
    expect(short.sufficient).toBe(false)
    expect(short.bitsPerSecond).toBeUndefined()

    const enough = steadyWindow(ledger, 0, 3000)
    expect(enough.windowMs).toBe(3000)
    expect(enough.sufficient).toBe(true)
    expect(enough.bitsPerSecond).toBe(1_240_000)
  })

  it('leaves the partial cells at either edge out of bytes and time', () => {
    const window = steadyWindow(sequentialRequests(rising, 10), 150, 3050)

    expect(window.cells[0]).toBe(2)
    expect(window.cells.at(-1)).toBe(29)
    expect(window.windowMs).toBe(2800)
  })

  it('never reaches past the ledger window end', () => {
    const ledger = sequentialRequests(rising, 10)
    // Every request confirmed: W_end = M_end = 4000, and nothing beyond it is a measured zero.
    expect(steadyWindow(ledger, 0, 99_999).cells.at(-1)).toBe(39)
    expect(steadyWindow(ledger, 0).windowMs).toBe(4000)
    expect(steadyWindow(new UploadLedger(), 0, 3000).cells).toEqual([])
  })
})

describe('the drain (section 7.5)', () => {
  /** Confirms a request of `stream` sent at `sentAt`, 1 s on the server from `startMs`. */
  const confirm = (ledger: UploadLedger, sentAt: number, startMs: number): { id: number; stream: number } => {
    const id = ledger.send(sentAt)
    ledger.confirm(id, startMs + 1100, { firstBucket: startMs / 100, buckets: Array.from({ length: 10 }, () => 1000), startMs, durationMs: 1000 })
    return { id, stream: 0 }
  }

  it('ends the measurement where the first stream falls quiet, before the other streams drain', () => {
    const ledger = new UploadLedger()
    confirm(ledger, 0, 100)
    // Two streams in flight at the stop: stream 0 ends at 2.1 s, stream 1 at 2.6 s.
    const a = ledger.send(1100)
    const b = ledger.send(1600)
    ledger.halt([
      { id: a, stream: 0 },
      { id: b, stream: 1 },
    ])
    ledger.confirm(a, 2200, { firstBucket: 11, buckets: Array.from({ length: 10 }, () => 1000), startMs: 1100, durationMs: 1000 })
    ledger.confirm(b, 2700, { firstBucket: 16, buckets: Array.from({ length: 10 }, () => 1000), startMs: 1600, durationMs: 1000 })
    expect(ledger.measurementEnd()).toBe(2100)
    expect(ledger.windowEnd()).toBe(2100)
  })

  it('takes the latest end of a stream with two requests in flight, an early one included', () => {
    const ledger = new UploadLedger()
    const a = ledger.send(0)
    const b = ledger.send(800)
    ledger.halt([
      { id: a, stream: 0 },
      { id: b, stream: 0 },
    ])
    ledger.confirm(a, 1200, { firstBucket: 1, buckets: Array.from({ length: 10 }, () => 1000), startMs: 100, durationMs: 1000 })
    ledger.confirm(b, 2200, { firstBucket: 11, buckets: Array.from({ length: 10 }, () => 1000), startMs: 1100, durationMs: 1000 })
    expect(ledger.measurementEnd()).toBe(2100)
  })

  it('falls back to the latest confirmed end while none of the requests in flight has confirmed', () => {
    const ledger = new UploadLedger()
    confirm(ledger, 0, 100)
    const a = ledger.send(1100)
    ledger.halt([{ id: a, stream: 0 }])
    expect(ledger.measurementEnd()).toBe(1100)
    ledger.end(a, 1500)
    expect(ledger.measurementEnd()).toBe(1100)
  })
})

describe('UploadGrid', () => {
  it('rejects invalid counts without adding any of them', () => {
    const grid = new UploadGrid()

    expect(() => grid.add({ firstBucket: 0, buckets: [100, -50, 50] })).toThrow(RangeError)
    expect(() => grid.add({ firstBucket: 0, buckets: [100, 0.5] })).toThrow(RangeError)
    expect(() => grid.add({ firstBucket: 0.5, buckets: [100] })).toThrow(RangeError)
    expect(grid.bytes(0)).toBe(0)
  })
})
