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

// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { BrowserClock } from '@/engine/clock'
import { BrowserTransport } from '@/engine/transport'
import { TIMING_PROBE_WAIT_MS, TIMING_WAIT_MS, type TimingEntry } from '@/engine/wiring'

// Which waiter each request uses (measurement.md section 11.6): a probe waits up to 250 ms for its
// Resource Timing entry on a patience of its own, a download up to 50 ms on the streams' one.

/** The browser's resource entries, and the observer the transport registers to hear of new ones. */
const entries: TimingEntry[] = []
let observed: (() => void) | null = null

class FakeObserver {
  constructor(callback: () => void) {
    observed = callback
  }

  observe(): void {}
}

/** The browser adds the entry of the request to `url` sent at `at`. */
function addEntry(url: string, at: number): void {
  entries.push({ name: url, startTime: at, nextHopProtocol: 'h2', requestStart: at + 1, responseStart: at + 2, responseEnd: at + 3 })
  observed?.()
}

const ORIGIN = 'http://bitgauge.test'
const SMALL = `${ORIGIN}/api/v1/small`

const clock = { now: () => Date.now(), task: <T>(fn: () => T): T => fn(), count: () => {} } as unknown as BrowserClock
const urls: string[] = []

/** Settles the promise's pending callbacks after `ms` of fake time; true once it has resolved. */
async function after<T>(promise: Promise<T>, ms: number): Promise<boolean> {
  let done = false
  void promise.then(() => (done = true))
  await vi.advanceTimersByTimeAsync(ms)
  return done
}

beforeEach(() => {
  vi.useFakeTimers({ now: 10_000 })
  entries.length = 0
  urls.length = 0
  vi.stubGlobal('PerformanceObserver', FakeObserver)
  vi.stubGlobal('location', { origin: ORIGIN })
  vi.stubGlobal('performance', {
    now: () => Date.now(),
    getEntriesByType: () => [...entries],
    setResourceTimingBufferSize: () => {},
    clearResourceTimings: () => {},
    addEventListener: () => {},
  })
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      urls.push(url)
      return Promise.resolve(new Response(new Uint8Array(1), { status: 200 }))
    }),
  )
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

async function readAll(transport: BrowserTransport): Promise<void> {
  const response = await transport.download(1, new AbortController().signal)
  for await (const chunk of response.chunks) {
    void chunk
  }
}

describe('the production transport waits for timing entries', () => {
  it('gives a probe up to 250 ms, and a download up to 50 ms', async () => {
    const probe = new BrowserTransport(clock, '/').probe('/api/v1/small')
    expect(await after(probe, TIMING_PROBE_WAIT_MS - 1)).toBe(false)
    expect(await after(probe, 1)).toBe(true)
    expect((await probe).timing).toBeNull()

    const download = readAll(new BrowserTransport(clock, '/'))
    expect(await after(download, TIMING_WAIT_MS - 1)).toBe(false)
    expect(await after(download, 1)).toBe(true)
  })

  it('keeps waiting for probes after a download missed its entry', async () => {
    const transport = new BrowserTransport(clock, '/')
    // A first probe whose entry is there at once: the browser reports probe timing.
    addEntry(SMALL, Date.now())
    expect((await transport.probe('/api/v1/small')).timing).not.toBeNull()
    entries.length = 0
    // A download whose entry never comes: the streams' waiter gives up after its one wait.
    const download = readAll(transport)
    expect(await after(download, TIMING_WAIT_MS)).toBe(true)
    // A probe whose entry the browser adds 200 ms after its answer is still found.
    await vi.advanceTimersByTimeAsync(1)
    const probe = transport.probe('/api/v1/small')
    await vi.advanceTimersByTimeAsync(0)
    const sentAt = Date.now()
    expect(await after(probe, 200)).toBe(false)
    expect(urls.at(-1)).toBe(SMALL)
    addEntry(SMALL, sentAt)
    expect(await after(probe, 0)).toBe(true)
    expect((await probe).timing).not.toBeNull()
  })
})

describe('a 429 on download', () => {
  it('reads the envelope code and the Retry-After instead of cancelling the body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('{"error":{"code":"rate_limited","message":"slow down"}}', { status: 429, headers: { 'Retry-After': '2' } }))),
    )
    const response = await new BrowserTransport(clock, '/').download(1, new AbortController().signal)
    expect(response.status).toBe(429)
    expect(response.refusal).toEqual({ code: 'rate_limited', retryAfterMs: 2000 })
  })

  it('carries no refusal on any other failed status', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('oops', { status: 500 }))))
    const response = await new BrowserTransport(clock, '/').download(1, new AbortController().signal)
    expect(response).not.toHaveProperty('refusal')
  })
})

describe('a 429 on upload', () => {
  it('reads the envelope code from the response text and the Retry-After header', async () => {
    class RefusingRequest {
      status = 0
      responseText = ''
      responseType = ''
      upload: { onprogress: (() => void) | null } = { onprogress: null }
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      onabort: (() => void) | null = null
      open(): void {}
      setRequestHeader(): void {}
      abort(): void {}
      getResponseHeader(name: string): string | null {
        return name === 'Retry-After' ? '4' : null
      }
      send(): void {
        this.status = 429
        this.responseText = '{"error":{"code":"rate_limited","message":"slow down"}}'
        this.onload?.()
      }
    }
    vi.stubGlobal('XMLHttpRequest', RefusingRequest)
    const answer = new BrowserTransport(clock, '/').upload(16, () => {}, new AbortController().signal)
    await vi.advanceTimersByTimeAsync(TIMING_WAIT_MS)
    const response = await answer
    expect(response).toMatchObject({ status: 429, telemetry: null, refusal: { code: 'rate_limited', retryAfterMs: 4000 } })
  })
})
