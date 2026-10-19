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

// The AIM quality scores (measurement.md section 13): the point tables at every threshold, the
// clamp at 0, the bands at every threshold, the missing inputs, the basis, and the worked examples
// of section 17 and the demo's LAN fixture.

import { describe, expect, it } from 'vitest'

import type { Bufferbloat, Experience } from '@/engine/messages'
import { type ScoreInputs, scores } from '@/engine/result/scores'

/** A grade whose increase, +50 ms, gives 0 points. */
const BLOAT: Bufferbloat = { grade: 'C', basis: 'download+upload', increaseMs: 50 }
/** Inputs that each give 0 points: 50 ms idle, 20 ms jitter, +50 ms, no download. */
const ZERO = { idle: { medianMs: 50, jitterMs: 20 }, bufferbloat: BLOAT, download: { bitsPerSecond: 0 } } satisfies ScoreInputs

function points(experience: Experience): number | null {
  return 'points' in experience ? experience.points : null
}

/** Gaming's points with the idle median at `medianMs` and the rest at their zero-point values. */
const gamingAtLatency = (medianMs: number) => points(scores({ ...ZERO, idle: { medianMs, jitterMs: 20 } }).gaming)

describe('the point tables', () => {
  it('give latency 20, 10, 5, 0, −10, −20 across 10, 20, 50, 100 and 500 ms, at or above each threshold', () => {
    // Gaming is idle latency + packet loss (0) + the increase (0 at 50 ms), clamped at 0: a
    // negative input shows through the other experiences' sums instead.
    expect([0, 9.99, 10, 19.99, 20, 49.99, 50].map(gamingAtLatency)).toEqual([20, 20, 10, 10, 5, 5, 0])
    // With the increase under 10 ms (+20), the negative latency points show.
    const withIncrease = (medianMs: number) => points(scores({ ...ZERO, idle: { medianMs, jitterMs: 20 }, bufferbloat: { ...BLOAT, increaseMs: 0 } }).gaming)
    expect([99.99, 100, 499.99, 500, 2000].map(withIncrease)).toEqual([20, 10, 10, 0, 0])
  })

  it('give the loaded-latency increase the latency table', () => {
    const atIncrease = (increaseMs: number) => points(scores({ ...ZERO, idle: { medianMs: 0, jitterMs: 20 }, bufferbloat: { ...BLOAT, increaseMs } }).gaming)
    // 20 from the idle latency, plus the increase's points.
    expect([0, 9.99, 10, 19.99, 20, 49.99, 50, 99.99, 100, 499.99, 500].map(atIncrease)).toEqual([40, 40, 30, 30, 25, 25, 20, 20, 10, 10, 0])
  })

  it('give jitter 10, 5, 0, −10, −20 across 10, 20, 100 and 500 ms', () => {
    // RTC is idle latency + jitter + the increase; 20 + 20 from a 0 ms idle median and increase.
    const atJitter = (jitterMs: number) => points(scores({ ...ZERO, idle: { medianMs: 0, jitterMs }, bufferbloat: { ...BLOAT, increaseMs: 0 } }).rtc)
    expect([0, 9.99, 10, 19.99, 20, 99.99, 100, 499.99, 500].map(atJitter)).toEqual([50, 50, 45, 45, 40, 40, 30, 30, 20])
  })

  it('give download 0, 5, 10, 20, 30 across 1, 10, 50 and 100 Mbit/s', () => {
    const atDownload = (bitsPerSecond: number) => points(scores({ ...ZERO, download: { bitsPerSecond } }).streaming)
    expect([0, 999_999, 1e6, 9_999_999, 10e6, 49_999_999, 50e6, 99_999_999, 100e6, 10e9].map(atDownload)).toEqual([0, 0, 5, 5, 10, 10, 20, 20, 30, 30])
  })

  it('clamp an experience’s sum at 0', () => {
    const worst = scores({ idle: { medianMs: 900, jitterMs: 900 }, bufferbloat: { ...BLOAT, increaseMs: 900 }, download: { bitsPerSecond: 0 } })
    expect([worst.streaming, worst.gaming, worst.rtc]).toEqual([
      { points: 0, band: 'bad' },
      { points: 0, band: 'bad' },
      { points: 0, band: 'bad' },
    ])
  })
})

describe('the bands', () => {
  // Streaming = idle latency + download + increase: 20 (0 ms) + the download + the increase.
  const streaming = (download: number, increaseMs: number) => scores({ ...ZERO, idle: { medianMs: 0, jitterMs: 20 }, download: { bitsPerSecond: download }, bufferbloat: { ...BLOAT, increaseMs } }).streaming

  it('of streaming break at 15, 20, 40 and 60 points', () => {
    expect(streaming(0, 100)).toEqual({ points: 10, band: 'bad' })
    expect(streaming(1e6, 100)).toEqual({ points: 15, band: 'poor' })
    expect(streaming(0, 50)).toEqual({ points: 20, band: 'average' })
    expect(streaming(10e6, 20)).toEqual({ points: 35, band: 'average' })
    expect(streaming(50e6, 50)).toEqual({ points: 40, band: 'good' })
    expect(streaming(100e6, 20)).toEqual({ points: 55, band: 'good' })
    expect(streaming(100e6, 10)).toEqual({ points: 60, band: 'great' })
  })

  it('of gaming break at 5, 15, 25 and 30 points', () => {
    const gaming = (medianMs: number, increaseMs: number) => scores({ ...ZERO, idle: { medianMs, jitterMs: 20 }, bufferbloat: { ...BLOAT, increaseMs } }).gaming
    expect(gaming(50, 50)).toEqual({ points: 0, band: 'bad' })
    expect(gaming(20, 50)).toEqual({ points: 5, band: 'poor' })
    expect(gaming(10, 50)).toEqual({ points: 10, band: 'poor' })
    expect(gaming(10, 20)).toEqual({ points: 15, band: 'average' })
    expect(gaming(0, 50)).toEqual({ points: 20, band: 'average' })
    expect(gaming(0, 20)).toEqual({ points: 25, band: 'good' })
    expect(gaming(0, 10)).toEqual({ points: 30, band: 'great' })
  })

  it('of video calls break at 5, 15, 25 and 40 points', () => {
    const rtc = (medianMs: number, jitterMs: number, increaseMs: number) => scores({ ...ZERO, idle: { medianMs, jitterMs }, bufferbloat: { ...BLOAT, increaseMs } }).rtc
    expect(rtc(50, 20, 50)).toEqual({ points: 0, band: 'bad' })
    expect(rtc(50, 10, 50)).toEqual({ points: 5, band: 'poor' })
    expect(rtc(50, 0, 20)).toEqual({ points: 15, band: 'average' })
    expect(rtc(20, 0, 20)).toEqual({ points: 20, band: 'average' })
    expect(rtc(10, 0, 20)).toEqual({ points: 25, band: 'good' })
    expect(rtc(0, 0, 20)).toEqual({ points: 35, band: 'good' })
    expect(rtc(10, 0, 0)).toEqual({ points: 40, band: 'great' })
  })
})

