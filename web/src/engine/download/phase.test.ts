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

// The download phase on the fake transport: the worked timelines of measurement.md sections 19.2
// and 19.3, failures, the 429 rule, the data cap and the compression notice.

import { describe, expect, it } from 'vitest'

import { type DownloadOptions, type DownloadOutcome, DownloadPhase } from '@/engine/download/phase'
import { FIRST_SIZE, SIZE_FLOOR } from '@/engine/phases/sizing'
import { FakeClock } from '@/engine/test/fakeClock'
import { type Failure, FakeTransport, type Scenario } from '@/engine/test/fakeTransport'

const MIB = 1024 * 1024
const NORMAL = { level: 'normal', reasons: [] }

/**
 * Section 19.2: a 500 kbit/s shaper carrying ≈ 0.478 Mbit/s of goodput (1448 payload bytes per
 * 1514), 300 ms RTT. Section 19.3: 100 Mbit/s of goodput, 50 ms RTT.
 */
const GOODPUT = 59_800
const VPN: Scenario = { rate: () => GOODPUT, rttMs: 300, protocol: 'h2' }
const FAST: Scenario = { rate: () => 12_500_000, rttMs: 50, protocol: 'h2' }

function failing(failures: Record<number, Failure>, scenario: Scenario = VPN): Scenario {
  return { ...scenario, failure: (direction, index) => (direction === 'download' ? (failures[index] ?? null) : null) }
}

interface Harness {
  clock: FakeClock
  transport: FakeTransport
  phase: DownloadPhase
  /** The outcome once the phase has ended. */
  outcome: () => DownloadOutcome | undefined
}

/** Starts the phase on `clock`; `options.transport` replaces the fake transport the phase uses. */
function start(scenario: Scenario, options: Partial<DownloadOptions> = {}, clock = new FakeClock()): Harness {
  const transport = new FakeTransport(clock, scenario)
  const phase = new DownloadPhase({
    clock,
    transport,
    preset: 'standard',
    streams: { mode: 'auto', fixed: 3, max: 6 },
    bounds: { minMs: 10_000, maxMs: 20_000 },
    warmup: 'auto',
    dataCapBytes: null,
    dataUsedBefore: 0,
    limits: { maxDownloadBytes: 256 * MIB, maxStreamsPerClient: 6 },
    rttMs: scenario.rttMs,
    ...options,
  })
  let outcome: DownloadOutcome | undefined
  void phase.run().then((value) => {
    outcome = value
  })
  return { clock, transport, phase, outcome: () => outcome }
}

/** Runs the phase to its end, at most 60 s. */
async function run(scenario: Scenario, options: Partial<DownloadOptions> = {}, clock = new FakeClock()) {
  const harness = start(scenario, options, clock)
  await harness.clock.advance(60_000)
  const outcome = harness.outcome()
  if (outcome === undefined) {
    throw new Error('the download phase did not end')
  }
  return { ...harness, outcome }
}

function headline(outcome: DownloadOutcome): number {
  const window = outcome.window
  if (window === null) {
    throw new Error('no steady window')
  }
  return (window.bytes * 8 * 1000) / (window.toMs - window.fromMs)
}

describe('section 19.2, 500 kbit/s and 300 ms RTT', () => {
  it('ends warm-up with the no-gain plateau at 6.9 s and the phase at its 10 s minimum with a 3.1 s window', async () => {
    const { outcome } = await run(VPN)
    expect(outcome).toMatchObject({
      status: 'measured',
      endMs: 10_000,
      warmup: { bucket: 69, confidence: NORMAL },
      window: { fromMs: 6900, toMs: 10_000 },
      streams: 4,
      plateau: 'no-gain',
      protocol: 'h2',
      notices: [],
      events: [],
      dataCapReached: false,
    })
  })

  it('meets the window condition at 9.9 s, 3 s after warm-up', async () => {
    // With a 5 s minimum the phase ends at the first instant the condition holds.
    const { outcome } = await run(VPN, { bounds: { minMs: 5000, maxMs: 20_000 } })
    expect(outcome.endMs).toBe(9900)
    expect(outcome.window).toMatchObject({ fromMs: 6900, toMs: 9900 })
    expect(outcome.notices).toEqual([{ code: 'slow-link-extended', direction: 'download' }])
    expect(outcome.events).toEqual([{ code: 'extended', atMs: 5000 }])
  })

  it('counts every byte the link carried into the bucket it arrived in', async () => {
    const { outcome, transport } = await run(VPN)
    const carried = Array.from({ length: 100 }, (_, bucket) => transport.carried.download[bucket] ?? 0)
    expect(outcome.buckets).toEqual(carried)
    expect(outcome.buckets.reduce((sum, bytes) => sum + bytes, 0)).toBe(outcome.bytes)
  })

  it('reports ≈ 0.457 Mbit/s, the link idling once in the window, and ≈ 0.54 MB of data used', async () => {
    const { outcome } = await run(VPN)
    expect(Math.abs(headline(outcome) / 457_000 - 1)).toBeLessThan(0.02)
    // ≈ 95.5 % of the goodput: the four floor-sized streams' RTT gaps coincide once, 9.4 to 9.6 s.
    expect(headline(outcome) / (GOODPUT * 8)).toBeCloseTo(0.955, 2)
    const [, , gapStart = 0, gapEnd = 0] = outcome.buckets.slice(92, 96)
    expect(gapStart + gapEnd).toBeLessThan(GOODPUT / 10)
    expect(Math.min(...outcome.buckets.slice(69))).toBe(gapEnd)
    expect(outcome.bytes / 1e6).toBeCloseTo(0.54, 2)
  })

  it('sizes the first request at 64 KiB and the next at the stream rate', async () => {
    const { transport } = await run(VPN)
    expect(transport.requested.download[0]).toBe(FIRST_SIZE)
    // 64 KiB in 1095 ms between the first and last chunk: ≈ 58.4 KiB.
    expect(transport.requested.download[1]).toBeCloseTo(58.4 * 1024, -2)
    expect(Math.min(...transport.requested.download)).toBe(SIZE_FLOOR)
  })
})

