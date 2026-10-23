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
import type { DirectionEvent, DirectionStatus, Notice, Plateau } from '@/engine/messages'
import type { WarmupEnd } from '@/engine/phases/warmup'
import type { DurationRule } from '@/engine/phases/window'
import type { BucketSeries } from '@/engine/stats/buckets'
import { BUCKET_MS } from '@/engine/stats/units'
import type { ContinuousUpload } from '@/engine/upload/continuous'
import { type ClientEvent, serverEvents } from '@/engine/upload/timeline'
import type { UploadLedger } from '@/engine/upload/watermark'
import { confirmedSeries, steadyWindow, type UploadWindow } from '@/engine/upload/window'

// What an upload phase reports once it is over (measurement.md sections 5, 7.6, 15 and 16). A
// Continuous upload is measured from three fully known 1 s cells since its steady start, whatever
// ended it, and reads its numbers from its retention rather than from a window.

/** Why the phase stopped issuing requests. */
export type Halt = 'duration' | 'run-length' | 'data-cap' | 'interrupted' | 'failures' | 'stopped' | 'server-restarted'

export interface UploadOutcome {
  status: Exclude<DirectionStatus, 'skipped'>
  warmup: WarmupEnd | null
  /** The steady window up to W_end_final; null when warm-up never ended, and in Continuous. */
  window: UploadWindow | null
  /** Continuous only: the retention its numbers come from. */
  retention: Retention | null
  /** Server timeline: P_start, the end of warm-up and W_end_final; null before a confirmation. */
  phaseStartMs: number | null
  warmupEndMs: number | null
  windowEndMs: number | null
  /** The confirmed series up to W_end_final; null in Continuous, whose retention holds it. */
  series: BucketSeries | null
  streams: number
  plateau: Plateau | undefined
  /** Every byte sent, warm-up and failed or aborted requests included. */
  bytes: number
  confirmedRequests: number
  /** The largest idle share a confirmed request showed (measurement.md section 8.2), null below 20 %. */
  idleShare: number | null
  /** nextHopProtocol of the latest answer with a timing entry, `unknown` when empty. */
  protocol: string | null
  /** The display-only offset of section 7.4, client minus server; null before a confirmation. */
  displayOffsetMs: number | null
  notices: Notice[]
  /** Times are on the server timeline from P_start; client instants are placed by the offset. */
  events: DirectionEvent[]
  dataCapReached: boolean
}

/** What the phase knows when it ends. */
export interface PhaseRecord {
  /** Every reason the phase halted for: a stop or a restart can cut a grace short. */
  halts: ReadonlySet<Halt>
  warmup: WarmupEnd | null
  ledger: UploadLedger
  rule: DurationRule
  streams: number
  plateau: Plateau | undefined
  bytes: number
  protocol: string | null
  streamLimit: number | null
  /** The `rate-limited` notice, when a rate-limit 429 refused a request (measurement.md section 4). */
  rateLimited: Notice | null
  bufferingSuspected: boolean
  idleShare: number | null
  displayOffsetMs: number | null
  events: readonly ClientEvent[]
  /** The phase start on the client clock. */
  startAt: number
  continuous: ContinuousUpload | null
}

/** A Continuous upload's status (measurement.md section 15), with the notices of its ending. */
function continuousStatus(record: PhaseRecord, retention: Retention, notices: Notice[]): UploadOutcome['status'] {
  const seconds = retention.aggregates().seconds
  if (seconds < MEASURED_SECONDS) {
    if (record.halts.has('stopped')) {
      notices.push({ code: 'stopped-early', direction: 'upload', coveredMs: seconds * 1000 })
    }
    return 'insufficient-data'
  }
  if (record.warmup?.confidence.level === 'low') {
    notices.push({ code: 'low-confidence', direction: 'upload', reasons: record.warmup.confidence.reasons })
  }
  return 'measured'
}

export function uploadOutcome(record: PhaseRecord): UploadOutcome {
  const { halts, ledger, warmup } = record
  // A restarted server's grid cannot be combined with the one before: the phase reports nothing.
  const restarted = halts.has('server-restarted')
  const warmupEndMs = warmup === null || restarted ? null : warmup.bucket * BUCKET_MS
  const retention = restarted ? null : (record.continuous?.retention ?? null)
  const window = warmupEndMs === null || record.continuous !== null ? null : steadyWindow(ledger, warmupEndMs)
  const notices: Notice[] = []
  let status: UploadOutcome['status']
  if (restarted) {
    status = 'error'
    notices.push({ code: 'server-restarted' })
  } else if (halts.has('failures')) {
    status = 'error'
  } else if (retention !== null) {
    status = continuousStatus(record, retention, notices)
  } else if (halts.has('stopped')) {
    status = 'partial'
  } else {
    // The duration rule, a data cap as if the maximum had passed, or an HTTP/1.1 failure.
    const outcome = record.rule.outcome(window?.sufficient ?? false)
    status = outcome.status
    notices.push(...outcome.notices)
    if (status === 'measured' && warmup?.confidence.level === 'low') {
      notices.push({ code: 'low-confidence', direction: 'upload', reasons: warmup.confidence.reasons })
    }
  }
  if (halts.has('interrupted')) {
    notices.push({ code: 'upload-interrupted' })
  }
  if (halts.has('data-cap')) {
    notices.push({ code: 'data-cap-reached', direction: 'upload' })
  }
  if (record.streamLimit !== null) {
    notices.push({ code: 'stream-limit', direction: 'upload', streams: record.streamLimit })
  }
  if (record.rateLimited !== null) {
    notices.push(record.rateLimited)
  }
  if (record.bufferingSuspected) {
    notices.push({ code: 'proxy-buffering-suspected' })
  }
  notices.push(...(record.continuous?.usedNotices.raised ?? []))
  return {
    status,
    warmup: restarted ? null : warmup,
    window,
    retention,
    phaseStartMs: restarted ? null : ledger.phaseStart(),
    warmupEndMs,
    windowEndMs: restarted ? null : ledger.windowEnd(),
    series: restarted || record.continuous !== null ? null : confirmedSeries(ledger),
    streams: record.streams,
    plateau: record.plateau,
    bytes: record.bytes,
    confirmedRequests: ledger.confirmedRequests,
    idleShare: record.idleShare,
    protocol: record.protocol,
    displayOffsetMs: record.displayOffsetMs,
    notices,
    events: serverEvents(record.events, record.startAt, ledger, record.displayOffsetMs, record.continuous?.failureGaps()),
    dataCapReached: halts.has('data-cap'),
  }
}
