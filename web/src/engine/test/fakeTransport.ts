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

import type { Direction } from '@/engine/messages'
import { BUCKET_MS } from '@/engine/stats/units'
import { abortError, Body } from '@/engine/test/body'
import type { FakeClock } from '@/engine/test/fakeClock'
import { FakeServer } from '@/engine/test/fakeServer'
import { Link, type LinkModel, wholeBytes } from '@/engine/test/link'
import type { BrowserIdentity, DownloadResponse, Info, InfoResult, ProbeTiming, ResourceTiming, Transport, UploadResponse, WsEcho } from '@/engine/types'

// A Transport for the engine tests that replays a scenario on the FakeClock, on the shared-link
// model of measurement.md section 19.1 (test/link.ts). A download's first byte
// reaches the client one RTT after the request is sent; an upload's first byte reaches the server
// half an RTT after it is sent and its response the client half an RTT after the last byte. The
// server's grid runs `gridOffsetMs` ahead of the client clock.

/** What one request replays instead of a normal transfer. */
export type Failure =
  /** Answered one RTT after it is sent with this status and no body. */
  | { kind: 'status'; status: number }
  /** Rejected one RTT after it is sent, like a network error. */
  | { kind: 'error' }
  /** Nothing arrives until the request is aborted. */
  | { kind: 'stall' }
  /** The body ends cleanly after `bytes` bytes. */
  | { kind: 'short'; bytes: number }

export interface Scenario extends LinkModel {
  rttMs: number
  /** Every entry's nextHopProtocol; null for requests without a Resource Timing entry. */
  protocol: string | null
  /** The failure the `index`-th request of `direction` (from 0) replays, or null. */
  failure?: (direction: Direction, index: number) => Failure | null
  /** The Content-Encoding of every download response. */
  contentEncoding?: string | null
  /** The server epoch at the start; FakeServer.restart changes it. */
  epoch?: string
  limits?: Partial<Info['limits']>
  /** The browser identity the fake wiring reports; Firefox 131 on Linux by default. */
  browser?: BrowserIdentity
  /**
   * A browser that prepares each upload body before its first byte leaves, at this many bytes per
   * second, one body at a time in send order (measurement.md section 7.2); absent, no preparation.
   */
  prepareBytesPerSecond?: number
  /**
   * A browser that takes this long to start each request beyond the RTT (measurement.md section
   * 3): a download's first byte, and an upload's first byte at the server, come this much later.
   */
  requestGapMs?: number
  /**
   * The delay the link's load adds to a pong or a probe sent while `inFlight` transfers of
   * `direction` are on the link, `sinceLoadMs` after its first one was; summed over both
   * directions. Absent, the load adds nothing.
   */
  loadedDelayMs?: (direction: Direction, inFlight: number, sinceLoadMs: number) => number
  /** The connections the browser holds per server on HTTP/1.1; 6 when absent. */
  h1Connections?: number
  /**
   * The nextHopProtocol of the `index`-th probe of `path` (from 0), null for one without a
   * Resource Timing entry; absent, every probe reports `protocol`.
   */
  probeProtocol?: (path: string, index: number) => string | null
  /**
   * Whether the `index`-th probe of `path` (from 0) opened a new connection: true gives its entry
   * a connectEnd after its connectStart, null leaves both out (the browser did not expose them);
   * absent or false, it reused one, connectStart equal to connectEnd.
   */
  newConnection?: (path: string, index: number) => boolean | null
}

export class FakeTransport implements Transport {
  /** The sizes requested, per direction, in issue order. */
  readonly requested: Record<Direction, number[]> = { download: [], upload: [] }
  private readonly clock: FakeClock
  private readonly scenario: Scenario
  private readonly link: Link
  /** The server's latency endpoints and GET /info. */
  readonly server: FakeServer
  /** When the browser's body preparation is free again, on the client clock. */
  private prepareFreeAt = 0

  constructor(clock: FakeClock, scenario: Scenario) {
    this.clock = clock
    this.scenario = scenario
    this.server = new FakeServer(clock, scenario, () => this.loadedDelay())
    this.link = new Link(clock, scenario)
  }

  /** What the scenario's load adds to a pong or a probe sent now. */
  private loadedDelay(): number {
    const delay = this.scenario.loadedDelayMs
    let total = 0
    for (const direction of ['download', 'upload'] as const) {
      const since = this.link.loadedSince[direction]
      const inFlight = this.link.inFlight(direction)
      if (delay !== undefined && since !== null && inFlight > 0) {
        total += delay(direction, inFlight, this.clock.now() - since)
      }
    }
    return total
  }

  /** The whole bytes the bottleneck carried per 100 ms cell of the client clock, per direction. */
  get carried(): Record<Direction, number[]> {
    return this.link.carried
  }

  /** The largest number of transfers that were in flight together, per direction. */
  get peakInFlight(): Record<Direction, number> {
    return this.link.peakInFlight
  }

