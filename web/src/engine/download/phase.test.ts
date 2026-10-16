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
import { coefficientOfVariation } from '@/engine/stats/buckets'
import { BUCKET_MS } from '@/engine/stats/units'
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
/**
 * 1.3 Gbit/s and 4 ms RTT, at most half of it per request, in a browser that takes 150 ms to start
 * each request (section 3): a stream's hole is not absorbed by the other.
 */
const GAPPED: Scenario = { rate: () => 162_500_000, perRequest: 81_250_000, rttMs: 4, protocol: 'http/1.1', requestGapMs: 150 }

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
  it('ends warm-up at the 10 s bound with the ramp unsettled at 6 streams, extending the phase to 13 s', async () => {
    const { outcome } = await run(VPN)
    const unsettled = { level: 'low', reasons: ['ramp-unsettled'] }
    expect(outcome).toMatchObject({
      status: 'measured',
      endMs: 13_000,
      warmup: { bucket: 100, confidence: unsettled },
      window: { fromMs: 10_000, toMs: 13_000 },
      streams: 6,
      plateau: 'no-gain',
      protocol: 'h2',
      notices: [
        { code: 'slow-link-extended', direction: 'download' },
        { code: 'low-confidence', direction: 'download', reasons: ['ramp-unsettled'] },
      ],
      events: [{ code: 'extended', atMs: 10_000 }],
      dataCapReached: false,
    })
  })

  it('meets the window condition at 13 s, 3 s after warm-up, with a 5 s minimum too', async () => {
    // The window condition, not the minimum, ends the phase; the extension starts at the minimum.
    const { outcome } = await run(VPN, { bounds: { minMs: 5000, maxMs: 20_000 } })
    expect(outcome.endMs).toBe(13_000)
    expect(outcome.window).toMatchObject({ fromMs: 10_000, toMs: 13_000 })
    expect(outcome.events).toEqual([{ code: 'extended', atMs: 5000 }])
  })

  it('counts every byte the link carried into the bucket it arrived in', async () => {
    const { outcome, transport } = await run(VPN)
    const carried = Array.from({ length: 130 }, (_, bucket) => transport.carried.download[bucket] ?? 0)
    expect(outcome.buckets).toEqual(carried)
    expect(outcome.buckets.reduce((sum, bytes) => sum + bytes, 0)).toBe(outcome.bytes)
  })

  it('reports ≈ 0.478 Mbit/s, the six streams keeping the link busy, and ≈ 0.70 MB of data used', async () => {
    const { outcome } = await run(VPN)
    // The goodput within 0.1 %: six floor-sized streams leave no RTT gap in the window.
    expect(headline(outcome) / (GOODPUT * 8)).toBeCloseTo(1, 3)
    expect(Math.min(...outcome.buckets.slice(100))).toBeGreaterThan(GOODPUT / 10 - 50)
    expect(outcome.bytes / 1e6).toBeCloseTo(0.7, 2)
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

  it('plateaus at 2 streams when the trial to 4 gains nothing, ending warm-up at 5.3 s', async () => {
    const { outcome } = await run(FAST)
    expect(outcome).toMatchObject({
      status: 'measured',
      endMs: 10_000,
      warmup: { bucket: 53, confidence: NORMAL },
      window: { fromMs: 5300, toMs: 10_000 },
      streams: 2,
      plateau: 'no-gain',
    })
    expect(Math.abs(headline(outcome) / 100e6 - 1)).toBeLessThan(0.01)
    expect(outcome.bytes / 1e6).toBeCloseTo(121, 0)
  })

  it('meets the window condition at 8.3 s', async () => {
    const { outcome } = await run(FAST, { bounds: { minMs: 5000, maxMs: 20_000 } })
    expect(outcome.endMs).toBe(8300)
  })
})

describe('section 19.4, 2.5 Gbit/s LAN', () => {
  // At most 0.5 Gbit/s per request, so each added stream adds throughput until six share the link.
  const LAN: Scenario = { rate: () => 312_500_000, perRequest: 62_500_000, rttMs: 0.3, protocol: 'h2' }

  it('grows the requests to ≈ 60 MiB and ramps to the cap of 6 streams at 6.5 s', async () => {
    const { outcome, transport } = await run(LAN)
    expect(transport.requested.download.slice(0, 5)).toEqual([FIRST_SIZE, 512 * 1024, 4 * MIB, 32 * MIB, 62_601_552])
    expect(outcome).toMatchObject({
      status: 'measured',
      endMs: 10_000,
      warmup: { bucket: 65, confidence: NORMAL },
      window: { fromMs: 6500, toMs: 10_000 },
      streams: 6,
      plateau: 'cap',
    })
    expect(Math.abs(headline(outcome) / 2.5e9 - 1)).toBeLessThan(0.01)
    expect(outcome.bytes / 1e9).toBeCloseTo(2.2, 1)
  })

  it('meets the window condition at 9.5 s', async () => {
    const { outcome } = await run(LAN, { bounds: { minMs: 5000, maxMs: 20_000 } })
    expect(outcome.endMs).toBe(9500)
  })
})

/** The coefficient of variation of the steady window's buckets. */
function variation(outcome: DownloadOutcome): number {
  const window = outcome.window
  if (window === null) {
    throw new Error('no steady window')
  }
  return coefficientOfVariation(outcome.buckets.slice(window.fromMs / BUCKET_MS, window.toMs / BUCKET_MS)) ?? Number.NaN
}

