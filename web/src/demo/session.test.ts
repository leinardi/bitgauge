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

// The demo against the engine's own expectations: the real Run, on the demo clock over a fake base
// clock, meets each scenario's simulated link and reports what the engine would report for a real
// link like it.

import { describe, expect, it } from 'vitest'

import { DEMO_LINKS } from '@/demo/fixtures'
import type { LinkProfile } from '@/demo/link'
import type { DemoCommand, DemoScenario, DemoScenarioName } from '@/demo/scenarios'
import { demoSession, ended, type Played, start } from '@/demo/test/play'
import type { EngineEvent, Result } from '@/engine/messages'

/** The longest a Standard run can take, with room for the info phase and idle latency. */
const RUN_LIMIT_MS = 90_000
const STEP_MS = 250

/** Starts a run and advances until it ends, or until RUN_LIMIT_MS has passed. */
async function play(name: DemoScenarioName, command: Partial<DemoCommand> = {}, scenario?: DemoScenario, profile?: LinkProfile): Promise<Played> {
  const played = demoSession(name, command, scenario, profile)
  start(played)
  for (let elapsed = 0; elapsed < RUN_LIMIT_MS && !ended(played.events); elapsed += STEP_MS) {
    await played.base.advance(STEP_MS)
  }
  return played
}

function resultOf(events: readonly EngineEvent[]): Result {
  const event = events.find((candidate) => candidate.type === 'result')
  if (event?.type !== 'result') {
    throw new Error('the run ended without a result')
  }
  return event.result
}

function errorOf(events: readonly EngineEvent[]): string | undefined {
  const event = events.find((candidate) => candidate.type === 'error')
  return event?.type === 'error' ? event.code : undefined
}

function noticesOf(result: Result): string[] {
  return [...result.notices, ...(result.download?.events ?? []), ...(result.upload?.events ?? [])].map((notice) => notice.code)
}