describe('section 19.3, 100 Mbit/s and 50 ms RTT', () => {
  it('grows the requests to ≈ 1 s each within 0.4 s', async () => {
    const { transport } = await run(FAST)
    expect(transport.requested.download.slice(0, 4)).toEqual([FIRST_SIZE, 512 * 1024, 4 * MIB, 12_520_310])
  })

  it('keeps the trial to 2 over the baseline that held a request gap, and plateaus at 4 streams at 5 s', async () => {
    const { outcome } = await run(FAST)
    expect(outcome).toMatchObject({
      status: 'measured',
      endMs: 10_000,
      warmup: { bucket: 50, confidence: NORMAL },
      window: { fromMs: 5000, toMs: 10_000 },
      streams: 4,
      plateau: 'no-gain',
    })
    expect(Math.abs(headline(outcome) / 100e6 - 1)).toBeLessThan(0.01)
    expect(outcome.bytes / 1e6).toBeCloseTo(122, 0)
  })

  it('meets the window condition at 8 s', async () => {
    const { outcome } = await run(FAST, { bounds: { minMs: 5000, maxMs: 20_000 } })
    expect(outcome.endMs).toBe(8000)
  })
})

describe('failures', () => {
  // One stream, so that the requests fail in issue order.
  const SINGLE: Partial<DownloadOptions> = { streams: { mode: 'single', fixed: 1, max: 6 } }

  it('end the phase with an error after three consecutive ones, keeping the bytes read', async () => {
    const { outcome, transport } = await run(failing({ 3: { kind: 'status', status: 500 }, 4: { kind: 'error' }, 5: { kind: 'short', bytes: 1000 } }), SINGLE)
    expect(outcome.status).toBe('error')
    expect(outcome.events).toEqual([{ code: 'error', atMs: outcome.endMs, notice: 'requests-failed' }])
    expect(outcome.endMs).toBeLessThan(10_000)
    expect(outcome.bytes).toBe(outcome.buckets.reduce((sum, bytes) => sum + bytes, 0))
    // Three complete requests, then the 1000 bytes of the short body.
    const [first = 0, second = 0, third = 0] = transport.requested.download
    expect(outcome.bytes).toBe(first + second + third + 1000)
  })

  it('reset the count when a request completes', async () => {
    const { outcome } = await run(failing({ 3: { kind: 'status', status: 500 }, 4: { kind: 'status', status: 500 }, 6: { kind: 'error' } }), SINGLE)
    expect(outcome.status).toBe('measured')
    expect(outcome.endMs).toBe(10_000)
  })

  it('count a body whose byte count differs from the size asked for', async () => {
    const short: Failure = { kind: 'short', bytes: 1000 }
    const { outcome } = await run(failing({ 0: short, 1: short, 2: short }), SINGLE)
    expect(outcome.status).toBe('error')
    expect(outcome.bytes).toBe(3000)
  })

  it('include a request aborted after 30 s, after which the stream issues its next one', async () => {
    const { clock, transport, outcome } = start(failing({ 0: { kind: 'stall' } }), { ...SINGLE, bounds: { minMs: 40_000, maxMs: 60_000 } })
    await clock.advance(29_999)
    expect(transport.requested.download).toEqual([FIRST_SIZE])
    await clock.advance(1)
    // The stalled request taught the stream nothing: the next one is a first request again.
    expect(transport.requested.download).toEqual([FIRST_SIZE, FIRST_SIZE])
    await clock.advance(30_000)
    expect(outcome()?.status).toBe('measured')
  })
})

