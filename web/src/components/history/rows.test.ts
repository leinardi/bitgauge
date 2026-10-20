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
// A History row (ui/screens.md section 3): a Continuous result by its headline, the run-wide
// average of the direction it ran, the other direction without a number.

import { describe, expect, it } from 'vitest'

import { rowView } from '@/components/history/rows'
import { continuousResult } from '@/test/continuous'

describe('a History row', () => {
  it('shows a Continuous result by the headline of the direction it ran', () => {
    const download = rowView(continuousResult({ endMs: 7_200_000, bucketMs: 60_000 }), 'bits', 'en')
    expect(download.download).toEqual({ number: '921', unit: 'Mbit/s' })
    expect(download.upload).toBeNull()
    expect(download.grade).toBe('A')
    const upload = rowView(continuousResult({ direction: 'upload', endMs: 7_200_000, bucketMs: 60_000 }), 'bits', 'en')
    expect([upload.download, upload.upload]).toEqual([null, { number: '921', unit: 'Mbit/s' }])
  })
})
