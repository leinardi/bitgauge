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

import { Connections } from '@/demo/connections'
import type { Link } from '@/demo/link'
import { Body, Pacer, TICK_MS, type Transfer, wholeBytes } from '@/demo/pacer'
import type { Direction } from '@/engine/messages'
import type { BrowserIdentity, Clock, DownloadResponse, Info, InfoResult, ProbeTiming, ResourceTiming, Transport, UploadResponse, WsEcho } from '@/engine/types'

// The demo's Transport (frontend.md section 9): the engine's requests answered by a simulated
// server across the simulated link, on the demo clock. A download's first byte arrives one round
// trip after it is sent; an upload's first byte reaches the server half a round trip after it is
// sent, and its answer carries the telemetry of wire-protocol.md section 4, counted on the server's
// own 100 ms grid from the paced arrivals. The WebSocket echo and the probes answer one jittered
// round trip later, and GET /info answers with the fixture and the link's current epoch. While a
// direction has requests in flight, every round trip gains the link's queue delay; on a link with a
// connection limit, as on HTTP/1.1, a request or probe beyond it waits, first come first served,
// until a connection is free.

const BUCKET_MS = 100
/** The server grid's instant minus the client's: the two clocks share no origin. */
const GRID_OFFSET_MS = 1_000_037
const WS_GOING_AWAY = 1001
const WS_ABNORMAL = 1006

function abortError(): DOMException {
  return new DOMException('The request was aborted.', 'AbortError')
}

function networkError(): TypeError {
  return new TypeError('network error')
}

/** Adds `bytes`, moved evenly from `from` to `to` on the server timeline, to the grid cells from `first` on. */
function spread(cells: number[], first: number, from: number, to: number, bytes: number): void {
  const last = Math.max(Math.floor(from / BUCKET_MS), Math.ceil(to / BUCKET_MS) - 1)
  for (let cell = Math.floor(from / BUCKET_MS); cell <= last; cell++) {
    const overlap = to > from ? (Math.min(to, (cell + 1) * BUCKET_MS) - Math.max(from, cell * BUCKET_MS)) / (to - from) : 1
    cells[cell - first] = (cells[cell - first] ?? 0) + bytes * overlap
  }
}

export class DemoTransport implements Transport {
  private readonly clock: Clock
  private readonly link: Link
  private readonly fixture: Info
  private readonly browser: BrowserIdentity
  private readonly pacer: Pacer
  private readonly closers = new Set<(code: number) => void>()
  private readonly connections: Connections

  constructor(clock: Clock, link: Link, fixture: Info, browser: BrowserIdentity) {
    this.clock = clock
    this.link = link
    this.fixture = fixture
    this.browser = browser
    this.pacer = new Pacer(clock, link)
    this.connections = new Connections(link.profile.connections)
    // A server that stops answering drops every connection at that instant. A restart closes the
    // WebSocket as the old process goes away, while its requests in flight drain, as a graceful
    // shutdown lets them; a proxy that drops the WebSocket closes it alone.
    link.onEvent((event, at) => {
      const drop = () => {
        if (event === 'unreachable') {
          this.pacer.failAll(networkError)
        }
        const closers = [...this.closers]
        this.closers.clear()
        closers.forEach((close) => close(event === 'restart' ? WS_GOING_AWAY : WS_ABNORMAL))
      }
      const delay = at - clock.now()
      if (delay > 0) {
        clock.setTimer(delay, drop)
      } else {
        drop()
      }
    })
  }

  download(size: number, signal: AbortSignal): Promise<DownloadResponse> {
    return this.connected(signal, (release) => this.sendDownload(size, signal, this.loading('download', signal, release)))
  }

  /** A download on its connection; `end` runs once it is over, at its last byte, failure or abort. */
  private sendDownload(size: number, signal: AbortSignal, end: () => void): Promise<DownloadResponse> {
    const sentAt = this.clock.now()
    const rtt = this.requestRoundTrip('download', sentAt)
    const answered = this.answer(rtt, signal, this.failed(sentAt), () => {
      const body = new Body()
      let endAt = sentAt + rtt
      const whole = wholeBytes()
      const transfer = this.transfer('download', size, sentAt + rtt, {
        // One chunk per tick of the stretch moved, each stamped with its own arrival: a Worker busy
        // elsewhere fires the pacer late, and one chunk stamped at the end of a long stretch would
        // count bytes of a closed 100 ms bucket in the next one.
        onMove: (bytes, from, to) => {
          const slices = Math.max(1, Math.ceil((to - from) / TICK_MS - 1e-9))
          for (let slice = 1; slice <= slices; slice++) {
            const moved = whole(bytes / slices)
            if (moved > 0) {
              body.push({ bytes: moved, at: this.stamp(from + ((to - from) * slice) / slices) })
            }
          }
        },
        onDone: (at) => {
          endAt = at
          end()
          body.end()
        },
        onFail: (reason) => {
          end()
          body.fail(reason)
        },
      })
      signal.addEventListener('abort', () => {
        this.pacer.remove(transfer)
        body.fail(abortError())
      })
      return {
        status: 200,
        contentEncoding: null,
        chunks: body,
        timing: () => this.entry(sentAt, sentAt + rtt, endAt),
      }
    })
    answered.catch(end)
    return answered
  }

