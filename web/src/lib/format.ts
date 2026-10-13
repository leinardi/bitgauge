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

// Number formatting of ui/i18n-a11y.md section 1.3: Intl with the active locale, three significant
// digits, BitGauge's decimal units, and a non-breaking space between number and unit.

const NBSP = '\u00a0'
const BYTE_UNITS = ['B', 'kB', 'MB', 'GB', 'TB'] as const

/** A byte count in decimal units: 500 MB, 1.5 GB, 999 B. */
export function formatBytes(bytes: number, locale: string): string {
  let unit = 0
  let value = bytes
  // Rounding to three digits can reach 1000, which reads as the next unit.
  while (unit < BYTE_UNITS.length - 1 && Number(value.toPrecision(3)) >= 1000) {
    value /= 1000
    unit++
  }
  const number = new Intl.NumberFormat(locale, { maximumSignificantDigits: 3 }).format(value)
  return `${number}${NBSP}${BYTE_UNITS[unit] ?? 'B'}`
}

const RATE_UNITS = {
  bits: ['kbit/s', 'Mbit/s', 'Gbit/s'],
  bytes: ['kB/s', 'MB/s', 'GB/s'],
} as const

/**
 * A rate's number and unit, auto-scaled from kbit/s (or kB/s), with three significant digits,
 * trailing zeros kept (1.00 Mbit/s); `trim` drops them, for round numbers such as a scale's ends.
 */
export function rateParts(bitsPerSecond: number, units: 'bits' | 'bytes', locale: string, trim = false): { number: string; unit: string } {
  const names = RATE_UNITS[units]
  let unit = 0
  let value = (units === 'bytes' ? bitsPerSecond / 8 : bitsPerSecond) / 1000
  while (unit < names.length - 1 && Number(value.toPrecision(3)) >= 1000) {
    value /= 1000
    unit++
  }
  const number = new Intl.NumberFormat(locale, { minimumSignificantDigits: trim ? 1 : 3, maximumSignificantDigits: 3 }).format(value)
  return { number, unit: names[unit] ?? names[0] }
}

/** A rate with its unit: 94.1 Mbit/s. */
export function formatRate(bitsPerSecond: number, units: 'bits' | 'bytes', locale: string, trim = false): string {
  const { number, unit } = rateParts(bitsPerSecond, units, locale, trim)
  return `${number}${NBSP}${unit}`
}

/** A latency's number in milliseconds: whole from 10 ms (9.96 rounds to 10), one decimal below. */
export function latencyNumber(ms: number, locale: string): string {
  const digits = ms >= 9.95 ? 0 : 1
  return new Intl.NumberFormat(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(ms)
}
