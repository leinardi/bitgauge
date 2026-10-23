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

// The end condition, extension and shortfall of measurement.md sections 5, 8.4 and 8.6.

import { describe, expect, it } from 'vitest'

import { DurationRule, windowConditionHolds, windowStable } from '@/engine/phases/window'
import { nextPreset, PRESETS } from '@/engine/presets'

describe('windowConditionHolds', () => {
  it('needs 3 s and 3 confirmed requests inside the window on upload', () => {
    expect(windowConditionHolds('upload', 3000, 3)).toBe(true)
    expect(windowConditionHolds('upload', 2900, 3)).toBe(false)
    expect(windowConditionHolds('upload', 3000, 2)).toBe(false)
  })

  it('needs 3 s and 2 contributing requests on download', () => {
    expect(windowConditionHolds('download', 3000, 2)).toBe(true)
    expect(windowConditionHolds('download', 2900, 2)).toBe(false)
    expect(windowConditionHolds('download', 3000, 1)).toBe(false)
  })
})

describe('windowStable', () => {
  const steady = Array.from({ length: 30 }, () => 3750)

  it('holds when the 500 ms sums vary by at most 10 %', () => {
    expect(windowStable(steady)).toBe(true)
    // Sums of 18750 and 22500 alternate: a coefficient of variation of 9.1 %.
    const swinging = steady.map((value, index) => (Math.floor(index / 5) % 2 === 0 ? value : value * 1.2))
    expect(windowStable(swinging)).toBe(true)
  })

  it('does not hold when a burst lands in a 3 s window', () => {
    // A loss recovery releases 30 KB in one cell after a second of nothing (section 5).
    const burst = steady.map((value, index) => (index >= 10 && index < 20 ? 0 : value))
    burst[20] = 30_000
    expect(windowStable(burst)).toBe(false)
  })

  it('reads known cells only, and holds nothing without a mean', () => {
    // A group with an unknown cell is left out: the steady groups around it still hold.
    expect(windowStable([...steady.slice(0, 10), null, ...steady.slice(11)])).toBe(true)
    expect(windowStable(Array.from({ length: 30 }, () => 0))).toBe(false)
    expect(windowStable([])).toBe(false)
  })
})

describe('DurationRule', () => {
  it('runs at least the minimum, then ends as soon as the condition holds', () => {
    const rule = new DurationRule('download', PRESETS.standard.download, 'standard')
    expect(rule.evaluate(9900, true)).toBe('continue')
    expect(rule.evaluate(10_000, true)).toBe('end')
    expect(rule.extended).toBe(false)
    expect(rule.outcome(true)).toEqual({ status: 'measured', notices: [] })
  })

  it('extends a phase whose condition fails at the minimum, with the slow-link notice', () => {
    const rule = new DurationRule('download', PRESETS.standard.download, 'standard')
    expect(rule.evaluate(10_000, false)).toBe('continue')
    expect(rule.extended).toBe(true)
    expect(rule.evaluate(13_400, true)).toBe('end')
    expect(rule.outcome(true)).toEqual({
      status: 'measured',
      notices: [{ code: 'slow-link-extended', direction: 'download' }],
    })
  })

  it('ends download at its maximum', () => {
    const rule = new DurationRule('download', PRESETS.standard.download, 'standard')
    expect(rule.evaluate(19_900, false)).toBe('continue')
    expect(rule.evaluate(20_000, false)).toBe('end')
  })

  it('stops issuing upload requests one second before the maximum', () => {
    const rule = new DurationRule('upload', PRESETS.standard.upload, 'standard')
    expect(rule.evaluate(23_900, false)).toBe('continue')
    expect(rule.evaluate(24_000, false)).toBe('end')
  })

  it('stops upload at max - 1 s even before a minimum equal to the maximum, never extended', () => {
    // duration=8 on Standard: minimum and maximum both 8 s.
    const rule = new DurationRule('upload', { minMs: 8000, maxMs: 8000 }, 'standard')
    expect(rule.evaluate(6900, false)).toBe('continue')
    expect(rule.evaluate(7000, false)).toBe('end')
    expect(rule.outcome(false).notices).toEqual([{ code: 'insufficient-data', direction: 'upload', offer: 'extended' }])

    const download = new DurationRule('download', { minMs: 8000, maxMs: 8000 }, 'standard')
    expect(download.evaluate(8000, false)).toBe('end')
    expect(download.extended).toBe(false)
  })

  it('offers no larger preset to a direction the data cap ended without a number', () => {
    // A larger preset would meet the same cap (measurement.md section 8.6).
    const rule = new DurationRule('upload', PRESETS.standard.upload, 'standard')
    expect(rule.outcome(false, true)).toEqual({ status: 'insufficient-data', notices: [{ code: 'insufficient-data', direction: 'upload', offer: null }] })
    expect(rule.outcome(true, true)).toEqual({ status: 'measured', notices: [] })
  })

  it('reports insufficient data at the maximum, offering the next larger preset', () => {
    const offers = (['quick', 'standard', 'extended'] as const).map((preset) => {
      const rule = new DurationRule('upload', PRESETS[preset].upload, preset)
      rule.evaluate(PRESETS[preset].upload.maxMs, false)
      return rule.outcome(false)
    })
    expect(offers).toEqual([
      {
        status: 'insufficient-data',
        notices: [
          { code: 'slow-link-extended', direction: 'upload' },
          { code: 'insufficient-data', direction: 'upload', offer: 'standard' },
        ],
      },
      {
        status: 'insufficient-data',
        notices: [
          { code: 'slow-link-extended', direction: 'upload' },
          { code: 'insufficient-data', direction: 'upload', offer: 'extended' },
        ],
      },
      {
        status: 'insufficient-data',
        notices: [
          { code: 'slow-link-extended', direction: 'upload' },
          { code: 'insufficient-data', direction: 'upload', offer: null },
        ],
      },
    ])
  })
})

describe('presets', () => {
  it('match measurement.md section 8.5', () => {
    expect(PRESETS).toEqual({
      quick: {
        streams: { mode: 'fixed', fixed: 3 },
        download: { minMs: 5000, maxMs: 10_000 },
        upload: { minMs: 5000, maxMs: 10_000 },
        pingCount: 10,
      },
      standard: {
        streams: { mode: 'auto' },
        download: { minMs: 10_000, maxMs: 20_000 },
        upload: { minMs: 15_000, maxMs: 25_000 },
        pingCount: 20,
      },
      extended: {
        streams: { mode: 'auto' },
        download: { minMs: 20_000, maxMs: 40_000 },
        upload: { minMs: 20_000, maxMs: 40_000 },
        pingCount: 50,
      },
      continuous: {
        streams: { mode: 'auto' },
        download: { minMs: null, maxMs: null },
        upload: { minMs: null, maxMs: null },
        pingCount: 20,
      },
    })
  })

  it('offer Quick, then Standard, then Extended, then nothing, and nothing from Continuous', () => {
    expect([nextPreset('quick'), nextPreset('standard'), nextPreset('extended'), nextPreset('continuous')]).toEqual([
      'standard',
      'extended',
      null,
      null,
    ])
  })
})
