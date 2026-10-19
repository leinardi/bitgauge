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

// The fake transport replays its scenario on the shared-link model the engine tests rely on.

import { describe, expect, it } from 'vitest'

import { FakeClock } from '@/engine/test/fakeClock'
import { FakeTransport, type Scenario } from '@/engine/test/fakeTransport'
import type { DownloadChunk, UploadResponse } from '@/engine/types'

/** 10 bytes per millisecond and 100 ms RTT. */
const LINK: Scenario = { rate: () => 10_000, rttMs: 100, protocol: 'h2' }

describe('download', () => {
  it('delivers the first chunk one RTT after the send, at the link rate, and its timing entry', async () => {
    const clock = new FakeClock()
    const transport = new FakeTransport(clock, LINK)
    const chunks: DownloadChunk[] = []
    let ended = false
    void transport.download(500, new AbortController().signal).then(async (response) => {
      for await (const chunk of response.chunks) {
        chunks.push(chunk)
      }
      ended = true
      expect(response.timing()).toEqual({ nextHopProtocol: 'h2', requestStart: 0, responseStart: 100, responseEnd: 150 })
    })
    await clock.advance(1000)
    expect(ended).toBe(true)
    expect(chunks).toHaveLength(50)
    expect(chunks[0]).toEqual({ bytes: 10, at: 100 })
    expect(chunks.at(-1)).toEqual({ bytes: 10, at: 149 })
  })

  it('shares the link equally among the transfers crossing it', async () => {
    const clock = new FakeClock()
    const transport = new FakeTransport(clock, LINK)
    const bytes = [0, 0]
    for (const index of [0, 1]) {
      void transport.download(1000, new AbortController().signal).then(async (response) => {
        for await (const chunk of response.chunks) {
          bytes[index] = (bytes[index] ?? 0) + chunk.bytes
        }
      })
    }
    // Milliseconds 100 to 149: 50 ms at 5 bytes each.
    await clock.advance(149)
    expect(bytes).toEqual([250, 250])
    expect(transport.peakInFlight.download).toBe(2)
  })

  it('holds each transfer to the per-request ceiling', async () => {
    const clock = new FakeClock()
    const transport = new FakeTransport(clock, { ...LINK, perRequest: 2000 })
    let bytes = 0
    void transport.download(1000, new AbortController().signal).then(async (response) => {
      for await (const chunk of response.chunks) {
        bytes += chunk.bytes
      }
    })
    // Milliseconds 100 to 149 at 2 bytes each, not the link's 10.
    await clock.advance(149)
    expect(bytes).toBe(100)
  })

  it('ends the body with an AbortError when the signal aborts', async () => {
    const clock = new FakeClock()
    const transport = new FakeTransport(clock, LINK)
    const controller = new AbortController()
    let error: unknown = null
    void transport.download(10_000, controller.signal).then(async (response) => {
      try {
        for await (const chunk of response.chunks) {
          void chunk
        }
      } catch (reason) {
        error = reason
      }
    })
    await clock.advance(200)
    controller.abort()
    await clock.advance(0)
    expect(error).toMatchObject({ name: 'AbortError' })
    // The link stops ticking at its next millisecond, with nothing left to move.
    await clock.advance(1)
    expect(clock.pending).toBe(0)
  })
})

