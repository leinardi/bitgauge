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

// Idle latency, measurement.md section 10, on the fake clock.

import { describe, expect, it } from 'vitest'

import { httpPinger, IdleLatency, type IdleOutcome, type IdleProgress, idleStatistics, webSocketPinger } from '@/engine/latency/idle'
import { FakeClock } from '@/engine/test/fakeClock'
import type { ProbeTiming, WsEcho } from '@/engine/types'

/**
 * A WebSocket echo answering ping `seq`, the echo's send number `index`, after `rttFor(seq, index)`
 * ms, or never when it gives null.
 */
function echo(clock: FakeClock, rttFor: (seq: number, index: number) => number | null) {
  const sends: number[] = []
  let listener: ((seq: number, sentAt: number, receivedAt: number) => void) | null = null
  const ws: WsEcho = {
    ping(seq, sentAt) {
      const rtt = rttFor(seq, sends.length)
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
  return { ws, sends }
}

async function run(clock: FakeClock, idle: IdleLatency, ms = 60_000): Promise<IdleOutcome | null> {
  let outcome: IdleOutcome | null | undefined
  void idle.run().then((value) => {
    outcome = value
  })
  await clock.advance(ms)
  if (outcome === undefined) {
    throw new Error('idle latency did not finish')
  }
  return outcome
}

describe('ping scheduling', () => {
  it('sends one ping at a time, no sooner than 100 ms after the previous send', async () => {
    const clock = new FakeClock()
    const { ws, sends } = echo(clock, () => 30)
    const outcome = await run(clock, new IdleLatency(clock, webSocketPinger(ws), 6))
    expect(sends).toEqual([0, 100, 200, 300, 400, 500])
    // The first ping is the warm-up: six pings, five samples.
    expect(outcome?.result.samples).toEqual([30, 30, 30, 30, 30])
  })

  it('sends the next ping 50 ms after a slow answer, never in the moment it arrives', async () => {
    const clock = new FakeClock()
    const { ws, sends } = echo(clock, () => 250)
    await run(clock, new IdleLatency(clock, webSocketPinger(ws), 6))
    expect(sends).toEqual([0, 300, 600, 900, 1200, 1500])
  })

  it('keeps 100 ms after the send while an answer comes within 50 ms, and waits 50 ms beyond it', async () => {
    const clock = new FakeClock()
    // Round trips of 30, 40 and 80 ms: the 100 ms spacing holds until an answer 80 ms after its
    // send puts the next one 130 ms after it.
    const { ws, sends } = echo(clock, (seq) => [30, 40, 80, 30][seq] ?? 30)
    await run(clock, new IdleLatency(clock, webSocketPinger(ws), 5))
    expect(sends).toEqual([0, 100, 200, 330, 430])
  })

  it('sends the next ping at once after a lost one, whose answer never came', async () => {
    const clock = new FakeClock()
    const { ws, sends } = echo(clock, (seq) => (seq === 1 ? null : 250))
    await run(clock, new IdleLatency(clock, webSocketPinger(ws), 4))
    // Ping 1 times out after 10 s, before any sample: ping 2 goes out at that instant.
    expect(sends).toEqual([0, 300, 10_300, 10_600])
  })

  it('stops after 30 s even if the count is not reached', async () => {
    const clock = new FakeClock()
    const { ws, sends } = echo(clock, () => 4000)
    const outcome = await run(clock, new IdleLatency(clock, webSocketPinger(ws), 20))
    // Ping 7, sent at 28.35 s, is still outstanding at 30 s: neither a sample nor a loss.
    expect(sends).toEqual([0, 4050, 8100, 12_150, 16_200, 20_250, 24_300, 28_350])
    expect(outcome?.result.samples).toHaveLength(6)
    expect(outcome?.result.lossPercent).toBe(0)
    expect(clock.pending).toBe(0)
  })
})

describe('the timeout policy', () => {
  for (const [median, timeout] of [
    [300, 2000],
    [600, 2400],
  ] as const) {
    it(`waits max(2 s, 4 × ${median} ms) = ${timeout} ms once the median is ${median} ms`, async () => {
      const clock = new FakeClock()
      const { ws, sends } = echo(clock, (seq) => (seq === 4 ? null : median))
      await run(clock, new IdleLatency(clock, webSocketPinger(ws), 6))
      expect((sends[5] ?? 0) - (sends[4] ?? 0)).toBe(timeout)
    })
  }

  it('waits 10 s for the first ping, and while there is no sample yet', async () => {
    const clock = new FakeClock()
    const { ws, sends } = echo(clock, (seq) => (seq < 2 ? null : 50))
    const outcome = await run(clock, new IdleLatency(clock, webSocketPinger(ws), 7))
    expect(sends.slice(0, 3)).toEqual([0, 10_000, 20_000])
    // The lost warm-up ping is not a loss; the lost second one is.
    expect(outcome?.result.lossPercent).toBeCloseTo((1 / 6) * 100, 10)
  })

  it('caps the timeout at 10 s', async () => {
    const clock = new FakeClock()
    const { ws, sends } = echo(clock, (seq) => (seq === 3 ? null : 3000))
    await run(clock, new IdleLatency(clock, webSocketPinger(ws), 5), 120_000)
    expect((sends[4] ?? 0) - (sends[3] ?? 0)).toBe(10_000)
  })

  it('ignores an answer that arrives after its ping timed out', async () => {
    const clock = new FakeClock()
    // Ping 3 answers after 2.5 s, past its 2 s timeout, while ping 4 is outstanding.
    const { ws } = echo(clock, (seq) => (seq === 3 ? 2500 : 50))
    const outcome = await run(clock, new IdleLatency(clock, webSocketPinger(ws), 7))
    expect(outcome?.result.samples).toEqual([50, 50, 50, 50, 50])
    expect(outcome?.result.lossPercent).toBeCloseTo((1 / 6) * 100, 10)
  })
})

describe('progress', () => {
  it('reports each answered or lost ping with the last RTT, the running statistics and the probe-timeout share', async () => {
    const clock = new FakeClock()
    const { ws } = echo(clock, (seq) => (seq === 2 ? null : 10 * (seq + 1)))
    const seen: IdleProgress[] = []
    await run(clock, new IdleLatency(clock, webSocketPinger(ws), 4, (progress) => seen.push(progress)))
    // The warm-up counts as a ping but carries no sample; the lost ping carries no RTT.
    expect(seen).toEqual([
      { path: 'websocket', pings: 1, count: 4 },
      { path: 'websocket', pings: 2, count: 4, rttMs: 20, medianMs: 20, minMs: 20, p90Ms: 20, jitterMs: 0, lossPercent: 0 },
      { path: 'websocket', pings: 3, count: 4, medianMs: 20, minMs: 20, p90Ms: 20, jitterMs: 0, lossPercent: 50 },
      { path: 'websocket', pings: 4, count: 4, rttMs: 40, medianMs: 30, minMs: 20, p90Ms: expect.any(Number), jitterMs: 20, lossPercent: (1 / 3) * 100 },
    ])
  })
})

describe('loss', () => {
  it('is the lost pings over the pings sent, the warm-up excluded, and not packet loss', async () => {
    const clock = new FakeClock()
    const { ws } = echo(clock, (seq) => (seq === 2 || seq === 5 ? null : 40))
    const outcome = await run(clock, new IdleLatency(clock, webSocketPinger(ws), 10))
    expect(outcome?.result.lossPercent).toBeCloseTo((2 / 9) * 100, 10)
    expect(outcome?.result.samples).toHaveLength(7)
    // The result has a probe-timeout percentage and nothing that reads as packet loss.
    expect(Object.keys(outcome?.result ?? {})).not.toContain('packetLoss')
  })
})

describe('statistics', () => {
  it('are min, median, p90 and the mean absolute difference of consecutive samples', () => {
    expect(idleStatistics([10, 20, 15, 30, 25])).toEqual({ minMs: 10, medianMs: 20, p90Ms: 28, jitterMs: 8.75 })
  })

  it('keep the samples in send order with the timer resolution', async () => {
    const clock = new FakeClock()
    const rtts = [0, 12.125, 0.25, 48.875, 7.5, 3]
    const { ws } = echo(clock, (seq) => rtts[seq] ?? null)
    const outcome = await run(clock, new IdleLatency(clock, webSocketPinger(ws), 6))
    expect(outcome?.result.samples).toEqual([12.125, 0.25, 48.875, 7.5, 3])
    expect(outcome?.result.minMs).toBe(0.25)
  })

  it('are unavailable under 5 samples', async () => {
    const clock = new FakeClock()
    const { ws } = echo(clock, (seq) => (seq === 3 ? null : 40))
    const outcome = await run(clock, new IdleLatency(clock, webSocketPinger(ws), 6))
    expect(outcome?.unavailable).toBe(true)
    expect(outcome?.unreachable).toBe(false)
    expect(outcome?.result).toEqual({ path: 'websocket', lossPercent: 20, samples: [40, 40, 40, 40] })
  })

  it('report the server unreachable when every ping is lost', async () => {
    const clock = new FakeClock()
    const { ws } = echo(clock, () => null)
    const outcome = await run(clock, new IdleLatency(clock, webSocketPinger(ws), 6), 120_000)
    expect(outcome).toEqual({
      result: { path: 'websocket', lossPercent: 100, samples: [] },
      unavailable: true,
      unreachable: true,
    })
  })
})

describe('the HTTP fallback', () => {
  /** GET /api/v1/ping answered after 80 ms, with `answer(seq)` as its status and timing entry. */
  function probes(clock: FakeClock, answer: (seq: number) => Pick<ProbeTiming, 'status' | 'timing'>) {
    const paths: string[] = []
    let seq = 0
    return {
      paths,
      transport: {
        probe(path: string): Promise<ProbeTiming> {
          paths.push(path)
          const sentAt = clock.now()
          const result = answer(seq++)
          return new Promise((resolve) => {
            clock.setTimer(80, () => resolve({ ...result, sentAt, doneAt: clock.now() }))
          })
        },
      },
    }
  }

  const timing = (requestStart: number, responseStart: number) => ({
    nextHopProtocol: 'h2',
    requestStart,
    responseStart,
    responseEnd: responseStart + 1,
  })

  it('times each ping as responseStart − requestStart of its timing entry', async () => {
    const clock = new FakeClock()
    const { paths, transport } = probes(clock, (seq) => ({ status: 204, timing: timing(100 * seq + 20, 100 * seq + 52) }))
    const outcome = await run(clock, new IdleLatency(clock, httpPinger(transport), 6))
    expect(paths).toEqual(Array(6).fill('/api/v1/ping'))
    // 32 ms from the entry, not the 80 ms the whole fetch took.
    expect(outcome?.result).toMatchObject({ path: 'http', samples: [32, 32, 32, 32, 32], medianMs: 32 })
  })

  it('counts an answer other than 204 as lost, and one without its entry as nothing', async () => {
    const clock = new FakeClock()
    const { transport } = probes(clock, (seq) => {
      if (seq === 2) {
        return { status: 503, timing: timing(0, 30) }
      }
      return { status: 204, timing: seq === 3 ? null : timing(0, 30) }
    })
    const outcome = await run(clock, new IdleLatency(clock, httpPinger(transport), 8))
    expect(outcome?.result.samples).toEqual([30, 30, 30, 30, 30])
    // One loss among six counted pings: the unmeasured one is not counted as sent.
    expect(outcome?.result.lossPercent).toBeCloseTo((1 / 6) * 100, 10)
  })
})

describe('stop', () => {
  it('ends the run without an outcome and leaves no timer behind', async () => {
    const clock = new FakeClock()
    const { ws } = echo(clock, () => 40)
    const idle = new IdleLatency(clock, webSocketPinger(ws), 20)
    let outcome: IdleOutcome | null | undefined
    void idle.run().then((value) => {
      outcome = value
    })
    await clock.advance(250)
    idle.stop()
    await clock.advance(0)
    expect(outcome).toBeNull()
    expect(clock.pending).toBe(0)
  })

  it('lets a new run start over on the same path when the page is visible again', async () => {
    const clock = new FakeClock()
    const { ws, sends } = echo(clock, () => 40)
    const pinger = webSocketPinger(ws)
    const first = new IdleLatency(clock, pinger, 20)
    void first.run()
    await clock.advance(250)
    first.stop()
    const outcome = await run(clock, new IdleLatency(clock, pinger, 6))
    // Three pings of the stopped run, then six of the new one with its own warm-up.
    expect(sends).toEqual([0, 100, 200, 250, 350, 450, 550, 650, 750])
    expect(outcome?.result.samples).toEqual([40, 40, 40, 40, 40])
  })

  it('ignores a late echo of a stopped run that carries the new run sequence number', async () => {
    const clock = new FakeClock()
    // Send 1 is the stopped run's ping 1, echoed at 1100 ms while the new run's ping 1 (send 3,
    // at 250 ms) is outstanding; its own echo comes at 2250 ms.
    const rtts = [40, 1000, 40, 2000]
    const { ws } = echo(clock, (_seq, index) => rtts[index] ?? 40)
    const pinger = webSocketPinger(ws)
    const first = new IdleLatency(clock, pinger, 20)
    void first.run()
    await clock.advance(150)
    first.stop()
    const outcome = await run(clock, new IdleLatency(clock, pinger, 6))
    expect(outcome?.result.samples).toEqual([2000, 40, 40, 40, 40])
    expect(outcome?.result.lossPercent).toBe(0)
  })
})
