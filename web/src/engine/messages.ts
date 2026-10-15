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

// The message contract between the UI and the engine's Worker (architecture.md section 4): both
// directions are unions discriminated on `type`. The application imports this module and nothing
// else under engine/. The engine sends raw numbers and codes, never display text.

/** The phases of a run, in their default order (measurement.md section 1). */
export type PhaseName = 'info' | 'idle' | 'download' | 'upload'

/** The phases a run can skip; info always runs (decisions.md section 34). */
export type MeasuringPhase = Exclude<PhaseName, 'info'>

export type PhaseState = 'started' | 'finished' | 'skipped' | 'failed'

export type Direction = 'download' | 'upload'

/** The v0.1 presets (measurement.md section 8.5); Continuous arrives in v0.3. */
export type Preset = 'quick' | 'standard' | 'extended'

export type StreamMode = 'auto' | 'fixed' | 'single'

/** A resolved duration range of one direction, in milliseconds. */
export interface DurationBounds {
  minMs: number
  maxMs: number
}

/** The resolved settings of a run, as `configure` carries them (configuration.md section 2.3). */
export interface TestSettings {
  preset: Preset
  /** The measuring phases to run, in order; info is not listed because it always runs. */
  phases: MeasuringPhase[]
  streams: { mode: StreamMode; fixed: number; max: number }
  download: DurationBounds
  upload: DurationBounds
  dataCapBytes: number | null
  units: 'bits' | 'bytes'
  /** `auto`, or a fixed warm-up in milliseconds (measurement.md section 8.3). */
  warmup: 'auto' | number
  pingCount: number
  overheadCompensationPercent: number
}

/**
 * The URL parameters' settings (ui/url-params.md section 2), which `configure` resolves over the
 * settings it carries: any field of the settings, and the `duration` parameter as `durationMs`.
 */
export type ConfigureOverride = Partial<TestSettings> & {
  durationMs?: number
}

/**
 * A run's override of the configured settings (architecture.md section 4): any field of the
 * settings, the `duration` URL parameter as `durationMs`, the result's label, the context label,
 * and the URL parameters whose values were ignored, each a `url-parameter-ignored` notice.
 */
export type SettingsOverride = ConfigureOverride & {
  label?: string
  contextLabel?: string
  ignoredParameters?: string[]
}

/** The confidence reasons of measurement.md section 8.3. */
export type ConfidenceReason = 'ramp-unsettled' | 'insufficient-samples' | 'unstable'

/** A direction's confidence (measurement.md section 16). */
export interface Confidence {
  level: 'normal' | 'low' | 'cpu-bound'
  reasons: ConfidenceReason[]
}

/**
 * The v0.1 notices of measurement.md section 16, each with the raw values it names. `data-used`
 * (Continuous) and `probe-reservation` (loaded responsiveness) belong to later versions.
 */
export type Notice =
  | { code: 'slow-link-extended'; direction: Direction }
  | { code: 'low-confidence'; direction: Direction; reasons: ConfidenceReason[] }
  | { code: 'data-cap-reached'; direction: Direction }
  /** A `429` lowered the effective cap; `streams` is the lowered cap (measurement.md section 4). */
  | { code: 'stream-limit'; direction: Direction; streams: number }
  | { code: 'insufficient-data'; direction: Direction; offer: Preset | null }
  | { code: 'url-parameter-ignored'; parameter: string }
  | { code: 'stopped-early'; direction: Direction; coveredMs: number }
  | { code: 'server-restarted' }
  | { code: 'server-unreachable' }
  | { code: 'proxy-buffering-suspected' }
  /** The browser's own upload path may bound the headline (measurement.md section 16); `browser` is its family. */
  | { code: 'browser-upload-limit'; browser: string }
  | { code: 'upload-interrupted' }
  | { code: 'response-compression-detected' }
  | { code: 'overhead-compensation'; percent: number }
  | { code: 'timer-throttling-detected' }
  | { code: 'page-hidden' }
  | { code: 'network-changed' }
  | { code: 'websocket-reopened' }
  | { code: 'websocket-unavailable' }
  | { code: 'base-path-mismatch' }

