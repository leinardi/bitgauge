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

// The server-timed upload phase end to end: the worked timelines of measurement.md sections 19.1
// and 19.4, worked example B through the runner, the grace, protocol-dependent failures, epoch
// validation, the proxy-buffering notice and the preparation turn.

import { describe, expect, it } from 'vitest'

import { FIRST_SIZE } from '@/engine/phases/sizing'
import { FakeClock } from '@/engine/test/fakeClock'
import { type Failure, FakeTransport, type Scenario } from '@/engine/test/fakeTransport'
import { steadyTelemetry } from '@/engine/test/telemetry'
import type { Transport, UploadResponse, UploadTelemetry } from '@/engine/types'
import { type UploadOutcome, uploadOutcome } from '@/engine/upload/outcome'
import { DurationRule } from '@/engine/phases/window'
import { UploadLedger } from '@/engine/upload/watermark'
import { type UploadOptions, UploadPhase } from '@/engine/upload/phase'
import { UploadStreams } from '@/engine/upload/streams'

const MIB = 1024 * 1024
const EPOCH = 'epoch-1'
const LOW_SAMPLES = { level: 'low', reasons: ['insufficient-samples'] }

/** Section 19.1: 300 kbit/s of goodput and 300 ms RTT, on HTTP/2. */
const SLOW: Scenario = { rate: () => 37_500, rttMs: 300, protocol: 'h2' }
/** Section 19.4: 2.5 Gbit/s, at most 0.5 Gbit/s per request, 0.3 ms RTT. */
const LAN: Scenario = { rate: () => 312_500_000, perRequest: 62_500_000, rttMs: 0.3, protocol: 'h2' }
/** 1 MB/s and 50 ms RTT, for the failure rules. */
const LINK: Scenario = { rate: () => 1_000_000, rttMs: 50, protocol: 'h2' }
/** 1 Gbit/s on a phone whose browser prepares each body at 600 Mbit/s before sending it (section 8.2). */
const PHONE: Scenario = { rate: () => 125_000_000, prepareBytesPerSecond: 75_000_000, rttMs: 8, protocol: 'http/1.1' }
/**
 * 1.3 Gbit/s and 4 ms RTT, at most half of it per request, in a browser that takes 150 ms to start
 * each request (section 3): a stream's hole is not absorbed by the other.
 */
const GAPPED: Scenario = { rate: () => 162_500_000, perRequest: 81_250_000, rttMs: 4, protocol: 'http/1.1', requestGapMs: 150 }

type Upload = Transport['upload']

interface Harness {
  clock: FakeClock
  transport: FakeTransport
  phase: UploadPhase
  /** The client instant and size of every request sent, and the instant of every answer. */
  sends: { at: number; size: number }[]
  answers: number[]
  outcome: () => UploadOutcome | undefined
  endedAt: () => number | undefined
}

/**
 * Starts the phase on the fake transport; `wrap` may alter what it answers. Options default to
 * Standard upload in auto mode.
 */
function start(scenario: Scenario, options: Partial<UploadOptions> = {}, wrap?: (upload: Upload) => Upload, clock = new FakeClock()): Harness {
  const transport = new FakeTransport(clock, scenario)
  const sends: Harness['sends'] = []
  const answers: number[] = []
  const inner: Upload = (size, onProgress, signal) => transport.upload(size, onProgress, signal)
  const upload = wrap?.(inner) ?? inner
  const phase = new UploadPhase({
    clock,
    transport: {
      upload: (size, onProgress, signal) => {
        sends.push({ at: clock.now(), size })
        return upload(size, onProgress, signal).then((response) => {
          answers.push(clock.now())
          return response
        })
      },
    },
    preset: 'standard',
    streams: { mode: 'auto', fixed: 3, max: 6 },
    bounds: { minMs: 15_000, maxMs: 25_000 },
    warmup: 'auto',
    dataCapBytes: null,
    dataUsedBefore: 0,
    limits: { maxUploadBytes: 256 * MIB, maxStreamsPerClient: 6 },
    rttMs: scenario.rttMs,
    epoch: EPOCH,
    ...options,
  })
  let outcome: UploadOutcome | undefined
  let endedAt: number | undefined
  void phase.run().then((value) => {
    outcome = value
    endedAt = clock.now()
  })
  return { clock, transport, phase, sends, answers, outcome: () => outcome, endedAt: () => endedAt }
}

