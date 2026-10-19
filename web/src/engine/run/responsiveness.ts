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

import { connectionOf, pathBRuns, type PathBSample, responsiveness } from '@/engine/latency/responsiveness'
import { sendProbe, Ticker } from '@/engine/latency/ticker'
import type { Direction, DirectionResult, Responsiveness } from '@/engine/messages'
import type { WarmupEnd } from '@/engine/phases/warmup'
import type { Clock, ProbeTiming, Transport } from '@/engine/types'

// The run's HTTP loaded responsiveness, path B (measurement.md section 12.3): the capability the
// info phase's idle GET /api/v1/small found, and one prober per direction beside path A's pinger,
// from the instant the direction learns its warm-up ended to its end instant, unless the
// capability rules path B out. Each direction's block is settled as it finishes.

const SMALL_PATH = '/api/v1/small'
/** In Continuous the prober keeps its last 64 valid probes (measurement.md section 15). */
const CONTINUOUS_PROBES = 64

/** The capability check's protocol: the one reported, empty when the probe failed, answered other than 200 or had no entry. */
export function capabilityOf(probe: ProbeTiming | null): string {
  return probe === null || probe.status !== 200 || probe.timing === null ? '' : probe.timing.nextHopProtocol
}

/** A valid probe's sample: answered 200, with an entry whose requestStart and responseStart are known. */
function sampleOf(probe: ProbeTiming): PathBSample | null {
  const timing = probe.timing
  if (probe.status !== 200 || timing === null || timing.requestStart === 0 || timing.responseStart === 0) {
    return null
  }
  // fetchStart is on the client clock's timeline; the send instant stands in when it is not exposed.
  const fetchStart = timing.fetchStart ?? probe.sentAt
  return {
    fetchStart,
    httpMs: timing.responseStart - timing.requestStart,
    totalMs: timing.responseEnd - fetchStart,
    protocol: timing.nextHopProtocol,
    connection: connectionOf(timing.connectStart, timing.connectEnd),
  }
}

/**
 * One direction's prober: a probe every 300 ms, a tick skipped while the last is pending. It keeps
 * every valid probe, or in Continuous a ring of the last 64, with the count of every one.
 */
class Prober {
  readonly samples: PathBSample[] = []
  /** Every valid probe since it started, those the ring dropped included. */
  count = 0
  private readonly transport: Pick<Transport, 'probe'>
  private readonly ticker: Ticker
  private readonly limit: number
  private pending: AbortController | null = null
  private stopped = false

  constructor(clock: Clock, transport: Pick<Transport, 'probe'>, continuous: boolean) {
    this.transport = transport
    this.ticker = new Ticker(clock, () => this.tick())
    this.limit = continuous ? CONTINUOUS_PROBES : Number.POSITIVE_INFINITY
  }

  start(): void {
    this.ticker.start()
  }

  /** The end instant: no probe from here on, and the one outstanding is aborted and not counted. */
  stop(): void {
    this.stopped = true
    this.ticker.stop()
    this.pending?.abort()
    this.pending = null
  }

  private tick(): void {
    if (this.pending !== null) {
      return
    }
    this.pending = sendProbe(this.transport, SMALL_PATH, (probe) => {
      this.pending = null
      const sample = this.stopped || probe === null ? null : sampleOf(probe)
      if (sample !== null) {
        this.count++
        this.samples.push(sample)
        if (this.samples.length > this.limit) {
          this.samples.shift()
        }
      }
    })
  }
}

interface Probing {
  prober: Prober | null
  /** The warm-up ended at its cap. */
  capped: boolean
  /** The end instant, once reached. */
  endAt: number | null
}

/** Whether a direction has a steady window (measurement.md section 12.4). */
function hasWindow(block: DirectionResult): boolean {
  return (block.status === 'measured' || block.status === 'partial') && block.windowMs !== undefined
}

export class ResponsivenessProbes {
  /** The capability check's protocol; null until the info phase ran it, which reads as empty. */
  protocol: string | null = null
  private readonly clock: Clock
  private readonly transport: Pick<Transport, 'probe'>
  private readonly probing = new Map<Direction, Probing>()
  private readonly settled: Record<Direction, Responsiveness | null> = { download: null, upload: null }

  constructor(clock: Clock, transport: Pick<Transport, 'probe'>) {
    this.clock = clock
    this.transport = transport
  }

  /** The direction learned its warm-up ended: its prober starts now, when the capability allows it. */
  warmedUp(direction: Direction, end: WarmupEnd, continuous = false): void {
    if (this.probing.has(direction)) {
      return
    }
    const prober = pathBRuns(this.protocol ?? '') ? new Prober(this.clock, this.transport, continuous) : null
    this.probing.set(direction, { prober, capped: end.confidence.reasons.length > 0, endAt: null })
    prober?.start()
  }

  /** The direction's end instant: its prober stops. */
  end(direction: Direction): void {
    const probing = this.probing.get(direction)
    if (probing !== undefined && probing.endAt === null) {
      probing.endAt = this.clock.now()
      probing.prober?.stop()
    }
  }

  /** The direction's block as it finishes, from its result block's status and window; kept for the result. */
  settle(direction: Direction, block: DirectionResult, resolutionMs: number): Responsiveness {
    this.end(direction)
    const probing = this.probing.get(direction)
    const settled = responsiveness({
      protocol: this.protocol ?? '',
      samples: probing?.prober?.samples ?? [],
      count: probing?.prober?.count ?? 0,
      endAt: probing?.endAt ?? null,
      window: hasWindow(block),
      cappedWarmup: probing?.capped ?? false,
      resolutionMs,
    })
    this.settled[direction] = settled
    return settled
  }

  /** Each direction's settled block; null for one that did not finish. */
  results(): Record<Direction, Responsiveness | null> {
    return { ...this.settled }
  }

  /** The valid probes each prober keeps, which the footprint test reads. */
  footprint(): number {
    let kept = 0
    for (const probing of this.probing.values()) {
      kept += probing.prober?.samples.length ?? 0
    }
    return kept
  }

  /** Stops every prober at once: the run is over. */
  drain(): void {
    for (const probing of this.probing.values()) {
      probing.prober?.stop()
    }
  }
}
