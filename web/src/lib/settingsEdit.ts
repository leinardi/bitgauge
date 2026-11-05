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

import { urlOverride, type UrlParams } from '@/composables/useUrlParams'
import { resolveSettings, type TestSettings } from '@/engine/messages'
import { defaultOf, same, storedContinuous, type StoredKey, type StoredSettings, storedOver, valueIn } from '@/lib/settingsStorage'
import { SECOND } from '@/lib/urlValues'

// A Settings edit over the URL parameters of the page load (ui/flows.md section 9, D-9): a field a
// parameter sets shows the link's value, marked; an edit is stored, takes effect at once, and every
// parameter that governs the field leaves the address, so the next run uses the edit. A `preset`
// parameter governs the fields its preset brings, but only while it differs from the stored
// preset; editing one of them first stores the link's preset with the values it brings, so the
// fields not edited keep them. Parameters that do not govern the field stay.

/** The URL parameters a Settings edit can drop, which Reset all drops together. */
export const URL_PARAM_NAMES = ['preset', 'test', 'duration', 'streams', 'cap', 'units', 'lang', 'theme', 'label'] as const
export type UrlParamName = (typeof URL_PARAM_NAMES)[number]

/** Each editable setting, with the URL parameters that can set it. */
const GOVERNING: Partial<Record<StoredKey, readonly UrlParamName[]>> = {
  preset: ['preset'],
  phases: ['test'],
  continuousDirection: ['test', 'preset'],
  download: ['duration', 'preset'],
  upload: ['duration', 'preset'],
  runLengthS: ['duration', 'preset'],
  pingCount: ['preset'],
  streams: ['streams', 'preset'],
  dataCapBytes: ['cap'],
  units: ['units'],
  label: ['label'],
  theme: ['theme'],
  lang: ['lang'],
}

/** The settings only a bounded preset runs with, and those only Continuous runs with. */
const BOUNDED_ONLY: ReadonlySet<StoredKey> = new Set(['download', 'upload'])
const CONTINUOUS_ONLY: ReadonlySet<StoredKey> = new Set(['continuousDirection', 'runLengthS'])

/** The settings a run would use: the stored settings over the defaults, the URL parameters over them. */
export function linkedSettings(defaults: TestSettings, stored: StoredSettings, url: UrlParams): TestSettings {
  const base = storedOver(defaults, stored)
  const resolved = resolveSettings(base, urlOverride(url, base, storedContinuous(stored)).override)
  if (!resolved.ok) {
    return base
  }
  const { label: _label, contextLabel: _context, ignoredParameters: _ignored, ...settings } = resolved.settings
  return settings
}

/** The parameters that apply over these stored settings, each only where it changes a setting. */
function inEffect(defaults: TestSettings, stored: StoredSettings, url: UrlParams): Set<UrlParamName> {
  const base = storedOver(defaults, stored)
  const { override } = urlOverride(url, base, storedContinuous(stored))
  const on = new Set<UrlParamName>()
  const add = (name: UrlParamName, applies: boolean) => applies && on.add(name)
  add('preset', override.preset !== undefined && override.preset !== base.preset)
  add('test', url.test !== undefined && (override.phases !== undefined || override.continuousDirection !== undefined))
  add('duration', override.durationMs !== undefined)
  add('streams', override.streams !== undefined)
  add('cap', override.dataCapBytes !== undefined)
  add('units', override.units !== undefined)
  add('lang', url.lang !== undefined)
  add('theme', url.theme !== undefined)
  add('label', url.label !== undefined)
  return on
}

/**
 * The parameters in effect that govern `key`: `test` the phases of a bounded preset or the
 * direction of Continuous, `duration` the bounds of a bounded preset or the run length of Continuous.
 */
