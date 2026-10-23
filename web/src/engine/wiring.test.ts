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

// The pure parts of the browser wiring, on the values a browser hands them: the upload body's
// sizing, the timing-entry lookup, pong frames, the timer resolution, the user-agent table, the
// GET /info check and the URLs under the base path.

import { describe, expect, it } from 'vitest'

import {
  apiUrl,
  browserIdentity,
  checkedInfo,
  pong,
  RANDOM_CALL_BYTES,
  refusalOf,
  resolutionOf,
  SEED_BYTES,
  type TimingEntry,
  TIMING_PROBE_WAIT_MS,
  TIMING_WAIT_MS,
  timingFor,
  TimingWaiter,
  UploadBody,
  webSocketUrl,
} from '@/engine/wiring'

const MIB = 1024 * 1024

describe('the upload body', () => {
  it('fills the 1 MiB seed once, in 64 KiB calls, and sends a slice of the master', () => {
    const calls: number[] = []
    const body = new UploadBody((chunk) => {
      calls.push(chunk.byteLength)
      chunk.fill(7)
    })
    expect(body.slice(1000).size).toBe(1000)
    expect(calls).toEqual(Array.from({ length: SEED_BYTES / RANDOM_CALL_BYTES }, () => RANDOM_CALL_BYTES))
    expect(body.slice(3 * MIB).size).toBe(3 * MIB)
    expect(body.size).toBe(4 * MIB)
    // A smaller request after a larger one reuses the master as it is.
    expect(body.slice(MIB).size).toBe(MIB)
    expect(body.size).toBe(4 * MIB)
    expect(calls).toHaveLength(16)
  })

  it('carries the seed bytes', async () => {
    const body = new UploadBody((chunk) => chunk.fill(42))
    const bytes = new Uint8Array(await body.slice(2 * MIB + 5).arrayBuffer())
    expect(bytes.every((byte) => byte === 42)).toBe(true)
  })
})

describe('the timing entry of a request', () => {
  const entry = (name: string, startTime: number, nextHopProtocol = 'h2'): TimingEntry => ({
    name,
    startTime,
    nextHopProtocol,
    requestStart: startTime + 1,
    responseStart: startTime + 2,
    responseEnd: startTime + 3,
  })
  const url = 'https://speed.example/api/v1/download?bytes=1000'

  it('is the earliest one with the URL that started at or after the send', () => {
    const entries = [entry(url, 10), entry(url, 120, 'http/1.1'), entry(url, 105), entry('https://speed.example/api/v1/ping', 101)]
    expect(timingFor(entries, url, 100)).toEqual({ nextHopProtocol: 'h2', requestStart: 106, responseStart: 107, responseEnd: 108 })
  })

  it('is null without one', () => {
    expect(timingFor([entry(url, 10)], url, 100)).toBeNull()
    expect(timingFor([], url, 0)).toBeNull()
  })

  it('carries the fetch and connect fields the browser exposes, and leaves out the others', () => {
    const exposed = { ...entry(url, 100), fetchStart: 100, connectStart: 100, connectEnd: 100.5 }
    expect(timingFor([exposed], url, 100)).toEqual({ nextHopProtocol: 'h2', requestStart: 101, responseStart: 102, responseEnd: 103, fetchStart: 100, connectStart: 100, connectEnd: 100.5 })
    const partial = { ...entry(url, 100), fetchStart: 100, connectStart: undefined } as unknown as TimingEntry
    expect(Object.keys(timingFor([partial], url, 100) ?? {})).toEqual(['nextHopProtocol', 'requestStart', 'responseStart', 'responseEnd', 'fetchStart'])
  })

  it('reads a protocol the browser does not report as empty', () => {
    const missing = { ...entry(url, 100), nextHopProtocol: undefined } as unknown as TimingEntry
    expect(timingFor([missing], url, 100)?.nextHopProtocol).toBe('')
    expect(timingFor([entry(url, 100, '')], url, 100)?.nextHopProtocol).toBe('')
  })
})

