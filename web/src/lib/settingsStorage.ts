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

import { type Direction, type DurationBounds, type MeasuringPhase, type Preset, PRESETS, type TestSettings } from '@/engine/messages'
import { MAX_DURATION_S, MAX_LABEL, MAX_RUN_LENGTH_S, MAX_STREAMS, MIN_DURATION_S, MIN_RUN_LENGTH_S, SECOND } from '@/lib/urlValues'

// The settings stored in this browser (frontend.md section 4, ui/screens.md section 4): one sparse
// object under `bitgauge.settings.v1` holding only the fields the user set, in the engine's units.
// A field that is missing or outside its range is not applied; a field this version does not know
// is kept as it is, and every write leaves the other fields alone. Storage that is unreadable or
// refuses a write leaves the defaults in effect for this page. A field the chosen preset does not use
// (the durations under Continuous, its direction and run length under a bounded preset) stays
// stored as it is, for when a preset that uses it is chosen again.

export const SETTINGS_KEY = 'bitgauge.settings.v1'

export type ThemeChoice = 'light' | 'dark' | 'system'

export interface StoredSettings {
  theme?: ThemeChoice
  lang?: string
  preset?: Preset
  phases?: MeasuringPhase[]
  /** The stream mode and fixed count; the maximum is always the server's. */
  streams?: { mode: TestSettings['streams']['mode']; fixed: number }
  download?: DurationBounds
  upload?: DurationBounds
  /** Continuous only: the one direction it runs. */
  continuousDirection?: Direction
  /** Continuous only: the run length in whole seconds; absent means none. */
  runLengthS?: number
  dataCapBytes?: number | null
  units?: TestSettings['units']
  autoStart?: { enabled: boolean; countdownS: number }
  warmup?: TestSettings['warmup']
  pingCount?: number
  overheadCompensationPercent?: number
  /** The result label that pre-fills every result in this browser. */
  label?: string
}

export type StoredKey = keyof StoredSettings

/** What the stored settings read and write; the browser's localStorage in the application. */
export type SettingsStorage = Pick<Storage, 'getItem' | 'setItem'>

export const MIN_CAP_MB = 2
export const MAX_CAP_MB = 100_000
export const MB = 1e6
export const MIN_COUNTDOWN_S = 1
export const MAX_COUNTDOWN_S = 30
export const MIN_WARMUP_S = 1
export const MAX_WARMUP_S = 60
export const MIN_PINGS = 6
export const MAX_PINGS = 200
const MAX_OVERHEAD = 20

const PHASES: readonly MeasuringPhase[] = ['idle', 'download', 'upload']

function integer(value: unknown, least: number, most: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= least && value <= most
}

function seconds(value: unknown, least: number, most: number): value is number {
  return typeof value === 'number' && value % SECOND === 0 && integer(value / SECOND, least, most)
}

function bounds(value: unknown): value is DurationBounds {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const { minMs, maxMs } = value as Partial<DurationBounds>
  return seconds(minMs, MIN_DURATION_S, MAX_DURATION_S) && seconds(maxMs, MIN_DURATION_S, MAX_DURATION_S) && minMs <= maxMs
}

/** A non-empty list of measuring phases without duplicates, idle first when present. */
function phases(value: unknown): value is MeasuringPhase[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((phase) => PHASES.includes(phase as MeasuringPhase)) &&
    new Set(value).size === value.length &&
    (!value.includes('idle') || value[0] === 'idle')
  )
}

