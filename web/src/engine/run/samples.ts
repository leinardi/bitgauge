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

import type { DataUsedNotices } from '@/engine/continuous/dataUsed'
import { continuousSoFar } from '@/engine/continuous/live'
import type { Retention } from '@/engine/continuous/retention'
import type { DownloadPhase } from '@/engine/download/phase'
import type { EngineEvent, LoadedPing, SteadySoFar } from '@/engine/messages'
import { type Cell, mean, percentile } from '@/engine/stats/buckets'
import { BUCKET_MS, bitsFromBytes, bitsPerSecond, bucketRate } from '@/engine/stats/units'
import type { UploadPhase } from '@/engine/upload/phase'
import { confirmedSeries, steadyWindow } from '@/engine/upload/window'

// The live `sample` messages of a throughput phase (architecture.md section 4, measurement.md
// section 14): the buckets that became known since the last message, the gauge, and the steady
// window's average and peak so far once warm-up has ended, and the loaded-latency pings answered
// since the previous sample. Nothing here feeds a result.

/** A sample as the feed builds it; the run adds how long the phase has run. */
type Sample = Omit<Extract<EngineEvent, { type: 'sample' }>, 'phaseMs'>

/** The gauge reads the last 5 buckets: half a second. */
const GAUGE_BUCKETS = 5

/** The upload gauge reads the sending progress over the last 10 ticks: a browser may report a request in one burst. */
const SENDING_BUCKETS = 10

const PEAK_PERCENTILE = 90

/** The average and p90 of a set of bucket values over their time. */
function steady(values: readonly number[]): SteadySoFar | undefined {
  const peak = percentile(values, PEAK_PERCENTILE)
  if (peak === null) {
    return undefined
  }
  const bytes = values.reduce((sum, value) => sum + value, 0)
  return { avgBitsPerSecond: bitsPerSecond(bytes, values.length * BUCKET_MS), peakBitsPerSecond: bucketRate(peak) }
}

/** The non-null values of a range of buckets. */
function known(cells: readonly Cell[]): number[] {
  return cells.filter((cell) => cell !== null)
}

/**
 * The download's buckets from `from` to `to` (exclusive): from the live series up to a Continuous
 * steady start, from the retention after it, which keeps the last 10 minutes.
 */
function values(phase: DownloadPhase, from: number, to: number): Cell[] {
  const start = Math.max(0, from)
  const first = phase.retention?.first ?? null
  if (phase.retention === null || first === null) {
    return phase.series.range(start, to)
  }
  return [...phase.series.range(start, Math.min(first, to)), ...phase.retention.values(Math.max(start, first), to)]
}

/**
 * The upload's confirmed cells from `next`, or from the first confirmed one: from the confirmed
 * series up to a Continuous steady start, from the retention after it. Null before a confirmation.
 */
function uploadValues(phase: UploadPhase, next: number | null): { from: number; values: Cell[] } | null {
  const series = confirmedSeries(phase.ledger)
  if (series === null) {
    return null
  }
  const from = next ?? series.first
  const retention = phase.continuous?.retention ?? null
  const first = retention?.first ?? null
  if (retention === null || first === null) {
    return { from, values: series.range(from, Math.max(from, series.end)) }
  }
  const end = Math.max(from, retention.end)
  return { from, values: [...series.range(from, Math.min(first, end)), ...retention.values(Math.max(from, first), end)] }
}

export interface LiveOptions {
  runLengthMs: number | null
  loadedMs: () => number | null
}

/** One direction's feed: each call returns the next message, or null when nothing changed. */
export class SampleFeed {
  /** The next bucket to send. */
  private next: number | null = null
  /** Upload progress at the last ticks, for the sending rate. */
  private readonly progress: { at: number; bytes: number }[] = []
  /** Takes the loaded-latency pings answered since it was last called. */
  private readonly pings: () => LoadedPing[]
  /** Continuous only: the run length, and the loaded latency of the last minute. */
  private readonly live: LiveOptions | null

  constructor(pings: () => LoadedPing[] = () => [], live: LiveOptions | null = null) {
    this.pings = pings
    this.live = live
  }

  /** The sample with the pings answered since the previous one, when there are any. */
  private withPings(sample: Sample): Sample {
    const loadedLatency = this.pings()
    return loadedLatency.length === 0 ? sample : { ...sample, loadedLatency }
  }

