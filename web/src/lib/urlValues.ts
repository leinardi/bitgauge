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

import type { MeasuringPhase, TestSettings } from '@/engine/messages'

// The values a setting takes where the user types or links it (ui/url-params.md section 2,
// ui/screens.md section 4): the URL parameters' parsers and the ranges the Settings screen and the
// stored settings share with them. Enum values match case-insensitively.

export const SECOND = 1000
export const MIN_DURATION_S = 5
export const MAX_DURATION_S = 600
export const MAX_STREAMS = 6
/** The data cap's floor, 1 MiB (configuration.md section 2.3). */
const MIN_DATA_CAP = 1024 * 1024
export const MAX_LABEL = 64

const SIZE_UNITS: Readonly<Record<string, number>> = { kb: 1e3, mb: 1e6, gb: 1e9, kib: 1024, mib: 1024 ** 2, gib: 1024 ** 3 }

/** The value of an enum parameter, matched case-insensitively. */
export function choose<T extends string>(value: string, choices: readonly T[]): T | undefined {
  const lower = value.toLowerCase()
  return choices.find((choice) => choice === lower)
}

/** A whole number written in digits only, within `least` and `most`. */
export function wholeNumber(value: string, least: number, most: number): number | undefined {
  if (!/^\d+$/.test(value)) {
    return undefined
  }
  const number = Number(value)
  return number >= least && number <= most ? number : undefined
}

/** `run`: present, `1` or `true` starts; `0` or `false` does not. */
export function runFlag(value: string): boolean | undefined {
  const lower = value.toLowerCase()
  if (lower === '' || lower === '1' || lower === 'true') {
    return true
  }
  return lower === '0' || lower === 'false' ? false : undefined
}

/** A data cap: integer bytes, or a number with a decimal or binary unit; `0` or `none` for no cap. */
export function dataCap(value: string): number | null | undefined {
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

/** A stream mode: `auto`, `single`, or a fixed count of 1–6. */
export function streamsValue(value: string): { mode: 'auto' | 'single' } | { mode: 'fixed'; fixed: number } | undefined {
  const mode = choose(value, ['auto', 'single'] as const)
  if (mode !== undefined) {
    return { mode }
  }
  const fixed = wholeNumber(value, 1, MAX_STREAMS)
  return fixed === undefined ? undefined : { mode: 'fixed', fixed }
}

/** A result label of at most 64 characters. */
export function labelValue(value: string): string | undefined {
  return [...value].length <= MAX_LABEL ? value : undefined
}

/** The display units. */
export function unitsValue(value: string): TestSettings['units'] | undefined {
  return choose(value, ['bits', 'bytes'] as const)
}

export type Test = 'all' | 'download' | 'upload' | 'latency'

/**
 * The phases a `test` value runs: idle latency with both directions, or with one, or alone; the
 * directions keep the order of the configured phases.
 */
export function testPhases(test: Test, configured: readonly MeasuringPhase[]): MeasuringPhase[] {
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
