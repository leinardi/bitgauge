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

// The confidence card (ui/screens.md section 2): each measured direction's confidence, its steady
// window worded in the units the rest of the page uses for the run.

import { describe, expect, it } from 'vitest'

import { confidenceView } from '@/components/result/confidence'
import { createAppI18n } from '@/i18n'
import { continuousResult } from '@/test/continuous'

const t = createAppI18n('', ['en']).global.t as unknown as Parameters<typeof confidenceView>[1]['t']
const wording = { t, locale: 'en' }

describe('the confidence card', () => {
  it("reads a Continuous run's window in days, hours and minutes", () => {
    const base = continuousResult({ endMs: 792_720_000, bucketMs: 600_000 })
    const result = { ...base, download: base.download && { ...base.download, windowMs: 792_713_500, confidence: { level: 'normal' as const, reasons: [] } } }
    const [item] = confidenceView(result, wording).confidence
    expect(item?.body.replace(/\u00a0/gu, ' ')).toContain('covered 9 d 4 h 11 min.')
    expect(item?.body).not.toContain('792')
  })
})
