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

// The demo's simulated link (frontend.md section 9): a bottleneck per direction whose rate the
// requests in flight share, a round-trip time with jitter, a queue that fills while a direction
// has requests in flight, requests that are lost, and a server that restarts or stops answering
// from a given instant. Every random draw comes from one seeded generator, so a scenario plays the
// same way each time.

/** A direction's queue under load: the delay each round trip gains, reached as 1 − e^(−t/τ). */
export interface LoadedDelay {
  downloadMs: number
  uploadMs: number
  tauMs: number
}

export interface LinkProfile {
  /** The bottleneck's goodput per direction, in bits per second. */
  downloadBitsPerSecond: number
  uploadBitsPerSecond: number
  /** The most one request carries per direction, in bits per second, such as one connection's CPU limit. */
  perRequestBitsPerSecond?: Readonly<Record<Direction, number>>
  rttMs: number
  /** The mean difference between consecutive round trips. */
  jitterMs: number
  /** Each request's chance of failing like a network error, from 0 to 1. */
  lossProbability?: number
  /** Every Resource Timing entry's nextHopProtocol; null for none. */
  protocol: string | null
  /** Whether the WebSocket echo opens; false plays a proxy that refuses the upgrade. */
  webSocket?: boolean
  /** The queue's delay while a direction has requests in flight; absent, a load adds none. */
  loaded?: LoadedDelay
  /** The browser's connections per origin, as on HTTP/1.1; absent, a request never waits for one. */
  connections?: number
  /** Whether each probe sets up a new connection first, which its timing entry shows; absent, probes reuse one. */
  newConnections?: boolean
  /** Whether GET /small goes unanswered while an upload request is in flight. */
  starveSmallDuringUpload?: boolean
}

/** The change a link announces at its instant, so the transport can end what was in flight. */
export type LinkEvent = 'restart' | 'unreachable' | 'websocket-closed'

/** Mulberry32: a small, fast 32-bit generator, plenty for a demo's draws. */
function generator(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let mixed = Math.imul(state ^ (state >>> 15), state | 1)
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61)
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296
  }
}

/** The half-width of a uniform spread whose consecutive draws differ by `jitterMs` on average. */
const SPREAD_PER_JITTER = 1.5
const MIN_RTT_MS = 0.1

export class Link {
  readonly profile: LinkProfile
  private readonly random: () => number
  private readonly epochs: { from: number; epoch: string }[]
  private failingFrom = Number.POSITIVE_INFINITY
  private uploadFailuresFrom = Number.POSITIVE_INFINITY
  private uploadFailures = 0
  private unreachableFrom = Number.POSITIVE_INFINITY
  private webSocketUntil = Number.POSITIVE_INFINITY
  private webSocketUnanswered = false
  private readonly listeners = new Set<(event: LinkEvent, at: number) => void>()
  /** The requests in flight per direction, which the transport reports. */
  private readonly inFlight: Record<Direction, number> = { download: 0, upload: 0 }
  /** When each direction's requests began to be in flight; null with none in flight. */
  private readonly loadedSince: Record<Direction, number | null> = { download: null, upload: null }

  constructor(profile: LinkProfile, epoch: string, seed = 1) {
    this.profile = profile
    this.random = generator(seed)
    this.epochs = [{ from: Number.NEGATIVE_INFINITY, epoch }]
  }

  /** The bytes per millisecond the bottleneck carries in `direction`. */
  bytesPerMs(direction: Direction): number {
    const bits = direction === 'download' ? this.profile.downloadBitsPerSecond : this.profile.uploadBitsPerSecond
    return bits / 8 / 1000
  }

  /** The bytes per millisecond one request carries at most in `direction`. */
  perRequestBytesPerMs(direction: Direction): number {
    const bits = this.profile.perRequestBitsPerSecond?.[direction]
    return bits === undefined ? Number.POSITIVE_INFINITY : bits / 8 / 1000
  }

  /** One round trip at `at`, drawn around the profile's RTT, with the delay the queue adds then. */
  roundTrip(at: number): number {
    const spread = SPREAD_PER_JITTER * this.profile.jitterMs
    return Math.max(MIN_RTT_MS, this.profile.rttMs + (this.random() * 2 - 1) * spread) + this.loadedMs(at)
  }

