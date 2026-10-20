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

import type { ThemeChoice } from '@/composables/useTheme'
import type { ConfigureOverride, IgnoredParameter, Preset, TestSettings } from '@/engine/messages'
import { isSupportedLocale } from '@/i18n'
import { choose, dataCap, labelValue, MAX_DURATION_S, MAX_RUN_LENGTH_S, MIN_DURATION_S, MIN_RUN_LENGTH_S, runFlag, SECOND, streamsValue, type Test, testPhases, unitsValue, wholeNumber } from '@/lib/urlValues'

// The URL parameters of ui/url-params.md: names match case-insensitively, the first occurrence of
// a name counts, enum values match case-insensitively, an invalid value is ignored and named so
// the run can carry the `url-parameter-ignored` notice, and an unknown name is ignored silently.
// They apply to the page load they appear on and are never stored; the values' parsers are shared
// with the Settings screen (lib/urlValues.ts). Two of them read the resolved preset, the link's,
// else the stored one, else the server's: under Continuous, `test` picks the direction and
// `duration` is the run length, in its own range.

export interface UrlParams {
  /** Whether the link asks for a test after the countdown. */
  run: boolean
  /** The link says `run=0` or `run=false`: a stored Auto-start does not apply to this load. */
  noRun?: true
  test?: Test
  preset?: Preset
  durationMs?: number
  streams?: { mode: 'auto' | 'single' } | { mode: 'fixed'; fixed: number }
  /** A data cap in bytes, or null for none. */
  dataCapBytes?: number | null
  units?: TestSettings['units']
  lang?: string
  theme?: ThemeChoice
  label?: string
  /** The values the link gave `test` and `duration`, which the resolved preset may still ignore. */
  given?: { test?: string; duration?: string }
  /** The parameters whose values were invalid, in the order they appear, with their values. */
  ignored: IgnoredParameter[]
}

/** An ignored value is cut to this many characters (ui/url-params.md section 1). */
const MAX_IGNORED_VALUE = 64

/** An ignored parameter with its value as the link gave it, cut to 64 characters. */
function ignoredParameter(parameter: string, value: string): IgnoredParameter {
  return { parameter, value: [...value].slice(0, MAX_IGNORED_VALUE).join('') }
}

/** Reads one parameter into `params`; false when its value is invalid. */
function read(params: UrlParams, name: string, value: string): boolean {
  switch (name) {
    case 'run': {
      const flag = runFlag(value)
      params.run = flag ?? false
      if (flag === false) {
        params.noRun = true
      }
      return flag !== undefined
    }
    case 'test': {
      const test = choose(value, ['all', 'download', 'upload', 'latency', 'ping'] as const)
      params.test = test === 'ping' ? 'latency' : test
      params.given = { ...params.given, test: value }
      return test !== undefined
    }
    case 'preset':
      params.preset = choose(value, ['quick', 'standard', 'extended', 'continuous'] as const)
      return params.preset !== undefined
    case 'duration': {
      // Within either preset's range here; the resolved preset's range is checked with it.
      const seconds = wholeNumber(value, MIN_DURATION_S, MAX_RUN_LENGTH_S)
      params.durationMs = seconds === undefined ? undefined : seconds * SECOND
      params.given = { ...params.given, duration: value }
      return seconds !== undefined
    }
    case 'streams':
      params.streams = streamsValue(value)
      return params.streams !== undefined
    case 'cap':
      params.dataCapBytes = dataCap(value)
      return params.dataCapBytes !== undefined
    case 'units':
      params.units = unitsValue(value)
      return params.units !== undefined
    case 'lang':
      params.lang = isSupportedLocale(value) ? value.toLowerCase() : undefined
      return params.lang !== undefined
    case 'theme':
      params.theme = choose(value, ['system', 'light', 'dark'] as const)
      return params.theme !== undefined
    case 'label':
      params.label = labelValue(value)
      return params.label !== undefined
    default:
      // An unknown parameter is ignored silently.
      return true
  }
}

/** The parameters of a query string; absent fields keep their stored or server value. */
export function parseUrlParams(search: string): UrlParams {
  const params: UrlParams = { run: false, ignored: [] }
  const seen = new Set<string>()
  for (const [rawName, value] of new URLSearchParams(search)) {
    const name = rawName.toLowerCase()
    if (seen.has(name)) {
      continue
    }
    seen.add(name)
    if (!read(params, name, value)) {
      params.ignored.push(ignoredParameter(name, value))
    }
  }
  // An invalid value leaves its field unset, so nothing of it applies.
  for (const key of Object.keys(params) as (keyof UrlParams)[]) {
    if (params[key] === undefined) {
      Reflect.deleteProperty(params, key)
    }
  }
  return params
}

/**
 * The parameters over `defaults`, the stored settings over the server's, as the override the
 * engine resolves. A bounded preset runs the phases a `test` value names, idle latency first and
 * the directions in the configured order, and takes a `duration` of 5–600 s. Continuous runs the
 * direction `test` names, download for `all`, ignoring `latency`, with idle latency as the stored
 * phases say, and takes a `duration` of 60–604800 s as its run length.
 */
export function urlOverride(params: UrlParams, defaults: TestSettings): { override: ConfigureOverride; ignored: IgnoredParameter[] } {
  const override: ConfigureOverride = {}
  const ignored = [...params.ignored]
  const continuous = (params.preset ?? defaults.preset) === 'continuous'
  if (params.test !== undefined) {
    if (!continuous) {
      override.phases = testPhases(params.test, defaults.phases)
    } else if (params.test === 'latency') {
      ignored.push(ignoredParameter('test', params.given?.test ?? params.test))
      override.continuousDirection = 'download'
    } else {
      override.continuousDirection = params.test === 'upload' ? 'upload' : 'download'
    }
  }
  if (params.preset !== undefined) {
    override.preset = params.preset
  }
  if (params.durationMs !== undefined) {
    const [least, most] = continuous ? [MIN_RUN_LENGTH_S, MAX_RUN_LENGTH_S] : [MIN_DURATION_S, MAX_DURATION_S]
    const seconds = params.durationMs / SECOND
    if (seconds >= least && seconds <= most) {
      override.durationMs = params.durationMs
    } else {
      ignored.push(ignoredParameter('duration', params.given?.duration ?? String(seconds)))
    }
  }
  if (params.streams !== undefined) {
    if (params.streams.mode === 'fixed' && params.streams.fixed > defaults.streams.max) {
      ignored.push(ignoredParameter('streams', String(params.streams.fixed)))
    } else {
      override.streams = { ...defaults.streams, ...params.streams }
    }
  }
  if (params.dataCapBytes !== undefined) {
    override.dataCapBytes = params.dataCapBytes
  }
  if (params.units !== undefined) {
    override.units = params.units
  }
  return { override, ignored }
}

let pageLoad: UrlParams | null = null
let runConsumed = false

/** The parameters of this page load, read once. */
export function useUrlParams(): UrlParams {
  pageLoad ??= parseUrlParams(window.location.search)
  return pageLoad
}

/**
 * Whether the page load asks for an auto-run that has not started yet; true only once. A stored
 * Auto-start asks on every load, as `run=1` does, unless the link says `run=0`.
 */
export function consumeAutoRun(autoStart = false): boolean {
  const params = useUrlParams()
  const run = (params.run || (autoStart && params.noRun !== true)) && !runConsumed
  runConsumed = true
  return run
}