async function run(scenario: Scenario, options: Partial<UploadOptions> = {}, wrap?: (upload: Upload) => Upload) {
  const harness = start(scenario, options, wrap)
  await harness.clock.advance(60_000)
  const outcome = harness.outcome()
  const endedAt = harness.endedAt()
  if (outcome === undefined || endedAt === undefined) {
    throw new Error('the upload phase did not end')
  }
  return { ...harness, outcome, endedAt }
}

function failing(scenario: Scenario, failure: (index: number) => Failure | null): Scenario {
  return { ...scenario, failure: (direction, index) => (direction === 'upload' ? failure(index) : null) }
}

/** Rewrites the 200 answers whose index, in answer order, matches. */
function rewriting(match: (index: number) => boolean, rewrite: (response: UploadResponse) => UploadResponse): (upload: Upload) => Upload {
  let answered = 0
  return (upload) => (size, onProgress, signal) =>
    upload(size, onProgress, signal).then((response) => (match(answered++) && response.status === 200 ? rewrite(response) : response))
}

describe('section 19.1, 300 kbit/s and 300 ms RTT', () => {
  it('confirms the first request at ≈ 2.05 s and ramps as the confirmations allow', async () => {
    const { sends, answers, outcome } = await run(SLOW)
    expect(answers[0]).toBe(2048)
    // The baseline adds stream 2 at 4.65 s; its kept trial adds streams 3 and 4 at 8.2 s.
    expect(sends.filter((send) => send.size === FIRST_SIZE).map((send) => send.at)).toEqual([0, 4648, 8196, 8196])
    expect(outcome).toMatchObject({ streams: 4, plateau: 'no-gain', warmup: { bucket: 108, confidence: LOW_SAMPLES }, warmupEndMs: 10_800 })
  })

  it('meets the window condition at ≈ 17.6 s, issues nothing after it, and ends by 18.4 s', async () => {
    const { sends, phase, outcome, endedAt } = await run(SLOW)
    expect(phase.haltedAt).toBe(17_644)
    expect(Math.max(...sends.map((send) => send.at))).toBeLessThanOrEqual(17_644)
    expect(endedAt).toBeLessThanOrEqual(18_400)
    expect(outcome.status).toBe('measured')
    expect(outcome.window).toMatchObject({ sufficient: true })
    // The low-confidence notice comes from the direction's final confidence, not the outcome.
    expect(outcome.notices).toEqual([{ code: 'slow-link-extended', direction: 'upload' }])
    // Extended at the 15 s minimum, placed on the server timeline: 15 s less the 150 ms offset,
    // from P_start at 150 ms.
    expect(outcome.events).toEqual([{ code: 'extended', atMs: 14_700 }])
    expect(outcome).toMatchObject({ phaseStartMs: 150, displayOffsetMs: 150, protocol: 'h2' })
  })

  it('gives the requests in flight min(2 s, 2 × 1.75 s) = 2 s of grace', async () => {
    // The 16 KiB request sent at 16.63 s, still in flight at the 17.47 s decision, never answers;
    // its stream's rate makes it a 1.75 s request.
    const { endedAt, outcome, phase, sends } = await run(failing(SLOW, (index) => (index >= 21 ? { kind: 'stall' } : null)))
    expect(sends[21]).toEqual({ at: 16_630, size: 16_384 })
    expect(sends).toHaveLength(22)
    expect(phase.haltedAt).toBe(17_466)
    expect(endedAt).toBe(17_466 + 2000)
    expect(outcome.status).toBe('measured')
  })
})

describe('a phase that runs to its maximum', () => {
  it('stops issuing at max − 1 s, ends after the grace, and offers the next preset', async () => {
    // From the fourth request on, nothing is ever answered: the window cannot grow.
    const { sends, phase, outcome, endedAt } = await run(failing(LINK, (index) => (index >= 3 ? { kind: 'stall' } : null)), {
      streams: { mode: 'single', fixed: 1, max: 6 },
    })
    expect(Math.max(...sends.map((send) => send.at))).toBeLessThan(24_000)
    expect(phase.haltedAt).toBe(24_000)
    // The stalled request was sized for 1 s at its stream's rate: a 2 s grace.
    expect(endedAt).toBe(24_000 + 2000)
    expect(outcome.status).toBe('insufficient-data')
    expect(outcome.notices).toContainEqual({ code: 'insufficient-data', direction: 'upload', offer: 'extended' })
    expect(outcome.notices).toContainEqual({ code: 'slow-link-extended', direction: 'upload' })
    expect(outcome.events).toContainEqual(expect.objectContaining({ code: 'extended' }))
  })
})