describe('upload', () => {
  it('reports telemetry on the server grid, offset from the client clock, with the epoch', async () => {
    const clock = new FakeClock()
    const transport = new FakeTransport(clock, { ...LINK, gridOffsetMs: 1030, epoch: 'e-2' })
    const progress: number[] = []
    let response: UploadResponse | undefined
    void transport.upload(1000, (sent) => progress.push(sent), new AbortController().signal).then((value) => {
      response = value
    })
    await clock.advance(1000)
    // The first byte reaches the server at 50 ms, client time: 1080 ms on the grid, cell 10.
    expect(response?.telemetry).toEqual({
      epoch: 'e-2',
      bucketMs: 100,
      firstBucket: 10,
      buckets: [200, 800],
      bytes: 1000,
      startMs: 1080,
      durationMs: 100,
    })
    // The last byte crosses in millisecond 149; the response arrives half an RTT after its end.
    expect(response?.timing?.responseStart).toBe(200)
    expect(progress.at(-1)).toBe(1000)
  })

  it('answers a replayed status without telemetry, one RTT after the send', async () => {
    const clock = new FakeClock()
    const transport = new FakeTransport(clock, { ...LINK, failure: () => ({ kind: 'status', status: 429 }) })
    let response: UploadResponse | undefined
    void transport.upload(1000, () => {}, new AbortController().signal).then((value) => {
      response = value
    })
    await clock.advance(99)
    expect(response).toBeUndefined()
    await clock.advance(1)
    expect(response).toMatchObject({ status: 429, telemetry: null })
  })
})

describe('latency paths', () => {
  it('open the echo, answer pings, probes and GET /info one RTT later', async () => {
    const clock = new FakeClock()
    const transport = new FakeTransport(clock, LINK)
    const opening = transport.ws()
    await clock.advance(100)
    const echo = await opening
    const pongs: number[] = []
    echo.onPong((_seq, sentAt, receivedAt) => pongs.push(receivedAt - sentAt))
    echo.ping(0, clock.now())
    const probe = transport.probe('/api/v1/ping')
    const info = transport.info()
    await clock.advance(100)
    expect(pongs).toEqual([100])
    expect(await probe).toMatchObject({ status: 204, sentAt: 100, doneAt: 200 })
    expect(transport.server.probed).toEqual(['/api/v1/ping'])
    expect(await info).toMatchObject({ info: { server: { epoch: 'epoch-1' } }, browser: { name: 'Firefox' } })
  })

  it('close the echo, refuse a WebSocket or GET /info, and restart with a new epoch', async () => {
    const clock = new FakeClock()
    const { server } = new FakeTransport(clock, LINK)
    const opening = server.ws()
    await clock.advance(100)
    const echo = await opening
    const codes: number[] = []
    const pongs: number[] = []
    echo.onClose((code) => codes.push(code))
    echo.onPong((seq) => pongs.push(seq))
    server.restart('epoch-2')
    echo.ping(1, clock.now())
    server.wsAvailable = false
    server.infoAvailable = false
    const refused = server.ws().then(() => 'open', () => 'refused')
    const info = server.info().then(() => 'answered', () => 'failed')
    await clock.advance(100)
    expect(codes).toEqual([1012])
    expect(pongs).toEqual([])
    expect(await refused).toBe('refused')
    expect(await info).toBe('failed')
    expect(server.epoch).toBe('epoch-2')
    expect(server).toMatchObject({ opened: 1, infoCalls: 1 })
  })
})

