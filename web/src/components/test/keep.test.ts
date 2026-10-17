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

// Keep in history's condition (ui/screens.md section 1): a partial or error result with at least one
// finished phase.

import { describe, expect, it } from 'vitest'

import { hasFinishedPhase } from '@/components/test/keep'
import { resultFixture } from '@/test/fixtures'

const base = resultFixture()

describe('hasFinishedPhase', () => {
  it('counts idle latency and a direction that ended on its own', () => {
    expect(hasFinishedPhase(resultFixture({ status: 'partial', notices: [{ code: 'stopped-early', direction: 'upload', coveredMs: 3000 }] }))).toBe(true)
  })

  it('does not count idle latency stopped while it ran, with no direction run', () => {
    const skipped = { status: 'skipped' as const, streams: 0, bytes: 0, events: [] }
    expect(hasFinishedPhase({ ...base, status: 'partial', download: skipped, upload: { ...skipped, confirmedRequests: 0 } })).toBe(false)
  })

  it('does not count the direction the stop ended, even without a number', () => {
    const { idle: _idle, ...withoutIdle } = base
    const stopped = { ...withoutIdle, status: 'partial' as const, download: { ...base.download!, status: 'insufficient-data' as const }, upload: undefined, notices: [{ code: 'stopped-early' as const, direction: 'download' as const, coveredMs: 1200 }] }
    expect(hasFinishedPhase(stopped)).toBe(false)
  })

  it('does not count a direction that ended with an error', () => {
    const { idle: _idle, ...withoutIdle } = base
    expect(hasFinishedPhase({ ...withoutIdle, status: 'error', download: { ...base.download!, status: 'error' }, upload: undefined })).toBe(false)
  })
})
