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

// Loaded latency's pinger, measurement.md sections 11.1, 11.2 and 11.6, on the fake clock.

import { describe, expect, it } from 'vitest'

import { LoadedLatency, type LoadedOptions, type LoadedOutcome, type LoadedPath } from '@/engine/latency/loaded'
import { SharedEcho } from '@/engine/latency/shared'
import { FakeClock } from '@/engine/test/fakeClock'
import type { ProbeTiming, WsEcho } from '@/engine/types'

/** A WebSocket echo answering each ping after `rttFor(index)` ms, the index counting sends, or never on null. */
function echo(clock: FakeClock, rttFor: (index: number) => number | null) {
  const sends: number[] = []
  let listener: ((seq: number, sentAt: number, receivedAt: number) => void) | null = null
  const ws: WsEcho = {
    ping(seq, sentAt) {
      const rtt = rttFor(sends.length)
      sends.push(clock.now())
      if (rtt !== null) {
        clock.setTimer(rtt, () => listener?.(seq, sentAt, clock.now()))
      }
    },
    onPong(fn) {
      listener = fn
    },
    onClose() {},
    close() {},
  }
  return { shared: new SharedEcho(ws), sends }
}

/** GET /api/v1/ping answered after `rttFor(index)` ms with `status`, or never on null; it rejects once aborted. */
function prober(clock: FakeClock, rttFor: (index: number) => number | null, status = 204, timed = true) {
  const sends: number[] = []
  const aborted: number[] = []
  const transport = {
    probe(path: string, signal?: AbortSignal): Promise<ProbeTiming> {
      expect(path).toBe('/api/v1/ping')
      const index = sends.push(clock.now()) - 1
      const sentAt = clock.now()
      return new Promise((resolve, reject) => {
        signal?.addEventListener('abort', () => {
          aborted.push(clock.now())
          reject(new DOMException('aborted', 'AbortError'))
        })
        const rtt = rttFor(index)
        if (rtt !== null) {
          clock.setTimer(rtt, () => {
            const doneAt = clock.now()
            resolve({ status, sentAt, doneAt, timing: timed ? { nextHopProtocol: 'h2', requestStart: sentAt, responseStart: doneAt, responseEnd: doneAt } : null })
          })
        }
      })
    },
  }
  return { path: { kind: 'http', transport } satisfies LoadedPath, sends, aborted }
}

function pinger(clock: FakeClock, path: () => LoadedPath | null, overrides: Partial<LoadedOptions> = {}): LoadedLatency {
  return new LoadedLatency({ clock, path, inFlight: () => 3, httpSource: 'http-h2', startAt: 0, ...overrides })
}

/** Runs the pinger for `ms`, then finishes it with `graceMs` and waits out the grace. */
async function measure(clock: FakeClock, loaded: LoadedLatency, ms: number, graceMs = 2000): Promise<LoadedOutcome> {
  loaded.start()
  await clock.advance(ms)
  return settle(clock, loaded, graceMs)
}

/** Finishes a started pinger with `graceMs` and waits out the grace. */
async function settle(clock: FakeClock, loaded: LoadedLatency, graceMs: number): Promise<LoadedOutcome> {
  let outcome: LoadedOutcome | undefined
  void loaded.finish(graceMs).then((value) => (outcome = value))
  await clock.advance(graceMs + 1)
  if (outcome === undefined) {
    throw new Error('the pinger did not finish')
  }
  return outcome
}