describe('waiting for a timing entry', () => {
  const TIMING = { nextHopProtocol: 'h2', requestStart: 1, responseStart: 2, responseEnd: 3 }

  /** A browser that adds the entry `afterMs` after the request ended, or never (null). */
  function browser(afterMs: number | null) {
    let time = 0
    const waits: number[] = []
    return {
      waits,
      now: () => time,
      lookup: () => (afterMs !== null && time >= afterMs ? TIMING : null),
      added: (ms: number) => {
        waits.push(ms)
        const arrives = afterMs !== null && afterMs > time && afterMs - time <= ms
        time = arrives ? afterMs : time + ms
        return Promise.resolve(arrives)
      },
    }
  }

  it('takes an entry already there without waiting', async () => {
    const page = browser(0)
    expect(await new TimingWaiter(TIMING_WAIT_MS, 'once').find(page.lookup, page.added, page.now)).toEqual(TIMING)
    expect(page.waits).toEqual([])
  })

  it('waits for an entry added after the response, as long as the bound allows', async () => {
    const page = browser(12)
    expect(await new TimingWaiter(TIMING_WAIT_MS, 'once').find(page.lookup, page.added, page.now)).toEqual(TIMING)
    expect(page.waits).toEqual([TIMING_WAIT_MS])
    expect(page.now()).toBe(12)
  })

  it('gives up at the bound, and waits no more once the browser missed it', async () => {
    const waiter = new TimingWaiter(TIMING_WAIT_MS, 'once')
    const never = browser(null)
    expect(await waiter.find(never.lookup, never.added, never.now)).toBeNull()
    expect(never.now()).toBe(TIMING_WAIT_MS)
    const late = browser(5)
    expect(await waiter.find(late.lookup, late.added, late.now)).toBeNull()
    expect(late.waits).toEqual([])
    // An entry found at once makes it patient again.
    const ready = browser(0)
    expect(await waiter.find(ready.lookup, ready.added, ready.now)).toEqual(TIMING)
    const again = browser(5)
    expect(await waiter.find(again.lookup, again.added, again.now)).toEqual(TIMING)
  })
})

describe('waiting for probe timing entries under load', () => {
  const TIMING = { nextHopProtocol: 'h2', requestStart: 1, responseStart: 2, responseEnd: 3 }

  /** One request whose entry the browser adds `afterMs` after it ended, or never (null). */
  async function request(waiter: TimingWaiter, afterMs: number | null): Promise<{ found: boolean; waits: number[] }> {
    let time = 0
    const waits: number[] = []
    const entry = await waiter.find(
      () => (afterMs !== null && time >= afterMs ? TIMING : null),
      (ms) => {
        waits.push(ms)
        const arrives = afterMs !== null && afterMs > time && afterMs - time <= ms
        time = arrives ? afterMs : time + ms
        return Promise.resolve(arrives)
      },
      () => time,
    )
    return { found: entry !== null, waits }
  }

  const LATE_PROBES = [20, 35, 40, 25, 30]

  it('loses every later probe entry on one shared waiter after a late upload entry', async () => {
    const shared = new TimingWaiter(TIMING_WAIT_MS, 'once')
    expect((await request(shared, 60)).found).toBe(false)
    for (const after of LATE_PROBES) {
      expect(await request(shared, after)).toEqual({ found: false, waits: [] })
    }
  })

  it('keeps them with a waiter of their own', async () => {
    const streams = new TimingWaiter(TIMING_WAIT_MS, 'once')
    const probes = new TimingWaiter(TIMING_PROBE_WAIT_MS, 'sticky')
    expect((await request(streams, 60)).found).toBe(false)
    for (const after of LATE_PROBES) {
      expect(await request(probes, after)).toEqual({ found: true, waits: [TIMING_PROBE_WAIT_MS] })
    }
  })

  it('keeps waiting for every probe once one entry was found, however many miss', async () => {
    const probes = new TimingWaiter(TIMING_PROBE_WAIT_MS, 'sticky')
    expect((await request(probes, 30)).found).toBe(true)
    expect(await request(probes, null)).toEqual({ found: false, waits: [TIMING_PROBE_WAIT_MS] })
    expect(await request(probes, null)).toEqual({ found: false, waits: [TIMING_PROBE_WAIT_MS] })
    expect(await request(probes, 40)).toEqual({ found: true, waits: [TIMING_PROBE_WAIT_MS] })
  })

  it('costs a missed upload entry exactly one wait, and the next upload none', async () => {
    const streams = new TimingWaiter(TIMING_WAIT_MS, 'once')
    expect(await request(streams, 60)).toEqual({ found: false, waits: [TIMING_WAIT_MS] })
    expect(await request(streams, 30)).toEqual({ found: false, waits: [] })
  })

  it('costs a browser that never reports one probe wait', async () => {
    const probes = new TimingWaiter(TIMING_PROBE_WAIT_MS, 'sticky')
    expect(await request(probes, null)).toEqual({ found: false, waits: [TIMING_PROBE_WAIT_MS] })
    for (let i = 0; i < 5; i++) {
      expect(await request(probes, null)).toEqual({ found: false, waits: [] })
    }
  })

  it('misses an entry that arrives after the probe bound', async () => {
    const probes = new TimingWaiter(TIMING_PROBE_WAIT_MS, 'sticky')
    expect((await request(probes, 0)).found).toBe(true)
    expect(await request(probes, TIMING_PROBE_WAIT_MS + 10)).toEqual({ found: false, waits: [TIMING_PROBE_WAIT_MS] })
  })
})

