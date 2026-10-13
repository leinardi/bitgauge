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
import type { ConfigureOverride, MeasuringPhase, Preset, TestSettings } from '@/engine/messages'
import { isSupportedLocale } from '@/i18n'

// The URL parameters of ui/url-params.md: names match case-insensitively, the first occurrence of
// a name counts, enum values match case-insensitively, an invalid value is ignored and named so
// the run can carry the `url-parameter-ignored` notice, and an unknown name is ignored silently.
// They apply to the page load they appear on and are never stored.

type Test = 'all' | 'download' | 'upload' | 'latency'

export interface UrlParams {
  /** Whether the link asks for a test after the countdown. */
  run: boolean
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
  /** The parameters whose values were invalid, in the order they appear. */
  ignored: string[]
}

const SECOND = 1000
const MIN_DURATION_S = 5
const MAX_DURATION_S = 600
const MAX_STREAMS = 6
const MIN_DATA_CAP = 1024 * 1024
const MAX_LABEL = 64
const SIZE_UNITS: Readonly<Record<string, number>> = { kb: 1e3, mb: 1e6, gb: 1e9, kib: 1024, mib: 1024 ** 2, gib: 1024 ** 3 }

/** The value of an enum parameter, matched case-insensitively. */
function choose<T extends string>(value: string, choices: readonly T[]): T | undefined {
  const lower = value.toLowerCase()
  return choices.find((choice) => choice === lower)
}

function wholeNumber(value: string, least: number, most: number): number | undefined {
  if (!/^\d+$/.test(value)) {
    return undefined
  }
  const number = Number(value)
  return number >= least && number <= most ? number : undefined
}

function runFlag(value: string): boolean | undefined {
  const lower = value.toLowerCase()
  if (lower === '' || lower === '1' || lower === 'true') {
    return true
  }
  return lower === '0' || lower === 'false' ? false : undefined
}

/** A data cap: integer bytes, or a number with a decimal or binary unit; `0` or `none` for no cap. */
function dataCap(value: string): number | null | undefined {
  const lower = value.toLowerCase()
  if (lower === '0' || lower === 'none') {
    return null
  }
  const match = /^(\d+(?:\.\d+)?)(kb|mb|gb|kib|mib|gib)?$/.exec(lower)
  if (match === null || (match[2] === undefined && match[1]?.includes('.') === true)) {
    return undefined
  }
  const bytes = Math.round(Number(match[1]) * (match[2] === undefined ? 1 : (SIZE_UNITS[match[2]] ?? 1)))
  return bytes >= MIN_DATA_CAP ? bytes : undefined
}

function streams(value: string): UrlParams['streams'] {
  const mode = choose(value, ['auto', 'single'] as const)
  if (mode !== undefined) {
    return { mode }
  }
  const fixed = wholeNumber(value, 1, MAX_STREAMS)
  return fixed === undefined ? undefined : { mode: 'fixed', fixed }
}

/** Reads one parameter into `params`; false when its value is invalid. */
function read(params: UrlParams, name: string, value: string): boolean {
  switch (name) {
    case 'run': {
      const flag = runFlag(value)
      params.run = flag ?? false
      return flag !== undefined
    }
    case 'test': {
      const test = choose(value, ['all', 'download', 'upload', 'latency', 'ping'] as const)
      params.test = test === 'ping' ? 'latency' : test
      return test !== undefined
    }
    case 'preset':
      // Continuous is a v0.3 preset: v0.1 ignores it like any invalid value.
      params.preset = choose(value, ['quick', 'standard', 'extended'] as const)
      return params.preset !== undefined
    case 'duration': {
      const seconds = wholeNumber(value, MIN_DURATION_S, MAX_DURATION_S)
      params.durationMs = seconds === undefined ? undefined : seconds * SECOND
      return seconds !== undefined
    }
    case 'streams':
      params.streams = streams(value)
      return params.streams !== undefined
    case 'cap':
      params.dataCapBytes = dataCap(value)
      return params.dataCapBytes !== undefined
    case 'units':
      params.units = choose(value, ['bits', 'bytes'] as const)
      return params.units !== undefined
    case 'lang':
      params.lang = isSupportedLocale(value) ? value.toLowerCase() : undefined
      return params.lang !== undefined
    case 'theme':
      params.theme = choose(value, ['system', 'light', 'dark'] as const)
      return params.theme !== undefined
    case 'label':
      params.label = [...value].length <= MAX_LABEL ? value : undefined
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
      params.ignored.push(name)
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

/** The phases a `test` value runs: idle latency first, the directions in the configured order. */
function phases(test: Test, configured: readonly MeasuringPhase[]): MeasuringPhase[] {
  const order = configured.filter((phase) => phase !== 'idle')
  const directions = [...order, ...(['download', 'upload'] as const).filter((phase) => !order.includes(phase))]
  switch (test) {
    case 'all':
      return ['idle', ...directions]
    case 'latency':
      return ['idle']
    default:
      return ['idle', test]
  }
}

/**
 * The parameters as the settings `configure` resolves over the server defaults, and every
 * parameter ignored: a fixed stream count above the server's maximum is invalid there too.
 */
export function urlOverride(params: UrlParams, defaults: TestSettings): { override: ConfigureOverride; ignored: string[] } {
  const override: ConfigureOverride = {}
  const ignored = [...params.ignored]
  if (params.test !== undefined) {
    override.phases = phases(params.test, defaults.phases)
  }
  if (params.preset !== undefined) {
    override.preset = params.preset
  }
  if (params.durationMs !== undefined) {
    override.durationMs = params.durationMs
  }
  if (params.streams !== undefined) {
    if (params.streams.mode === 'fixed' && params.streams.fixed > defaults.streams.max) {
      ignored.push('streams')
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

/** Whether the page load asked for an auto-run that has not started yet; true only once. */
export function consumeAutoRun(): boolean {
  const run = useUrlParams().run && !runConsumed
  runConsumed = true
  return run
}
