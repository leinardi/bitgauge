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

import { type Direction, type EngineEvent, RING_LENGTHS, type SteadySoFar, type TestSettings } from '@/engine/messages'
import { FixedRing } from '@/lib/ring'

// A direction's live samples (frontend.md sections 4 and 6): its buckets and, on upload, its
// sending trace, each kept in a fixed ring allocated at the phase start, so the live view of a run
// never grows with its length.

const BUCKET_MS = 100
const PING_MS = 300
/** The upload grace and a margin past the maximum: the cells still confirmed after it (measurement.md section 5). */
const GRACE_MS = 5000
/** The largest bounded maximum, for a run whose settings are not known yet (ui/screens.md section 4). */
const LONGEST_MAX_MS = 600_000
/** A Continuous direction's live pings. */
const CONTINUOUS_PINGS = 2000

/** The live numbers of one direction, as the last `sample` carried them. */
export interface DirectionLive {
  /** The bucket of `values[0]`: from the phase start on download, a server grid cell on upload. */
  firstBucket: number
  /** Bytes per bucket, the oldest held first; `null` is an unknown bucket, never zero. */
  values: readonly (number | null)[]
  /** The lowest bucket the ring has not overwritten; absent until it has overwritten one. */
  evictedBefore?: number
  /** Upload only: the current window end on the server grid. */
  windowEnd: number | null
  /** Bits per second over the last 5 buckets. */
  gauge: number
  /** Upload only: the client's sending progress in bits per second. */
  sending: number | null
  /** The steady-window average and peak so far; null while warming up. */
  steady: SteadySoFar | null
  /** The bucket where warm-up ended, on the axis of `firstBucket`; null while warming up. */
  warmupEnd: number | null
  /** Upload only: P_start on the server grid, in cells; null before a request has confirmed. */
  start: number | null
  /** Upload only: the sending values, each at its instant on the server grid in cells. */
  sendingTrace: readonly TracePoint[]
  /** The stream count the ramp has reached. */
  streams: number
  /** How long the phase has run on the client clock. */
  phaseMs: number
}

export interface TracePoint {
  cell: number
  bitsPerSecond: number
}

/** How many buckets and pings a direction's live rings hold (frontend.md section 6). */
export function liveCapacity(settings: TestSettings | null, direction: Direction): { buckets: number; pings: number } {
  const maxMs = settings === null ? LONGEST_MAX_MS : settings[direction].maxMs
  if (maxMs === null) {
    return { buckets: RING_LENGTHS.native, pings: CONTINUOUS_PINGS }
  }
  return { buckets: Math.ceil((maxMs + GRACE_MS) / BUCKET_MS), pings: Math.ceil((maxMs + GRACE_MS) / PING_MS) }
}

/** A direction's rings, allocated whole at its phase start. */
export interface LiveRings {
  buckets: FixedRing<number | null>
  trace: FixedRing<TracePoint>
}

export function liveRings(settings: TestSettings | null, direction: Direction): LiveRings {
  const { buckets } = liveCapacity(settings, direction)
  return { buckets: new FixedRing(buckets), trace: new FixedRing(buckets) }
}

export function emptyLive(): Record<Direction, DirectionLive | null> {
  return { download: null, upload: null }
}

/**
 * Writes a sample's range of buckets into the direction's rings, unknown across any hole, and
 * updates the direction's live numbers in place, as the view of the last sample reads them.
 */
export function record(live: DirectionLive | null, rings: LiveRings, event: Extract<EngineEvent, { type: 'sample' }>): DirectionLive {
  const { buckets, trace } = rings
  // Until a bucket is known, the buffer follows the samples: an upload sends empty ones before its
  // first confirmation, and its cells start far from 0.
  if (buckets.length === 0) {
    buckets.restart(event.fromBucket)
  }
  event.values.forEach((value, index) => buckets.put(event.fromBucket + index, value, null))
  if (event.sendingBucket !== undefined && event.sending !== undefined) {
    trace.push({ cell: event.sendingBucket, bitsPerSecond: event.sending })
  }
  const buffer = live ?? { firstBucket: 0, values: [], windowEnd: null, gauge: 0, sending: null, steady: null, warmupEnd: null, start: null, sendingTrace: [], streams: 0, phaseMs: 0 }
  buffer.firstBucket = buckets.firstIndex
  buffer.values = buckets.toArray()
  const evicted = buckets.evictedBefore
  if (evicted !== Number.NEGATIVE_INFINITY) {
    buffer.evictedBefore = evicted
  }
  buffer.windowEnd = event.windowEnd ?? null
  buffer.gauge = event.gauge
  buffer.streams = event.streams
  buffer.phaseMs = event.phaseMs
  buffer.sending = event.sending ?? null
  buffer.steady = event.steady ?? null
  buffer.warmupEnd = event.warmupEndBucket ?? buffer.warmupEnd
  buffer.start = event.startBucket ?? buffer.start
  buffer.sendingTrace = trace.toArray()
  return buffer
}
