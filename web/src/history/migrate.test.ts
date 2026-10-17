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

// Migration of a stored or imported record to the current result version (frontend.md section 5).

import { describe, expect, it } from 'vitest'

import { CURRENT_SCHEMA_VERSION, InvalidRecord, migrate, UnsupportedSchema } from '@/history/migrate'
import { resultFixture } from '@/test/fixtures'

describe('migrate', () => {
  it('passes a current record through the validator', () => {
    const result = resultFixture({ note: 'n' })
    expect(CURRENT_SCHEMA_VERSION).toBe(1)
    expect(migrate(result)).toBe(result)
  })

  it('refuses a later version', () => {
    expect(() => migrate({ ...resultFixture(), schemaVersion: 2 })).toThrow(UnsupportedSchema)
  })

  it('refuses what the validator rejects, with its problems', () => {
    try {
      migrate({ ...resultFixture(), durationMs: 'long' })
      expect.unreachable()
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidRecord)
      expect((error as InvalidRecord).problems).toEqual(['result.durationMs: not a number of at least 0'])
    }
    expect(() => migrate(null)).toThrow(InvalidRecord)
  })
})
