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

// The hybrid warm-up of measurement.md section 8.3 on synthetic evaluation series. Standard's
// maxima give a 5 s cap and a 10 s bound on download (20 s max), a 6.3 s cap and a 12.5 s bound on
// upload (25 s max).

import { describe, expect, it } from 'vitest'

import type { Direction } from '@/engine/messages'
import { type RampView, Warmup, type WarmupEnd } from '@/engine/phases/warmup'
import { BucketSeries, type Cell } from '@/engine/stats/buckets'

const SETTLED: RampView = { settledAt: 12, lastAdd: 0, settle: 10 }
const RUNNING: RampView = { settledAt: null, lastAdd: 0, settle: 10 }
const NORMAL = { level: 'normal', reasons: [] }

function series(cells: readonly Cell[], first = 0): BucketSeries {
  const built = new BucketSeries(first)
  built.append(...cells)
  return built
}

function steady(count: number, bytes = 1000): Cell[] {
  return Array<Cell>(count).fill(bytes)
}

/** Feeds the cells one at a time, as a live series grows, and returns the end of warm-up. */
function warmUp(
  cells: readonly Cell[],
  ramp: RampView,
  requests: readonly number[] = [2],
  direction: Direction = 'download',
  fixedMs: number | null = null,
): WarmupEnd | null {
  const warmup = new Warmup({ direction, maxMs: direction === 'upload' ? 25_000 : 20_000, fixedMs })
  const grown = new BucketSeries(0)
  for (const cell of cells) {
    grown.append(cell)
    warmup.update(grown, ramp, requests)
  }
  return warmup.end
}

describe('warm-up end', () => {
  it('comes at the first bucket where all four conditions hold', () => {
    // Steady from the start; the ramp settles at bucket 12, with I_s since its last add at 0.
    expect(warmUp(steady(200), SETTLED)).toEqual({ bucket: 12, confidence: NORMAL })
  })

  it('evaluates a series that grew at once bucket by bucket', () => {
    const warmup = new Warmup({ direction: 'upload', maxMs: 25_000, fixedMs: null })
    expect(warmup.update(series(steady(40), 1), SETTLED, [2])).toEqual({ bucket: 12, confidence: NORMAL })
  })

  it('needs I_s of known series after the last add', () => {
    expect(warmUp(steady(200), { settledAt: 12, lastAdd: 8, settle: 10 })?.bucket).toBe(18)
    // Unknown buckets after the add do not count toward I_s.
    const gapped = [...steady(10), null, null, ...steady(190)]
    expect(warmUp(gapped, { settledAt: 12, lastAdd: 8, settle: 10 })?.bucket).toBe(20)
  })
})

describe('each condition in isolation', () => {
  it('1: an unsettled ramp holds warm-up to the bound, then gives ramp-unsettled', () => {
    expect(warmUp(steady(200), RUNNING)).toEqual({
      bucket: 100,
      confidence: { level: 'low', reasons: ['ramp-unsettled'] },
    })
  })

  it('2: one confirmed request on a stream gives insufficient-samples at the cap', () => {
    expect(warmUp(steady(200), SETTLED, [2, 1], 'upload')).toEqual({
      bucket: 63,
      confidence: { level: 'low', reasons: ['insufficient-samples'] },
    })
  })

  it('2: on download, 1 s of continuous arrivals stands in for the completed requests', () => {
    expect(warmUp(steady(200), SETTLED, [1, 0], 'download')).toEqual({ bucket: 12, confidence: NORMAL })
  })

  it('2: needs 8 non-empty buckets among the last 10', () => {
    // The ramp settles at the cap, bucket 50, so warm-up ends there on buckets 40 to 49.
    const late: RampView = { settledAt: 50, lastAdd: 0, settle: 10 }
    const eight = warmUp([...steady(42), 0, 0, ...steady(60)], late)?.confidence.reasons
    const seven = warmUp([...steady(43), 0, 0, 0, ...steady(60)], late)?.confidence.reasons
    expect(eight).toEqual(['unstable'])
    expect(seven).toEqual(['insufficient-samples', 'unstable'])
  })

  it('3: a coefficient of variation of exactly 10 % passes and 10.1 % fails', () => {
    const alternate = (low: number, high: number) =>
      Array.from({ length: 200 }, (_, bucket) => (bucket % 2 === 0 ? low : high))
    expect(warmUp(alternate(900, 1100), SETTLED)).toEqual({ bucket: 12, confidence: NORMAL })
    expect(warmUp(alternate(899, 1101), SETTLED)).toEqual({
      bucket: 50,
      confidence: { level: 'low', reasons: ['unstable'] },
    })
  })

  it('2 and 3 need ten known buckets, which also gives condition 4 its second', () => {
    // Only nine buckets are ever known: no condition 2 or 3, and no cap either, since the cap
    // counts known buckets too.
    const sparse = [...steady(9), ...Array<Cell>(100).fill(null)]
    expect(warmUp(sparse, { settledAt: 0, lastAdd: 0, settle: 0 })).toBeNull()
    expect(warmUp([...steady(9), null, 1000], { settledAt: 0, lastAdd: 0, settle: 0 })?.bucket).toBe(11)
  })
})

