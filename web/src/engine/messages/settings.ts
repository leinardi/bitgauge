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

// The settings half of the message contract (architecture.md section 4): the phases, the presets
// and the resolved settings `configure` and `start` carry. Re-exported by engine/messages.ts.

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
  ignoredParameters?: IgnoredParameter[]
}

/** A URL parameter whose value was ignored, with the value the link gave, cut to 64 characters. */
export interface IgnoredParameter {
  parameter: string
  value: string
}
