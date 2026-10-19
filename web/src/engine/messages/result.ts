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

import type { Confidence, Notice, NoticeCode } from '@/engine/messages/notices'
import type { Direction, DurationBounds, MeasuringPhase, Preset, StreamMode } from '@/engine/messages/settings'

// Result object (measurement.md section 17), the v0.2 field set: the fields of later versions
// (responsiveness, quality scores, Continuous fields) are absent, never null-filled, and the v0.2
// additions are optional, so a v0.1 result stays valid.

export type DirectionStatus = 'measured' | 'insufficient-data' | 'partial' | 'skipped' | 'error'

export type ResultStatus = 'complete' | 'partial' | 'error'

/** Why the ramp stopped adding streams (measurement.md section 8.2). */
export type Plateau = 'no-gain' | 'cap' | 'floor-limited'

/**
 * The steady-window bucket values, at most 2000 points; every time is in milliseconds from the
 * phase start. A downsampled point holds several 100 ms buckets, and the last one ends at `endMs`.
 */
export interface ResultSeries {
  bucketMs: number
  firstCellMs: number
  warmupEndMs: number
  endMs: number
  /** Bytes per bucket; `null` is an unknown cell. */
  values: (number | null)[]
}

export type DirectionEvent =
  | { code: 'extended' | 'data-cap' | 'cancelled'; atMs: number }
  | { code: 'error'; atMs: number; notice: NoticeCode | 'requests-failed' }
  | { code: 'failure-gap'; startMs: number; endMs: number }

/** Where loaded-latency samples came from (measurement.md section 11.2). */
export type LoadedSource = 'websocket' | 'http-h1-reserved' | 'http-h2' | 'http-h3'

/** Why a direction has no loaded-latency number (measurement.md section 11.4). */
export type LoadedLatencyReason = 'no-steady-window' | 'insufficient-samples' | 'reservation-broken' | 'no-probe-path'

/** A loaded-latency ping as the series and the live samples hold it. */
export interface LoadedPing {
  atMs: number
  rttMs: number
}

/**
 * A direction's loaded latency (measurement.md sections 11.4 and 17): measured, with no status, or
 * unavailable with its reason. `increaseMs` and `idleSource` exist only with an idle median.
 */
export type LoadedLatency =
  | {
      source: LoadedSource
      idleSource?: IdleResult['path']
      samples: number
      skippedTicks: number
      lost: number
      medianMs: number
      p90Ms: number
      increaseMs?: number
      /** The counted samples on the direction's series timeline, at most 2000 points. */
      series: LoadedPing[]
    }
  | { status: 'unavailable'; reason: LoadedLatencyReason; source?: LoadedSource; samples: number; skippedTicks: number; lost: number }

/** The bufferbloat grade of measurement.md section 11.3. */
export interface Bufferbloat {
  grade: 'A+' | 'A' | 'B' | 'C' | 'D' | 'F'
  basis: 'download+upload' | Direction
  increaseMs: number
}

/**
 * One throughput direction. A direction without a number omits the number's fields; one whose
 * warm-up never ended also omits the window, its series and the confidence.
 */
export interface DirectionResult {
  status: DirectionStatus
  bitsPerSecond?: number
  peakBitsPerSecond?: number
  uncompensatedBitsPerSecond?: number
  windowMs?: number
  streams: number
  plateau?: Plateau
  confidence?: Confidence
  bytes: number
  series?: ResultSeries
  events: DirectionEvent[]
  /** Present when the direction ran while a loaded-latency path existed (v0.2). */
  loadedLatency?: LoadedLatency
}

export interface UploadResult extends DirectionResult {
  confirmedRequests: number
}

/** Idle latency (measurement.md section 10). The statistics are absent while it is unavailable. */
export interface IdleResult {
  path: 'websocket' | 'http'
  lossPercent: number
  minMs?: number
  medianMs?: number
  p90Ms?: number
  jitterMs?: number
  /** RTTs in send order. */
  samples: number[]
}

export interface Result {
  schema: 'bitgauge.result'
  schemaVersion: 1
  id: string
  /** Wall-clock start, ISO 8601. */
  startedAt: string
  durationMs: number
  status: ResultStatus
  label: string
  /** The user's note, written by the history (v0.2); the engine never emits it. */
  note?: string
  server: { name: string; version: string; epoch: string }
  client: {
    ip: string
    contextLabel: string
    protocol: string
    browser: { name: string; major: number; os: string }
    /** The detected resolution of the Worker's clock, and whether the page was cross-origin isolated. */
    timerResolutionMs: number
    crossOriginIsolated: boolean
  }
  settings: {
    preset: Preset
    phases: MeasuringPhase[]
    streams: { mode: StreamMode; max: number }
    /** Each direction's resolved duration bounds (v0.2); absent on an older result. */
    download?: DurationBounds
    upload?: DurationBounds
    dataCapBytes: number | null
    overheadCompensationPercent: number
    warmup: 'auto' | number
    pingCount: number
  }
  idle?: IdleResult
  download?: DirectionResult
  upload?: UploadResult
  /** Absent without idle latency or a gradable direction (v0.2). */
  bufferbloat?: Bufferbloat
  dataUsedBytes: number
  notices: Notice[]
}
