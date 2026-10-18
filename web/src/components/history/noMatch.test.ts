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

// The no-match text names what the filter asks for: contexts and labels, the date range and the
// search, and how many results are still in history.

import { describe, expect, it } from 'vitest'

import { noMatchBody } from '@/components/history/noMatch'
import { NO_FILTER } from '@/history/filters'
import { createAppI18n } from '@/i18n'
import { plainText } from '@/lib/timeText'

const wording = { t: createAppI18n('', ['en']).global.t as unknown as Parameters<typeof noMatchBody>[2]['t'], locale: 'en' }

describe('noMatchBody', () => {
  it('names the context, the preset range and the search, as the kit words it', () => {
    expect(plainText(noMatchBody({ ...NO_FILTER, contexts: ['VPN'], range: { kind: 'days', days: 7 }, q: 'airport' }, 48, wording))).toBe(
      'Nothing with context VPN in the last 7 days matches “airport”. All 48 results are still in history.',
    )
  })

  it('joins several chips with or, and words a custom range and no search, its days in time elements', () => {
    const body = noMatchBody({ ...NO_FILTER, labels: ['Office', 'Home'], range: { kind: 'custom', from: '2026-10-02', to: '2026-10-05' } }, 1, wording)
    expect(plainText(body)).toBe('Nothing with label Office or Home dated Oct 2\u2009–\u20095, 2026 matches. The 1 result is still in history.')
    expect(body.filter((run) => run.datetime !== undefined)).toEqual([
      { text: '2', datetime: '2026-10-02' },
      { text: '5', datetime: '2026-10-05' },
    ])
  })
})
