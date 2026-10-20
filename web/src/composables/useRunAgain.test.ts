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
// Run again (ui/screens.md section 2): the result's settings and label, taken once by the Test
// screen; a Continuous result's one direction and run length with them, none as null.

import { describe, expect, it } from 'vitest'

import { requestRunAgain, takeRunAgain } from '@/composables/useRunAgain'
import { continuousResultSettings } from '@/test/continuous'
import { resultFixture } from '@/test/fixtures'

const SKIPPED = { status: 'skipped' as const, streams: 0, bytes: 0, events: [] }

describe('run again', () => {
  it('runs a Continuous upload as a Continuous upload, with its run length, once', () => {
    const base = resultFixture()
    requestRunAgain({ ...base, label: 'Rack', settings: { ...continuousResultSettings('upload'), streams: { mode: 'fixed', max: 6 }, runLengthMs: 3_600_000 }, download: SKIPPED })
    expect(takeRunAgain()).toEqual({
      label: 'Rack',
      settings: {
        preset: 'continuous',
        phases: ['idle', 'download', 'upload'],
        // The count the upload ran with, not the skipped download's.
        streams: { mode: 'fixed', max: 6, fixed: base.upload?.streams },
        dataCapBytes: null,
        overheadCompensationPercent: 0,
        warmup: 'auto',
        pingCount: 20,
        continuousDirection: 'upload',
        runLengthMs: 3_600_000,
      },
    })
    expect(takeRunAgain()).toBeNull()
  })

  it('leaves the Continuous fields out of a bounded run, and clears the run length when there was none', () => {
    requestRunAgain(resultFixture())
    expect(takeRunAgain()?.settings).not.toHaveProperty('continuousDirection')
    requestRunAgain({ ...resultFixture(), settings: continuousResultSettings('download') })
    const settings = takeRunAgain()?.settings
    expect(settings).toMatchObject({ preset: 'continuous', continuousDirection: 'download' })
    // Null clears whatever run length the stored settings or the link configured (architecture.md section 4).
    expect(settings).toHaveProperty('runLengthMs', null)
  })
})