describe('an unstable window', () => {
  it('keeps sending to max − 1 s and still reports the window', async () => {
    // The rate steps between 8 and 1.6 Mbit/s every second: the window condition holds from the
    // minimum, but its 500 ms sums never steady (measurement.md section 5).
    const stepping: Scenario = { ...LINK, rate: (_, atMs) => (Math.floor(atMs / 1000) % 2 === 0 ? 1_000_000 : 200_000) }
    const { phase, outcome } = await run(stepping)
    expect(phase.haltedAt).toBe(24_000)
    expect(outcome.status).toBe('measured')
    expect(outcome.notices).toContainEqual({ code: 'slow-link-extended', direction: 'upload' })
  })
})

describe('the data cap', () => {
  it('ends a direction it reached before a steady window as insufficient data, with no larger preset offered', async () => {
    const { outcome } = await run(LINK, { dataCapBytes: FIRST_SIZE, streams: { mode: 'single', fixed: 1, max: 6 } })
    expect(outcome).toMatchObject({ status: 'insufficient-data', dataCapReached: true })
    expect(outcome.notices).toContainEqual({ code: 'insufficient-data', direction: 'upload', offer: null })
  })
})

describe('a stop during the grace', () => {
  it('keeps the data cap that started the grace', async () => {
    const { clock, phase, outcome } = start(failing(SLOW, () => ({ kind: 'stall' })), {
      streams: { mode: 'fixed', fixed: 2, max: 6 },
      dataCapBytes: FIRST_SIZE + 10_000,
    })
    await clock.advance(1000)
    phase.stop()
    await clock.advance(0)
    expect(outcome()).toMatchObject({ status: 'partial', dataCapReached: true })
    expect(outcome()?.notices).toContainEqual({ code: 'data-cap-reached', direction: 'upload' })
    expect(outcome()?.events.map((event) => event.code)).toEqual(['data-cap', 'cancelled'])
  })

  it('ends the phase at once, as partial', async () => {
    const { clock, phase, outcome, endedAt } = start(failing(SLOW, (index) => (index >= 21 ? { kind: 'stall' } : null)))
    await clock.advance(18_000)
    expect(phase.haltedAt).toBe(17_466)
    expect(outcome()).toBeUndefined()
    phase.stop()
    await clock.advance(0)
    expect(endedAt()).toBe(18_000)
    expect(outcome()?.status).toBe('partial')
    expect(phase.haltedAt).toBe(17_466)
    expect(clock.pending).toBe(0)
  })
})

describe('section 19.4, 2.5 Gbit/s LAN', () => {
  it('ramps to 6 streams, ends warm-up at 8.1 s server time, stops at 15 s and ends at ≈ 15.8 s', async () => {
    const { phase, outcome, endedAt } = await run(LAN)
    expect(outcome).toMatchObject({ status: 'measured', streams: 6, plateau: 'cap', warmupEndMs: 8100, notices: [] })
    expect(phase.haltedAt).toBe(15_000)
    expect(endedAt).toBeCloseTo(15_760, -1)
    // The window ends where the first stream falls quiet, ≈ 15.4 s, before the others drain at
    // 0.5 Gbit/s each: the link's rate, not 97 % of it.
    expect(outcome.windowEndMs).toBeCloseTo(15_377, 0)
    expect((outcome.window?.bitsPerSecond ?? 0) / 1e9).toBeCloseTo(2.5, 2)
    expect(outcome.bytes / 1e9).toBeCloseTo(3.7, 1)
  })

  it('has its 3 s window confirmed at ≈ 11.8 s', async () => {
    // With a 5 s minimum the phase stops at the first instant the condition holds.
    const { phase, outcome } = await run(LAN, { bounds: { minMs: 5000, maxMs: 25_000 } })
    expect(phase.haltedAt).toBeCloseTo(11_831, 0)
    expect(outcome.window?.windowMs).toBeGreaterThanOrEqual(3000)
  })
})

describe('the floor rule\'s rate', () => {
  it('sums rate_s over the active streams that have confirmed (measurement.md section 8.2)', () => {
    const telemetry = (startMs: number, durationMs: number, bytes: number): UploadTelemetry => {
      const steady = steadyTelemetry(startMs, startMs + durationMs, bytes)
      return { epoch: EPOCH, bucketMs: 100, firstBucket: steady.firstBucket, buckets: [...steady.buckets], bytes, startMs, durationMs }
    }
    const streams = new UploadStreams(600)
    const first = streams.add()
    const second = streams.add()
    streams.add()
    expect(streams.summedRate(3)).toBeNull()
    // Two partly overlapping streams on the 600 ms floor profile, each read at about 29 kB/s.
    streams.confirm(streams.issue(1, first, 26_837, 0), telemetry(1000, 920, 26_837), 2200)
    streams.confirm(streams.issue(2, second, 28_667, 100), telemetry(1100, 975, 28_667), 2300)
    // The third stream has not confirmed, and the count leaves out a stream past it.
    expect(streams.summedRate(3)).toBeCloseTo(26_837 / 0.92 + 28_667 / 0.975, 3)
    expect(streams.summedRate(1)).toBeCloseTo(26_837 / 0.92, 3)
  })
})

