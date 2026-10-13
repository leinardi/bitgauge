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

// The demo's clock, link and transport on their own: the speed, the coarse timer, the busy share
// and the hold of the clock; the link's seeded draws; and upload telemetry that obeys
// wire-protocol.md section 4 as the engine checks it.

import { describe, expect, it } from 'vitest'

import { DemoClock } from '@/demo/clock'
import { DEMO_LINKS, infoFor } from '@/demo/fixtures'
import { Link } from '@/demo/link'
import { DemoTransport } from '@/demo/transport'
import { FakeClock } from '@/engine/test/fakeClock'
import type { UploadResponse } from '@/engine/types'
import { validTelemetry } from '@/engine/upload/timeline'

const BROWSER = { name: 'Firefox', major: 131, os: 'Linux' }

function transport(clock: FakeClock, link = new Link(DEMO_LINKS.vpn, 'epoch-1')) {
  return { link, transport: new DemoTransport(clock, link, infoFor('vpn'), BROWSER) }
}

describe('the demo clock', () => {
  it('runs at its speed, on the coarse timer it is given', async () => {
    const base = new FakeClock()
    const clock = new DemoClock(base, { speed: 4, resolutionMs: 5 })
    const fired: number[] = []
    clock.setTimer(100, () => fired.push(clock.now()))
    await base.advance(12)
    expect(clock.now()).toBe(45)
    await base.advance(13)
    expect(fired).toEqual([100])
    expect(clock.resolutionMs).toBe(5)
    expect(clock.crossOriginIsolated).toBe(false)
  })

  it('reports the busy share it is given, and holds for good', async () => {
    const base = new FakeClock()
    const clock = new DemoClock(base, { speed: 1, busyFraction: 0.95 })
    await base.advance(1000)
    expect(clock.busyMs()).toBeCloseTo(950)
    let fired = false
    clock.setTimer(10, () => {
      fired = true
    })
    clock.hold()
    await base.advance(1000)
    expect(clock.now()).toBe(1000)
    expect(fired).toBe(false)
  })

  it('refuses a speed or a timer resolution that is not positive', () => {
    expect(() => new DemoClock(new FakeClock(), { speed: 0 })).toThrow(RangeError)
    expect(() => new DemoClock(new FakeClock(), { speed: 1, resolutionMs: 0 })).toThrow(RangeError)
  })
})

describe('the demo link', () => {
  it('draws the same round trips from the same seed', () => {
    const draws = (seed: number) => {
      const link = new Link(DEMO_LINKS.vpn, 'epoch-1', seed)
      return Array.from({ length: 5 }, () => link.roundTrip())
    }
    expect(draws(7)).toEqual(draws(7))
    expect(draws(7)).not.toEqual(draws(8))
    draws(7).forEach((rtt) => expect(Math.abs(rtt - DEMO_LINKS.vpn.rttMs)).toBeLessThanOrEqual(1.5 * DEMO_LINKS.vpn.jitterMs))
  })

  it('loses about the given share of requests, and every one once failing', () => {
    const link = new Link({ ...DEMO_LINKS.lan, lossProbability: 0.3 }, 'epoch-1')
    const lost = Array.from({ length: 2000 }, (_, at) => link.lost(at)).filter(Boolean).length
    expect(lost / 2000).toBeGreaterThan(0.25)
    expect(lost / 2000).toBeLessThan(0.35)
    link.failFrom(5000)
    expect(Array.from({ length: 50 }, (_, index) => link.lost(5000 + index)).every(Boolean)).toBe(true)
  })

  it('changes its epoch at a restart, and answers nothing once unreachable', () => {
    const link = new Link(DEMO_LINKS.lan, 'epoch-1')
    link.restart(500)
    link.unreachable(900)
    expect(link.epochAt(499)).toBe('epoch-1')
    expect(link.epochAt(500)).not.toBe('epoch-1')
    expect(link.reachable(899)).toBe(true)
    expect(link.reachable(900)).toBe(false)
  })
})

describe('the demo transport', () => {
  it('answers an upload with telemetry on the server grid that adds up to its bytes', async () => {
    const clock = new FakeClock()
    const { transport: demo } = transport(clock)
    const size = 64 * 1024
    const progress: number[] = []
    const answer = demo.upload(size, (sent) => progress.push(sent), new AbortController().signal)
    await clock.advance(5000)
    const { status, telemetry } = await answer
    expect(status).toBe(200)
    if (telemetry === null) {
      throw new Error('no telemetry')
    }
    expect(telemetry.bytes).toBe(size)
    expect(telemetry.buckets.reduce((sum, bytes) => sum + bytes, 0)).toBe(size)
    expect(telemetry.firstBucket).toBe(Math.floor(telemetry.startMs / telemetry.bucketMs))
    expect(telemetry.firstBucket + telemetry.buckets.length).toBe(Math.ceil((telemetry.startMs + telemetry.durationMs) / telemetry.bucketMs))
    // 64 KiB at 210 kbit/s takes about 2.5 s.
    expect(telemetry.durationMs).toBeGreaterThan(2400)
    expect(telemetry.durationMs).toBeLessThan(2600)
    expect(progress.at(-1)).toBe(size)
  })

  it('answers telemetry the engine accepts, wherever in a millisecond the request starts', async () => {
    const clock = new FakeClock()
    const { transport: demo } = transport(clock, new Link(DEMO_LINKS.lan, 'epoch-1'))
    const size = 1024
    const answers: Promise<UploadResponse>[] = []
    for (let index = 0; index < 400; index++) {
      // 0.37 ms apart: the half round trip of 1.55 ms lands on every fraction of a millisecond, and
      // on the last half millisecond of many cells.
      await clock.advance(0.37)
      answers.push(demo.upload(size, () => undefined, new AbortController().signal))
    }
    await clock.advance(5000)
    for (const { telemetry } of await Promise.all(answers)) {
      expect(telemetry !== null && validTelemetry(telemetry, size)).toBe(true)
    }
  })

  it('drains a download in flight across a restart, which closes the WebSocket', async () => {
    const clock = new FakeClock()
    const { link, transport: demo } = transport(clock)
    const echo = await (async () => {
      const opening = demo.ws()
      await clock.advance(100)
      return opening
    })()
    const closes: number[] = []
    echo.onClose((code) => closes.push(code))
    const response = demo.download(16_000, new AbortController().signal)
    await clock.advance(100)
    const chunks = (await response).chunks
    link.restart(clock.now())
    await clock.advance(1000)
    let bytes = 0
    for await (const chunk of chunks) {
      bytes += chunk.bytes
    }
    expect(bytes).toBe(16_000)
    expect(closes).toEqual([1001])
  })

  it('fails what is in flight when the server becomes unreachable', async () => {
    const clock = new FakeClock()
    const { link, transport: demo } = transport(clock)
    const response = demo.download(1_000_000, new AbortController().signal)
    await clock.advance(100)
    const { chunks } = await response
    link.unreachable(clock.now())
    await clock.advance(100)
    await expect(
      (async () => {
        for await (const _chunk of chunks) {
          // drained
        }
      })(),
    ).rejects.toThrow(TypeError)
    const info = demo.info()
    await clock.advance(100)
    await expect(info).rejects.toThrow(TypeError)
  })
})