describe('the WebSocket path', () => {
  it('pings every 300 ms from the start and records what was in flight at each send', async () => {
    const clock = new FakeClock()
    const { shared, sends } = echo(clock, () => 40)
    let inFlight = 0
    const answered: { atMs: number; rttMs: number }[] = []
    const loaded = pinger(clock, () => ({ kind: 'websocket', echo: shared }), { inFlight: () => inFlight++, answered: (ping) => answered.push(ping) })
    const outcome = await measure(clock, loaded, 1000)
    expect(sends).toEqual([0, 300, 600, 900])
    expect(outcome.samples.map(({ atMs, rttMs, inFlight: count, loaded: busy, source }) => ({ atMs, rttMs, count, busy, source }))).toEqual([
      { atMs: 0, rttMs: 40, count: 0, busy: false, source: 'websocket' },
      { atMs: 300, rttMs: 40, count: 1, busy: true, source: 'websocket' },
      { atMs: 600, rttMs: 40, count: 2, busy: true, source: 'websocket' },
      { atMs: 900, rttMs: 40, count: 3, busy: true, source: 'websocket' },
    ])
    expect(outcome).toMatchObject({ skippedTicks: 0, lost: 0, maxInFlight: 3, sources: ['websocket'] })
    expect(answered).toEqual(outcome.samples.map(({ atMs, rttMs }) => ({ atMs, rttMs })))
  })

  it('counts send instants from the phase start', async () => {
    const clock = new FakeClock()
    await clock.advance(5000)
    const { shared } = echo(clock, () => 10)
    const outcome = await measure(clock, pinger(clock, () => ({ kind: 'websocket', echo: shared }), { startAt: 4900 }), 400)
    expect(outcome.samples.map((sample) => sample.atMs)).toEqual([100, 400])
  })

  it('keeps at most 4 pings outstanding, skipping the ticks over the bound without queuing them', async () => {
    const clock = new FakeClock()
    const { shared, sends } = echo(clock, () => 1500)
    const outcome = await measure(clock, pinger(clock, () => ({ kind: 'websocket', echo: shared })), 2000)
    // Sends at 0, 300, 600 and 900; the tick at 1200 finds four outstanding and is skipped; the
    // pong of the first ping, at 1500, frees one for the tick at 1500.
    expect(sends).toEqual([0, 300, 600, 900, 1500, 1800])
    expect(outcome.skippedTicks).toBe(1)
    expect(outcome.samples).toHaveLength(6)
  })

  it('counts a ping unanswered after 30 s as lost', async () => {
    const clock = new FakeClock()
    const { shared } = echo(clock, (index) => (index === 0 ? null : 20))
    const outcome = await measure(clock, pinger(clock, () => ({ kind: 'websocket', echo: shared })), 31_000)
    expect(outcome.lost).toBe(1)
    expect(outcome.samples[0]?.atMs).toBe(300)
  })

  it('matches pongs on sequence and send time, so idle latency’s pongs on the same echo never count', async () => {
    const clock = new FakeClock()
    const { shared } = echo(clock, () => 25)
    const foreign: number[] = []
    shared.onPong((seq) => foreign.push(seq))
    const loaded = pinger(clock, () => ({ kind: 'websocket', echo: shared }))
    loaded.start()
    // Another listener's ping 0, sent 10 ms later than the pinger's ping 0.
    clock.setTimer(10, () => shared.ping(0, clock.now()))
    await clock.advance(100)
    let outcome: LoadedOutcome | undefined
    void loaded.finish(0).then((value) => (outcome = value))
    await clock.advance(1)
    expect(outcome?.samples.map((sample) => sample.rttMs)).toEqual([25])
    expect(foreign).toEqual([0, 0])
  })
})

describe('the HTTP fallback', () => {
  it('keeps one probe outstanding and labels its samples with the fallback’s source', async () => {
    const clock = new FakeClock()
    const http = prober(clock, () => 450)
    const outcome = await measure(clock, pinger(clock, () => http.path, { httpSource: 'http-h1-reserved' }), 1300)
    // A probe at 0 answered at 450; the tick at 300 is skipped; 600 sends, answered at 1050; 900 skipped; 1200 sends.
    expect(http.sends).toEqual([0, 600, 1200])
    expect(outcome).toMatchObject({ skippedTicks: 2, lost: 0, sources: ['http-h1-reserved'] })
    expect(outcome.samples.map((sample) => [sample.atMs, sample.rttMs])).toEqual([
      [0, 450],
      [600, 450],
      [1200, 450],
    ])
  })

  it('aborts a probe unanswered after 30 s and counts it lost', async () => {
    const clock = new FakeClock()
    const http = prober(clock, (index) => (index === 0 ? null : 20))
    const outcome = await measure(clock, pinger(clock, () => http.path), 30_100)
    expect(http.aborted).toEqual([30_000])
    expect(outcome.lost).toBe(1)
    expect(outcome.samples[0]?.atMs).toBe(30_000)
  })

  it('counts a probe that was not answered 204 as lost, and one without a timing entry as neither', async () => {
    const clock = new FakeClock()
    const failing = prober(clock, () => 20, 503)
    expect(await measure(clock, pinger(clock, () => failing.path), 400)).toMatchObject({ samples: [], lost: 2 })
    const untimed = prober(clock, () => 20, 204, false)
    expect(await measure(clock, pinger(clock, () => untimed.path), 400)).toMatchObject({ samples: [], lost: 0, sources: ['http-h2'] })
  })
})

