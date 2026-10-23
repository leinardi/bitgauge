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

import type { EngineErrorCode, Notice } from '@/engine/messages/notices'
import type { DirectionEvent, DirectionResult, IdleResult, LoadedPing, Result } from '@/engine/messages/result'
import type { ConfigureOverride, Direction, PhaseName, PhaseState, SettingsOverride, TestSettings } from '@/engine/messages/settings'

// The commands and events of the message contract (architecture.md section 4), both unions
// discriminated on `type`. Re-exported by engine/messages.ts.

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

/**
 * A Continuous run's live figures (measurement.md section 15): the four rates are absent until
 * three fully known 1 s cells exist, so the UI shows a dash, never 0.
 */
export interface ContinuousSoFar {
  /** Since the phase start on the client clock; the run length and the chart's tier count from there. */
  elapsedMs: number
  runLengthMs?: number
  minBitsPerSecond?: number
  avgBitsPerSecond?: number
  maxBitsPerSecond?: number
  peakLastHourBitsPerSecond?: number
  /** The data the run has used so far. */
  dataBytes: number
  /** The median of the last minute's per-second loaded-latency medians. */
  loadedLastMinuteMedianMs?: number
}

/** A coarse retention cell closed since the previous sample (measurement.md section 15). */
export interface ClosedCellEvent {
  tier: 'hour' | 'day' | 'long'
  bytes: number
  knownMs: number
}

/** Events, engine to UI. */
export type EngineEvent =
  | {
      type: 'phase'
      phase: PhaseName
      state: PhaseState
      protocol?: string
      streams?: number
      /** A finished or failed download or upload: the direction object its result will report. */
      result?: DirectionResult
      /** A finished idle latency: the idle object its result will report. */
      idle?: IdleResult
      /** A failed phase: how long it ran, in ms from its start on the engine's clock (display only). */
      ranMs?: number
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
      /** Absent while warming up, and in Continuous, which sends `continuous` instead. */
      steady?: SteadySoFar
      /** Continuous only: the run's live figures. */
      continuous?: ContinuousSoFar
      /** Continuous only: the coarse cells closed since the previous sample, in order. */
      cells?: ClosedCellEvent[]
      /**
       * The notices raised since the previous sample: `data-used`, and `slow-link-extended` or
       * `data-cap-reached` with their events.
       */
      notices?: Notice[]
      /**
       * The direction events raised since the previous sample (`extended`, `data-cap`), each once,
       * `atMs` on the chart's timeline as in the result's events; a sample that only carries these
       * or notices has no values.
       */
      events?: DirectionEvent[]
      /** Once warm-up has ended: its bucket, on the same axis as `fromBucket` (display only). */
      warmupEndBucket?: number
      /** Upload only, once a request has confirmed: P_start on the server grid, in cells. */
      startBucket?: number
      /**
       * Upload only, once a request has confirmed: this sample's instant on the server grid, in
       * fractional cells, placed by the display-only offset of measurement.md section 7.4.
       */
      sendingBucket?: number
      /** The stream count the ramp has reached (measurement.md section 4). */
      streams: number
      /** The loaded-latency pings answered since the previous sample, atMs from the phase start on the client clock. */
      loadedLatency?: LoadedPing[]
      /** How long the phase has run, in ms on the client clock (display only). */
      phaseMs: number
      dataUsedBytes: number
    }
  /**
   * The resolved settings: after a valid `configure`, those the next run starts from; when a run
   * starts, that run's, its override applied.
   */
  | { type: 'settings'; scope: 'configured' | 'run'; settings: TestSettings }
  /** Idle latency so far, after each ping: its path, the ping counter, the last RTT, the running statistics, the probe-timeout share and how long the phase has run (display only). */
  | { type: 'idle'; path: IdleResult['path']; pings: number; count: number; rttMs?: number; medianMs?: number; minMs?: number; p90Ms?: number; jitterMs?: number; lossPercent?: number; phaseMs: number }
  | { type: 'result'; result: Result }
  | {
      type: 'error'
      code: EngineErrorCode
      messageKey: `errors.${EngineErrorCode}`
      phase?: PhaseName
      partial: boolean
    }
