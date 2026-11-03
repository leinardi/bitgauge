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

// History's loading placeholders (ui/screens.md section 3) switch from cards to the table at the
// same breakpoint as the list they stand in for, so nothing jumps when the results arrive.

import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import HistoryLoading from '@/components/history/HistoryLoading.vue'
import { createAppI18n } from '@/i18n'

describe('the loading placeholders', () => {
  it('show cards below the desktop breakpoint and the table from it, as the list does', () => {
    const loading = mount(HistoryLoading, { global: { plugins: [createAppI18n('', ['en'])] } })
    expect(loading.get('[data-testid="loading-table"]').classes()).toEqual(expect.arrayContaining(['hidden', 'desktop:block']))
    expect(loading.get('[data-testid="loading-cards"]').classes()).toContain('desktop:hidden')
    loading.unmount()
  })
})
