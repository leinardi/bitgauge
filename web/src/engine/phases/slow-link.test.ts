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

// The slow-link budgets of measurement.md sections 19.1 and 19.2: request sizing and the ramp
// driven on the shared-link model those sections are computed on. Upload decisions read the
// confirmed series of the request ledger, so they wait for the confirmation delay; download
// decisions read the live series.

import { describe, expect, it } from 'vitest'

import type { Direction, Plateau } from '@/engine/messages'
import { Ramp } from '@/engine/phases/ramp'
import { nextSize, SIZE_FLOOR, streamRate } from '@/engine/phases/sizing'
import { BucketSeries, coefficientOfVariation } from '@/engine/stats/buckets'
import { type Completion, type LinkRequest, SharedLink } from '@/engine/test/sharedLink'
import { cellOf } from '@/engine/upload/grid'
import { UploadLedger } from '@/engine/upload/watermark'
import { confirmedSeries, steadyWindow } from '@/engine/upload/window'

const CAP = 256 * 1024 * 1024
const RTT_MS = 300

interface Decision {
  atMs: number
  streams: number
  plateau?: Plateau
}

/** One Standard phase on the shared link, until `done` says so or 30 s pass. */
class Phase {
  readonly link: SharedLink
  readonly ledger = new UploadLedger()
  readonly ramp = new Ramp({ mode: 'auto', fixed: 1, max: 6, serverMax: 6, rttMs: RTT_MS })
  readonly decisions: Decision[] = []
  /** Where each added step was placed on the series. */
  readonly anchors: number[] = []
  /** Confirmed requests per stream. */
  readonly confirmed: number[] = []
  private readonly ids = new Map<LinkRequest, number>()
  private readonly last = new Map<number, { size: number; rate: number }>()
  private readonly direction: Direction
  private readonly waiting = new Set<number>()
  private readonly firstBytes: number[] = []
  private started = 0

  constructor(direction: Direction, bytesPerSecond: number) {
    this.direction = direction
    this.link = new SharedLink(direction, bytesPerSecond, RTT_MS)
    this.grow()
    this.waiting.clear()
  }

  run(done: () => boolean): void {
    while (this.link.now < 30_000 && !done()) {
      const completions = this.link.step()
      if (this.direction === 'download') {
        this.decide(this.link.now, () => this.liveSeries())
        if (this.ramp.placing) {
          this.place(cellOf(this.link.now))
        }
      }
      completions.forEach((completion) => this.completed(completion))
    }
  }

  /** The download series: every bucket completed so far. */
  liveSeries(): BucketSeries {
    const series = new BucketSeries(0)
    for (let bucket = 0; bucket < Math.floor(this.link.now / 100); bucket++) {
      series.append(this.link.totals[bucket] ?? 0)
    }
    return series
  }

  private completed(completion: Completion): void {
    const { request, telemetry } = completion
    this.last.set(request.stream, { size: request.size, rate: streamRate(request.size, completion.transferMs) })
    this.confirmed[request.stream] = (this.confirmed[request.stream] ?? 0) + 1
    if (this.direction === 'upload') {
      this.ledger.confirm(this.ids.get(request) ?? -1, completion.doneAt, telemetry)
      if (this.waiting.delete(request.stream)) {
        this.firstBytes.push(telemetry.startMs)
        if (this.waiting.size === 0) {
          this.place(cellOf(Math.max(...this.firstBytes)))
        }
      }
      this.decide(completion.doneAt, () => confirmedSeries(this.ledger))
    }
    this.issue(request.stream)
  }

  private decide(atMs: number, series: () => BucketSeries | null): void {
    if (this.ramp.settled) {
      return
    }
    const current = series()
    if (current === null) {
      return
    }
    const before = this.ramp.streams
    this.ramp.update(current)
    if (this.ramp.streams !== before || this.ramp.settled) {
      this.decisions.push({
        atMs,
        streams: this.ramp.streams,
        ...(this.ramp.plateau === undefined ? {} : { plateau: this.ramp.plateau }),
      })
    }
    this.firstBytes.length = 0
    this.grow()
  }

  private place(cell: number): void {
    this.anchors.push(cell)
    this.ramp.stepStarted(cell)
  }

  private grow(): void {
    while (this.started < this.ramp.streams) {
      this.waiting.add(this.started)
      this.issue(this.started++)
    }
  }

