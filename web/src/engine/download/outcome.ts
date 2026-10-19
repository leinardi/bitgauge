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

import { MEASURED_SECONDS, type Retention } from '@/engine/continuous/retention'
import type { DownloadWindow } from '@/engine/download/window'
import type { DirectionEvent, DirectionStatus, Notice, Plateau } from '@/engine/messages'
import type { WarmupEnd } from '@/engine/phases/warmup'
import type { DurationRule } from '@/engine/phases/window'

// What a download phase reports once it is over (measurement.md sections 5, 15 and 16). A bounded
// direction reads its steady window; a Continuous one is measured from three fully known 1 s cells
// since its steady start, whatever ended it.

export interface DownloadOutcome {
  status: Exclude<DirectionStatus, 'skipped'>
  /** Bytes per bucket from the phase start; the last bucket ends at `endMs` and may be partial. Empty in Continuous. */
  buckets: number[]
  /** The end instant, in ms from the phase start. */
  endMs: number
  warmup: WarmupEnd | null
  window: DownloadWindow | null
  /** Continuous only: the retention its numbers come from. */
  retention: Retention | null
  streams: number
  plateau: Plateau | undefined
  /** Every byte read, warm-up and failed requests included. */
  bytes: number
  /** nextHopProtocol of the latest request with a timing entry, `unknown` when empty. */
  protocol: string | null
  notices: Notice[]
  events: DirectionEvent[]
  dataCapReached: boolean
}

export type EndReason = 'duration' | 'run-length' | 'data-cap' | 'failures' | 'stopped'

/** What the phase knows when it ends. */
export interface DownloadRecord {
  reason: EndReason | null
  endMs: number
  window: (DownloadWindow & { holds: boolean }) | null
  rule: DurationRule
  warmup: WarmupEnd | null
  events: readonly DirectionEvent[]
  buckets: number[]
  retention: Retention | null
  /** The data-used notices the run raised (Continuous). */
  dataUsed: readonly Notice[]
  streams: number
  plateau: Plateau | undefined
  bytes: number
  protocol: string | null
  streamLimit: number | null
  compressed: boolean
}

/** The direction's status, with the events and notices of its ending. */
function ending(record: DownloadRecord, events: DirectionEvent[], notices: Notice[]): DownloadOutcome['status'] {
  const { reason, endMs, retention, warmup } = record
  if (reason === 'failures') {
    return 'error'
  }
  if (reason === 'stopped') {
    events.push({ code: 'cancelled', atMs: endMs })
  }
  let status: DownloadOutcome['status']
  if (retention !== null) {
    const seconds = retention.aggregates().seconds
    status = seconds >= MEASURED_SECONDS ? 'measured' : 'insufficient-data'
    if (status === 'insufficient-data' && reason === 'stopped') {
      notices.push({ code: 'stopped-early', direction: 'download', coveredMs: seconds * 1000 })
    }
  } else if (reason === 'stopped') {
    return 'partial'
  } else {
    // The duration rule, or a data cap ending the phase as if its maximum had passed.
    const outcome = record.rule.outcome(record.window?.holds ?? false)
    status = outcome.status
    notices.push(...outcome.notices)
  }
  if (status === 'measured' && warmup?.confidence.level === 'low') {
    notices.push({ code: 'low-confidence', direction: 'download', reasons: warmup.confidence.reasons })
  }
  return status
}

export function downloadOutcome(record: DownloadRecord): DownloadOutcome {
  const { reason, endMs, window } = record
  const notices: Notice[] = []
  const events = [...record.events]
  const status = ending(record, events, notices)
  if (reason === 'data-cap') {
    notices.push({ code: 'data-cap-reached', direction: 'download' })
    events.push({ code: 'data-cap', atMs: endMs })
  }
  if (record.streamLimit !== null) {
    notices.push({ code: 'stream-limit', direction: 'download', streams: record.streamLimit })
  }
  if (record.compressed) {
    notices.push({ code: 'response-compression-detected' })
  }
  notices.push(...record.dataUsed)
  return {
    status,
    buckets: record.buckets,
    endMs,
    warmup: record.warmup,
    window: window === null ? null : { fromMs: window.fromMs, toMs: window.toMs, bytes: window.bytes, requests: window.requests },
    retention: record.retention,
    streams: record.streams,
    plateau: record.plateau,
    bytes: record.bytes,
    protocol: record.protocol,
    notices,
    events,
    dataCapReached: reason === 'data-cap',
  }
}
