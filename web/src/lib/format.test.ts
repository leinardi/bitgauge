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

// Decimal bytes with three significant digits and a non-breaking space.

import { describe, expect, it } from 'vitest'

import { formatBytes } from '@/lib/format'

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
