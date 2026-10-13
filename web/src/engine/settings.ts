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

import type { DurationBounds, MeasuringPhase, SettingsOverride, TestSettings } from '@/engine/messages'
import { PRESETS } from '@/engine/presets'

// Settings resolution (architecture.md section 4): the configured settings, a run's override on
// top, then validation against the ranges of configuration.md section 2.3 and the `duration` and
// `label` URL parameters. Anything invalid fails the whole command with invalid-settings.

const SECOND = 1000
const MIN_DURATION_MS = 5 * SECOND
const MAX_DURATION_MS = 600 * SECOND
const MAX_STREAMS = 6
const MIN_DATA_CAP = 1024 * 1024
const MIN_WARMUP_MS = SECOND
const MAX_WARMUP_MS = 60 * SECOND
const MIN_PINGS = 6
const MAX_PINGS = 200
const MAX_COMPENSATION = 20
const MAX_LABEL = 64
const PHASES: readonly MeasuringPhase[] = ['idle', 'download', 'upload']

/** The settings of one run, with the labels the result carries. */
export interface RunSettings extends TestSettings {
  label?: string
  contextLabel?: string
}

export type Resolution =
  | { ok: true; settings: RunSettings }
  /** `field` names the first invalid setting, for diagnostics; the UI words only the code. */
  | { ok: false; code: 'invalid-settings'; field: string }

function isInteger(value: unknown, least: number, most: number): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value >= least && value <= most
}

/** The configured settings with another preset's durations, ping count and stream mode. */
function withPreset(configured: TestSettings, preset: TestSettings['preset']): TestSettings {
  const table = PRESETS[preset]
  const streams =
    table.streams.mode === 'fixed'
      ? // A preset's fixed count stays within the configured maximum.
        { ...configured.streams, mode: table.streams.mode, fixed: Math.min(table.streams.fixed, configured.streams.max) }
      : { ...configured.streams, mode: table.streams.mode }
  return {
    ...configured,
    preset,
    streams,
    download: { ...table.download },
    upload: { ...table.upload },
    pingCount: table.pingCount,
  }
}

/** The bounds with the `duration` rule: the maximum is it, the minimum at most it. */
function capped(bounds: DurationBounds, durationMs: number): DurationBounds {
  return { minMs: Math.min(bounds.minMs, durationMs), maxMs: durationMs }
}

/** Resolves the settings of a run: `override` on top of `configured`, then validated. */
export function resolveSettings(configured: TestSettings, override: SettingsOverride = {}): Resolution {
  const { durationMs, label, contextLabel, ...fields } = override
  const preset = fields.preset ?? configured.preset
  if (!Object.hasOwn(PRESETS, preset)) {
    return { ok: false, code: 'invalid-settings', field: 'preset' }
  }
  const base = preset === configured.preset ? configured : withPreset(configured, preset)
  const merged = { ...base, ...fields }
  // Nothing of the run's settings is shared with the configured settings or the override.
  const settings: RunSettings = {
    ...merged,
    phases: [...merged.phases],
    streams: { ...merged.streams },
    download: { ...merged.download },
    upload: { ...merged.upload },
  }

  if (durationMs !== undefined) {
    if (!isInteger(durationMs / SECOND, MIN_DURATION_MS / SECOND, MAX_DURATION_MS / SECOND)) {
      return { ok: false, code: 'invalid-settings', field: 'durationMs' }
    }
    settings.download = capped(settings.download, durationMs)
    settings.upload = capped(settings.upload, durationMs)
  }
  if (label !== undefined) {
    settings.label = label
  }
  if (contextLabel !== undefined) {
    settings.contextLabel = contextLabel
  }

  const field = invalidField(settings)
  return field === null ? { ok: true, settings } : { ok: false, code: 'invalid-settings', field }
}

/** The first setting outside its range, or null when every one is valid. */
function invalidField(settings: RunSettings): string | null {
  const checks: [string, boolean][] = [
    ['phases', validPhases(settings.phases)],
    ['streams.mode', ['auto', 'fixed', 'single'].includes(settings.streams.mode)],
    ['streams.max', isInteger(settings.streams.max, 1, MAX_STREAMS)],
    ['streams.fixed', isInteger(settings.streams.fixed, 1, settings.streams.max)],
    ['download', validBounds(settings.download)],
    ['upload', validBounds(settings.upload)],
    ['dataCapBytes', settings.dataCapBytes === null || isInteger(settings.dataCapBytes, MIN_DATA_CAP, Infinity)],
    ['units', settings.units === 'bits' || settings.units === 'bytes'],
    ['warmup', settings.warmup === 'auto' || isInteger(settings.warmup, MIN_WARMUP_MS, MAX_WARMUP_MS)],
    ['pingCount', isInteger(settings.pingCount, MIN_PINGS, MAX_PINGS)],
    [
      'overheadCompensationPercent',
      Number.isFinite(settings.overheadCompensationPercent) &&
        settings.overheadCompensationPercent >= 0 &&
        settings.overheadCompensationPercent <= MAX_COMPENSATION,
    ],
    ['label', settings.label === undefined || [...settings.label].length <= MAX_LABEL],
  ]
  return checks.find(([, valid]) => !valid)?.[0] ?? null
}

/** A non-empty list of measuring phases without duplicates, idle first when present. */
function validPhases(phases: readonly MeasuringPhase[]): boolean {
  return (
    phases.length > 0 &&
    phases.every((phase) => PHASES.includes(phase)) &&
    new Set(phases).size === phases.length &&
    (!phases.includes('idle') || phases[0] === 'idle')
  )
}

/** A duration range of 5 s to 10 min with the maximum not below the minimum. */
function validBounds(bounds: DurationBounds): boolean {
  return (
    isInteger(bounds.minMs, MIN_DURATION_MS, MAX_DURATION_MS) &&
    isInteger(bounds.maxMs, bounds.minMs, MAX_DURATION_MS)
  )
}
