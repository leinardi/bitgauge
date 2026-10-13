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
// requests in flight share, a round-trip time with jitter, requests that are lost, and a server
// that restarts or stops answering from a given instant. Every random draw comes from one seeded
// generator, so a scenario plays the same way each time.

export interface LinkProfile {
  /** The bottleneck's goodput per direction, in bits per second. */
  downloadBitsPerSecond: number
  uploadBitsPerSecond: number
  /** The most one request carries, in bits per second, such as one connection's CPU limit. */
  perRequestBitsPerSecond?: number
  rttMs: number
  /** The mean difference between consecutive round trips. */
  jitterMs: number
  /** Each request's chance of failing like a network error, from 0 to 1. */
  lossProbability?: number
  /** Every Resource Timing entry's nextHopProtocol; null for none. */
  protocol: string | null
  /** Whether the WebSocket echo opens; false plays a proxy that refuses the upgrade. */
  webSocket?: boolean
}

/** The change a link announces at its instant, so the transport can end what was in flight. */
export type LinkEvent = 'restart' | 'unreachable'

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
  private unreachableFrom = Number.POSITIVE_INFINITY
  private readonly listeners = new Set<(event: LinkEvent, at: number) => void>()

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

  /** The bytes per millisecond one request carries at most. */
  perRequestBytesPerMs(): number {
    const bits = this.profile.perRequestBitsPerSecond
    return bits === undefined ? Number.POSITIVE_INFINITY : bits / 8 / 1000
  }

  /** One round trip, drawn around the profile's RTT. */
  roundTrip(): number {
    const spread = SPREAD_PER_JITTER * this.profile.jitterMs
    return Math.max(MIN_RTT_MS, this.profile.rttMs + (this.random() * 2 - 1) * spread)
  }

  /** Whether a request sent at `at` is lost. */
  lost(at: number): boolean {
    if (at >= this.failingFrom) {
      return true
    }
    const probability = this.profile.lossProbability ?? 0
    return probability > 0 && this.random() < probability
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

  /** The server restarts at `at`: a new epoch from then on, and its WebSocket closes. */
  restart(at: number): void {
    const last = this.epochs[this.epochs.length - 1]
    this.epochs.push({ from: at, epoch: `${last?.epoch ?? 'epoch'}+${this.epochs.length}` })
    this.listeners.forEach((listener) => listener('restart', at))
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
