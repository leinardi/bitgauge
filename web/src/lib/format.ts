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

/**
 * A value scaled by thousands until it reads below 1000 at three significant digits, at most to
 * the last of `units` scales; rounding to three digits can reach 1000, which reads as the next one.
 */
function scaled(value: number, units: number): { value: number; scale: number } {
  let scale = 0
  while (scale < units - 1 && Number(value.toPrecision(3)) >= 1000) {
    value /= 1000
    scale++
  }
  return { value, scale }
}

/** A byte count's number and decimal unit: 500 and MB, 1.5 and GB, 999 and B. */
export function bytesParts(bytes: number, locale: string): { number: string; unit: string } {
  const { value, scale } = scaled(bytes, BYTE_UNITS.length)
  const number = new Intl.NumberFormat(locale, { maximumSignificantDigits: 3 }).format(value)
  return { number, unit: BYTE_UNITS[scale] ?? 'B' }
}

/** A byte count in decimal units: 500 MB, 1.5 GB, 999 B. */
export function formatBytes(bytes: number, locale: string): string {
  const { number, unit } = bytesParts(bytes, locale)
  return `${number}${NBSP}${unit}`
}

const RATE_UNITS = {
  bits: ['kbit/s', 'Mbit/s', 'Gbit/s'],
  bytes: ['kB/s', 'MB/s', 'GB/s'],
} as const

/** A rate in kbit/s (or kB/s), scaled. */
function rateScaled(bitsPerSecond: number, units: 'bits' | 'bytes'): { value: number; scale: number } {
  return scaled((units === 'bytes' ? bitsPerSecond / 8 : bitsPerSecond) / 1000, RATE_UNITS[units].length)
}

/**
 * A rate's number and unit, auto-scaled from kbit/s (or kB/s), with three significant digits,
 * trailing zeros kept (1.00 Mbit/s); `trim` drops them, for round numbers such as a scale's ends.
 */
export function rateParts(bitsPerSecond: number, units: 'bits' | 'bytes', locale: string, trim = false): { number: string; unit: string } {
  const names = RATE_UNITS[units]
  const { value, scale } = rateScaled(bitsPerSecond, units)
  const number = new Intl.NumberFormat(locale, { minimumSignificantDigits: trim ? 1 : 3, maximumSignificantDigits: 3 }).format(value)
  return { number, unit: names[scale] ?? names[0] }
}

const AXIS_FRACTIONS = [0.25, 0.5, 0.75, 1] as const

/**
 * A rate axis's five labels, at 0, a quarter, a half, three quarters and the whole of its maximum
 * (in bit/s). Every tick is in the unit the maximum reads in, so a lower one never reads in another
 * (250, 500, 750 under 1 Gbit/s would say 0.25 Gbit/s three times over), with the decimals that give
 * the top one three significant digits (0.25 … 1.00 Gbit/s, 3.8 … 15.0 Mbit/s); only the top one
 * names the unit, and 0 is bare.
 */
export function rateAxisLabels(maxBitsPerSecond: number, units: 'bits' | 'bytes', locale: string): string[] {
  const { scale } = rateScaled(maxBitsPerSecond, units)
  const names = RATE_UNITS[units]
  const max = maxBitsPerSecond / ((units === 'bytes' ? 8 : 1) * 1000 ** (scale + 1))
  const whole = Math.max(1, Math.floor(Math.log10(Math.max(max, 1))) + 1)
  const digits = Math.max(0, 3 - whole)
  const format = new Intl.NumberFormat(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits })
  return axisTicks((fraction) => format.format(max * fraction), names[scale] ?? names[0])
}

/**
 * A latency axis's five labels: the top one as a latency reads (latencyNumber), with its unit, and
 * every tick with the top one's decimals, "3", "6", "9", "12 ms" or "1.0" … "4.0 ms"
 * (design_system/components/charts.md).
 */
export function latencyAxisLabels(maxMs: number, locale: string): string[] {
  const format = fixedDigits(latencyDigits(maxMs), locale)
  return axisTicks((fraction) => format.format(maxMs * fraction), 'ms')
}

function axisTicks(label: (fraction: number) => string, unit: string): string[] {
  return ['0', ...AXIS_FRACTIONS.map((fraction) => (fraction === 1 ? `${label(fraction)}${NBSP}${unit}` : label(fraction)))]
}

