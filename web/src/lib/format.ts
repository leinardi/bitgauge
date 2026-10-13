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