  /**
   * The delay the queue adds to a round trip at `at`: while a direction has requests in flight,
   * its delay × (1 − e^(−t/τ)), t the time since they began to be; none without requests in flight.
   */
  loadedMs(at: number): number {
    const loaded = this.profile.loaded
    if (loaded === undefined) {
      return 0
    }
    let delay = 0
    for (const direction of ['download', 'upload'] as const) {
      const since = this.loadedSince[direction]
      if (since !== null) {
        const full = direction === 'download' ? loaded.downloadMs : loaded.uploadMs
        delay += full * (1 - Math.exp(-Math.max(0, at - since) / loaded.tauMs))
      }
    }
    return delay
  }

  /** A request of `direction` is in flight from `at`. */
  load(direction: Direction, at: number): void {
    if (this.inFlight[direction]++ === 0) {
      this.loadedSince[direction] = at
    }
  }

  /** Whether an upload request is in flight. */
  uploading(): boolean {
    return this.inFlight.upload > 0
  }

  /** A request of `direction` ended; the queue empties with the last one. */
  unload(direction: Direction): void {
    this.inFlight[direction] = Math.max(0, this.inFlight[direction] - 1)
    if (this.inFlight[direction] === 0) {
      this.loadedSince[direction] = null
    }
  }

  /** Whether a request sent at `at` is lost. */
  lost(at: number): boolean {
    if (at >= this.failingFrom) {
      return true
    }
    const probability = this.profile.lossProbability ?? 0
    return probability > 0 && this.random() < probability
  }

  /** Whether a WebSocket opens at `at`: the profile allows one, and no proxy has dropped them yet. */
  webSocketOpens(at: number): boolean {
    return this.profile.webSocket !== false && at < this.webSocketUntil
  }

  /** Whether an upgrade the proxy no longer serves is left unanswered rather than refused. */
  leavesWebSocketUnanswered(at: number): boolean {
    return this.webSocketUnanswered && at >= this.webSocketUntil
  }

  /** Whether the server answers at `at`. */
  reachable(at: number): boolean {
    return at < this.unreachableFrom
  }

  /** The server's epoch at `at`: a new one after each restart. */
  epochAt(at: number): string {
    // The epochs are in the order of their instants.
    return this.epochs.filter((entry) => entry.from <= at).map((entry) => entry.epoch).pop() ?? ''
  }

  /** Every request sent from `at` on fails, while the server and the WebSocket stay up. */
  failFrom(at: number): void {
    this.failingFrom = Math.min(this.failingFrom, at)
  }

  /** The next `count` upload requests sent from `at` on fail, and nothing else does. */
  failUploads(at: number, count: number): void {
    this.uploadFailuresFrom = at
    this.uploadFailures = count
  }

  /** Whether an upload request sent at `at` is one of those `failUploads` fails; it counts it. */
  uploadLost(at: number): boolean {
    if (at < this.uploadFailuresFrom || this.uploadFailures === 0) {
      return false
    }
    this.uploadFailures -= 1
    return true
  }

  /** The server restarts at `at`: a new epoch from then on, and its WebSocket closes. */
  restart(at: number): void {
    const last = this.epochs[this.epochs.length - 1]
    this.epochs.push({ from: at, epoch: `${last?.epoch ?? 'epoch'}+${this.epochs.length}` })
    this.listeners.forEach((listener) => listener('restart', at))
  }

  /**
   * A proxy in front of the server drops the WebSocket at `at` and, from then on, refuses a new one
   * or leaves it unanswered, while the server and its HTTP requests stay up.
   */
  closeWebSocket(at: number, reopen: 'refused' | 'unanswered' = 'refused'): void {
    this.webSocketUntil = Math.min(this.webSocketUntil, at)
    this.webSocketUnanswered = reopen === 'unanswered'
    this.listeners.forEach((listener) => listener('websocket-closed', at))
  }

  /** The server stops answering at `at`, for good. */
  unreachable(at: number): void {
    this.unreachableFrom = Math.min(this.unreachableFrom, at)
    this.listeners.forEach((listener) => listener('unreachable', at))
  }

  /** Called with each restart and with the instant the server stops answering. */
  onEvent(listener: (event: LinkEvent, at: number) => void): void {
    this.listeners.add(listener)
  }
}