/** A rate with its unit: 94.1 Mbit/s. */
export function formatRate(bitsPerSecond: number, units: 'bits' | 'bytes', locale: string, trim = false): string {
  const { number, unit } = rateParts(bitsPerSecond, units, locale, trim)
  return `${number}${NBSP}${unit}`
}

/**
 * A latency's number in milliseconds: below the timer resolution "< resolution", whole from 10 ms
 * (9.96 rounds to 10) or at a resolution of 1 ms or coarser, one decimal below (screens.md
 * section 6).
 */
export function latencyNumber(ms: number, locale: string, resolutionMs = 0): string {
  if (ms < resolutionMs) {
    return `<${NBSP}${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(resolutionMs)}`
  }
  return fixedDigits(latencyDigits(ms, resolutionMs), locale).format(ms)
}

function latencyDigits(ms: number, resolutionMs = 0): number {
  return resolutionMs >= 1 || ms >= 9.95 ? 0 : 1
}

function fixedDigits(digits: number, locale: string): Intl.NumberFormat {
  return new Intl.NumberFormat(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

/** A latency with its unit: 9.4 ms, 51 ms, < 1 ms. */
export function formatLatency(ms: number, locale: string, resolutionMs = 0): string {
  return `${latencyNumber(ms, locale, resolutionMs)}${NBSP}ms`
}

/** A duration's number of seconds, with one decimal. */
export function secondsNumber(ms: number, locale: string): string {
  return new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(ms / 1000)
}

/** A duration in seconds with one decimal: 12.3 s. */
export function formatDuration(ms: number, locale: string): string {
  return `${secondsNumber(ms, locale)}${NBSP}s`
}

/** A configured limit in whole seconds, as settings give it: 20 s. */
export function formatLimit(ms: number, locale: string): string {
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(ms / 1000)}${NBSP}s`
}

/** A percentage with one decimal: 2.5 %. */
export function formatPercent(percent: number, locale: string): string {
  const number = new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(percent)
  return `${number}${NBSP}%`
}

// Spoken forms, for the live regions (ui/i18n-a11y.md sections 2.1 and 2.7): the same scale and
// digits as the visual forms, with the locale's long unit names (94.1 megabits per second).

const SPOKEN_RATE_UNITS = {
  bits: ['kilobit-per-second', 'megabit-per-second', 'gigabit-per-second'],
  bytes: ['kilobyte-per-second', 'megabyte-per-second', 'gigabyte-per-second'],
} as const
const SPOKEN_BYTE_UNITS = ['byte', 'kilobyte', 'megabyte', 'gigabyte', 'terabyte'] as const

function spoken(value: number, unit: string, locale: string, digits: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(locale, { style: 'unit', unit, unitDisplay: 'long', ...digits }).format(value)
}

/** A rate spoken: 94.1 megabits per second, on the scale and with the digits of formatRate. */
export function spokenRate(bitsPerSecond: number, units: 'bits' | 'bytes', locale: string): string {
  const { value, scale } = rateScaled(bitsPerSecond, units)
  return spoken(value, SPOKEN_RATE_UNITS[units][scale] ?? SPOKEN_RATE_UNITS[units][0], locale, { minimumSignificantDigits: 3, maximumSignificantDigits: 3 })
}

/** A byte count spoken: 1.2 gigabytes, on the scale and with the digits of formatBytes. */
export function spokenBytes(bytes: number, locale: string): string {
  const { value, scale } = scaled(bytes, BYTE_UNITS.length)
  return spoken(value, SPOKEN_BYTE_UNITS[scale] ?? 'byte', locale, { maximumSignificantDigits: 3 })
}

/**
 * A latency spoken with the digits of latencyNumber (51 milliseconds); below the timer resolution,
 * the resolution, `below` set for the caller's "less than".
 */
export function spokenLatency(ms: number, locale: string, resolutionMs = 0): { text: string; below: boolean } {
  if (ms < resolutionMs) {
    return { text: spoken(resolutionMs, 'millisecond', locale, { maximumFractionDigits: 2 }), below: true }
  }
  const digits = resolutionMs >= 1 || ms >= 9.95 ? 0 : 1
  return { text: spoken(ms, 'millisecond', locale, { minimumFractionDigits: digits, maximumFractionDigits: digits }), below: false }
}
