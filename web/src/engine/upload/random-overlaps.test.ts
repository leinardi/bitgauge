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

// The overlapping-histogram case of testing.md section 2 on random overlaps: S_up, the confirmed
// series and the window bytes against a brute-force per-cell sum.

import { describe, expect, it } from 'vitest'

import type { ConfirmedTelemetry } from '@/engine/upload/watermark'
import { UploadLedger } from '@/engine/upload/watermark'
import { confirmedSeries, steadyWindow } from '@/engine/upload/window'

const SETS = 200
const SEED = 0x5eed

// Mulberry32: a small seeded generator, so every run checks the same 200 sets.
function generator(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let mixed = Math.imul(state ^ (state >>> 15), state | 1)
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61)
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296
  }
}

function randomRequests(random: () => number): ConfirmedTelemetry[] {
  const integer = (below: number) => Math.floor(random() * below)
  const requests: ConfirmedTelemetry[] = []
  const count = 1 + integer(12)
  for (let index = 0; index < count; index++) {
    const firstBucket = integer(200)
    const buckets = Array.from({ length: 1 + integer(50) }, () => integer(100_000))
    const startMs = firstBucket * 100 + integer(100)
    const lastMs = (firstBucket + buckets.length - 1) * 100 + 1 + integer(99)
    requests.push({ firstBucket, buckets, startMs, durationMs: Math.max(0, lastMs - startMs) })
  }
  return requests
}

// The reference: one array slot per cell, every count added where it belongs.
function bruteForce(requests: readonly ConfirmedTelemetry[]): number[] {
  const cells = new Array<number>(260).fill(0)
  for (const request of requests) {
    request.buckets.forEach((count, offset) => {
      cells[request.firstBucket + offset] = (cells[request.firstBucket + offset] ?? 0) + count
    })
  }
  return cells
}

describe('random overlapping requests', () => {
  it(`matches a brute-force per-cell sum on ${SETS} seeded sets`, () => {
    const random = generator(SEED)
    for (let set = 0; set < SETS; set++) {
      const requests = randomRequests(random)
      const reference = bruteForce(requests)
      const ledger = new UploadLedger()
      const ids = requests.map((_, index) => ledger.send(index))
      requests.forEach((request, index) => ledger.confirm(ids[index] ?? -1, 10_000 + index, request))

      reference.forEach((bytes, cell) => expect(ledger.grid.bytes(cell), `set ${set}, cell ${cell}`).toBe(bytes))

      // Every request confirmed: C = M_end, and every cell up to it is known.
      const windowEnd = ledger.windowEnd() ?? Number.NaN
      expect(windowEnd).toBe(ledger.measurementEnd())
      const series = confirmedSeries(ledger)
      const first = series?.first ?? Number.NaN
      expect(series?.range(first, Math.floor(windowEnd / 100))).toEqual(
        reference.slice(first, Math.floor(windowEnd / 100)),
      )

      const window = steadyWindow(ledger, 0, windowEnd)
      const expected = reference.slice(0, Math.floor(windowEnd / 100)).reduce((sum, bytes) => sum + bytes, 0)
      expect(window.bytes, `set ${set}`).toBe(expected)
    }
  })
})