describe('an unstable window', () => {
  it('extends the phase to its maximum and still reports the window', async () => {
    // The rate steps between 100 and 20 Mbit/s every second: the window condition holds from the
    // minimum, but its 500 ms sums never steady (measurement.md section 5).
    const stepping: Scenario = { ...FAST, rate: (_, atMs) => (Math.floor(atMs / 1000) % 2 === 0 ? 12_500_000 : 2_500_000) }
    const { outcome } = await run(stepping)
    expect(outcome).toMatchObject({ status: 'measured', endMs: 20_000 })
    expect(outcome.notices).toContainEqual({ code: 'slow-link-extended', direction: 'download' })
    expect(outcome.events).toContainEqual({ code: 'extended', atMs: 10_000 })
  })
})

describe('a browser with an issue gap', () => {
  const fixed = (streams: number, maxStreamsPerClient = 8): Partial<DownloadOptions> => ({
    streams: { mode: 'fixed', fixed: streams, max: 6 },
    limits: { maxDownloadBytes: 256 * MIB, maxStreamsPerClient },
  })

  it('issues each stream\'s next request early once the gap has shown, closing the holes', async () => {
    const { transport, outcome } = await run(GAPPED, fixed(2))
    expect(headline(outcome) / 1e9).toBeCloseTo(1.3, 1)
    expect(variation(outcome)).toBeLessThan(0.05)
    // Early requests overlap their predecessors, within the server's in-flight bound.
    expect(transport.peakInFlight.download).toBeGreaterThan(2)
    expect(transport.peakInFlight.download).toBeLessThanOrEqual(8)
  })

  it('leaves the holes, which read as unstable, when the in-flight bound allows no early request', async () => {
    const { transport, outcome } = await run(GAPPED, fixed(2, 2))
    expect(transport.peakInFlight.download).toBe(2)
    expect(variation(outcome)).toBeGreaterThan(0.2)
  })

  it('closes most of the holes of six streams with the two spare slots of the default bound', async () => {
    const bound = await run(GAPPED, fixed(6, 6))
    const spare = await run(GAPPED, fixed(6))
    expect(bound.transport.peakInFlight.download).toBe(6)
    expect(spare.transport.peakInFlight.download).toBeLessThanOrEqual(8)
    // Boundaries come every ≈ 170 ms and each needs a 150 ms overlap: two slots cover most of them.
    expect(variation(spare.outcome)).toBeLessThan(variation(bound.outcome) / 2)
    expect(variation(spare.outcome)).toBeLessThan(0.15)
  })

  it('never issues early in a browser without a gap', async () => {
    const { transport } = await run(FAST, fixed(2))
    expect(transport.peakInFlight.download).toBe(2)
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
    // Each failure leaves a hole in a lone stream's delivery, so the window's 500 ms sums never
    // steady and the phase runs to its maximum (measurement.md section 5).
    expect(outcome.endMs).toBe(20_000)
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
    // Dropping a stream steps the rate inside the window, which stays unstable to the maximum.
    expect(outcome).toMatchObject({ status: 'measured', endMs: 20_000, streams: 2 })
    expect(outcome.notices).toContainEqual({ code: 'stream-limit', direction: 'download', streams: 2 })
    expect(transport.peakInFlight.download).toBe(3)
  })

  it('ends a running trial at the lowered cap', async () => {
    // Request 4 is the first of stream 2, issued by the trial to 2 at 4.1 s.
    const { outcome } = await run(failing({ 4: { kind: 'status', status: 429 } }), {
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
    const { outcome } = await run({ ...FAST, contentEncoding: 'gzip' })
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
    // Warm-up has not ended at 4.25 s: there is no window.
    expect(outcome()?.window).toBeNull()
    // The last bucket is the partial one, from 4.2 s to the stop.
    expect(outcome()?.buckets).toHaveLength(43)
    expect(transport.requested.download).toHaveLength(requested)
    expect(clock.pending).toBe(0)
  })
})

describe('a phase starting at a fractional instant', () => {
  it('closes each bucket on its tick and ends at the bucket end exactly', async () => {
    // performance.now() is fractional: 1901.2 + 200 − 1901.2 is 199.99999999999977, which must
    // neither hold the bucket open nor end the window early.
    const clock = new FakeClock()
    await clock.advance(1901.2)
    const { outcome } = await run(FAST, {}, clock)
    expect(outcome.status).toBe('measured')
    expect(outcome.endMs % BUCKET_MS).toBe(0)
    expect(outcome.buckets).toHaveLength(outcome.endMs / BUCKET_MS)
  })
})

describe('a window ended between two ticks', () => {
  it('holds the full buckets only, the partial last one left out', async () => {
    const { clock, phase, outcome } = start(FAST)
    await clock.advance(9050)
    phase.stop()
    await clock.advance(5000)
    // §19.3: warm-up ended at 5.3 s; the stop at 9.05 s leaves the window at 5.3 s to 9 s.
    expect(outcome()).toMatchObject({ status: 'partial', endMs: 9050, window: { fromMs: 5300, toMs: 9000 } })
    expect(outcome()?.buckets).toHaveLength(91)
    const window = outcome()?.window
    expect(window?.bytes).toBe(outcome()?.buckets.slice(53, 90).reduce((sum, bytes) => sum + bytes, 0))
  })
})