describe('a browser that prepares each body', () => {
  it('reads an idle share from a confirmed request of at least one bucket, beyond the round trip', () => {
    const telemetry = (startMs: number, durationMs: number, bytes: number): UploadTelemetry => {
      const steady = steadyTelemetry(startMs, startMs + durationMs, bytes)
      return { epoch: EPOCH, bucketMs: 100, firstBucket: steady.firstBucket, buckets: [...steady.buckets], bytes, startMs, durationMs }
    }
    const streams = new UploadStreams(8)
    const stream = streams.add()
    const request = streams.issue(1, stream, 125_000_000, 1000)
    // 1 s of sending inside 2.667 s on the client: idle (2667 − 1000 − 8) / 2667.
    streams.confirm(request, telemetry(2667, 1000, 125_000_000), 3667)
    expect(streams.idleShare).toBeCloseTo(0.622, 3)
    // A shorter server duration reads nothing; a smaller idle than the share does not lower it.
    streams.confirm(streams.issue(2, stream, 4_000_000, 4000), telemetry(5000, 50, 4_000_000), 4200)
    streams.confirm(streams.issue(3, stream, 125_000_000, 5000), telemetry(6000, 1000, 125_000_000), 6100)
    expect(streams.idleShare).toBeCloseTo(0.622, 3)
  })

  it('forgets the shares read before the turn to early issue, and reads the early requests from their predecessor\'s end', () => {
    const telemetry = (startMs: number, durationMs: number, bytes: number): UploadTelemetry => {
      const steady = steadyTelemetry(startMs, startMs + durationMs, bytes)
      return { epoch: EPOCH, bucketMs: 100, firstBucket: steady.firstBucket, buckets: [...steady.buckets], bytes, startMs, durationMs }
    }
    const streams = new UploadStreams(8)
    const stream = streams.add()
    streams.settled = true
    streams.confirm(streams.issue(1, stream, 125_000_000, 1000), telemetry(2667, 1000, 125_000_000), 3667)
    // The gap of 1.659 s turned the phase to early issue: that share is forgotten.
    expect(streams.leadMs).toBeCloseTo(1659, 0)
    expect(streams.idleShare).toBeNull()
    // Issued at 2000 while the previous one ran to 3667, sent for 1 s from 4000: idle 0.325 s of 1.333 s.
    streams.confirm(streams.issue(2, stream, 125_000_000, 2000, true), telemetry(4000, 1000, 125_000_000), 5000)
    expect(streams.idleShare).toBeCloseTo(0.244, 3)
  })

  it('ramps past the gaps of a single stream, which read as no gain over the shorter intervals', async () => {
    const { outcome } = await run(PHONE)
    // The single stream sends for 1 s and prepares for 1.67 s; with 6 streams the preparation
    // rate, 600 Mbit/s, is the ceiling, reached in bursts the warm-up bound leaves unsettled.
    expect(outcome).toMatchObject({ status: 'measured', streams: 6, plateau: 'cap' })
    expect(outcome.warmup?.confidence.reasons).toContain('ramp-unsettled')
    expect((outcome.window?.bitsPerSecond ?? 0) / 1e6).toBeGreaterThan(500)
  })
})