  upload(size: number, onProgress: (sentBytes: number, at: number) => void, signal: AbortSignal): Promise<UploadResponse> {
    return this.connected(signal, (release) => {
      const end = this.loading('upload', signal, release)
      const answered = this.sendUpload(size, onProgress, signal)
      void answered.then(end, end)
      return answered
    })
  }

  /** An upload on its connection: its first byte half a round trip after it is sent, its answer half a round trip after its last. */
  private sendUpload(size: number, onProgress: (sentBytes: number, at: number) => void, signal: AbortSignal): Promise<UploadResponse> {
    const sentAt = this.clock.now()
    const rtt = this.requestRoundTrip('upload', sentAt)
    const half = rtt / 2
    if (signal.aborted || this.failed(sentAt) || this.link.uploadLost(sentAt)) {
      // A lost upload fails like an XMLHttpRequest's error, once the round trip has passed.
      return this.answer(rtt, signal, true, () => {
        throw networkError()
      })
    }
    return new Promise((resolve, reject) => {
      // The server reads its clock in whole milliseconds: the first byte's instant is placed on
      // one, and the cells, the first bucket and the telemetry all derive from it.
      const startMs = Math.round(sentAt + half + GRID_OFFSET_MS)
      const firstBucket = Math.floor(startMs / BUCKET_MS)
      const cells: number[] = []
      const transfer = this.transfer('upload', size, startMs - GRID_OFFSET_MS, {
        onMove: (bytes, from, to) => {
          spread(cells, firstBucket, from + GRID_OFFSET_MS, to + GRID_OFFSET_MS, bytes)
          onProgress(Math.round(transfer.moved), this.stamp(to))
        },
        onDone: (at) => {
          const back = (this.link.profile.rttMs + this.link.loadedMs(at)) / 2
          const timer = this.clock.setTimer(at + back - this.clock.now(), () => {
            const responseAt = this.clock.now()
            if (!this.link.reachable(responseAt)) {
              reject(networkError())
              return
            }
            const whole = wholeBytes()
            resolve({
              status: 200,
              telemetry: {
                epoch: this.link.epochAt(at),
                bucketMs: BUCKET_MS,
                firstBucket,
                buckets: Array.from(cells, (bytes = 0) => whole(bytes)),
                bytes: size,
                startMs,
                durationMs: Math.max(0, Math.round(at + GRID_OFFSET_MS) - startMs),
              },
              timing: this.entry(sentAt, responseAt, responseAt),
            })
          })
          signal.addEventListener('abort', () => this.clock.clearTimer(timer))
        },
        onFail: reject,
      })
      signal.addEventListener('abort', () => {
        this.pacer.remove(transfer)
        reject(abortError())
      })
    })
  }

  ws(): Promise<WsEcho> {
    const { clock, link } = this
    return this.later(link.roundTrip(clock.now()), (resolve, reject) => {
      if (this.link.leavesWebSocketUnanswered(clock.now())) {
        return
      }
      if (!this.link.webSocketOpens(clock.now()) || !this.link.reachable(clock.now())) {
        reject(new Error('the WebSocket did not open'))
        return
      }
      let open = true
      let onPong: ((seq: number, sentAt: number, receivedAt: number) => void) | null = null
      let onClose: ((code: number) => void) | null = null
      const closer = (code: number) => {
        open = false
        onClose?.(code)
      }
      this.closers.add(closer)
      resolve({
        ping: (seq, sentAt) => {
          if (open) {
            // The echo is stamped with its simulated arrival: a timer fires no earlier than the
            // browser's floor, a few milliseconds, which would otherwise lengthen a LAN round trip.
            const at = clock.now()
            const rtt = link.roundTrip(at)
            clock.setTimer(rtt, () => (open ? onPong?.(seq, sentAt, this.stamp(at + rtt)) : undefined))
          }
        },
        onPong: (listener) => {
          onPong = listener
        },
        onClose: (listener) => {
          onClose = listener
        },
        close: () => {
          open = false
          this.closers.delete(closer)
        },
      })
    })
  }

