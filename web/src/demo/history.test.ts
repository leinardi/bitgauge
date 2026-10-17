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

// The demo's History variants (frontend.md section 9): the kit's eight results, each a valid
// result the History import would accept, newest first, with the kit's statuses and grades.

import { describe, expect, it } from 'vitest'

import { restore } from '@/demo/choice'
import { DEMO_HISTORY_VARIANTS, demoHistoryResults, isDemoHistory } from '@/demo/history'
import { validateResult } from '@/engine/messages'

describe('the demo history', () => {
  it('holds the kit rows as valid results, newest first', () => {
    const results = demoHistoryResults('populated')
    expect(results).toHaveLength(8)
    expect(results.flatMap((result) => validateResult(result))).toEqual([])
    expect(new Set(results.map((result) => result.id)).size).toBe(8)
    const starts = results.map((result) => Date.parse(result.startedAt))
    expect(starts).toEqual([...starts].sort((a, b) => b - a))
    expect(results.map((result) => result.status)).toEqual(['complete', 'complete', 'complete', 'complete', 'partial', 'complete', 'error', 'complete'])
    expect(results.map((result) => result.bufferbloat?.grade ?? null)).toEqual(['D', 'C', 'C', 'B', 'D', 'B', null, 'F'])
    expect(demoHistoryResults('empty')).toEqual([])
  })

  it('knows its variants, and the panel reads an unknown one back as the browser history', () => {
    expect(DEMO_HISTORY_VARIANTS.every(isDemoHistory)).toBe(true)
    expect(isDemoHistory('select3')).toBe(false)
    const storage = (value: object) => ({ getItem: () => JSON.stringify(value), setItem: () => undefined })
    expect(restore(storage({ history: 'empty' })).history).toBe('empty')
    expect(restore(storage({ history: 'deleted' })).history).toBe('')
  })
})