describe('a browser with an issue gap', () => {
  const fixed = (streams: number, maxStreamsPerClient = 8): Partial<UploadOptions> => ({
    streams: { mode: 'fixed', fixed: streams, max: 6 },
    limits: { maxUploadBytes: 256 * MIB, maxStreamsPerClient },
  })

  it('sends each stream\'s next request early once the gap has shown, closing the holes on the server grid', async () => {
    const { transport, outcome } = await run(GAPPED, fixed(2))
    expect((outcome.window?.bitsPerSecond ?? 0) / 1e9).toBeCloseTo(1.3, 1)
    expect(outcome.series?.coefficientOfVariation(Math.ceil((outcome.warmupEndMs ?? 0) / 100), Math.floor((outcome.windowEndMs ?? 0) / 100))).toBeLessThan(0.1)
    expect(transport.peakInFlight.upload).toBeGreaterThan(2)
    expect(transport.peakInFlight.upload).toBeLessThanOrEqual(8)
  })

  it('keeps six requests in flight on HTTP/1.1, the browsers\' connection limit', async () => {
    // Two more would wait in the browser for a connection while their client time runs (section 3).
    const h1 = await run(GAPPED, fixed(6))
    expect(h1.transport.peakInFlight.upload).toBe(6)
    const h2 = await run({ ...GAPPED, protocol: 'h2' }, fixed(6))
    expect(h2.transport.peakInFlight.upload).toBeGreaterThan(6)
  })

  it('leaves the holes when the in-flight bound allows no early request', async () => {
    const { transport, outcome } = await run(GAPPED, fixed(2, 2))
    expect(transport.peakInFlight.upload).toBe(2)
    expect(outcome.series?.coefficientOfVariation(Math.ceil((outcome.warmupEndMs ?? 0) / 100), Math.floor((outcome.windowEndMs ?? 0) / 100))).toBeGreaterThan(0.2)
  })
})

describe('the preparation turn', () => {
  /** 100 MB/s and 100 ms RTT on two fixed streams: a first byte reaches the server 50 ms after its send. */
  const TWO: Partial<UploadOptions> = { streams: { mode: 'fixed', fixed: 2, max: 6 }, bounds: { minMs: 4000, maxMs: 6000 } }
  const FAST: Scenario = { rate: () => 100_000_000, rttMs: 100, protocol: 'h2' }
  const sizes = (sends: Harness['sends']): string[] => sends.slice(0, 8).map((send) => `${send.at} ${(send.size / MIB).toFixed(2)}`)

  it('sends a request of 1 MiB or more only once the previous one reported its first byte', async () => {
    const { sends } = await run(FAST, TWO)
    // The 64 KiB and 512 KiB requests go together; each 4 and 32 MiB pair 50 ms apart.
    expect(sizes(sends)).toEqual(['0 0.06', '0 0.06', '102 0.50', '102 0.50', '213 4.00', '263 4.00', '355 32.00', '405 32.00'])
  })

  it('stops waiting once a confirmed request reported no progress', async () => {
    const quiet = (upload: Upload): Upload => (size, _onProgress, signal) => upload(size, () => undefined, signal)
    const { sends } = await run(FAST, TWO, quiet)
    // The second 4 MiB request waits for the first one's answer at 355 ms; from then on none waits.
    expect(sizes(sends)).toEqual(['0 0.06', '0 0.06', '102 0.50', '102 0.50', '213 4.00', '355 32.00', '355 4.00', '539 32.00'])
  })
})

describe('the grace', () => {
  it('is 2 × d when the requests in flight are expected to take under 1 s', async () => {
    const clock = new FakeClock()
    // 2 MB requests at 10 MB/s: d = 0.2 s. The request in flight at the 5 s stop never answers.
    const scenario: Scenario = { rate: () => 10_000_000, rttMs: 10, protocol: 'h2', failure: () => (clock.now() >= 4800 ? { kind: 'stall' } : null) }
    const harness = start(
      scenario,
      { streams: { mode: 'single', fixed: 1, max: 6 }, bounds: { minMs: 5000, maxMs: 25_000 }, limits: { maxUploadBytes: 2_000_000, maxStreamsPerClient: 6 } },
      undefined,
      clock,
    )
    await clock.advance(10_000)
    expect(harness.sends.at(-1)?.size).toBe(2_000_000)
    expect(harness.endedAt()).toBe(5000 + 400)
  })

  it('is the full 2 s for a stream with no confirmed request yet', async () => {
    // Two streams: the second finds the data cap spent by the first one's request, which stalls.
    const { endedAt, outcome } = await run(failing(SLOW, () => ({ kind: 'stall' })), {
      streams: { mode: 'fixed', fixed: 2, max: 6 },
      dataCapBytes: FIRST_SIZE + 10_000,
    })
    expect(endedAt).toBe(2000)
    expect(outcome).toMatchObject({ status: 'insufficient-data', dataCapReached: true, bytes: 0 })
    expect(outcome.notices).toContainEqual({ code: 'data-cap-reached', direction: 'upload' })
    expect(outcome.events).toEqual([{ code: 'data-cap', atMs: 0 }])
  })
})