  probe(path: string, signal?: AbortSignal): Promise<ProbeTiming> {
    const sentAt = this.clock.now()
    return this.connected(signal, (release) => {
      // A probe that waited for a connection starts when it has one, as Resource Timing's
      // requestStart does.
      const requestStart = this.clock.now()
      const lost = this.failed(requestStart)
      const rtt = this.link.roundTrip(requestStart)
      return new Promise<ProbeTiming>((resolve, reject) => {
        const timer = this.clock.setTimer(rtt, () => {
          release()
          if (lost) {
            reject(networkError())
            return
          }
          // Stamped with the simulated answer, as the echo is.
          const doneAt = this.stamp(requestStart + rtt)
          const status = path.endsWith('/ping') ? 204 : path.endsWith('/small') ? 200 : 404
          resolve({ status, sentAt, doneAt, timing: this.entry(requestStart, doneAt, doneAt) })
        })
        signal?.addEventListener('abort', () => {
          this.clock.clearTimer(timer)
          release()
          reject(abortError())
        })
      })
    })
  }

  info(): Promise<InfoResult> {
    return this.connected(undefined, (release) =>
      this.later(this.link.roundTrip(this.clock.now()), (resolve, reject) => {
        release()
        const now = this.clock.now()
        if (!this.link.reachable(now)) {
          reject(networkError())
          return
        }
        const server = { ...this.fixture.server, epoch: this.link.epochAt(now) }
        resolve({ info: { ...this.fixture, server }, browser: this.browser })
      }),
    )
  }

  /** Sends a request on a connection, once one is free (demo/connections.ts). */
  private connected<T>(signal: AbortSignal | undefined, send: (release: () => void) => Promise<T>): Promise<T> {
    return this.connections.connected(signal, abortError, send)
  }

  /**
   * A request's own round trip to its first byte: behind the queue only while another request of
   * its direction is moving, whose bytes hold it; with none moving the queue is empty, and two
   * streams that end together would otherwise both wait a loaded round trip, idling the link.
   */
  private requestRoundTrip(direction: Direction, at: number): number {
    return this.link.profile.rttMs + (this.pacer.moving(direction, at) ? this.link.loadedMs(at) : 0)
  }

  /** A throughput request in flight on its connection from now; the end it returns runs once, on abort too. */
  private loading(direction: Direction, signal: AbortSignal, release: () => void): () => void {
    this.link.load(direction, this.clock.now())
    let loaded = true
    const end = (): void => {
      if (loaded) {
        loaded = false
        this.link.unload(direction)
        release()
      }
    }
    signal.addEventListener('abort', end)
    return end
  }

  /**
   * A simulated instant as the clock would read it: on a multiple of its resolution, so a coarse
   * timer coarsens what the transport reports too.
   */
  private stamp(at: number): number {
    const step = this.clock.resolutionMs
    return step > 0 ? Math.floor(at / step + 1e-9) * step : at
  }

  /** Whether a request sent at `at` fails: the server is gone, or the link lost it. */
  private failed(at: number): boolean {
    return !this.link.reachable(at) || this.link.lost(at)
  }

  /**
   * Answers a request after `delayMs` with `respond()`, or fails it when it was `lost` or the server
   * stopped answering meanwhile, unless it is aborted first.
   */
  private answer<T>(delayMs: number, signal: AbortSignal, lost: boolean, respond: () => T): Promise<T> {
    return new Promise((resolve, reject) => {
      if (signal.aborted) {
        reject(abortError())
        return
      }
      const timer = this.clock.setTimer(delayMs, () => {
        if (lost || !this.link.reachable(this.clock.now())) {
          reject(networkError())
        } else {
          resolve(respond())
        }
      })
      signal.addEventListener('abort', () => {
        this.clock.clearTimer(timer)
        reject(abortError())
      })
    })
  }

  private transfer(direction: Direction, target: number, firstByteAt: number, callbacks: Pick<Transfer, 'onMove' | 'onDone' | 'onFail'>): Transfer {
    const transfer: Transfer = { direction, target, firstByteAt, moved: 0, movedTo: null, ...callbacks }
    this.pacer.add(transfer)
    return transfer
  }

  private entry(requestStart: number, responseStart: number, responseEnd: number): ResourceTiming | null {
    const protocol = this.link.profile.protocol
    return protocol === null ? null : { nextHopProtocol: protocol, requestStart, responseStart, responseEnd }
  }

  /** Settles `delayMs` from now. */
  private later<T>(delayMs: number, settle: (resolve: (value: T) => void, reject: (reason: unknown) => void) => void): Promise<T> {
    return new Promise((resolve, reject) => {
      this.clock.setTimer(delayMs, () => settle(resolve, reject))
    })
  }
}
