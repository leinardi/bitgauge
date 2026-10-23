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

// Path B's probers (measurement.md section 12.3): the capability, one prober per direction from
// its warm-up end to its end instant, single-outstanding, the probe outstanding at the end aborted
// and not counted, and the capped-warm-up rule.

import { describe, expect, it } from 'vitest'

import type { DirectionResult } from '@/engine/messages'
import type { WarmupEnd } from '@/engine/phases/warmup'
import { capabilityOf, ResponsivenessProbes } from '@/engine/run/responsiveness'
import { FakeClock } from '@/engine/test/fakeClock'
import { FakeTransport, type Scenario } from '@/engine/test/fakeTransport'

const SMALL = '/api/v1/small'
/** 40 ms RTT on HTTP/2: each probe is answered 40 ms after it is sent. */
const H2: Scenario = { rate: () => 1_000_000, rttMs: 40, protocol: 'h2' }
const UNCAPPED: WarmupEnd = { bucket: 20, confidence: { level: 'normal', reasons: [] } }
const CAPPED: WarmupEnd = { bucket: 80, confidence: { level: 'low', reasons: ['ramp-unsettled'] } }
const MEASURED: DirectionResult = { status: 'measured', bitsPerSecond: 8e6, windowMs: 5000, streams: 3, bytes: 5_000_000, events: [] }

/** The probers on a fake transport, 1 s into the run: a timing entry's instants are never 0. */
async function probes(scenario: Scenario = H2) {
  const clock = new FakeClock()
  const transport = new FakeTransport(clock, scenario)
  await clock.advance(1000)
  return { clock, transport, probes: new ResponsivenessProbes(clock, transport) }
}

describe('the capability', () => {
  it('is the idle probe’s protocol, empty when it failed, answered other than 200 or had no entry', () => {
    const timing = { nextHopProtocol: 'h2', requestStart: 1, responseStart: 2, responseEnd: 2 }
    expect(capabilityOf({ status: 200, sentAt: 0, doneAt: 2, timing })).toBe('h2')
    expect(capabilityOf({ status: 200, sentAt: 0, doneAt: 2, timing: { ...timing, nextHopProtocol: 'http/1.1' } })).toBe('http/1.1')
    expect(capabilityOf({ status: 200, sentAt: 0, doneAt: 2, timing: { ...timing, nextHopProtocol: '' } })).toBe('')
    expect(capabilityOf({ status: 200, sentAt: 0, doneAt: 2, timing: null })).toBe('')
    expect(capabilityOf({ status: 503, sentAt: 0, doneAt: 2, timing })).toBe('')
    expect(capabilityOf(null)).toBe('')
  })
})

