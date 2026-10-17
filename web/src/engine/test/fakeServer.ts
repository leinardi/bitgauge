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

import { BUCKET_MS } from '@/engine/stats/units'
import { abortError } from '@/engine/test/body'
import type { FakeClock } from '@/engine/test/fakeClock'
import type { Scenario } from '@/engine/test/fakeTransport'
import type { InfoResult, ProbeTiming, WsEcho } from '@/engine/types'

// The fake transport's server side for the latency paths and GET /info: a WebSocket echo that a
// test can close or refuse, the ping probe, and an info answer whose epoch a test can change to
// play a restart. Every answer arrives one RTT after it was asked for; a pong and a probe also
// take the delay the link's load adds (Scenario.loadedDelayMs). On HTTP/1.1 the browser holds
// Scenario.h1Connections connections, 6 by default: each request holds one until it ends, and a
// probe waits, first come first served, until one is free.

/** The connections a browser holds per server on HTTP/1.1 unless the scenario says otherwise. */
const H1_CONNECTIONS = 6

export class FakeServer {
  /** The current epoch; upload telemetry carries it too. */
  epoch: string
  /** Whether a WebSocket can be opened. */
  wsAvailable = true
  /** Whether GET /info answers; a failed one rejects like an unreachable server. */
  infoAvailable = true
  /** The paths probed, in order. */
  readonly probed: string[] = []
  /** How many WebSockets were opened, and how many /info calls were made. */
  opened = 0
  infoCalls = 0
  /** The connections held by requests now, on HTTP/1.1. */
  busy = 0
  private readonly clock: FakeClock
  private readonly scenario: Scenario
  /** The delay the link's load adds to a pong or a probe sent now. */
  private readonly loadedDelay: () => number
  private closers: ((code: number) => void)[] = []
  /** The probes waiting for a free connection, first come first served. */
  private waiting: (() => void)[] = []

  constructor(clock: FakeClock, scenario: Scenario, loadedDelay: () => number = () => 0) {
    this.clock = clock
    this.scenario = scenario
    this.loadedDelay = loadedDelay
    this.epoch = scenario.epoch ?? 'epoch-1'
  }

  /** Holds one HTTP/1.1 connection, when the protocol is HTTP/1.1; returns its release, which runs once. */
  hold(): () => void {
    if (this.scenario.protocol !== 'http/1.1') {
      return () => undefined
    }
    this.busy++
    let held = true
    return () => {
      if (held) {
        held = false
        this.busy--
        this.waiting.shift()?.()
      }
    }
  }

  /** Plays a restart: a new epoch, and the open WebSocket closes. */
  restart(epoch: string): void {
    this.epoch = epoch
    this.closeEcho(1012)
  }

  /** Closes the open WebSocket from the server side. */
  closeEcho(code = 1006): void {
    const closers = this.closers
    this.closers = []
    closers.forEach((close) => close(code))
  }

  ws(): Promise<WsEcho> {
    const { clock } = this
    const rttMs = this.scenario.rttMs
    return this.later((resolve, reject) => {
      if (!this.wsAvailable) {
        reject(new Error('the WebSocket upgrade was refused'))
        return
      }
      this.opened++
      let open = true
      let pong: ((seq: number, sentAt: number, receivedAt: number) => void) | null = null
      let closed: ((code: number) => void) | null = null
      this.closers.push((code) => {
        open = false
        closed?.(code)
      })
      resolve({
        ping: (seq, sentAt) => {
          if (open) {
            clock.setTimer(rttMs + this.loadedDelay(), () => (open ? pong?.(seq, sentAt, clock.now()) : undefined))
          }
        },
        onPong(listener) {
          pong = listener
        },
        onClose(listener) {
          closed = listener
        },
        close() {
          open = false
        },
      })
    })
  }

  /** The ping probe: it waits for a free connection on HTTP/1.1, then answers one RTT plus the loaded delay later. */
  probe(path: string, signal?: AbortSignal): Promise<ProbeTiming> {
    this.probed.push(path)
    const sentAt = this.clock.now()
    return new Promise((resolve, reject) => {
      let release = (): void => undefined
      let timer: number | null = null
      const send = (): void => {
        release = this.hold()
        const requestStart = this.clock.now()
        timer = this.clock.setTimer(this.scenario.rttMs + this.loadedDelay(), () => {
          release()
          const doneAt = this.clock.now()
          const protocol = this.scenario.protocol
          const timing = protocol === null ? null : { nextHopProtocol: protocol, requestStart, responseStart: doneAt, responseEnd: doneAt }
          resolve({ status: 204, sentAt, doneAt, timing })
        })
      }
      signal?.addEventListener('abort', () => {
        this.waiting = this.waiting.filter((waiter) => waiter !== send)
        if (timer !== null) {
          this.clock.clearTimer(timer)
        }
        release()
        reject(abortError())
      })
      if (this.busy < (this.scenario.h1Connections ?? H1_CONNECTIONS) || this.scenario.protocol !== 'http/1.1') {
        send()
      } else {
        this.waiting.push(send)
      }
    })
  }

  info(): Promise<InfoResult> {
    this.infoCalls++
    return this.later((resolve, reject) => {
      if (!this.infoAvailable) {
        reject(new TypeError('network error'))
        return
      }
      resolve({ info: this.document(), browser: this.scenario.browser ?? { name: 'Firefox', major: 131, os: 'Linux' } })
    })
  }

  private document(): InfoResult['info'] {
    return {
      server: { name: 'test', version: '0.1.0', commit: 'test', buildDate: '2026-10-13', epoch: this.epoch, basePath: '/' },
      client: { ip: '10.0.0.2', ipVersion: 4, addressClass: 'private', suggestedLabel: 'LAN' },
      limits: {
        maxDownloadBytes: 256 * 1024 * 1024,
        maxUploadBytes: 256 * 1024 * 1024,
        maxStreamsPerClient: 6,
        uploadLifetimeMs: 120_000,
        bucketMs: BUCKET_MS,
        ...this.scenario.limits,
      },
      defaults: {
        preset: 'standard',
        phases: ['idle', 'download', 'upload'],
        streams: { mode: 'auto', fixed: 3, max: 6 },
        download: { minMs: 10_000, maxMs: 20_000 },
        upload: { minMs: 15_000, maxMs: 25_000 },
        dataCapBytes: null,
        units: 'bits',
        warmup: 'auto',
        pingCount: 20,
        overheadCompensationPercent: 0,
      },
      compat: { openspeedtest: false, librespeed: false, networkquality: false },
    }
  }

  /** Settles one RTT from now. */
  private later<T>(settle: (resolve: (value: T) => void, reject: (reason: unknown) => void) => void): Promise<T> {
    return new Promise((resolve, reject) => {
      this.clock.setTimer(this.scenario.rttMs, () => settle(resolve, reject))
    })
  }
}
