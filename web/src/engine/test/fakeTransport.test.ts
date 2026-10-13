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
  it('echo pings and answer probes one RTT later', async () => {
    const clock = new FakeClock()
    const transport = new FakeTransport(clock, LINK)
    const echo = await transport.ws()
    const pongs: number[] = []
    echo.onPong((_seq, sentAt, receivedAt) => pongs.push(receivedAt - sentAt))
    echo.ping(0, clock.now())
    const probe = transport.probe('/api/v1/ping')
    await clock.advance(100)
    expect(pongs).toEqual([100])
    expect(await probe).toMatchObject({ status: 204, sentAt: 0, doneAt: 100 })
    expect(transport.probed).toEqual(['/api/v1/ping'])
    expect((await transport.info()).server.epoch).toBe('epoch-1')
  })
})