describe('a 429', () => {
  it('aborts the request it answered, releasing its unread body', async () => {
    const clock = new FakeClock()
    const fake = new FakeTransport(clock, failing({ 1: { kind: 'status', status: 429 } }))
    const signals: AbortSignal[] = []
    const { outcome } = await run(
      VPN,
      {
        transport: {
          download: (size, signal) => {
            signals.push(signal)
            return fake.download(size, signal)
          },
        },
        streams: { mode: 'single', fixed: 1, max: 6 },
      },
      clock,
    )
    expect(signals.map((signal) => signal.aborted).slice(0, 3)).toEqual([false, true, false])
    expect(outcome.status).toBe('measured')
  })

  it('lowers the effective cap by one, drops the streams above it, and the phase continues', async () => {
    const { outcome, transport } = await run(failing({ 5: { kind: 'status', status: 429 } }), {
      streams: { mode: 'fixed', fixed: 3, max: 6 },
      limits: { maxDownloadBytes: 256 * MIB, maxStreamsPerClient: 3 },
    })
    expect(outcome).toMatchObject({ status: 'measured', endMs: 10_000, streams: 2 })
    expect(outcome.notices).toContainEqual({ code: 'stream-limit', direction: 'download', streams: 2 })
    expect(transport.peakInFlight.download).toBe(3)
  })

  it('ends a running trial at the lowered cap', async () => {
    // Request 3 is the first of stream 2, issued by the trial to 2 at 3.3 s.
    const { outcome } = await run(failing({ 3: { kind: 'status', status: 429 } }), {
      limits: { maxDownloadBytes: 256 * MIB, maxStreamsPerClient: 2 },
    })
    expect(outcome).toMatchObject({ streams: 1, plateau: 'cap' })
    expect(outcome.notices).toContainEqual({ code: 'stream-limit', direction: 'download', streams: 1 })
  })
})

describe('the data cap', () => {
  it('is never exceeded, and ends the phase when less than the floor remains', async () => {
    const cap = 400_000
    const { outcome } = await run(VPN, { dataCapBytes: cap, dataUsedBefore: 100_000 })
    expect(outcome.bytes).toBeLessThanOrEqual(cap - 100_000)
    expect(outcome.bytes).toBeGreaterThan(cap - 100_000 - 4 * SIZE_FLOOR)
    expect(outcome.endMs).toBeLessThan(10_000)
    expect(outcome.dataCapReached).toBe(true)
    expect(outcome.notices).toContainEqual({ code: 'data-cap-reached', direction: 'download' })
    expect(outcome.events).toContainEqual({ code: 'data-cap', atMs: outcome.endMs })
    // As if the maximum had passed: the window condition decides, and it does not hold here.
    expect(outcome.status).toBe('insufficient-data')
  })

  it('ends the phase at once when the budget is already below the floor', async () => {
    const { outcome, transport } = await run(VPN, { dataCapBytes: MIB, dataUsedBefore: MIB - SIZE_FLOOR + 1 })
    expect(transport.requested.download).toEqual([])
    expect(outcome).toMatchObject({ endMs: 0, bytes: 0, dataCapReached: true, status: 'insufficient-data' })
  })

  it('shrinks a request to the budget', async () => {
    const { transport } = await run(VPN, { dataCapBytes: 100_000 })
    expect(transport.requested.download[0]).toBe(FIRST_SIZE)
    expect(transport.requested.download[1]).toBe(100_000 - FIRST_SIZE)
  })
})

describe('response details', () => {
  it('add the compression notice when a response carries Content-Encoding', async () => {
    const { outcome } = await run({ ...VPN, contentEncoding: 'gzip' })
    expect(outcome.notices).toEqual([{ code: 'response-compression-detected' }])
  })

  it('record an empty nextHopProtocol as unknown, and none without a timing entry', async () => {
    expect((await run({ ...VPN, protocol: '' })).outcome.protocol).toBe('unknown')
    expect((await run({ ...VPN, protocol: null })).outcome.protocol).toBeNull()
  })
})

describe('a delayed chunk', () => {
  it('counts in the open bucket when its instant falls in one a decision has read', async () => {
    const clock = new FakeClock()
    // One response whose single chunk, stamped at 120 ms, is only read at 250 ms.
    const chunks = async function* () {
      await new Promise<void>((resolve) => clock.setTimer(250, resolve))
      yield { bytes: 1000, at: 120 }
    }
    const { phase, outcome } = start(
      VPN,
      {
        transport: { download: () => Promise.resolve({ status: 200, contentEncoding: null, chunks: chunks(), timing: () => null }) },
        streams: { mode: 'single', fixed: 1, max: 6 },
      },
      clock,
    )
    await clock.advance(300)
    phase.stop()
    await clock.advance(0)
    // Buckets 0 and 1 were read at 100 and 200 ms; the chunk counts in bucket 2.
    expect(outcome()?.buckets).toEqual([0, 0, 1000])
  })
})

describe('stop', () => {
  it('ends the phase at the instant, aborting requests in flight and keeping their bytes', async () => {
    const { clock, phase, transport, outcome } = start(VPN)
    await clock.advance(4250)
    const read = phase.dataUsed
    const requested = transport.requested.download.length
    phase.stop()
    await clock.advance(5000)
    expect(outcome()).toMatchObject({ status: 'partial', endMs: 4250, bytes: read, events: [{ code: 'cancelled', atMs: 4250 }] })
    // The last bucket is the partial one, from 4.2 s to the stop.
    expect(outcome()?.buckets).toHaveLength(43)
    expect(transport.requested.download).toHaveLength(requested)
    expect(clock.pending).toBe(0)
  })
})