describe('the demo session', () => {
  it('measures the LAN within 5 % of the link rate, over HTTP/2 on six streams', async () => {
    const { events, failures } = await play('complete')
    const result = resultOf(events)
    expect(failures).toEqual([])
    expect(result.status).toBe('complete')
    expect(result.download?.bitsPerSecond).toBeGreaterThan(DEMO_LINKS.lan.downloadBitsPerSecond * 0.95)
    expect(result.download?.bitsPerSecond).toBeLessThan(DEMO_LINKS.lan.downloadBitsPerSecond * 1.05)
    expect(result.upload?.bitsPerSecond).toBeGreaterThan(DEMO_LINKS.lan.uploadBitsPerSecond * 0.95)
    expect(result.upload?.bitsPerSecond).toBeLessThan(DEMO_LINKS.lan.uploadBitsPerSecond * 1.05)
    expect(result.idle?.path).toBe('websocket')
    expect(result.idle?.medianMs).toBeGreaterThan(2)
    expect(result.idle?.medianMs).toBeLessThan(4.5)
    expect(result.client).toMatchObject({ ip: '192.168.1.42', protocol: 'h2' })
    expect(result.server.name).toBe('Basement NAS')
    expect(result.download?.streams).toBe(6)
  })

  it('measures the VPN at its minimum, as the kit does, and extends a slower link', async () => {
    // The kit's VPN finds its steady window before the 10 s minimum and is not extended; its
    // insufficient-data link, 20 kbit/s over the same path, is.
    const vpn = resultOf((await play('slowdone')).events)
    expect(vpn.status).toBe('complete')
    expect(vpn.download?.bitsPerSecond).toBeGreaterThan(DEMO_LINKS.vpn.downloadBitsPerSecond * 0.95)
    expect(vpn.download?.bitsPerSecond).toBeLessThan(DEMO_LINKS.vpn.downloadBitsPerSecond * 1.05)
    expect(vpn.upload?.bitsPerSecond).toBeGreaterThan(DEMO_LINKS.vpn.uploadBitsPerSecond * 0.95)
    expect(vpn.upload?.bitsPerSecond).toBeLessThan(DEMO_LINKS.vpn.uploadBitsPerSecond * 1.05)
    expect(vpn.idle?.medianMs).toBeGreaterThan(40)
    expect(vpn.idle?.medianMs).toBeLessThan(56)
    expect(vpn.client.ip).toBe('10.8.0.6')

    const slower = resultOf((await play('insufficient', {}, { link: 'insufficient', start: true })).events)
    expect(slower.notices.map((notice) => notice.code)).toContain('slow-link-extended')
    expect(noticesOf(slower)).toContain('extended')
  })

  it('ends with server-restarted when the server restarts mid-run', async () => {
    const { events } = await play('error', { errorKind: 'restarted' })
    expect(errorOf(events)).toBe('server-restarted')
  })

  it('ends with server-unreachable when the server never answers', async () => {
    const { events } = await play('offline')
    expect(errorOf(events)).toBe('server-unreachable')
    expect(events.some((event) => event.type === 'phase' && event.state === 'started' && event.phase !== 'info')).toBe(false)
  })

  it('ends with requests-failed when the link loses every request', async () => {
    const { events } = await play('error', { errorKind: 'requests' })
    expect(errorOf(events)).toBe('requests-failed')
  })

  it('completes a lossy link with the failures it met', async () => {
    const lossy = { ...DEMO_LINKS.lan, lossProbability: 0.05 }
    const { events, failures } = await play('complete', {}, undefined, lossy)
    const result = resultOf(events)
    expect(failures).toEqual([])
    expect(result.status).toBe('complete')
    expect(noticesOf(result)).toContain('failure-gap')
  })

  it('ends with requests-failed when the server stops answering mid-download', async () => {
    // Every request in flight fails at once, three in a row before the WebSocket's close sequence
    // decides (ui/flows.md section 5).
    const { events } = await play('error', { errorKind: 'unreachable' })
    expect(errorOf(events)).toBe('requests-failed')
  })

  it('fails idle latency when the server goes away early, whatever the panel selects', async () => {
    // A server that stops answering mid-run closes the WebSocket: network changed (ui/flows.md
    // section 5), during idle latency, with nothing measured after it.
    const { events } = await play('error-early', { errorKind: 'requests' })
    expect(errorOf(events)).toBe('network-changed')
    expect(events).toContainEqual(expect.objectContaining({ type: 'phase', phase: 'idle', state: 'failed' }))
    const started = events.flatMap((event) => (event.type === 'phase' && event.state === 'started' ? [event.phase] : []))
    expect(started).toEqual(['info', 'idle'])
  })

  it('stops where the script stops, through the page, with what was measured by then', async () => {
    const { events, stopsPressed } = await play('cancelled-late')
    // The session asks the page to press Stop once; the page's stop ends the run.
    expect(stopsPressed).toHaveLength(1)
    const result = resultOf(events)
    expect(result.status).toBe('partial')
    expect(result.download?.status).toBe('measured')
    expect(result.upload?.status).toBe('partial')
    expect(noticesOf(result)).toContain('cancelled')
  })

  it('holds a run in its state: the clock stops and nothing more is reported', async () => {
    const played = demoSession('download')
    const { events, session: held, base } = played
    start(played)
    await base.advance(30_000)
    const heldAt = held.clock.now()
    const count = events.length
    await base.advance(30_000)
    expect(held.clock.now()).toBe(heldAt)
    expect(events.length).toBe(count)
    expect(ended(events)).toBe(false)
  })

  it('plays on past its state when the panel follows the run instead of forcing it', async () => {
    const { events } = await play('download', { hold: false })
    expect(resultOf(events).status).toBe('complete')
  })

  it('goes quiet once ended, as when the panel picks another scenario', async () => {
    const played = demoSession('complete')
    const { events, session, base } = played
    start(played)
    await base.advance(3000)
    session.end()
    const count = events.length
    await base.advance(60_000)
    expect(events.length).toBe(count)
  })

  it('runs at the panel speed: a twice-as-fast demo takes half the real time', async () => {
    const normal = await play('complete')
    const fast = await play('complete', { speed: 2 })
    expect(resultOf(fast.events).durationMs).toBeCloseTo(resultOf(normal.events).durationMs, -3)
    expect(fast.base.now()).toBeLessThan(normal.base.now() * 0.6)
  })
})