describe('the load on the latency paths', () => {
  it('adds the scenario’s loaded delay to a pong and a probe, by direction, transfers and time under load', async () => {
    const clock = new FakeClock()
    const seen: [string, number, number][] = []
    const transport = new FakeTransport(clock, {
      ...LINK,
      loadedDelayMs: (direction, inFlight, sinceLoadMs) => {
        seen.push([direction, inFlight, sinceLoadMs])
        return 40
      },
    })
    const echo = await (async () => {
      const opening = transport.ws()
      await clock.advance(100)
      return opening
    })()
    const pongs: number[] = []
    echo.onPong((_seq, sentAt, receivedAt) => pongs.push(receivedAt - sentAt))
    echo.ping(0, clock.now())
    await clock.advance(200)
    // Two downloads on the link, their first bytes one RTT after the send.
    void transport.download(100_000, new AbortController().signal)
    void transport.download(100_000, new AbortController().signal)
    await clock.advance(150)
    echo.ping(1, clock.now())
    let probed = 0
    void transport.probe('/api/v1/ping').then((probe) => (probed = probe.doneAt - probe.sentAt))
    await clock.advance(200)
    expect(pongs).toEqual([100, 140])
    expect(probed).toBe(140)
    expect(seen).toEqual([
      ['download', 2, 50],
      ['download', 2, 50],
    ])
  })

  it('holds six connections on HTTP/1.1: a probe waits, first come first served, for a free one', async () => {
    const clock = new FakeClock()
    const transport = new FakeTransport(clock, { ...LINK, protocol: 'http/1.1' })
    const controllers = Array.from({ length: 6 }, () => new AbortController())
    controllers.forEach((controller) => void transport.download(1_000_000, controller.signal))
    const answered: string[] = []
    void transport.probe('/first').then(() => answered.push(`first ${clock.now()}`))
    void transport.probe('/second').then(() => answered.push(`second ${clock.now()}`))
    await clock.advance(500)
    expect(answered).toEqual([])
    controllers[0]?.abort()
    await clock.advance(150)
    // The first probe takes the freed connection at 500 and answers at 600; the second follows it.
    expect(answered).toEqual(['first 600'])
    await clock.advance(100)
    expect(answered).toEqual(['first 600', 'second 700'])
  })

  it('rejects a probe aborted while it waits, and frees its place in the queue', async () => {
    const clock = new FakeClock()
    const transport = new FakeTransport(clock, { ...LINK, protocol: 'http/1.1', h1Connections: 1 })
    const download = new AbortController()
    void transport.download(1_000_000, download.signal)
    const waiting = new AbortController()
    const outcomes: string[] = []
    transport.probe('/aborted', waiting.signal).then(
      () => outcomes.push('answered'),
      (error: unknown) => outcomes.push((error as DOMException).name),
    )
    void transport.probe('/next').then(() => outcomes.push(`next ${clock.now()}`))
    await clock.advance(50)
    waiting.abort()
    download.abort()
    await clock.advance(200)
    expect(outcomes).toEqual(['AbortError', 'next 150'])
  })

  it('does not queue probes on HTTP/2', async () => {
    const clock = new FakeClock()
    const transport = new FakeTransport(clock, LINK)
    Array.from({ length: 8 }, () => void transport.download(1_000_000, new AbortController().signal))
    let answeredAt = 0
    void transport.probe('/api/v1/ping').then(() => (answeredAt = clock.now()))
    await clock.advance(150)
    expect(answeredAt).toBe(100)
  })
})

describe('the probes path B reads', () => {
  it('answer /api/v1/small with 200 and the ping with 204, a reused connection by default', async () => {
    const clock = new FakeClock()
    const transport = new FakeTransport(clock, LINK)
    const small = transport.probe('/api/v1/small')
    const ping = transport.probe('/api/v1/ping')
    await clock.advance(100)
    expect(await small).toEqual({
      status: 200,
      sentAt: 0,
      doneAt: 100,
      timing: { nextHopProtocol: 'h2', requestStart: 0, responseStart: 100, responseEnd: 100, fetchStart: 0, connectStart: 0, connectEnd: 0 },
    })
    expect((await ping).status).toBe(204)
  })

  it('give each probe of a path the protocol and the connection the scenario names', async () => {
    const clock = new FakeClock()
    const transport = new FakeTransport(clock, {
      ...LINK,
      probeProtocol: (path, index) => (path === '/api/v1/small' && index === 1 ? 'http/1.1' : index === 2 ? null : 'h3'),
      newConnection: (_path, index) => (index === 0 ? true : index === 1 ? null : false),
    })
    const probes = [0, 1, 2].map(() => transport.probe('/api/v1/small'))
    const other = transport.probe('/api/v1/ping')
    await clock.advance(100)
    const [first, second, third] = await Promise.all(probes)
    expect(first?.timing).toMatchObject({ nextHopProtocol: 'h3', connectStart: 0, connectEnd: 100 })
    expect(second?.timing).toEqual({ nextHopProtocol: 'http/1.1', requestStart: 0, responseStart: 100, responseEnd: 100, fetchStart: 0 })
    expect(third?.timing).toBeNull()
    expect((await other).timing).toMatchObject({ nextHopProtocol: 'h3', connectStart: 0, connectEnd: 100 })
  })
})