describe('the path', () => {
  it('skips the ticks without a path, a gap in the series, and resumes on whichever path comes back', async () => {
    const clock = new FakeClock()
    const { shared } = echo(clock, () => 10)
    const http = prober(clock, () => 10)
    let path: LoadedPath | null = { kind: 'websocket', echo: shared }
    const loaded = pinger(clock, () => path)
    loaded.start()
    await clock.advance(400)
    path = null
    await clock.advance(600)
    path = http.path
    await clock.advance(600)
    const outcome = await settle(clock, loaded, 100)
    expect(outcome.skippedTicks).toBe(2)
    expect(outcome.sources).toEqual(['websocket', 'http-h2'])
    expect(outcome.samples.map((sample) => [sample.atMs, sample.source])).toEqual([
      [0, 'websocket'],
      [300, 'websocket'],
      [1200, 'http-h2'],
      [1500, 'http-h2'],
    ])
  })
})

describe('a closed echo', () => {
  it('loses its outstanding pings once the pinger sees it gone, so they never hold the bound on the reopened one', async () => {
    const clock = new FakeClock()
    // The first echo closes at 1000 with four pings outstanding at a 1.5 s loaded RTT.
    const first = echo(clock, (index) => (index < 4 ? null : 1500))
    const second = echo(clock, () => 1500)
    let path: LoadedPath | null = { kind: 'websocket', echo: first.shared }
    const loaded = pinger(clock, () => path)
    loaded.start()
    await clock.advance(1000)
    path = null
    await clock.advance(300)
    path = { kind: 'websocket', echo: second.shared }
    await clock.advance(1800)
    const outcome = await settle(clock, loaded, 2000)
    expect(first.sends).toEqual([0, 300, 600, 900])
    // The tick at 1200 has no path and loses the first echo's pings; the reopened echo takes four
    // pings from 1500 on, the bound reached again at 2700, and answers them all.
    expect(second.sends).toEqual([1500, 1800, 2100, 2400, 3000])
    expect(outcome).toMatchObject({ lost: 4, skippedTicks: 2 })
    expect(outcome.samples.map((sample) => sample.atMs)).toEqual([1500, 1800, 2100, 2400, 3000])
  })
})

describe('the end of the direction', () => {
  it('stops sending and waits for the outstanding pings up to the grace; the rest are lost', async () => {
    const clock = new FakeClock()
    const { shared, sends } = echo(clock, (index) => (index === 3 ? 5000 : 700))
    const loaded = pinger(clock, () => ({ kind: 'websocket', echo: shared }))
    loaded.start()
    await clock.advance(1000)
    let outcome: LoadedOutcome | undefined
    void loaded.finish(500).then((value) => (outcome = value))
    await clock.advance(499)
    expect(outcome).toBeUndefined()
    await clock.advance(1)
    // Pings at 0, 300, 600 and 900: 0 and 300 answered before the end, 600 at 1300 within the grace, 900 lost.
    expect(sends).toEqual([0, 300, 600, 900])
    expect(outcome).toMatchObject({ lost: 1 })
    expect(outcome?.samples).toHaveLength(3)
  })

  it('ends as soon as nothing is outstanding', async () => {
    const clock = new FakeClock()
    const { shared } = echo(clock, () => 50)
    const loaded = pinger(clock, () => ({ kind: 'websocket', echo: shared }))
    loaded.start()
    await clock.advance(320)
    let outcome: LoadedOutcome | undefined
    void loaded.finish(2000).then((value) => (outcome = value))
    await clock.advance(30)
    expect(outcome).toMatchObject({ lost: 0 })
    expect(outcome?.samples).toHaveLength(2)
  })

  it('drops the outstanding pings uncounted when drained, and aborts a pending probe', async () => {
    const clock = new FakeClock()
    const http = prober(clock, () => null)
    const loaded = pinger(clock, () => http.path)
    loaded.start()
    await clock.advance(100)
    expect(loaded.drain()).toMatchObject({ samples: [], lost: 0 })
    expect(http.aborted).toEqual([100])
    expect(clock.pending).toBe(0)
  })
})