  /** `phaseMs` is how long the phase has run on the client clock. */
  download(phase: DownloadPhase, dataUsedBefore: number, phaseMs: number): Sample | null {
    const end = phase.closedBuckets
    const from = this.next ?? 0
    if (end <= from) {
      return null
    }
    this.next = end
    const warmupEnd = phase.warmupEnd
    const dataUsedBytes = dataUsedBefore + phase.dataUsed
    const sample: Sample = {
      type: 'sample',
      direction: 'download',
      fromBucket: from,
      values: values(phase, from, end),
      gauge: bucketRate(mean(known(values(phase, end - GAUGE_BUCKETS, end))) ?? 0),
      streams: phase.streamCount,
      dataUsedBytes,
      ...this.continuous(phase.retention, phase.usedNotices, phaseMs, dataUsedBytes),
    }
    if (warmupEnd === null) {
      return this.withPings(sample)
    }
    const live = phase.retention === null ? steady(known(values(phase, warmupEnd.bucket, end))) : undefined
    return this.withPings({ ...sample, warmupEndBucket: warmupEnd.bucket, ...(live === undefined ? {} : { steady: live }) })
  }

  /** In Continuous, the live figures, the coarse cells closed and the notices raised since the previous sample. */
  private continuous(retention: Retention | null, used: DataUsedNotices | null, elapsedMs: number, dataBytes: number): Pick<Sample, 'continuous' | 'cells' | 'notices'> {
    if (retention === null || this.live === null) {
      return {}
    }
    const cells = retention.drain()
    const notices = used?.drain() ?? []
    const live = continuousSoFar(retention, { elapsedMs, runLengthMs: this.live.runLengthMs, dataBytes, loadedMs: this.live.loadedMs() })
    return { continuous: live, ...(cells.length === 0 ? {} : { cells }), ...(notices.length === 0 ? {} : { notices }) }
  }

  /** The upload's gauge is the client's sending progress; its buckets are confirmed server cells. */
  upload(phase: UploadPhase, dataUsedBefore: number, now: number, phaseMs: number): Sample {
    const sent = phase.dataUsed
    this.progress.push({ at: now, bytes: sent })
    if (this.progress.length > SENDING_BUCKETS + 1) {
      this.progress.shift()
    }
    const oldest = this.progress[0] ?? { at: now, bytes: sent }
    const sending = now > oldest.at ? (bitsFromBytes(sent - oldest.bytes) * 1000) / (now - oldest.at) : 0
    // Cells are absolute server-grid indices, far from 0: values start at the first confirmed
    // cell, and nothing is remembered before the first confirmation.
    const confirmed = uploadValues(phase, this.next)
    const from = confirmed?.from ?? 0
    const values = confirmed?.values ?? []
    if (confirmed !== null) {
      this.next = from + values.length
    }
    const windowEnd = phase.ledger.windowEnd()
    // The chart's placing of the sending line: this instant on the server grid, by the offset.
    const offset = phase.displayOffset
    const phaseStart = phase.ledger.phaseStart()
    const sample: Sample = {
      type: 'sample',
      direction: 'upload',
      fromBucket: from,
      values,
      gauge: sending,
      sending,
      streams: phase.streamCount,
      dataUsedBytes: dataUsedBefore + sent,
      ...this.continuous(phase.continuous?.retention ?? null, phase.continuous?.usedNotices ?? null, phaseMs, dataUsedBefore + sent),
      ...(windowEnd === null ? {} : { windowEnd }),
      ...(offset === null || phaseStart === null ? {} : { startBucket: phaseStart / BUCKET_MS, sendingBucket: (now - offset) / BUCKET_MS }),
    }
    const warmupEnd = phase.warmupEnd
    if (warmupEnd === null) {
      return this.withPings(sample)
    }
    const live = phase.continuous === null ? steady(steadyWindow(phase.ledger, warmupEnd.bucket * BUCKET_MS).cells.map((cell) => phase.ledger.grid.bytes(cell))) : undefined
    return this.withPings({ ...sample, warmupEndBucket: warmupEnd.bucket, ...(live === undefined ? {} : { steady: live }) })
  }
}