  download(size: number, signal: AbortSignal): Promise<DownloadResponse> {
    const failure = this.next('download', size)
    const sentAt = this.clock.now()
    const { rttMs } = this.scenario
    const firstByteAt = sentAt + rttMs + (this.scenario.requestGapMs ?? 0)
    const release = this.server.hold()
    signal.addEventListener('abort', release)
    const answered = this.respond(rttMs, signal, failure, (status) => {
      const body = new Body()
      let endAt = firstByteAt
      const timing = (): ResourceTiming | null =>
        this.entry({ requestStart: sentAt, responseStart: firstByteAt, responseEnd: endAt })
      if (status !== 200) {
        release()
        body.end()
        return { status, contentEncoding: null, chunks: body, timing }
      }
      const transfer = this.link.start('download', failure?.kind === 'short' ? failure.bytes : size, firstByteAt, {
        moved: (bytes, _total, at) => {
          if (bytes > 0) {
            body.push({ bytes, at })
          }
        },
        done: (at) => {
          endAt = at
          release()
          body.end()
        },
      })
      signal.addEventListener('abort', () => {
        this.link.drop(transfer)
        body.fail(abortError())
      })
      return { status, contentEncoding: this.scenario.contentEncoding ?? null, chunks: body, timing }
    })
    answered.catch(release)
    return answered
  }

  upload(size: number, onProgress: (sentBytes: number, at: number) => void, signal: AbortSignal): Promise<UploadResponse> {
    const failure = this.next('upload', size)
    const sentAt = this.clock.now()
    const half = this.scenario.rttMs / 2
    const offset = this.scenario.gridOffsetMs ?? 0
    const release = this.server.hold()
    signal.addEventListener('abort', release)
    if (failure !== null && failure.kind !== 'short') {
      const answered = this.respond(this.scenario.rttMs, signal, failure, (status) => ({
        status,
        telemetry: null,
        timing: this.entry({ requestStart: sentAt, responseStart: sentAt + this.scenario.rttMs, responseEnd: sentAt }),
      }))
      void answered.then(release, release)
      return answered
    }
    const prepare = this.scenario.prepareBytesPerSecond
    const gap = this.scenario.requestGapMs ?? 0
    let firstByteAt = sentAt + half + gap
    if (prepare !== undefined) {
      this.prepareFreeAt = Math.max(sentAt, this.prepareFreeAt) + (size / prepare) * 1000
      firstByteAt = this.prepareFreeAt + half + gap
    }
    return new Promise((resolve, reject) => {
      const transfer = this.link.start('upload', failure?.bytes ?? size, firstByteAt, {
        moved: (_bytes, total, at) => onProgress(Math.round(total), at),
        done: (at) => {
          const startMs = (transfer.startMs ?? at) + offset
          // `at` is the end of the last byte's millisecond, one after the tick that moved it.
          const timer = this.clock.setTimer(half + 1, () => {
            const responseStart = this.clock.now()
            release()
            resolve({
              status: 200,
              telemetry: {
                epoch: this.server.epoch,
                bucketMs: BUCKET_MS,
                firstBucket: Math.floor(startMs / BUCKET_MS),
                buckets: wholeBytes(transfer.cells),
                bytes: Math.round(transfer.read),
                startMs,
                durationMs: at + offset - startMs,
              },
              timing: this.entry({ requestStart: sentAt, responseStart, responseEnd: responseStart }),
            })
          })
          signal.addEventListener('abort', () => this.clock.clearTimer(timer))
        },
      })
      signal.addEventListener('abort', () => {
        this.link.drop(transfer)
        reject(abortError())
      })
    })
  }

  ws(): Promise<WsEcho> {
    return this.server.ws()
  }

  probe(path: string, signal?: AbortSignal): Promise<ProbeTiming> {
    return this.server.probe(path, signal)
  }

  info(): Promise<InfoResult> {
    return this.server.info()
  }

  /** Records a request and returns the failure it replays. */
  private next(direction: Direction, size: number): Failure | null {
    const index = this.requested[direction].push(size) - 1
    return this.scenario.failure?.(direction, index) ?? null
  }

  private entry(times: Omit<ResourceTiming, 'nextHopProtocol'>): ResourceTiming | null {
    const protocol = this.scenario.protocol
    return protocol === null ? null : { nextHopProtocol: protocol, ...times }
  }

  /** Answers after `delayMs` with `answer(status)`, replaying `failure`, unless aborted first. */
  private respond<T>(
    delayMs: number,
    signal: AbortSignal,
    failure: Failure | null,
    answer: (status: number) => T,
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer =
        failure?.kind === 'stall'
          ? null
          : this.clock.setTimer(delayMs, () => {
              if (failure?.kind === 'error') {
                reject(new TypeError('network error'))
              } else {
                resolve(answer(failure?.kind === 'status' ? failure.status : 200))
              }
            })
      signal.addEventListener('abort', () => {
        if (timer !== null) {
          this.clock.clearTimer(timer)
        }
        reject(abortError())
      })
    })
  }
}