describe('worked example B through the phase runner', () => {
  /**
   * Two lanes of scripted requests: each request's first byte reaches the server 150 ms after it
   * is sent and its answer arrives 150 ms after its last byte. Lane 1's first request takes 350 ms
   * and lane 2's 750 ms, every later one 1 s, so r7 runs 6000–7000 and r8 6400–7400.
   */
  function scripted(clock: FakeClock): Pick<Transport, 'upload'> {
    const lanes = [
      { durations: [350], free: true },
      { durations: [750], free: true },
    ]
    return {
      upload(size, _onProgress, signal) {
        const lane = lanes.find((candidate) => candidate.free) ?? lanes[0]
        if (lane === undefined) {
          throw new Error('no lane')
        }
        lane.free = false
        const startMs = clock.now() + 150
        const endMs = startMs + (lane.durations.shift() ?? 1000)
        return new Promise((resolve, reject) => {
          const timer = clock.setTimer(endMs + 150 - clock.now(), () => {
            lane.free = true
            const telemetry = steadyTelemetry(startMs, endMs, size)
            resolve({
              status: 200,
              telemetry: { ...telemetry, buckets: [...telemetry.buckets], epoch: EPOCH, bucketMs: 100, bytes: size },
              timing: { nextHopProtocol: 'h2', requestStart: 0, responseStart: 0, responseEnd: 0 },
            })
          })
          signal.addEventListener('abort', () => {
            clock.clearTimer(timer)
            reject(new DOMException('aborted', 'AbortError'))
          })
        })
      },
    }
  }

  it('stops at 7.8 s with a partial result whose window ends at 7000', async () => {
    const clock = new FakeClock()
    const { phase, outcome } = start(SLOW, { transport: scripted(clock), streams: { mode: 'fixed', fixed: 2, max: 6 }, warmup: 1000 }, undefined, clock)
    await clock.advance(7800)
    phase.stop()
    await clock.advance(0)
    expect(outcome()).toMatchObject({ status: 'partial', windowEndMs: 7000, phaseStartMs: 150, warmupEndMs: 1100 })
    expect(phase.ledger.measurementEnd()).toBe(7400)
    expect(outcome()?.window?.cells.at(-1)).toBe(69)
    expect(outcome()?.events).toEqual([{ code: 'cancelled', atMs: 7800 - 150 - 150 }])
    expect(clock.pending).toBe(0)
  })
})

describe('a failed request', () => {
  it('retains a prior extension notice when interrupted, suppressing only the preset offer', () => {
    const rule = new DurationRule('upload', { minMs: 15_000, maxMs: 25_000 }, 'standard')
    rule.evaluate(15_000, false)
    const outcome = uploadOutcome({
      rule, halts: new Set(['interrupted']), ledger: new UploadLedger(), warmup: null,
      streams: 1, plateau: undefined, bytes: 0, protocol: 'http/1.1', streamLimit: null,
      rateLimited: null, bufferingSuspected: false, idleShare: null, displayOffsetMs: null,
      startAt: 0, continuous: null,
      events: [{ code: 'extended', at: 15_000 }, { code: 'error', at: 18_000, notice: 'upload-interrupted' }],
    })
    expect(outcome.notices).toContainEqual({ code: 'slow-link-extended', direction: 'upload' })
    expect(outcome.notices).toContainEqual({ code: 'insufficient-data', direction: 'upload', offer: null })
    expect(outcome.events).toContainEqual({ code: 'extended', atMs: 15_000 })
  })
  it('does not offer a larger preset after an early HTTP/1.1 failure (QA-122)', async () => {
    const { outcome } = await run(failing({ ...LINK, protocol: 'http/1.1' }, (index) => index === 1 ? { kind: 'status', status: 429 } : null))
    expect(outcome.status).toBe('insufficient-data')
    expect(outcome.notices).toContainEqual({ code: 'insufficient-data', direction: 'upload', offer: null })
    expect(outcome.notices).toContainEqual({ code: 'upload-interrupted' })
  })
  it('on HTTP/1.1 ends the phase with the window up to the failure, upload-interrupted and its error event', async () => {
    const { phase, sends, answers, outcome } = await run(failing({ ...LINK, protocol: 'http/1.1' }, (index) => (index === 6 ? { kind: 'status', status: 429 } : null)))
    const failedAt = answers[6] ?? 0
    expect(sends.filter((send) => send.at > failedAt)).toEqual([])
    expect(outcome.windowEndMs).toBe(phase.ledger.lowerBound(6))
    expect(outcome.notices).toContainEqual({ code: 'upload-interrupted' })
    expect(outcome.events).toContainEqual(expect.objectContaining({ code: 'error', notice: 'upload-interrupted' }))
    expect(outcome.notices).not.toContainEqual(expect.objectContaining({ code: 'stream-limit' }))
  })

  it('on HTTP/2 leaves a failure gap, lowers the cap after a 429, and the phase continues', async () => {
    const { outcome, endedAt } = await run(failing(LINK, (index) => (index === 6 ? { kind: 'status', status: 429 } : null)))
    expect(outcome.status).toBe('measured')
    expect(endedAt).toBeGreaterThan(15_000)
    expect(outcome.events).toContainEqual(expect.objectContaining({ code: 'failure-gap' }))
    expect(outcome.notices).toContainEqual({ code: 'stream-limit', direction: 'upload', streams: 5 })
  })

  it('on HTTP/2 three times in a row ends the phase with an error at once', async () => {
    const { outcome, endedAt, answers } = await run(
      failing(LINK, (index) => (index >= 3 && index <= 5 ? { kind: 'error' } : null)),
      { streams: { mode: 'single', fixed: 1, max: 6 } },
    )
    expect(outcome.status).toBe('error')
    expect(endedAt).toBeLessThan(5000)
    expect(answers).toHaveLength(3)
    expect(outcome.events).toContainEqual(expect.objectContaining({ code: 'error', notice: 'requests-failed' }))
  })

  it('is one whose telemetry does not match the bytes sent', async () => {
    const short = rewriting(
      (index) => index === 2,
      (response) => ({ ...response, telemetry: response.telemetry && { ...response.telemetry, bytes: response.telemetry.bytes - 1 } }),
    )
    const { outcome } = await run(LINK, { streams: { mode: 'single', fixed: 1, max: 6 } }, short)
    expect(outcome.confirmedRequests).toBeGreaterThan(5)
    expect(outcome.events).toContainEqual(expect.objectContaining({ code: 'failure-gap' }))
  })

  it('is one that times out after 30 s, after which the stream issues its next request', async () => {
    const { sends } = await run(failing(LINK, (index) => (index === 2 ? { kind: 'stall' } : null)), {
      streams: { mode: 'single', fixed: 1, max: 6 },
      bounds: { minMs: 40_000, maxMs: 50_000 },
    })
    const stalled = sends[2]?.at ?? 0
    expect(sends[3]?.at).toBe(stalled + 30_000)
  })
})

