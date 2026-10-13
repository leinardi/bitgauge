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

import type { DownloadPhase } from '@/engine/download/phase'
import type { EngineEvent, SteadySoFar } from '@/engine/messages'
import { type Cell, percentile } from '@/engine/stats/buckets'
import { BUCKET_MS, bitsFromBytes, bitsPerSecond, bucketRate } from '@/engine/stats/units'
import type { UploadPhase } from '@/engine/upload/phase'
import { confirmedSeries, steadyWindow } from '@/engine/upload/window'

// The live `sample` messages of a throughput phase (architecture.md section 4, measurement.md
// section 14): the buckets that became known since the last message, the gauge, and the steady
// window's average and peak so far once warm-up has ended. Nothing here feeds a result.

type Sample = Extract<EngineEvent, { type: 'sample' }>

/** The gauge reads the last 5 buckets: half a second. */
const GAUGE_BUCKETS = 5
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

/** One direction's feed: each call returns the next message, or null when nothing changed. */
export class SampleFeed {
  /** The next bucket to send. */
  private next: number | null = null
  /** Upload progress at the last ticks, for the sending rate. */
  private readonly progress: { at: number; bytes: number }[] = []

  download(phase: DownloadPhase, dataUsedBefore: number): Sample | null {
    const series = phase.series
    const from = this.next ?? series.first
    if (series.end <= from) {
      return null
    }
    this.next = series.end
    const warmupEnd = phase.warmupEnd
    const sample: Sample = {
      type: 'sample',
      direction: 'download',
      fromBucket: from,
      values: series.range(from, series.end),
      gauge: bucketRate(series.mean(series.end - GAUGE_BUCKETS, series.end) ?? 0),
      dataUsedBytes: dataUsedBefore + phase.dataUsed,
    }
    const live = warmupEnd === null ? undefined : steady(series.known(warmupEnd.bucket, series.end))
    return live === undefined ? sample : { ...sample, steady: live }
  }

  /** The upload's gauge is the client's sending progress; its buckets are confirmed server cells. */
  upload(phase: UploadPhase, dataUsedBefore: number, now: number): Sample {
    const sent = phase.dataUsed
    this.progress.push({ at: now, bytes: sent })
    if (this.progress.length > GAUGE_BUCKETS + 1) {
      this.progress.shift()
    }
    const oldest = this.progress[0] ?? { at: now, bytes: sent }
    const sending = now > oldest.at ? (bitsFromBytes(sent - oldest.bytes) * 1000) / (now - oldest.at) : 0
    const series = confirmedSeries(phase.ledger)
    // Cells are absolute server-grid indices, far from 0: values start at the first confirmed
    // cell, and nothing is remembered before the first confirmation.
    const from = this.next ?? series?.first ?? 0
    let values: Cell[] = []
    if (series !== null) {
      const end = Math.max(from, series.end)
      values = series.range(from, end)
      this.next = end
    }
    const windowEnd = phase.ledger.windowEnd()
    const sample: Sample = {
      type: 'sample',
      direction: 'upload',
      fromBucket: from,
      values,
      gauge: sending,
      sending,
      dataUsedBytes: dataUsedBefore + sent,
      ...(windowEnd === null ? {} : { windowEnd }),
    }
    const warmupEnd = phase.warmupEnd
    if (warmupEnd === null) {
      return sample
    }
    const window = steadyWindow(phase.ledger, warmupEnd.bucket * BUCKET_MS)
    const live = steady(window.cells.map((cell) => phase.ledger.grid.bytes(cell)))
    return live === undefined ? sample : { ...sample, steady: live }
  }
}