describe('a direction’s prober', () => {
  it('probes every 300 ms from the warm-up end to the end instant, and gives a measured block on h2', async () => {
    const { clock, transport, probes: paths } = await probes()
    paths.protocol = 'h2'
    await clock.advance(1000)
    expect(transport.server.probed).toEqual([])
    paths.warmedUp('download', UNCAPPED)
    // Ticks at 0, 300, ..., 4800 ms after the warm-up end; the end comes 20 ms after the last one.
    await clock.advance(4820)
    paths.end('download')
    await clock.advance(1000)
    expect(transport.server.probed).toEqual(Array.from({ length: 17 }, () => SMALL))
    // The probe outstanding at the end instant is aborted and not counted.
    expect(paths.settle('download', MEASURED, 0.1)).toEqual({ state: 'measured', protocol: 'h2', samples: 16, rpm: 1500, tm95Ms: 40, trimmed: 0, totalMedianMs: 40 })
    expect(paths.results()).toMatchObject({ download: { state: 'measured' }, upload: null })
  })

  it('keeps a ring of the last 64 probes in Continuous, counting every one, with TM95 over the last 4 s', async () => {
    // The first minute answered in 40 ms, the rest in 90 ms: by the end the ring holds only the slow ones.
    const scenario = { ...H2 }
    const { clock, probes: delayed } = await probes(scenario)
    delayed.protocol = 'h2'
    delayed.warmedUp('download', UNCAPPED, true)
    await clock.advance(60_000)
    scenario.rttMs = 90
    await clock.advance(60_020)
    expect(delayed.footprint()).toBe(64)
    delayed.end('download')
    const block = delayed.settle('download', MEASURED, 0.1)
    expect(block).toMatchObject({ state: 'measured', protocol: 'h2', tm95Ms: 90, totalMedianMs: 90, trimmed: 0 })
    expect(block.samples).toBeGreaterThan(300)
  })

  it('keeps one probe outstanding: a tick while one is pending is skipped', async () => {
    // 500 ms per probe: the 300 ms tick finds it pending, the 600 ms one sends the next. The tenth,
    // sent at 5400 ms, is still outstanding at the end: fewer than 10 samples.
    const { clock, transport, probes: paths } = await probes({ ...H2, rttMs: 500 })
    paths.protocol = 'h2'
    paths.warmedUp('upload', UNCAPPED)
    await clock.advance(5800)
    paths.end('upload')
    expect(transport.server.probed).toHaveLength(10)
    expect(paths.settle('upload', MEASURED, 0.1)).toMatchObject({ state: 'uncertain', samples: 9, tm95Ms: 500, rpm: 120 })
  })

  it('does not probe when the capability rules path B out', async () => {
    for (const protocol of ['http/1.1', '', null]) {
      const { clock, transport, probes: paths } = await probes()
      paths.protocol = protocol
      paths.warmedUp('download', UNCAPPED)
      await clock.advance(5000)
      expect(transport.server.probed).toEqual([])
      expect(paths.settle('download', MEASURED, 0.1)).toEqual({ state: 'unavailable_h1', protocol: protocol ?? '', samples: 0 })
    }
  })

  it('is uncertain after a capped warm-up', async () => {
    const { clock, probes: paths } = await probes()
    paths.protocol = 'h2'
    paths.warmedUp('download', CAPPED)
    await clock.advance(5000)
    expect(paths.settle('download', MEASURED, 0.1)).toMatchObject({ state: 'uncertain', samples: 17 })
  })

  it('is uncertain when a probe opened a new connection, or its entry does not say', async () => {
    for (const opened of [true, null]) {
      const { clock, probes: paths } = await probes({ ...H2, newConnection: (_path, index) => (index === 4 ? opened : false) })
      paths.protocol = 'h2'
      paths.warmedUp('download', UNCAPPED)
      await clock.advance(5000)
      expect(paths.settle('download', MEASURED, 0.1)).toMatchObject({ state: 'uncertain', samples: 17 })
    }
  })

  it('does not count a probe without an entry', async () => {
    const { clock, probes: paths } = await probes({ ...H2, probeProtocol: (_path, index) => (index % 2 === 0 ? null : 'h2') })
    paths.protocol = 'h2'
    paths.warmedUp('download', UNCAPPED)
    await clock.advance(5000)
    expect(paths.settle('download', MEASURED, 0.1)).toMatchObject({ state: 'uncertain', samples: 8 })
  })

  it('is unavailable_insufficient for a direction without a steady window, or that never warmed up', async () => {
    const { clock, transport, probes: paths } = await probes()
    paths.protocol = 'h2'
    paths.warmedUp('download', UNCAPPED)
    await clock.advance(2000)
    const insufficient: DirectionResult = { status: 'insufficient-data', streams: 1, bytes: 1000, events: [] }
    expect(paths.settle('download', insufficient, 0.1)).toEqual({ state: 'unavailable_insufficient', protocol: 'h2', samples: 7 })
    // A direction stopped before a long enough window is insufficient data too (section 7.6).
    const stopped: DirectionResult = { status: 'insufficient-data', streams: 1, bytes: 1000, windowMs: 1200, events: [{ code: 'cancelled', atMs: 3100 }] }
    expect(paths.settle('upload', stopped, 0.1)).toEqual({ state: 'unavailable_insufficient', protocol: 'h2', samples: 0 })
    expect(transport.server.probed).toHaveLength(7)
  })

  it('stops every prober when the run drains', async () => {
    const { clock, transport, probes: paths } = await probes()
    paths.protocol = 'h2'
    paths.warmedUp('download', UNCAPPED)
    await clock.advance(1000)
    paths.drain()
    const sent = transport.server.probed.length
    await clock.advance(3000)
    expect(transport.server.probed).toHaveLength(sent)
  })
})
