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
// finished phase, or with the partial idle latency a stop during it kept; a short Continuous run.

import { describe, expect, it } from 'vitest'

import { canKeep } from '@/components/test/keep'
import { continuousResultSettings } from '@/test/continuous'
import { resultFixture } from '@/test/fixtures'

const base = resultFixture()

describe('canKeep', () => {
  it('counts idle latency and a direction that ended on its own', () => {
    expect(canKeep(resultFixture({ status: 'partial', notices: [{ code: 'stopped-early', direction: 'upload', coveredMs: 3000 }] }))).toBe(true)
  })

  it('keeps the partial idle latency a stop during it kept, with no direction run (flows.md section 4)', () => {
    const skipped = { status: 'skipped' as const, streams: 0, bytes: 0, events: [] }
    expect(canKeep({ ...base, status: 'partial', download: skipped, upload: { ...skipped, confirmedRequests: 0 } })).toBe(true)
  })

  it('does not count the direction the stop ended, even without a number', () => {
    const { idle: _idle, ...withoutIdle } = base
    const stopped = { ...withoutIdle, status: 'partial' as const, download: { ...base.download!, status: 'insufficient-data' as const }, upload: undefined, notices: [{ code: 'stopped-early' as const, direction: 'download' as const, coveredMs: 1200 }] }
    expect(canKeep(stopped)).toBe(false)
  })

  it('does not count a direction that ended with an error', () => {
    const { idle: _idle, ...withoutIdle } = base
    expect(canKeep({ ...withoutIdle, status: 'error', download: { ...base.download!, status: 'error' }, upload: undefined })).toBe(false)
  })

  it('keeps a Continuous run stopped before 3 fully known cells, its warm-up included, with no idle latency', () => {
    const { idle: _idle, ...withoutIdle } = base
    const stopped = {
      ...withoutIdle,
      status: 'partial' as const,
      settings: continuousResultSettings('download'),
      download: { status: 'insufficient-data' as const, streams: 4, bytes: 6e6, events: [{ code: 'cancelled' as const, atMs: 5000 }] },
      upload: { status: 'skipped' as const, streams: 0, bytes: 0, events: [], confirmedRequests: 0 },
      notices: [{ code: 'stopped-early' as const, direction: 'download' as const, coveredMs: 0 }],
    }
    expect(canKeep(stopped)).toBe(true)
  })
})