describe('a rate-limit 429', () => {
  const SINGLE: Partial<UploadOptions> = { streams: { mode: 'single', fixed: 1, max: 6 } }

  it('on HTTP/2 makes the stream wait the Retry-After, with the cap unchanged, and carries rate-limited', async () => {
    const { outcome, sends, answers } = await run(failing(LINK, (index) => (index === 3 ? { kind: 'status', status: 429, code: 'rate_limited', retryAfter: 2 } : null)), SINGLE)
    // The 429 answers request 3; request 4 goes 2 s after that answer.
    expect(sends[4]?.at).toBe((answers[3] ?? 0) + 2000)
    expect(outcome.status).toBe('measured')
    expect(outcome.streams).toBe(1)
    expect(outcome.notices).toContainEqual({ code: 'rate-limited', direction: 'upload', reason: 'rate', retried: true })
    expect(outcome.notices).not.toContainEqual(expect.objectContaining({ code: 'stream-limit' }))
  })

  it('on HTTP/2 waits 1 s without a readable Retry-After', async () => {
    const { outcome, sends, answers } = await run(failing(LINK, (index) => (index === 3 ? { kind: 'status', status: 429, code: 'table_full' } : null)), SINGLE)
    expect(sends[4]?.at).toBe((answers[3] ?? 0) + 1000)
    expect(outcome.notices).toContainEqual({ code: 'rate-limited', direction: 'upload', reason: 'table-full', retried: true })
  })

  it('on HTTP/2 still counts toward three in a row, classified by the last', async () => {
    const { outcome } = await run(
      failing(LINK, (index) => (index === 3 ? { kind: 'status', status: 500 } : index === 4 ? { kind: 'error' } : index === 5 ? { kind: 'status', status: 429, code: 'table_full', retryAfter: 1 } : null)),
      SINGLE,
    )
    expect(outcome.status).toBe('error')
    expect(outcome.events).toContainEqual(expect.objectContaining({ code: 'error', notice: 'server-busy' }))
    expect(outcome.notices).toContainEqual({ code: 'rate-limited', direction: 'upload', reason: 'table-full', retried: false })
  })

  it('on HTTP/2 leaves a stream idle whose wait ends past max − 1 s, while the other measures', async () => {
    // Request 0 is stream 0's first; its wait would end at ≈ 60 s.
    const inFlight: number[] = []
    let live = 0
    const counted = (upload: Upload): Upload => (size, onProgress, signal) => {
      inFlight.push(++live)
      return upload(size, onProgress, signal).finally(() => live--)
    }
    const { outcome, sends } = await run(
      failing(LINK, (index) => (index === 0 ? { kind: 'status', status: 429, code: 'rate_limited', retryAfter: 60 } : null)),
      { streams: { mode: 'fixed', fixed: 2, max: 6 } },
      counted,
    )
    // Both streams' first requests went at once; after the refusal only stream 1 sent, one
    // request at a time, so each later request was alone in flight.
    expect(sends.length).toBeGreaterThan(4)
    expect(inFlight.slice(2).every((count) => count === 1)).toBe(true)
    expect(outcome.status).toBe('measured')
    expect(outcome.window).not.toBeNull()
    expect(outcome.events.filter((event) => event.code === 'error')).toEqual([])
    expect(outcome.notices).toContainEqual({ code: 'rate-limited', direction: 'upload', reason: 'rate', retried: false })
  })

  it('on HTTP/2 keeps the stream-limit path for too_many_streams', async () => {
    const { outcome } = await run(failing(LINK, (index) => (index === 6 ? { kind: 'status', status: 429, code: 'too_many_streams', retryAfter: 1 } : null)))
    expect(outcome.notices).toContainEqual({ code: 'stream-limit', direction: 'upload', streams: 5 })
    expect(outcome.notices).not.toContainEqual(expect.objectContaining({ code: 'rate-limited' }))
  })

  it('on HTTP/1.1 ends the phase as any failure does, with rate-limited not retried', async () => {
    const { outcome, sends, answers } = await run(failing({ ...LINK, protocol: 'http/1.1' }, (index) => (index === 6 ? { kind: 'status', status: 429, code: 'rate_limited', retryAfter: 1 } : null)))
    const failedAt = answers[6] ?? 0
    expect(sends.filter((send) => send.at > failedAt)).toEqual([])
    expect(outcome.notices).toContainEqual({ code: 'upload-interrupted' })
    expect(outcome.notices).toContainEqual({ code: 'rate-limited', direction: 'upload', reason: 'rate', retried: false })
    expect(outcome.notices).not.toContainEqual(expect.objectContaining({ code: 'stream-limit' }))
  })
})