const VALID: { readonly [K in StoredKey]-?: (value: unknown) => boolean } = {
  theme: (value) => value === 'light' || value === 'dark' || value === 'system',
  lang: (value) => typeof value === 'string' && /^[a-z]{2,3}(-[a-z0-9]{2,8})*$/i.test(value),
  preset: (value) => value === 'quick' || value === 'standard' || value === 'extended' || value === 'continuous',
  phases,
  streams: (value) => {
    const streams = value as StoredSettings['streams']
    return typeof streams === 'object' && streams !== null && ['auto', 'fixed', 'single'].includes(streams.mode) && integer(streams.fixed, 1, MAX_STREAMS)
  },
  download: bounds,
  upload: bounds,
  continuousDirection: (value) => value === 'download' || value === 'upload',
  runLengthS: (value) => integer(value, MIN_RUN_LENGTH_S, MAX_RUN_LENGTH_S),
  dataCapBytes: (value) => value === null || (typeof value === 'number' && value % MB === 0 && integer(value / MB, MIN_CAP_MB, MAX_CAP_MB)),
  units: (value) => value === 'bits' || value === 'bytes',
  autoStart: (value) => {
    const auto = value as StoredSettings['autoStart']
    return typeof auto === 'object' && auto !== null && typeof auto.enabled === 'boolean' && integer(auto.countdownS, MIN_COUNTDOWN_S, MAX_COUNTDOWN_S)
  },
  warmup: (value) => value === 'auto' || seconds(value, MIN_WARMUP_S, MAX_WARMUP_S),
  pingCount: (value) => integer(value, MIN_PINGS, MAX_PINGS),
  overheadCompensationPercent: (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= MAX_OVERHEAD,
  label: (value) => typeof value === 'string' && [...value].length <= MAX_LABEL,
}

/** The stored object as it is, unknown fields included; empty when unreadable or malformed. */
function raw(storage: SettingsStorage): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(SETTINGS_KEY) ?? '{}')
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {}
  } catch {
    // Unreadable storage or a malformed value: the defaults apply.
    return {}
  }
}

/** The stored fields this version knows and can apply. */
export function readStored(storage: SettingsStorage): StoredSettings {
  const stored = raw(storage)
  const settings: Record<string, unknown> = {}
  for (const key of Object.keys(VALID) as StoredKey[]) {
    if (Object.hasOwn(stored, key) && VALID[key](stored[key])) {
      settings[key] = stored[key]
    }
  }
  return settings as StoredSettings
}

/**
 * Sets the fields of `set` and removes those of `remove`, keeping every other field, the ones
 * this version does not know included; false when the storage refused it.
 */
export function writeStored(storage: SettingsStorage, set: StoredSettings, remove: readonly StoredKey[] = []): boolean {
  const stored = raw(storage)
  for (const key of remove) {
    Reflect.deleteProperty(stored, key)
  }
  try {
    storage.setItem(SETTINGS_KEY, JSON.stringify({ ...stored, ...set }))
    return true
  } catch {
    // Storage refused (private mode, quota): the change still applies for this page.
    return false
  }
}

/** The Auto-start a browser has before the user sets one: off, with a 3 s countdown. */
export const DEFAULT_AUTO_START: NonNullable<StoredSettings['autoStart']> = { enabled: false, countdownS: 3 }

/**
 * The settings with a preset's stream mode, durations and ping count, as the engine resolves a
 * preset: Continuous runs download unless the settings name its direction.
 */
function withPreset(defaults: TestSettings, preset: Preset): TestSettings {
  const table = PRESETS[preset]
  // A preset's fixed count stays within the server's maximum.
  const fixed = table.streams.mode === 'fixed' ? Math.min(table.streams.fixed, defaults.streams.max) : defaults.streams.fixed
  return {
    ...defaults,
    preset,
    streams: { ...defaults.streams, mode: table.streams.mode, fixed },
    download: { ...table.download },
    upload: { ...table.upload },
    pingCount: table.pingCount,
  }
}

/** Whether the preset leaves a stored field unused: the durations under Continuous, its fields under a bounded preset. */
function unused(key: StoredKey, preset: Preset): boolean {
  return preset === 'continuous' ? key === 'download' || key === 'upload' : key === 'continuousDirection' || key === 'runLengthS'
}

/**
 * The stored settings over the server defaults: a stored preset brings its values, the other
 * stored fields win over them, those the preset does not use aside: Continuous keeps its absent
 * bounds and a bounded preset has no direction or run length. A fixed stream mode whose count is
 * above the server's maximum is not applied; another mode keeps its count within the maximum.
 */
