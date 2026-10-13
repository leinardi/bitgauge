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

// The stream ramp of measurement.md sections 4 and 8.2, driven on synthetic evaluation series with
// a 300 ms RTT (I_s 12 buckets, I_m 13). The section 19 budgets, on a modelled link, are in
// slow-link.test.ts.

import { describe, expect, it } from 'vitest'

import type { Plateau } from '@/engine/messages'
import { measureBuckets, Ramp, type RampOptions, settleBuckets } from '@/engine/phases/ramp'
import { BucketSeries, type Cell } from '@/engine/stats/buckets'

const AUTO: RampOptions = { mode: 'auto', fixed: 1, max: 6, serverMax: 6, rttMs: 300 }

// 300 kbit/s is 37 500 bytes per second, 3750 per bucket.
const FULL_LINK = 3750

interface Step {
  atMs: number
  streams: number
  plateau?: Plateau
}

/**
 * A download phase on the client timeline: the first chunk arrives at `firstChunkMs`, then each
 * bucket holds `bytesFor(streams)`. Streams the ramp adds take effect at the bucket of the add.
 */
function download(ramp: Ramp, bytesFor: (streams: number) => number, buckets: number, firstChunkMs = 300): Step[] {
  const series = new BucketSeries(0)
  const steps: Step[] = []
  for (let bucket = 0; bucket < buckets && !ramp.settled; bucket++) {
    series.append(bucket * 100 < firstChunkMs ? 0 : bytesFor(ramp.streams))
    const before = ramp.streams
    ramp.update(series)
    if (ramp.placing) {
      ramp.stepStarted(series.end)
    }
    if (ramp.streams !== before || ramp.settled) {
      steps.push({ atMs: series.end * 100, streams: ramp.streams, ...(ramp.plateau ? { plateau: ramp.plateau } : {}) })
    }
  }
  return steps
}

describe('interval lengths', () => {
  it('are I_s = max(1 s, 4 RTT) and I_m = max(500 ms, 2 RTT, min(100 RTT, 1 s + RTT)) in whole buckets, rounded up', () => {
    // Over 10 ms of RTT, I_m spans a request cycle.
    expect([settleBuckets(300), measureBuckets(300)]).toEqual([12, 13])
    expect([settleBuckets(50), measureBuckets(50)]).toEqual([10, 11])
    expect([settleBuckets(333), measureBuckets(333)]).toEqual([14, 14])
    expect(measureBuckets(20)).toBe(11)
    // Below it, 100 RTT; on a LAN, the 500 ms floor.
    expect(measureBuckets(7)).toBe(7)
    expect([settleBuckets(0.3), measureBuckets(0.3)]).toEqual([10, 5])
    expect([settleBuckets(0), measureBuckets(0)]).toEqual([10, 5])
    // A round trip over 1 s: I_m is two of them.
    expect(measureBuckets(1200)).toBe(24)
    // Idle latency skipped: an RTT of 100 ms.
    expect([settleBuckets(null), measureBuckets(null)]).toEqual([10, 11])
  })
})

describe('the ramp on a live series', () => {
  it('plateaus with no gain when a second stream adds nothing', () => {
    const ramp = new Ramp(AUTO)
    // Baseline I_s + 2 I_m = 3.8 s after the first chunk at 0.3 s; the trial needs 2.5 s more.
    expect(download(ramp, () => FULL_LINK, 200)).toEqual([
      { atMs: 4100, streams: 2 },
      { atMs: 6600, streams: 2, plateau: 'no-gain' },
    ])
    // The no-gain plateau keeps the added stream.
    expect(ramp.streams).toBe(2)
    expect(ramp.lastAdd).toBe(41)
    // It settles at the end of the deciding interval: 41 + 12 + 13.
    expect(ramp.settledAt).toBe(66)
  })

  it('keeps gaining trials and skips the trial to 6 as floor-limited at 300 kbit/s', () => {
    const ramp = new Ramp(AUTO)
    const rates: Record<number, number> = { 1: 2800, 2: 3300, 4: FULL_LINK }
    expect(download(ramp, (streams) => rates[streams] ?? 0, 200)).toEqual([
      { atMs: 4100, streams: 2 },
      { atMs: 6600, streams: 4 },
      // 37 500 bytes per second over 6 streams is 6.1 KiB/s, below the 8 KiB/s floor rule.
      { atMs: 9100, streams: 4, plateau: 'floor-limited' },
    ])
    expect(ramp.lastAdd).toBe(66)
    expect(ramp.settledAt).toBe(91)
  })

  it('stops the baseline at its cap, 3 s after I_s, while the single stream keeps growing', () => {
    // On a LAN, I_s is 1 s and I_m 500 ms: six intervals fit in the cap, a seventh would not.
    const ramp = new Ramp({ ...AUTO, rttMs: 0 })
    let bucket = 0
    // Each 500 ms interval is well over 5 % above the one before.
    const steps = download(ramp, () => 1000 + 50 * bucket++, 200)
    expect(steps[0]).toEqual({ atMs: 4300, streams: 2 })
  })

  it('measures a second interval only, at 300 ms, where a third would end past the cap', () => {
    const ramp = new Ramp(AUTO)
    let bucket = 0
    const steps = download(ramp, () => 1000 + 50 * bucket++, 200)
    expect(steps[0]).toEqual({ atMs: 4100, streams: 2 })
  })
})