describe('the epoch', () => {
  it('aborts the phase with server-restarted when an answer carries another one', async () => {
    const restarted = rewriting((index) => index >= 5, (response) => ({ ...response, telemetry: response.telemetry && { ...response.telemetry, epoch: 'epoch-2' } }))
    const { outcome, endedAt, answers } = await run(LINK, {}, restarted)
    expect(endedAt).toBe(answers[5])
    expect(outcome.status).toBe('error')
    // The grid before the restart cannot be combined with the one after: nothing is reported.
    expect(outcome).toMatchObject({ window: null, series: null, warmupEndMs: null, windowEndMs: null })
    expect(outcome.notices).toContainEqual({ code: 'server-restarted' })
    expect(outcome.events).toContainEqual(expect.objectContaining({ code: 'error', notice: 'server-restarted' }))
  })
})

describe('proxy buffering', () => {
  it('is suspected when a request of at least 1 s was read in under 10 % of it', async () => {
    const buffered = rewriting(() => true, (response) => {
      const telemetry = response.telemetry
      if (telemetry === null) {
        return response
      }
      const endMs = telemetry.startMs + telemetry.durationMs
      const burst = steadyTelemetry(endMs - 20, endMs, telemetry.bytes)
      return { ...response, telemetry: { ...telemetry, ...burst, buckets: [...burst.buckets] } }
    })
    const { outcome } = await run(SLOW, {}, buffered)
    expect(outcome.notices).toContainEqual({ code: 'proxy-buffering-suspected' })
  })

  it('is not suspected on a link that reads as it sends', async () => {
    const { outcome } = await run(LINK)
    expect(outcome.notices).not.toContainEqual({ code: 'proxy-buffering-suspected' })
  })
})

describe('the timelines', () => {
  it('keep the server grid apart from the client clock: the offset is display-only', async () => {
    const { outcome } = await run({ ...SLOW, gridOffsetMs: 5000 })
    expect(outcome.phaseStartMs).toBe(5150)
    expect(outcome.displayOffsetMs).toBe(150 - 5000)
    expect(outcome.warmupEndMs).toBe(15_800)
    expect(outcome.events).toEqual([{ code: 'extended', atMs: 14_700 }])
  })
})