export function storedOver(defaults: TestSettings, stored: StoredSettings): TestSettings {
  const preset = stored.preset ?? defaults.preset
  const { continuousDirection, runLengthMs, ...base } = preset === defaults.preset ? defaults : withPreset(defaults, preset)
  const { max } = base.streams
  const streams =
    stored.streams === undefined || (stored.streams.mode === 'fixed' && stored.streams.fixed > max)
      ? base.streams
      : { mode: stored.streams.mode, fixed: Math.min(stored.streams.fixed, max), max }
  const continuous = preset === 'continuous'
  const runLength = stored.runLengthS === undefined ? runLengthMs : stored.runLengthS * SECOND
  return {
    ...base,
    phases: [...(stored.phases ?? base.phases)],
    streams: { ...streams },
    download: { ...(continuous ? base.download : (stored.download ?? base.download)) },
    upload: { ...(continuous ? base.upload : (stored.upload ?? base.upload)) },
    ...(continuous ? { continuousDirection: stored.continuousDirection ?? continuousDirection ?? 'download', ...(runLength === undefined ? {} : { runLengthMs: runLength }) } : {}),
    dataCapBytes: stored.dataCapBytes === undefined ? base.dataCapBytes : stored.dataCapBytes,
    units: stored.units ?? base.units,
    warmup: stored.warmup ?? base.warmup,
    pingCount: stored.pingCount ?? base.pingCount,
    overheadCompensationPercent: stored.overheadCompensationPercent ?? base.overheadCompensationPercent,
  }
}

/** A stream setting as it counts: the count only for a fixed mode. */
export function streamsShown(streams: { mode: TestSettings['streams']['mode']; fixed: number }): { mode: TestSettings['streams']['mode']; fixed?: number } {
  return streams.mode === 'fixed' ? { mode: streams.mode, fixed: streams.fixed } : { mode: streams.mode }
}

/** The value a field has with these stored settings over the defaults. */
export function valueOf(key: StoredKey, defaults: TestSettings, stored: StoredSettings): unknown {
  switch (key) {
    case 'theme':
      return stored.theme ?? 'system'
    case 'lang':
      return stored.lang ?? null
    case 'autoStart':
      return stored.autoStart ?? DEFAULT_AUTO_START
    case 'label':
      return stored.label ?? ''
    case 'streams':
      return streamsShown(storedOver(defaults, stored).streams)
    case 'continuousDirection':
      return storedOver(defaults, stored).continuousDirection ?? null
    case 'runLengthS': {
      const ms = storedOver(defaults, stored).runLengthMs
      return ms === undefined ? null : ms / SECOND
    }
    default:
      return storedOver(defaults, stored)[key]
  }
}

function without(stored: StoredSettings, key: StoredKey): StoredSettings {
  const rest = { ...stored }
  Reflect.deleteProperty(rest, key)
  return rest
}

/** The value a field would have if it were not stored: its default under the other stored fields. */
export function defaultOf(key: StoredKey, defaults: TestSettings, stored: StoredSettings): unknown {
  return valueOf(key, defaults, without(stored, key))
}

/** Whether two plain values (numbers, strings, arrays, objects) are the same. */
export function same(a: unknown, b: unknown): boolean {
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) {
    return a === b
  }
  const keys = Object.keys(a)
  return keys.length === Object.keys(b).length && keys.every((key) => same((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]))
}

/** The stored fields the chosen preset does not use, which stay stored and count as no change. */
function unusedKeys(defaults: TestSettings, stored: StoredSettings): Set<StoredKey> {
  const { preset } = storedOver(defaults, stored)
  return new Set((Object.keys(stored) as StoredKey[]).filter((key) => unused(key, preset)))
}

/** The stored fields whose value differs from their default, in the order they are stored. */
export function changedKeys(defaults: TestSettings, stored: StoredSettings): StoredKey[] {
  const idle = unusedKeys(defaults, stored)
  return (Object.keys(stored) as StoredKey[]).filter((key) => !idle.has(key) && !same(valueOf(key, defaults, stored), defaultOf(key, defaults, stored)))
}

/**
 * The stored settings without the fields that equal their default, one at a time, since a field's
 * default can follow another field: what the user set and still differs stays stored, and so does
 * a field the chosen preset does not use. A stored language always differs, its default being the
 * browser's.
 */
export function pruned(defaults: TestSettings, stored: StoredSettings): StoredSettings {
  let next = stored
  for (;;) {
    const changed = new Set(changedKeys(defaults, next))
    const idle = unusedKeys(defaults, next)
    const drop = (Object.keys(next) as StoredKey[]).find((key) => !changed.has(key) && !idle.has(key))
    if (drop === undefined) {
      return next
    }
    next = without(next, drop)
  }
}