describe('the ramp on a confirmed series', () => {
  it('decides only once the watermark has passed the end of each interval', () => {
    const ramp = new Ramp(AUTO)
    // The series starts at the cell of P_start and grows by one confirmed request at a time.
    const series = new BucketSeries(1)
    const confirm = (cells: number, bytes: number) => {
      series.append(...Array<Cell>(cells).fill(bytes))
      ramp.update(series)
    }

    confirm(17, FULL_LINK) // the first 64 KiB request, cells 1 to 17
    confirm(10, FULL_LINK)
    confirm(10, FULL_LINK) // series end 38: the baseline needs cell 1 + 38
    expect(ramp.streams).toBe(1)
    confirm(10, FULL_LINK) // series end 48
    expect(ramp.streams).toBe(2)
    expect(ramp.placing).toBe(true)

    // Until the added stream's first request confirms, nothing moves.
    confirm(10, FULL_LINK)
    expect(ramp.placing).toBe(true)
    // Its first byte reached the server in cell 51: the trial's I_s starts there and needs 25 cells.
    ramp.stepStarted(51)
    confirm(10, FULL_LINK) // series end 68, short of 76
    expect(ramp.settled).toBe(false)
    confirm(10, FULL_LINK) // series end 78, past cell 76
    expect(ramp.plateau).toBe('no-gain')
    expect(ramp.streams).toBe(2)
  })

  it('skips the trial to 6 as floor-limited at 300 kbit/s', () => {
    const ramp = new Ramp(AUTO)
    const rates: Record<number, number> = { 1: 2800, 2: 3300, 4: FULL_LINK }
    const series = new BucketSeries(1)
    // Requests confirm ten cells at a time; added streams reach the server 300 ms after the add.
    while (!ramp.settled && series.end < 300) {
      series.append(...Array<Cell>(10).fill(rates[ramp.streams] ?? 0))
      ramp.update(series)
      if (ramp.placing) {
        ramp.stepStarted(series.end + 3)
      }
    }
    expect(ramp.plateau).toBe('floor-limited')
    expect(ramp.streams).toBe(4)
  })
})

describe('plateaus', () => {
  it('reaches the cap plateau when every trial gains', () => {
    const ramp = new Ramp({ ...AUTO, rttMs: null })
    const steps = download(ramp, (streams) => 1_000_000 * streams, 400)
    expect(steps.map((step) => step.streams)).toEqual([2, 4, 6, 6])
    expect(ramp.plateau).toBe('cap')
  })

  it("clamps the sequence to the server's maximum", () => {
    const ramp = new Ramp({ ...AUTO, serverMax: 3, rttMs: null })
    const steps = download(ramp, (streams) => 1_000_000 * streams, 400)
    expect(steps.map((step) => step.streams)).toEqual([2, 3, 3])
    expect(ramp.plateau).toBe('cap')
  })

  it('reports the cap plateau with no trial at all when the cap is one stream', () => {
    const ramp = new Ramp({ ...AUTO, max: 1, rttMs: null })
    expect(download(ramp, () => FULL_LINK, 100)).toEqual([{ atMs: 3500, streams: 1, plateau: 'cap' }])
  })
})