describe('a 429 refusal', () => {
  it('reads the envelope code and whole seconds of Retry-After', () => {
    expect(refusalOf('{"error":{"code":"table_full","message":"busy"}}', '3')).toEqual({ code: 'table_full', retryAfterMs: 3000 })
    expect(refusalOf('{"error":{"code":"too_many_streams"}}', ' 1 ')).toEqual({ code: 'too_many_streams', retryAfterMs: 1000 })
  })

  it('gives null for what cannot be read: no envelope, a hidden header, or anything but whole seconds', () => {
    expect(refusalOf('Too Many Requests', null)).toEqual({ code: null, retryAfterMs: null })
    expect(refusalOf('{"error":{"code":7}}', '1.5')).toEqual({ code: null, retryAfterMs: null })
    expect(refusalOf('null', '-1')).toEqual({ code: null, retryAfterMs: null })
    expect(refusalOf('{}', 'Wed, 21 Oct 2026 07:28:00 GMT')).toEqual({ code: null, retryAfterMs: null })
  })
})

describe('a pong frame', () => {
  it('carries the sequence number and the send instant', () => {
    expect(pong('{"type":"pong","seq":17,"t":48213.512}')).toEqual({ seq: 17, t: 48_213.512 })
  })

  it.each([
    ['a ping', '{"type":"ping","seq":1,"t":1}'],
    ['malformed JSON', '{"type":'],
    ['a fractional sequence', '{"type":"pong","seq":1.5,"t":1}'],
    ['a missing instant', '{"type":"pong","seq":1}'],
    ['a binary frame', new ArrayBuffer(4)],
    ['null', 'null'],
  ])('is null for %s', (_, data) => {
    expect(pong(data)).toBeNull()
  })
})

describe('the timer resolution', () => {
  it('is the median step between distinct readings, without float noise', () => {
    expect(resolutionOf([0.1, 0.10000000000582077, 0.09999999999854481, 0.1])).toBe(0.1)
    expect(resolutionOf([1, 1, 1.2, 0.9, 1])).toBe(1)
    expect(resolutionOf([0.005, 0.005, 0.01])).toBe(0.005)
    expect(resolutionOf([])).toBe(0)
  })
})

describe('the browser identity', () => {
  it.each([
    ['Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0', 'Firefox', 131, 'Linux'],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36', 'Chrome', 130, 'Windows'],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.2849.68', 'Edge', 130, 'Windows'],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15', 'Safari', 18, 'macOS'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1', 'Safari', 18, 'iOS'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.6723.90 Mobile/15E148 Safari/604.1', 'Chrome', 130, 'iOS'],
    ['Mozilla/5.0 (iPad; CPU OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/132.0 Mobile/15E148 Safari/605.1.15', 'Firefox', 132, 'iOS'],
    ['Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36', 'Samsung Internet', 26, 'Android'],
    ['Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36', 'Chrome', 130, 'Android'],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 OPR/114.0.0.0', 'Opera', 114, 'Windows'],
    ['Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36', 'Chrome', 130, 'ChromeOS'],
    ['curl/8.10.1', 'unknown', 0, 'unknown'],
  ])('%s', (userAgent, name, major, os) => {
    expect(browserIdentity(userAgent)).toEqual({ name, major, os })
  })

  it('keeps nothing of the user agent but those three', () => {
    expect(Object.keys(browserIdentity('Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0'))).toEqual(['name', 'major', 'os'])
  })
})

describe('the GET /info answer', () => {
  const info = {
    server: { name: 'home', version: '0.1.0', commit: 'a', buildDate: 'b', epoch: 'e', basePath: '/' },
    client: { ip: '10.0.0.2', ipVersion: 4, addressClass: 'private', suggestedLabel: 'LAN' },
    limits: { maxDownloadBytes: 1, maxUploadBytes: 1, maxStreamsPerClient: 6, uploadLifetimeMs: 120_000, bucketMs: 100 },
  }

  it('passes with the epoch, the client and the limits', () => {
    expect(checkedInfo(info)).toBe(info)
  })

  it('throws without them', () => {
    expect(() => checkedInfo({ ...info, server: { ...info.server, epoch: 1 } })).toThrow(TypeError)
    expect(() => checkedInfo({ ...info, limits: { ...info.limits, bucketMs: '100' } })).toThrow(TypeError)
    expect(() => checkedInfo({ server: info.server })).toThrow(TypeError)
    expect(() => checkedInfo('<html>')).toThrow(TypeError)
  })
})

describe('the URLs', () => {
  it('sit under the base path, however it is written', () => {
    expect(apiUrl('https://speed.example', '/', 'api/v1/info')).toBe('https://speed.example/api/v1/info')
    expect(apiUrl('https://speed.example', '/speed', 'api/v1/info')).toBe('https://speed.example/speed/api/v1/info')
    expect(apiUrl('https://speed.example', '/speed/', 'api/v1/download?bytes=5')).toBe('https://speed.example/speed/api/v1/download?bytes=5')
    expect(apiUrl('http://192.168.1.10:8080', '', 'api/v1/ws')).toBe('http://192.168.1.10:8080/api/v1/ws')
  })

  it('give the WebSocket the matching scheme', () => {
    expect(webSocketUrl('https://speed.example/api/v1/ws')).toBe('wss://speed.example/api/v1/ws')
    expect(webSocketUrl('http://192.168.1.10:8080/api/v1/ws')).toBe('ws://192.168.1.10:8080/api/v1/ws')
  })
})
