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
// @vitest-environment jsdom

// The selection bar's Compare hint (ui/i18n-a11y.md section 2): it describes Compare while Compare
// is unavailable, and is gone from the bar, wide or floating, once exactly two are selected.

import { describe, expect, it } from 'vitest'

import SelectionBar from '@/components/history/SelectionBar.vue'
import { mountApp } from '@/test/mount'

const HINT = 'Compare needs exactly 2'

describe('the selection bar', () => {
  it.each([false, true])('describes Compare by the hint while it is unavailable (floating: %s)', async (floating) => {
    const bar = await mountApp(SelectionBar, '/history', { props: { count: 1, floating } })
    const compare = bar.get('[data-testid="compare"]')
    expect(compare.attributes('aria-disabled')).toBe('true')
    expect(bar.get(`[id="${compare.attributes('aria-describedby') ?? ''}"]`).text()).toContain(HINT)
    bar.unmount()
  })

  it.each([false, true])('has no hint once exactly two are selected (floating: %s)', async (floating) => {
    const bar = await mountApp(SelectionBar, '/history', { props: { count: 2, floating } })
    expect(bar.get('[data-testid="compare"]').attributes('aria-describedby')).toBeUndefined()
    const hint = bar.findAll('span').find((span) => span.text().includes(HINT))
    expect(hint === undefined || hint.classes().includes('hidden')).toBe(true)
    bar.unmount()
  })
})