describe('a 429', () => {
  it('lowers the effective cap by one and the ramp continues within it', () => {
    const ramp = new Ramp({ ...AUTO, rttMs: null })
    const series = new BucketSeries(0)
    let lowered = false
    for (let bucket = 0; bucket < 400 && !ramp.settled; bucket++) {
      series.append(1_000_000 * ramp.streams)
      ramp.update(series)
      if (ramp.placing) {
        ramp.stepStarted(series.end)
      }
      if (ramp.streams === 4 && !lowered) {
        ramp.lowerCap()
        lowered = true
      }
    }
    expect(ramp.cap).toBe(5)
    expect(ramp.streams).toBe(5)
    expect(ramp.plateau).toBe('cap')
  })

  it('drops the stream count to a cap below it and ends a running trial as cap', () => {
    const ramp = new Ramp({ ...AUTO, max: 2, rttMs: null })
    download(ramp, () => FULL_LINK, 38)
    expect(ramp.streams).toBe(2)
    ramp.lowerCap()
    expect(ramp.streams).toBe(1)
    expect(ramp.plateau).toBe('cap')
    expect(ramp.settled).toBe(true)
    // A trial ended by a 429 settles at the end of the series read so far.
    expect(ramp.settledAt).toBe(38)
  })

  it('ends the ramp as cap when it arrives while added streams wait to be placed', () => {
    const ramp = new Ramp({ ...AUTO, max: 2, rttMs: null })
    const series = new BucketSeries(0)
    series.append(...Array<Cell>(32).fill(FULL_LINK))
    ramp.update(series)
    expect(ramp.placing).toBe(true)
    expect(ramp.streams).toBe(2)

    ramp.lowerCap()
    expect(ramp.cap).toBe(1)
    expect(ramp.streams).toBe(1)
    expect(ramp.plateau).toBe('cap')
    // The unplaced streams count as added at the end of the series read, where it settles too.
    expect(ramp.lastAdd).toBe(32)
    expect(ramp.settledAt).toBe(32)
    expect(() => ramp.stepStarted(32)).toThrow(Error)
  })

  it('never lowers the cap below one stream', () => {
    const ramp = new Ramp({ ...AUTO, max: 1 })
    ramp.lowerCap()
    expect(ramp.cap).toBe(1)
    expect(ramp.streams).toBe(1)
  })
})

describe('fixed and single modes', () => {
  it('start every stream together and settle after I_s, with no plateau', () => {
    const ramp = new Ramp({ ...AUTO, mode: 'fixed', fixed: 4 })
    expect(ramp.streams).toBe(4)
    expect(download(ramp, () => FULL_LINK, 100)).toEqual([{ atMs: 1500, streams: 4 }])
    expect(ramp.plateau).toBeUndefined()
    expect(ramp.lastAdd).toBe(3)
    expect(ramp.settledAt).toBe(15)
  })

  it('clamp a fixed count to the effective cap', () => {
    expect(new Ramp({ ...AUTO, mode: 'fixed', fixed: 6, serverMax: 3 }).streams).toBe(3)
    expect(new Ramp({ ...AUTO, mode: 'single', fixed: 6 }).streams).toBe(1)
  })
})

describe('unknown buckets', () => {
  it('measure an interval that holds none of them again, never as zero', () => {
    const ramp = new Ramp({ ...AUTO, rttMs: null })
    const series = new BucketSeries(0)
    // I_s is cells 0 to 9; the first interval, cells 10 to 20, falls in a failure gap.
    series.append(...Array<Cell>(10).fill(FULL_LINK), ...Array<Cell>(11).fill(null))
    series.append(...Array<Cell>(22).fill(FULL_LINK))
    ramp.update(series)
    // Two measured intervals (21 to 31 and 32 to 42) with no growth: the trial starts at 43.
    expect(ramp.streams).toBe(2)
    expect(ramp.placing).toBe(true)
  })

  it('wait for a first bucket holding bytes', () => {
    const ramp = new Ramp(AUTO)
    ramp.update(new BucketSeries(0))
    const empty = new BucketSeries(0)
    empty.append(0, 0, null)
    ramp.update(empty)
    expect(ramp.lastAdd).toBeNull()
  })
})

describe('placing', () => {
  it('is only possible after the ramp has added streams', () => {
    expect(() => new Ramp(AUTO).stepStarted(0)).toThrow(Error)
  })
})