function governing(key: StoredKey, defaults: TestSettings, stored: StoredSettings, url: UrlParams): UrlParamName[] {
  const on = inEffect(defaults, stored, url)
  const continuous = linkedSettings(defaults, stored, url).preset === 'continuous'
  const fits = (name: UrlParamName) => {
    if (name === 'preset' && (BOUNDED_ONLY.has(key) || CONTINUOUS_ONLY.has(key))) {
      // The link's preset brings bounds or a run length, whichever of the two it runs with.
      return continuous === CONTINUOUS_ONLY.has(key)
    }
    if (name === 'test') {
      return continuous === (key === 'continuousDirection')
    }
    if (name === 'duration') {
      return continuous === (key === 'runLengthS')
    }
    return true
  }
  return (GOVERNING[key] ?? []).filter((name) => on.has(name) && fits(name))
}

/** The settings the link sets for this page load: what Settings marks "from the link". */
export function linkedKeys(defaults: TestSettings, stored: StoredSettings, url: UrlParams): Set<StoredKey> {
  return new Set((Object.keys(GOVERNING) as StoredKey[]).filter((key) => governing(key, defaults, stored, url).length > 0))
}

/** The value a field shows: the run's, with the link's theme, language and label. */
export function linkedValueOf(key: StoredKey, defaults: TestSettings, stored: StoredSettings, url: UrlParams): unknown {
  const own = { ...stored, ...(url.theme === undefined ? {} : { theme: url.theme }), ...(url.lang === undefined ? {} : { lang: url.lang }), ...(url.label === undefined ? {} : { label: url.label }) }
  return valueIn(key, linkedSettings(defaults, stored, url), own)
}

/** A field's default under the effective preset, not a stored value masked by the link. */
export function linkedDefaultOf(key: StoredKey, defaults: TestSettings, stored: StoredSettings, url: UrlParams): unknown {
  return defaultOf(key, defaults, { preset: linkedSettings(defaults, stored, url).preset })
}

/** Effective differences only; preset-implied values and fields unused by this preset are not custom. */
export function linkedChangedKeys(defaults: TestSettings, stored: StoredSettings, url: UrlParams): StoredKey[] {
  const { preset } = linkedSettings(defaults, stored, url)
  const unused = preset === 'continuous' ? BOUNDED_ONLY : CONTINUOUS_ONLY
  const candidates = new Set([...Object.keys(stored) as StoredKey[], ...linkedKeys(defaults, stored, url)])
  return [...candidates].filter((key) => !unused.has(key) && !same(linkedValueOf(key, defaults, stored, url), linkedDefaultOf(key, defaults, stored, url)))
}

/** The stored settings with `preset` and the values it brings over them, as the engine resolves it. */
function materialized(defaults: TestSettings, stored: StoredSettings, preset: NonNullable<UrlParams['preset']>): StoredSettings {
  const resolved = resolveSettings(storedOver(defaults, stored), { preset, ...(preset === 'continuous' ? storedContinuous(stored) : {}) })
  if (!resolved.ok) {
    return { ...stored, preset }
  }
  const { streams, pingCount, download, upload, continuousDirection, runLengthMs } = resolved.settings
  const next: StoredSettings = { ...stored, preset, streams: { mode: streams.mode, fixed: streams.fixed }, pingCount }
  if (preset !== 'continuous') {
    return download.minMs === null || upload.minMs === null ? next : { ...next, download: { ...download }, upload: { ...upload } }
  }
  const { runLengthS: _runLength, ...rest } = next
  return { ...rest, continuousDirection: continuousDirection ?? 'download', ...(runLengthMs === undefined ? {} : { runLengthS: runLengthMs / SECOND }) }
}

/**
 * The stored settings after `field` is set to `value` (absent for undefined) on the Settings
 * screen, and the URL parameters to drop from the page load: those that govern the field. When
 * `preset` is one of them, the link's preset is stored first with the values it brings.
 */
export function applyEdit<K extends StoredKey>(
  defaults: TestSettings,
  stored: StoredSettings,
  url: UrlParams,
  field: K,
  value: StoredSettings[K],
): { stored: StoredSettings; drop: UrlParamName[] } {
  const drop = governing(field, defaults, stored, url)
  const base = drop.includes('preset') && field !== 'preset' && url.preset !== undefined ? materialized(defaults, stored, url.preset) : stored
  const next: StoredSettings = { ...base, [field]: value }
  if (value === undefined) {
    Reflect.deleteProperty(next, field)
  }
  return { stored: next, drop }
}
