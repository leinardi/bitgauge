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

// The data-used notices (measurement.md sections 15 and 16): one at 1 GB, 10 GB, 100 GB and every
// further tenfold step, each once, live and for the result.

import { describe, expect, it } from 'vitest'

import { DataUsedNotices } from '@/engine/continuous/dataUsed'

describe('the data-used notices', () => {
  it('rise once at each tenfold step from 1 GB, every step a jump crosses included', () => {
    const notices = new DataUsedNotices()
    notices.update(999_999_999)
    expect(notices.drain()).toEqual([])
    notices.update(1e9)
    notices.update(5e9)
    expect(notices.drain()).toEqual([{ code: 'data-used', bytes: 1e9 }])
    notices.update(2e11)
    expect(notices.drain()).toEqual([
      { code: 'data-used', bytes: 1e10 },
      { code: 'data-used', bytes: 1e11 },
    ])
    notices.update(2e11)
    expect(notices.drain()).toEqual([])
    expect(notices.raised.map((notice) => notice.code === 'data-used' && notice.bytes)).toEqual([1e9, 1e10, 1e11])
  })
})
