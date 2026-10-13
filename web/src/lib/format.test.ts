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

// Decimal bytes and rates with three significant digits and a non-breaking space; latencies whole
// from 10 ms and with one decimal below.

import { describe, expect, it } from 'vitest'

import { formatBytes, formatDuration, formatLatency, formatPercent, formatRate, latencyNumber, rateParts } from '@/lib/format'

describe('formatBytes', () => {
  it.each([
    [0, '0 B'],
    [999, '999 B'],
    [999_600, '1 MB'],
    [500_000_000, '500 MB'],
    [1_500_000_000, '1.5 GB'],
    [268_435_456, '268 MB'],
    [12_340_000_000_000, '12.3 TB'],
  ])('writes %d bytes as %s', (bytes, text) => {
    expect(formatBytes(bytes, 'en')).toBe(text.replace(' ', '\u00a0'))
  })

  it('follows the locale', () => {
    expect(formatBytes(1_500_000_000, 'de')).toBe('1,5\u00a0GB')
  })
})

describe('formatRate', () => {
  it.each([
    [472_000, 'bits', '472 kbit/s'],
    [94_100_000, 'bits', '94.1 Mbit/s'],
    [2_380_000_000, 'bits', '2.38 Gbit/s'],
    [999_700, 'bits', '1.00 Mbit/s'],
    [5_000_000, 'bits', '5.00 Mbit/s'],
    [400, 'bits', '0.400 kbit/s'],
    [800_000_000, 'bytes', '100 MB/s'],
    [12_000, 'bytes', '1.50 kB/s'],
  ] as const)('writes %d bit/s in %s as %s', (bps, units, text) => {
    expect(formatRate(bps, units, 'en')).toBe(text.replace(' ', '\u00a0'))
  })

  it('trims the zeros of a round number, such as a scale\'s end', () => {
    expect(formatRate(1_000_000, 'bits', 'en', true)).toBe('1\u00a0Mbit/s')
    expect(formatRate(80_000, 'bytes', 'en', true)).toBe('10\u00a0kB/s')
  })

  it('gives the number and the unit apart, in the locale', () => {
    expect(rateParts(94_100_000, 'bits', 'de')).toEqual({ number: '94,1', unit: 'Mbit/s' })
  })
})

describe('latencyNumber', () => {
  it.each([
    [9.4, '9.4'],
    [9.0, '9.0'],
    [9.96, '10'],
    [51.4, '51'],
    [0.42, '0.4'],
  ])('writes %d ms as %s', (ms, text) => {
    expect(latencyNumber(ms, 'en')).toBe(text)
  })
})

describe('the formatting table of screens.md section 6', () => {
  const NB = '\u00a0'
  it.each([
    [formatRate(472_000, 'bits', 'en'), '472 kbit/s'],
    [formatRate(94_100_000, 'bits', 'en'), '94.1 Mbit/s'],
    [formatRate(2_380_000_000, 'bits', 'en'), '2.38 Gbit/s'],
    [formatLatency(9.4, 'en', 0.1), '9.4 ms'],
    [formatLatency(51.3, 'en', 0.1), '51 ms'],
    [formatLatency(0.6, 'en', 1), '< 1 ms'],
    [formatLatency(0.05, 'en', 0.1), '< 0.1 ms'],
    [formatLatency(4.4, 'en', 1), '4 ms'],
    [formatBytes(1_500_000_000, 'en'), '1.5 GB'],
    [formatDuration(12_345, 'en'), '12.3 s'],
    [formatPercent(2.5, 'en'), '2.5 %'],
  ])('writes %s as %s', (written, expected) => {
    expect(written).toBe(expected.replaceAll(' ', NB))
  })
})