  private issue(stream: number): void {
    const prev = this.last.get(stream)
    const size = nextSize(prev?.rate ?? 0, prev?.size ?? null, SIZE_FLOOR, CAP, null) ?? 0
    const request = this.link.send(stream, size)
    this.ids.set(request, this.ledger.send(this.link.now))
    this.last.set(stream, { size, rate: prev?.rate ?? 0 })
  }
}

/** Runs an upload until the steady window from `warmupEndMs` meets the window condition. */
function uploadUntilWindow(bytesPerSecond: number, warmupEndMs: number) {
  const phase = new Phase('upload', bytesPerSecond)
  let windowAt: number | null = null
  let confirmedAtSettle: number[] = []
  phase.run(() => {
    if (phase.ramp.settled && confirmedAtSettle.length === 0) {
      confirmedAtSettle = [...phase.confirmed]
    }
    if (phase.ramp.settled && windowAt === null && steadyWindow(phase.ledger, warmupEndMs).sufficient) {
      windowAt = phase.link.now
    }
    return windowAt !== null
  })
  return { phase, windowAt, confirmedAtSettle }
}

describe('section 19.1 upload, 300 kbit/s and 300 ms RTT', () => {
  const { phase, windowAt, confirmedAtSettle } = uploadUntilWindow(37_500, 8700)

  it('decides the baseline, the kept trial to 2 and the no-gain trial to 4 as the confirmations allow', () => {
    expect(phase.decisions).toEqual([
      { atMs: 3348, streams: 2 },
      { atMs: 6844, streams: 4 },
      { atMs: 13_462, streams: 4, plateau: 'no-gain' },
    ])
  })

  it("anchors each trial at the cell of the added streams' first byte", () => {
    // Stream 2 reaches the server at 3.498 s, streams 3 and 4 at 6.994 s; the trial to 4 is
    // therefore decided on the interval ending at cell 69 + 12 + 6 = 87, 8.7 s.
    expect(phase.anchors).toEqual([34, 69])
  })

  it('settles before streams 3 and 4 have confirmed two requests each', () => {
    // Warm-up condition 2 does not hold at the moved cap: confidence low, insufficient-samples.
    expect(confirmedAtSettle.slice(2)).toEqual([1, 1])
  })

  it('meets the window condition from 8.7 s just past the 15 s minimum', () => {
    expect(windowAt).toBe(15_388)
    const window = steadyWindow(phase.ledger, 8700)
    expect(window.windowMs).toBe(4600)
    expect(window.confirmedInside).toBe(4)
  })
})

describe('section 19.1 download, 300 kbit/s and 300 ms RTT', () => {
  const phase = new Phase('download', 37_500)
  phase.run(() => phase.ramp.settled)

  it('decides at 2.7, 4.5 and 6.3 s on the live series', () => {
    expect(phase.decisions).toEqual([
      { atMs: 2700, streams: 2 },
      { atMs: 4500, streams: 4 },
      { atMs: 6300, streams: 4, plateau: 'no-gain' },
    ])
  })

  it('leaves a steady series for the warm-up at 6.3 s', () => {
    const lastTen = phase.liveSeries().lastKnown(10)
    expect(lastTen.every((bytes) => bytes > 0)).toBe(true)
    expect(coefficientOfVariation(lastTen)).toBeLessThanOrEqual(0.1)
  })
})

describe('section 19.2, 500 kbit/s and 300 ms RTT', () => {
  it('decides the download at 3.3, 5.1 and 6.9 s', () => {
    const phase = new Phase('download', 62_500)
    phase.run(() => phase.ramp.settled)
    expect(phase.decisions).toEqual([
      { atMs: 3300, streams: 2 },
      { atMs: 5100, streams: 4 },
      { atMs: 6900, streams: 4, plateau: 'no-gain' },
    ])
  })

  it('decides the upload at 3.95, 6.3 and 10.3 s, and meets the window condition at 12.3 s', () => {
    const { phase, windowAt, confirmedAtSettle } = uploadUntilWindow(62_500, 8200)
    expect(phase.decisions).toEqual([
      { atMs: 3949, streams: 2 },
      { atMs: 6298, streams: 4 },
      { atMs: 10_307, streams: 4, plateau: 'no-gain' },
    ])
    expect(phase.anchors).toEqual([40, 64])
    expect(confirmedAtSettle.slice(2)).toEqual([1, 1])
    expect(windowAt).toBe(12_331)
  })
})
