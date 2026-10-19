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

import { LoadedSeconds } from '@/engine/continuous/loaded'
import { RESERVED_STREAMS } from '@/engine/latency/grade'
import { type HttpSource, LoadedLatency, type LoadedPath } from '@/engine/latency/loaded'
import type { Direction, LoadedPing, Notice } from '@/engine/messages'
import type { LoadedDirection } from '@/engine/run/report'
import type { Clock } from '@/engine/types'

// The run's loaded latency (measurement.md sections 11.2 and 11.4): one pinger per direction on the
// path the connection offers, the HTTP/1.1 probe reservation decided as each direction starts, its
// notice once, and the pings answered since the last live sample.

/** The HTTP fallback's source by the info phase's protocol: HTTP/2 and HTTP/3 multiplex, anything else reserves. */
function httpSource(protocol: string | null): HttpSource {
  return protocol === 'h2' ? 'http-h2' : protocol === 'h3' ? 'http-h3' : 'http-h1-reserved'
}

export interface LoadedProbesOptions {
  clock: Clock
  /** The path the connection offers now; null before it opened, or while its close sequence runs. */
  path: () => LoadedPath | null
  /** When the HTTP fallback took over; null while the WebSocket serves. */
  fallbackAt: () => number | null
}

interface Running {
  pinger: LoadedLatency
  reserved: boolean
  startAt: number
  seconds: LoadedSeconds | null
}

export class LoadedProbes {
  /** The probe-reservation notice, from the first direction that runs reserved. */
  readonly notices: Notice[] = []
  /** The nextHopProtocol of the info phase's idle request, which the reservation follows. */
  infoProtocol: string | null = null
  private readonly options: LoadedProbesOptions
  private readonly reserved = new Map<Direction, boolean>()
  private readonly running = new Map<Direction, Running>()
  private readonly ended = new Map<Direction, Promise<LoadedDirection>>()
  private current: Direction | null = null
  private answeredPings: LoadedPing[] = []

  constructor(options: LoadedProbesOptions) {
    this.options = options
  }

  /**
   * Decides the direction's reservation as it starts: only once the HTTP fallback has taken over,
   * so a direction that starts on a working WebSocket never reserves, and only when the info
   * phase's protocol is not HTTP/2 or HTTP/3. Returns the phase options it sets: the stream cap,
   * or none.
   */
  reserve(direction: Direction): { streamCap?: number } {
    const reserved = this.options.fallbackAt() !== null && httpSource(this.infoProtocol) === 'http-h1-reserved'
    this.reserved.set(direction, reserved)
    if (reserved && this.notices.length === 0) {
      this.notices.push({ code: 'probe-reservation', streams: RESERVED_STREAMS })
    }
    return reserved ? { streamCap: RESERVED_STREAMS } : {}
  }

  /**
   * Starts the direction's pinger at its phase start; `inFlight` counts its throughput requests.
   * In Continuous, `settleMs` given, the pings fold into per-second medians instead of being kept.
   */
  start(direction: Direction, startAt: number, inFlight: () => number, settleMs: number | null = null): void {
    this.current = direction
    this.answeredPings = []
    let pinger: LoadedLatency | null = null
    const seconds = settleMs === null ? null : new LoadedSeconds(settleMs, () => pinger?.counters() ?? { skippedTicks: 0, lost: 0 })
    pinger = new LoadedLatency({
      clock: this.options.clock,
      path: this.options.path,
      inFlight,
      httpSource: httpSource(this.infoProtocol),
      startAt,
      answered: (ping) => {
        if (this.current === direction) {
          this.answeredPings.push(ping)
        }
      },
      ...(seconds === null ? {} : { sink: seconds }),
    })
    this.running.set(direction, { pinger, reserved: this.reserved.get(direction) ?? false, startAt, seconds })
    pinger.start()
  }

  /** The median of the last minute's per-second medians of the running Continuous direction, for the live view. */
  lastMinuteMedianMs(): number | null {
    const run = this.current === null ? undefined : this.running.get(this.current)
    return run?.seconds?.lastMinuteMedianMs() ?? null
  }

  /** The direction's end instant: the pinger stops sending, and its outstanding pings get `graceMs`. */
  end(direction: Direction, graceMs: number): void {
    const run = this.running.get(direction)
    if (run !== undefined && !this.ended.has(direction)) {
      this.ended.set(direction, run.pinger.finish(graceMs).then((outcome) => ({ outcome, reserved: run.reserved, startAt: run.startAt, seconds: run.seconds })))
    }
  }

  /** The answered pings each pinger keeps, and in Continuous its per-second stores, which the footprint test reads. */
  footprint(): { loadedSamples: number; loadedSeconds: number } {
    let samples = 0
    let seconds = 0
    for (const run of this.running.values()) {
      samples += run.pinger.footprint()
      seconds += run.seconds?.footprint() ?? 0
    }
    return { loadedSamples: samples, loadedSeconds: seconds }
  }

  /** The pings answered since the last call, for the live sample. */
  answered(): LoadedPing[] {
    return this.answeredPings.splice(0)
  }

  /** Each direction's loaded latency once its grace has passed; null for a direction without a pinger. */
  async results(): Promise<Record<Direction, LoadedDirection | null>> {
    for (const direction of this.running.keys()) {
      this.end(direction, 0)
    }
    const [download, upload] = await Promise.all((['download', 'upload'] as const).map((direction) => this.ended.get(direction) ?? null))
    return { download: download ?? null, upload: upload ?? null }
  }

  /** Stops every pinger at once: the run is over. */
  drain(): void {
    for (const run of this.running.values()) {
      run.pinger.drain()
    }
  }
}
