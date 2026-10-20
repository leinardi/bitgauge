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
import type { Direction, DurationBounds, MeasuringPhase, NoBounds, Preset, StreamMode } from '@/engine/messages/settings'

// Result object (measurement.md section 17): a field with nothing to report is absent, never
// null-filled. The note, the duration bounds, the loaded latency, the bufferbloat grade, the
// responsiveness, the scores and the Continuous fields are optional, so a result without them stays
// valid. The Continuous fields are absent from a bounded run's result.

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
  /** Continuous only: each point's known time, so a rate over points is Σ bytes ÷ Σ known time. */
  knownMs?: number[]
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

/** How far a direction's HTTP loaded responsiveness can be trusted (measurement.md section 12.4). */
export type ResponsivenessState = 'measured' | 'uncertain' | 'unavailable_h1' | 'unavailable_insufficient'

/**
 * A direction's HTTP loaded responsiveness, path B (measurement.md section 12.6): `protocol` is the
 * capability check's, empty when it was not reported, failed or had no timing entry; `samples`
 * counts the window's valid probes. The numbers exist only on `measured` and `uncertain`, the
 * times quantized to the timer resolution; `trimmed` 0 means TM95 is the plain mean.
 */
export type Responsiveness =
  | { state: Extract<ResponsivenessState, 'measured' | 'uncertain'>; protocol: string; samples: number; rpm: number; tm95Ms: number; trimmed: number; totalMedianMs: number }
  | { state: Extract<ResponsivenessState, 'unavailable_h1' | 'unavailable_insufficient'>; protocol: string; samples: number }

/** The bufferbloat grade of measurement.md section 11.3. */
export interface Bufferbloat {
  grade: 'A+' | 'A' | 'B' | 'C' | 'D' | 'F'
  basis: 'download+upload' | Direction
  increaseMs: number
}

/** A quality-score band (measurement.md section 13.3), from the lowest. */
export type ScoreBand = 'bad' | 'poor' | 'average' | 'good' | 'great'

/** An input a quality score needs (measurement.md section 13.1), by the name a missing one is listed with. */
export type ScoreInput = 'idle-latency' | 'jitter' | 'loaded-latency' | 'download'

/** One experience's score: its clamped points and band, or every input it misses, never both. */
export type Experience = { points: number; band: ScoreBand } | { missing: ScoreInput[] }

/** The AIM quality scores (measurement.md section 13.5); packet loss is not measured, 0 points. */
export interface Scores {
  /** The bufferbloat grade's basis, `none` without one. */
  basis: Bufferbloat['basis'] | 'none'
  packetLoss: 'not-measured'
  streaming: Experience
  gaming: Experience
  rtc: Experience
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
  /** Continuous only: the lowest and highest fully known 1 s cell since the steady start. */
  minBitsPerSecond?: number
  maxBitsPerSecond?: number
  windowMs?: number
  streams: number
  plateau?: Plateau
  confidence?: Confidence
  bytes: number
  series?: ResultSeries
  events: DirectionEvent[]
  /** Present when the direction ran while a loaded-latency path existed. */
  loadedLatency?: LoadedLatency
  /** Present on every direction that ran; absent on a record that predates it. */
  responsiveness?: Responsiveness
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
  /** The user's note, written by the history; the engine never emits it. */
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
    /** Each direction's resolved duration bounds, null in Continuous; absent on a record that predates them. */
    download?: DurationBounds | NoBounds
    upload?: DurationBounds | NoBounds
    /** Continuous only: the direction it runs, and its run length when it has one. */
    continuousDirection?: Direction
    runLengthMs?: number
    dataCapBytes: number | null
    overheadCompensationPercent: number
    warmup: 'auto' | number
    pingCount: number
  }
  idle?: IdleResult
  download?: DirectionResult
  upload?: UploadResult
  /** Absent without idle latency or a gradable direction. */
  bufferbloat?: Bufferbloat
  /** Present on every result, even when no experience is scored; absent on a record that predates it. */
  scores?: Scores
  dataUsedBytes: number
  notices: Notice[]
}
