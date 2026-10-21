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

  it('runs a scheduled clock’s timers each at its own instant, in a task of its own, in event time', async () => {
    const base = new FakeClock()
    const clock = new DemoClock(base, { speed: 60, nextTask: (fn) => base.setTimer(0, fn) })
    const fired: [number, number][] = []
    for (const ms of [3, 10, 1]) {
      clock.setTimer(ms, () => fired.push([ms, clock.now()]))
    }
    // A long real stretch: every timer reads its own instant, not the late one it ran at.
    await base.advance(50)
    expect(fired).toEqual([[1, 1], [3, 3], [10, 10]])
    // The reading stays at the last timer's instant, however much real time has passed.
    expect(clock.now()).toBe(10)
    // A message from outside moves it on to real time, never past the next timer still to run.
    clock.sync()
    expect(clock.now()).toBe(3000)
    clock.setTimer(100, () => fired.push([100, clock.now()]))
    base.pause(10)
    clock.sync()
    expect(clock.now()).toBe(3100)
  })

  it('pauses a scheduled clock where it is until resumed, as if no real time had passed meanwhile', async () => {
    const base = new FakeClock()
    const clock = new DemoClock(base, { speed: 1, nextTask: (fn) => base.setTimer(0, fn) })
    const fired: number[] = []
    clock.setTimer(10, () => {
      clock.pause()
      fired.push(clock.now())
    })
    clock.setTimer(20, () => fired.push(clock.now()))
    await base.advance(500)
    expect(fired).toEqual([10])
    clock.sync()
    expect(clock.now()).toBe(10)
    clock.resume()
    await base.advance(5)
    expect(fired).toEqual([10])
    await base.advance(5)
    expect(fired).toEqual([10, 20])
  })

  it('runs a fast-forward’s next timer when one before it throws', async () => {
    const base = new FakeClock()
    const thrown: unknown[] = []
    const clock = new DemoClock(base, {
      speed: 60,
      nextTask: (fn) =>
        base.setTimer(0, () => {
          try {
            fn()
          } catch (error) {
            thrown.push(error)
          }
        }),
    })
    const fired: number[] = []
    clock.setTimer(1, () => {
      throw new Error('a failing timer')
    })
    clock.setTimer(2, () => fired.push(clock.now()))
    await base.advance(50)
    expect(thrown).toHaveLength(1)
    expect(fired).toEqual([2])
  })

  it('changes its speed on the way, demo time carrying on, and a timer armed before keeps its instant', async () => {
    const base = new FakeClock()
    const clock = new DemoClock(base, { speed: 10 })
    let at = 0
    clock.setTimer(1000, () => (at = clock.now()))
    await base.advance(50)
    expect(clock.now()).toBe(500)
    clock.setSpeed(1)
    await base.advance(400)
    expect(at).toBe(0)
    await base.advance(100)
    expect(at).toBe(1000)
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
      return Array.from({ length: 5 }, () => link.roundTrip(0))
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

describe('the demo link under load', () => {
  // The LAN without jitter, so a round trip is its RTT and the queue's delay.
  const steady = { ...DEMO_LINKS.lan, jitterMs: 0 }

  it('adds each direction’s queue delay as 1 − e^(−t/τ) while it has requests in flight, and none after', () => {
    const link = new Link(steady, 'epoch-1')
    expect(link.roundTrip(0)).toBeCloseTo(3.1)
    link.load('upload', 1000)
    link.load('upload', 1500)
    expect(link.roundTrip(1000)).toBeCloseTo(3.1)
    expect(link.roundTrip(2000)).toBeCloseTo(3.1 + 39 * (1 - Math.exp(-1)))
    expect(link.roundTrip(11_000)).toBeCloseTo(3.1 + 39, 2)
    link.unload('upload')
    expect(link.loadedMs(11_000)).toBeCloseTo(39, 2)
    link.unload('upload')
    expect(link.roundTrip(11_000)).toBeCloseTo(3.1)
    // The queue starts over with the next load.
    link.load('download', 12_000)
    expect(link.loadedMs(13_000)).toBeCloseTo(15 * (1 - Math.exp(-1)))
  })

  it('adds no delay on a link without a loaded profile', () => {
    const link = new Link({ ...DEMO_LINKS.insufficient, jitterMs: 0 }, 'epoch-1')
    link.load('download', 0)
    expect(link.roundTrip(5000)).toBe(48)
  })

  it('delays the echo and the probes while a direction is loaded, and a request while another moves', async () => {
    const clock = new FakeClock()
    const demo = new DemoTransport(clock, new Link({ ...steady, loaded: { downloadMs: 100, uploadMs: 300, tauMs: 1 } }, 'epoch-1'), infoFor('lan'), BROWSER)
    const opening = demo.ws()
    await clock.advance(10)
    const echo = await opening
    const pongs: number[] = []
    echo.onPong((_seq, sentAt, receivedAt) => pongs.push(Math.round(receivedAt - sentAt)))
    const download = new AbortController()
    const firstByte: number[] = []
    void demo.download(10_000_000, download.signal).then(() => firstByte.push(clock.now()))
    await clock.advance(50)
    echo.ping(0, clock.now())
    let probeRtt = 0
    void demo.probe('/api/v1/ping').then((probe) => (probeRtt = Math.round((probe.timing?.responseStart ?? 0) - (probe.timing?.requestStart ?? 0))))
    await clock.advance(200)
    expect(pongs).toEqual([103])
    expect(probeRtt).toBe(103)
    // The download found no request moving, so no queue ahead of its first byte.
    expect(firstByte).toEqual([13.1])
    // A second one, sent while the first moves, waits behind the bytes that hold the queue.
    const second = new AbortController()
    const sentAt = clock.now()
    void demo.download(10_000_000, second.signal).then(() => firstByte.push(Math.round(clock.now() - sentAt)))
    await clock.advance(150)
    expect(firstByte).toEqual([13.1, 103])
    second.abort()
    download.abort()
    echo.ping(1, clock.now())
    await clock.advance(50)
    expect(pongs).toEqual([103, 3])
  })
})

describe('the demo probes', () => {
  const steady = { ...DEMO_LINKS.lan, jitterMs: 0 }

  it('report their fetch start and a reused connection, connectStart equal to connectEnd', async () => {
    const clock = new FakeClock()
    await clock.advance(100)
    const demo = new DemoTransport(clock, new Link(steady, 'epoch-1'), infoFor('lan'), BROWSER)
    const answer = demo.probe('/api/v1/small')
    await clock.advance(10)
    const { timing, sentAt } = await answer
    expect(timing).toMatchObject({ nextHopProtocol: 'h2', fetchStart: sentAt, connectStart: 100, connectEnd: 100, requestStart: 100 })
    expect(timing?.responseStart).toBeCloseTo(103.1)
  })

  it('set up a new connection first on a link that opens one per probe, a round trip before the request', async () => {
    const clock = new FakeClock()
    const demo = new DemoTransport(clock, new Link({ ...steady, newConnections: true }, 'epoch-1'), infoFor('lan'), BROWSER)
    const answer = demo.probe('/api/v1/small')
    await clock.advance(10)
    const { timing } = await answer
    expect(timing?.connectStart).toBe(0)
    expect(timing?.connectEnd).toBeCloseTo(3.1)
    expect(timing?.requestStart).toBe(timing?.connectEnd)
    expect(timing?.responseStart).toBeCloseTo(6.2)
  })

  it('leave /small unanswered while an upload is in flight on a starving link, until aborted', async () => {
    const clock = new FakeClock()
    const link = new Link({ ...steady, starveSmallDuringUpload: true }, 'epoch-1')
    const demo = new DemoTransport(clock, link, infoFor('lan'), BROWSER)
    // Idle, and during download, it answers.
    await expect(Promise.all([demo.probe('/api/v1/small'), clock.advance(10)])).resolves.toBeDefined()
    link.load('upload', clock.now())
    const aborted = new AbortController()
    let settled: string | null = null
    demo.probe('/api/v1/small', aborted.signal).then(
      () => (settled = 'answered'),
      (error: unknown) => (settled = error instanceof DOMException ? error.name : 'failed'),
    )
    // The ping path stays answered.
    const ping = demo.probe('/api/v1/ping')
    await clock.advance(5000)
    expect((await ping).status).toBe(204)
    expect(settled).toBeNull()
    aborted.abort()
    await clock.advance(1)
    expect(settled).toBe('AbortError')
  })
})

describe('the HTTP/1.1 link', () => {
  it('holds six connections: a request or probe beyond them waits, first come first served', async () => {
    const clock = new FakeClock()
    const demo = new DemoTransport(clock, new Link({ ...DEMO_LINKS['lan-http1'], jitterMs: 0 }, 'epoch-1'), infoFor('lan-http1'), BROWSER)
    const downloads = Array.from({ length: 6 }, () => new AbortController())
    downloads.forEach((controller) => void demo.download(100_000_000, controller.signal))
    const answered: string[] = []
    const starts: number[] = []
    for (const name of ['first', 'second']) {
      void demo.probe('/api/v1/ping').then((probe) => {
        answered.push(name)
        starts.push(probe.timing?.requestStart ?? 0)
      })
    }
    await clock.advance(100)
    expect(answered).toEqual([])
    downloads[0]?.abort()
    await clock.advance(50)
    // The first probe takes the freed connection at 100; the second waits for the first's answer.
    expect(answered).toEqual(['first', 'second'])
    expect(starts[0]).toBe(100)
    expect(starts[1]).toBeGreaterThan(103.1)
  })

  it('rejects a request aborted while it waits, and gives its place to the next', async () => {
    const clock = new FakeClock()
    const demo = new DemoTransport(clock, new Link({ ...DEMO_LINKS['lan-http1'], jitterMs: 0, connections: 1 }, 'epoch-1'), infoFor('lan-http1'), BROWSER)
    const download = new AbortController()
    void demo.download(100_000_000, download.signal)
    const waiting = new AbortController()
    const outcomes: string[] = []
    demo.probe('/api/v1/ping', waiting.signal).then(
      () => outcomes.push('answered'),
      (error: unknown) => outcomes.push((error as DOMException).name),
    )
    void demo.probe('/api/v1/ping').then(() => outcomes.push('next'))
    await clock.advance(10)
    waiting.abort()
    download.abort()
    await clock.advance(50)
    expect(outcomes).toEqual(['AbortError', 'next'])
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

  it('reports its simulated instants on the resolution of its clock', async () => {
    const base = new FakeClock()
    const clock = new DemoClock(base, { speed: 1, resolutionMs: 1 })
    const demo = new DemoTransport(clock, new Link(DEMO_LINKS.lan, 'epoch-1'), infoFor('lan'), BROWSER)
    const opening = demo.ws()
    await base.advance(10)
    const echo = await opening
    const pongs: number[] = []
    echo.onPong((_seq, _sentAt, receivedAt) => pongs.push(receivedAt))
    for (let seq = 0; seq < 5; seq++) {
      echo.ping(seq, clock.now())
      await base.advance(7.3)
    }
    const probe = demo.probe('/api/v1/ping')
    await base.advance(10)
    const { doneAt } = await probe
    expect(pongs).toHaveLength(5)
    ;[...pongs, doneAt].forEach((at) => expect(Number.isInteger(at)).toBe(true))
  })

  it('stamps the bytes of a late pacer tick across the stretch they crossed', async () => {
    const clock = new FakeClock()
    const demo = new DemoTransport(clock, new Link(DEMO_LINKS.lan, 'epoch-1'), infoFor('lan'), BROWSER)
    const response = demo.download(50_000_000, new AbortController().signal)
    await clock.advance(20)
    const seen: { at: number; bytes: number }[] = []
    void (async () => {
      for await (const chunk of (await response).chunks) seen.push(chunk)
    })()
    await clock.advance(5)
    const before = seen.length
    const from = seen.at(-1)?.at ?? 0
    clock.pause(75)
    await clock.advance(0)
    // The reader takes a few promise rounds per chunk: let it drain the body.
    for (let round = 0; round < 10; round++) await clock.advance(0)
    const late = seen.slice(before)
    const stamps = late.map((chunk) => chunk.at)
    // About 80 ms of bytes in steps of no more than a tick, the last at the instant the tick fired.
    expect(stamps.length).toBeGreaterThanOrEqual(8)
    stamps.forEach((at, index) => expect(at - (stamps[index - 1] ?? from)).toBeLessThanOrEqual(10.01))
    expect(stamps.at(-1)).toBeCloseTo(clock.now(), 2)
    // One request alone moves at the LAN's per-request ceiling, 110 Mbit/s: 13 750 bytes per ms.
    const bytes = late.reduce((sum, chunk) => sum + chunk.bytes, 0)
    expect(bytes / ((stamps.at(-1) ?? 0) - from)).toBeCloseTo(13_750, -2)
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