export type NoticeCode = Notice['code']

/** The `error` event's codes (architecture.md section 4); the message key is `errors.<code>`. */
export type EngineErrorCode =
  | 'invalid-settings'
  | 'requests-failed'
  | 'network-changed'
  | 'server-restarted'
  | 'server-unreachable'

// Result object (measurement.md section 17), the v0.1 field set: the fields of later versions (the
// note, loaded latency, responsiveness, bufferbloat grade, quality scores, Continuous fields) are
// absent, never null-filled.

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
    dataCapBytes: number | null
    overheadCompensationPercent: number
    warmup: 'auto' | number
    pingCount: number
  }
  idle?: IdleResult
  download?: DirectionResult
  upload?: UploadResult
  dataUsedBytes: number
  notices: Notice[]
}

/** Checks a value against the result object; the application validates before exporting. */
export { validateResult } from '@/engine/result/validate'

/** Commands, UI to engine. */
export type EngineCommand =
  | { type: 'configure'; settings: TestSettings; override?: ConfigureOverride; basePath: string }
  | { type: 'start'; override?: SettingsOverride; visible: boolean }
  | { type: 'stop' }
  | { type: 'visibility'; visible: boolean }
  /** The page's `offline` event, or a change of navigator.connection.type (edge-cases.md section 6). */
  | { type: 'network'; event: 'offline' | 'type-changed' }

/** The live steady-window numbers of a direction, absent while it warms up (section 14). */
export interface SteadySoFar {
  avgBitsPerSecond: number
  peakBitsPerSecond: number
}

/** Events, engine to UI. */
export type EngineEvent =
  | {
      type: 'phase'
      phase: PhaseName
      state: PhaseState
      protocol?: string
      streams?: number
      /** A finished download or upload: its headline, the result's `bitsPerSecond`, when it has one. */
      headlineBitsPerSecond?: number
      /** A finished or failed download or upload: its bytes, the result's `bytes` for it. */
      bytes?: number
      notices: Notice[]
    }
  | {
      type: 'sample'
      direction: Direction
      /** Download: the client bucket index from the phase start; upload: the server grid cell. */
      fromBucket: number
      /** Bytes per bucket; `null` is an unknown cell (a failure gap), never zero. */
      values: (number | null)[]
      /** Upload only: the current window end on the server grid. */
      windowEnd?: number
      /** Bits per second over the last 5 buckets (measurement.md section 14). */
      gauge: number
      /** Upload only: the client's sending progress in bits per second; it never feeds a number. */
      sending?: number
      steady?: SteadySoFar
      /** Once warm-up has ended: its bucket, on the same axis as `fromBucket` (display only). */
      warmupEndBucket?: number
      /** Upload only, once a request has confirmed: P_start on the server grid, in cells. */
      startBucket?: number
      /**
       * Upload only, once a request has confirmed: this sample's instant on the server grid, in
       * fractional cells, placed by the display-only offset of measurement.md section 7.4.
       */
      sendingBucket?: number
      dataUsedBytes: number
    }
  /**
   * The resolved settings: after a valid `configure`, those the next run starts from; when a run
   * starts, that run's, its override applied.
   */
  | { type: 'settings'; scope: 'configured' | 'run'; settings: TestSettings }
  /** Idle latency so far, after each ping: the ping counter, the last RTT and the running median. */
  | { type: 'idle'; pings: number; count: number; rttMs?: number; medianMs?: number }
  | { type: 'result'; result: Result }
  | {
      type: 'error'
      code: EngineErrorCode
      messageKey: `errors.${EngineErrorCode}`
      phase?: PhaseName
      partial: boolean
    }
