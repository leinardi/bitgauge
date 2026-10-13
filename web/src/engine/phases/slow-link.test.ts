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
import { Warmup } from '@/engine/phases/warmup'
import { PRESETS } from '@/engine/presets'
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
  readonly warmup: Warmup
  /** When the end of warm-up became known on the client. */
  warmupKnownAt: number | null = null
  private readonly ids = new Map<LinkRequest, number>()
  private readonly last = new Map<number, { size: number; rate: number }>()
  private readonly direction: Direction
  private readonly waiting = new Set<number>()
  private readonly firstBytes: number[] = []
  private started = 0

  constructor(direction: Direction, bytesPerSecond: number) {
    this.direction = direction
    this.link = new SharedLink(direction, bytesPerSecond, RTT_MS)
    this.warmup = new Warmup({ direction, maxMs: PRESETS.standard[direction].maxMs, fixedMs: null })
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
    const current = series()
    if (current === null) {
      return
    }
    if (!this.ramp.settled) {
      const before = this.ramp.streams
      this.ramp.update(current)
      if (this.ramp.streams !== before || this.ramp.settled) {
        this.decisions.push({
          atMs,
          streams: this.ramp.streams,
          ...(this.ramp.plateau === undefined ? {} : { plateau: this.ramp.plateau }),
        })
      }
      this.grow()
    }
    if (this.warmup.end === null) {
      const active = Array.from({ length: this.ramp.streams }, (_, stream) => this.confirmed[stream] ?? 0)
      if (this.warmup.update(current, this.ramp, active) !== null) {
        this.warmupKnownAt = atMs
      }
    }
  }

  private place(cell: number): void {
    this.anchors.push(cell)
    this.ramp.stepStarted(cell)
  }

  private grow(): void {
    if (this.started < this.ramp.streams) {
      this.firstBytes.length = 0
    }
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

/** Runs an upload until the steady window from the end of warm-up meets the window condition. */
function uploadUntilWindow(bytesPerSecond: number) {
  const phase = new Phase('upload', bytesPerSecond)
  let windowAt: number | null = null
  phase.run(() => {
    const warmupEnd = phase.warmup.end
    if (warmupEnd !== null && windowAt === null && steadyWindow(phase.ledger, warmupEnd.bucket * 100).sufficient) {
      windowAt = phase.link.now
    }
    return windowAt !== null
  })
  return { phase, windowAt }
}

const LOW_SAMPLES = { level: 'low', reasons: ['insufficient-samples'] }
const NORMAL = { level: 'normal', reasons: [] }

describe('section 19.1 upload, 300 kbit/s and 300 ms RTT', () => {
  const { phase, windowAt } = uploadUntilWindow(37_500)

  it('decides the baseline, the kept trial to 2 and the no-gain trial to 4 as the confirmations allow', () => {
    expect(phase.decisions).toEqual([
      { atMs: 4648, streams: 2 },
      { atMs: 8196, streams: 4 },
      { atMs: 14_762, streams: 4, plateau: 'no-gain' },
    ])
  })

  it("anchors each trial at the cell of the added streams' first byte", () => {
    // Stream 2 reaches the server at 4.798 s, streams 3 and 4 at 8.346 s; the trial to 4 is
    // therefore decided on the interval ending at cell 83 + 12 + 13 = 108, 10.8 s.
    expect(phase.anchors).toEqual([47, 83])
  })

  it('ends warm-up at the moved cap, 10.8 s, before streams 3 and 4 have confirmed two requests', () => {
    // Known once streams 3 and 4 confirm their first requests; condition 2 does not hold there.
    expect(phase.warmup.end).toEqual({ bucket: 108, confidence: LOW_SAMPLES })
    expect(phase.warmupKnownAt).toBe(14_762)
  })

  it('meets the window condition from 10.8 s at 17.6 s, past the 15 s minimum', () => {
    expect(windowAt).toBe(17_644)
    const window = steadyWindow(phase.ledger, 10_800)
    expect(window.windowMs).toBe(5400)
    expect(window.confirmedInside).toBe(3)
  })
})

describe('section 19.1 download, 300 kbit/s and 300 ms RTT', () => {
  const phase = new Phase('download', 37_500)
  phase.run(() => phase.ramp.settled)

  it('decides at 4.1, 6.6 and 9.1 s on the live series', () => {
    expect(phase.decisions).toEqual([
      { atMs: 4100, streams: 2 },
      { atMs: 6600, streams: 4 },
      { atMs: 9100, streams: 4, plateau: 'no-gain' },
    ])
  })

  it('ends warm-up with the ramp at 9.1 s, on a steady series', () => {
    expect(phase.warmup.end).toEqual({ bucket: 91, confidence: NORMAL })
    const lastTen = phase.liveSeries().lastKnown(10)
    expect(lastTen.every((bytes) => bytes > 0)).toBe(true)
    expect(coefficientOfVariation(lastTen)).toBeLessThanOrEqual(0.1)
  })
})

describe('section 19.2, 500 kbit/s and 300 ms RTT', () => {
  // The ≈ 0.478 Mbit/s of goodput a 500 kbit/s shaper carries: 1448 payload bytes per 1514.
  const GOODPUT = 59_800

  it('decides the download at 4.1, 6.6, 9.1 and 11.6 s, warm-up ending first at its 10 s bound', () => {
    const phase = new Phase('download', GOODPUT)
    phase.run(() => phase.ramp.settled)
    expect(phase.decisions).toEqual([
      { atMs: 4100, streams: 2 },
      { atMs: 6600, streams: 4 },
      { atMs: 9100, streams: 6 },
      { atMs: 11_600, streams: 6, plateau: 'no-gain' },
    ])
    expect(phase.warmup.end).toEqual({ bucket: 100, confidence: { level: 'low', reasons: ['ramp-unsettled'] } })
  })

  it('decides the upload at 5.3, 8.9, 13.2 and 19.3 s, and meets the window condition at 19.3 s', () => {
    const { phase, windowAt } = uploadUntilWindow(GOODPUT)
    expect(phase.decisions).toEqual([
      { atMs: 5296, streams: 2 },
      { atMs: 8919, streams: 4 },
      { atMs: 13_203, streams: 6 },
      { atMs: 19_250, streams: 6, plateau: 'no-gain' },
    ])
    expect(phase.anchors).toEqual([54, 90, 133])
    // The bound, 50 % of the 25 s maximum, ends warm-up at cell 126 before the trial to 6 is
    // decided; it is known at 13.6 s.
    expect(phase.warmup.end).toEqual({ bucket: 126, confidence: { level: 'low', reasons: ['ramp-unsettled', 'insufficient-samples'] } })
    expect(phase.warmupKnownAt).toBe(13_643)
    expect(windowAt).toBe(19_250)
  })
})