describe('the missing inputs', () => {
  it('name every unavailable input of each experience, in the order of section 13.1, and never score it', () => {
    expect(scores({})).toEqual({
      basis: 'none',
      packetLoss: 'not-measured',
      streaming: { missing: ['idle-latency', 'loaded-latency', 'download'] },
      gaming: { missing: ['idle-latency', 'loaded-latency'] },
      rtc: { missing: ['idle-latency', 'jitter', 'loaded-latency'] },
    })
  })

  it('without loaded latency: every experience misses it, and only it', () => {
    const { bufferbloat: _bufferbloat, ...rest } = ZERO
    expect(scores(rest)).toMatchObject({
      basis: 'none',
      streaming: { missing: ['loaded-latency'] },
      gaming: { missing: ['loaded-latency'] },
      rtc: { missing: ['loaded-latency'] },
    })
  })

  it('without a download headline: streaming alone misses it', () => {
    const skipped = scores({ ...ZERO, download: {} })
    expect(skipped.streaming).toEqual({ missing: ['download'] })
    expect(skipped.gaming).toEqual({ points: 0, band: 'bad' })
    expect(skipped.rtc).toEqual({ points: 0, band: 'bad' })
  })

  it('with idle latency unavailable: the median and the jitter are both missing', () => {
    const unavailable = scores({ ...ZERO, idle: {} })
    expect(unavailable.streaming).toEqual({ missing: ['idle-latency'] })
    expect(unavailable.gaming).toEqual({ missing: ['idle-latency'] })
    expect(unavailable.rtc).toEqual({ missing: ['idle-latency', 'jitter'] })
  })

  it('with only the jitter missing: video calls alone miss it', () => {
    const noJitter = scores({ ...ZERO, idle: { medianMs: 50 } })
    expect(noJitter.rtc).toEqual({ missing: ['jitter'] })
    expect(noJitter.gaming).toEqual({ points: 0, band: 'bad' })
  })

  it('with nothing but a direction without a number: every input missing', () => {
    const { bufferbloat: _bufferbloat, idle: _idle, ...rest } = ZERO
    expect(scores({ ...rest, download: {} })).toEqual(scores({}))
  })
})

describe('the basis', () => {
  it('is the grade’s, so a download-only grade labels the scores the same way', () => {
    for (const basis of ['download+upload', 'download', 'upload'] as const) {
      const bufferbloat: Bufferbloat = { ...BLOAT, basis }
      expect(scores({ ...ZERO, bufferbloat }).basis).toBe(basis)
    }
  })

  it('download only: scored from the download’s increase and headline', () => {
    const downloadOnly = scores({ idle: { medianMs: 12, jitterMs: 4 }, bufferbloat: { grade: 'A', basis: 'download', increaseMs: 15 }, download: { bitsPerSecond: 80e6 } })
    expect(downloadOnly).toEqual({
      basis: 'download',
      packetLoss: 'not-measured',
      streaming: { points: 40, band: 'good' },
      gaming: { points: 20, band: 'average' },
      rtc: { points: 30, band: 'good' },
    })
  })
})

describe('the worked examples', () => {
  it('section 17: 51 ms idle, 1.9 ms jitter, +81 ms and 94.1 Mbit/s give 20 average, 0 bad and 10 poor', () => {
    const example = scores({ idle: { medianMs: 51, jitterMs: 1.9 }, bufferbloat: { grade: 'C', basis: 'download+upload', increaseMs: 81 }, download: { bitsPerSecond: 94_100_000 } })
    expect(example).toEqual({
      basis: 'download+upload',
      packetLoss: 'not-measured',
      streaming: { points: 20, band: 'average' },
      gaming: { points: 0, band: 'bad' },
      rtc: { points: 10, band: 'poor' },
    })
  })

  it('the demo’s LAN: 3 ms idle, under 10 ms jitter, +39 ms and 160 Mbit/s give 55, 25 and 35, all good', () => {
    const lan = scores({ idle: { medianMs: 3, jitterMs: 0.4 }, bufferbloat: { grade: 'B', basis: 'download+upload', increaseMs: 39 }, download: { bitsPerSecond: 160e6 } })
    expect(lan).toEqual({
      basis: 'download+upload',
      packetLoss: 'not-measured',
      streaming: { points: 55, band: 'good' },
      gaming: { points: 25, band: 'good' },
      rtc: { points: 35, band: 'good' },
    })
  })
})