describe('unknown buckets', () => {
  it('are skipped, never read as zero', () => {
    // Every third bucket unknown: read as zero they would make the series unstable.
    const cells = Array.from({ length: 200 }, (_, bucket): Cell => (bucket % 3 === 2 ? null : 1000))
    expect(warmUp(cells, { settledAt: 15, lastAdd: 0, settle: 10 })).toEqual({ bucket: 15, confidence: NORMAL })
  })
})

describe('the cap', () => {
  it('is max(3 s, 25 % of the max): 5 s for Standard download', () => {
    expect(warmUp(steady(200), SETTLED, [1], 'upload')?.bucket).toBe(63)
    const shaky = Array.from({ length: 200 }, (_, bucket) => (bucket % 2 === 0 ? 500 : 1500))
    expect(warmUp(shaky, SETTLED)).toEqual({ bucket: 50, confidence: { level: 'low', reasons: ['unstable'] } })
  })

  it('moves to the instant a running ramp settles', () => {
    const late: RampView = { settledAt: 70, lastAdd: 0, settle: 10 }
    expect(warmUp(steady(200), late, [1], 'download')?.bucket).toBe(70)
    expect(warmUp(steady(200), late, [1], 'upload')?.bucket).toBe(70)
  })

  it('stops moving at 50 % of the max: 10 s download, 12.5 s upload', () => {
    expect(warmUp(steady(300), RUNNING)?.bucket).toBe(100)
    expect(warmUp(steady(300), RUNNING, [2], 'upload')?.bucket).toBe(125)
  })

  it('is measured from the series start, the cell of P_start on upload', () => {
    const warmup = new Warmup({ direction: 'upload', maxMs: 25_000, fixedMs: null })
    expect(warmup.update(series(steady(300), 7), RUNNING, [2])?.bucket).toBe(132)
  })

  it('gives every unmet reason at once', () => {
    const shaky = Array.from({ length: 200 }, (_, bucket) => (bucket % 2 === 0 ? 500 : 1500))
    expect(warmUp(shaky, RUNNING, [1], 'upload')?.confidence).toEqual({
      level: 'low',
      reasons: ['ramp-unsettled', 'insufficient-samples', 'unstable'],
    })
  })
})

describe('a ramp that settles at a bucket already evaluated', () => {
  it('ends warm-up at that settle instant, not one bucket later', () => {
    // A 429 ends the ramp at the end of the series it read, bucket 60, after warm-up evaluated it.
    const warmup = new Warmup({ direction: 'download', maxMs: 20_000, fixedMs: null })
    const grown = series(steady(60))
    expect(warmup.update(grown, RUNNING, [1])).toBeNull()
    // Every condition holds there: the steady download stands in for the requests.
    expect(warmup.update(grown, { settledAt: 60, lastAdd: 0, settle: 10 }, [1])).toEqual({
      bucket: 60,
      confidence: NORMAL,
    })
  })
})

describe('a fixed warm-up', () => {
  it('ends exactly then', () => {
    expect(warmUp(steady(200), SETTLED, [2], 'download', 4000)).toEqual({ bucket: 40, confidence: NORMAL })
  })

  it('gives ramp-unsettled when the ramp still runs then, and nothing else', () => {
    const shaky = Array.from({ length: 200 }, (_, bucket) => (bucket % 2 === 0 ? 500 : 1500))
    expect(warmUp(shaky, RUNNING, [0], 'download', 4000)).toEqual({
      bucket: 40,
      confidence: { level: 'low', reasons: ['ramp-unsettled'] },
    })
  })
})
