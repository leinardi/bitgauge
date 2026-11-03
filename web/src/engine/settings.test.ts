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

// Settings resolution, architecture.md section 4, against configuration.md section 2.3 and the
// `duration` and `label` URL parameters of ui/url-params.md section 2.

import { describe, expect, it } from 'vitest'

import type { SettingsOverride, TestSettings } from '@/engine/messages'
import { resolveSettings } from '@/engine/settings'

/** configuration.md section 2.3's defaults on Standard. */
const STANDARD: TestSettings = {
  preset: 'standard',
  phases: ['idle', 'download', 'upload'],
  streams: { mode: 'auto', fixed: 3, max: 6 },
  download: { minMs: 10_000, maxMs: 20_000 },
  upload: { minMs: 15_000, maxMs: 25_000 },
  dataCapBytes: null,
  units: 'bits',
  warmup: 'auto',
  pingCount: 20,
  overheadCompensationPercent: 0,
}

function settings(override?: SettingsOverride) {
  const resolution = resolveSettings(STANDARD, override)
  if (!resolution.ok) {
    throw new Error(`unexpected invalid-settings on ${resolution.field}`)
  }
  return resolution.settings
}

describe('valid settings', () => {
  it('are the configured settings without an override', () => {
    expect(settings()).toEqual(STANDARD)
  })

  it('take each override field on top of the configured settings', () => {
    expect(
      settings({ phases: ['upload', 'download'], units: 'bytes', warmup: 4000, overheadCompensationPercent: 5.13 }),
    ).toEqual({
      ...STANDARD,
      phases: ['upload', 'download'],
      units: 'bytes',
      warmup: 4000,
      overheadCompensationPercent: 5.13,
    })
  })

  it('accept any phase skipped, the info phase never being listed', () => {
    for (const phases of [['download'], ['upload'], ['idle'], ['idle', 'upload'], ['download', 'upload']] as const) {
      expect(settings({ phases: [...phases] }).phases).toEqual(phases)
    }
  })

  it('accept the edges of every range', () => {
    expect(
      resolveSettings(STANDARD, {
        streams: { mode: 'fixed', fixed: 1, max: 1 },
        download: { minMs: 5000, maxMs: 600_000 },
        upload: { minMs: 600_000, maxMs: 600_000 },
        dataCapBytes: 1024 * 1024,
        warmup: 60_000,
        pingCount: 200,
        overheadCompensationPercent: 20,
        label: 'x'.repeat(64),
      }).ok,
    ).toBe(true)
    expect(resolveSettings(STANDARD, { warmup: 1000, pingCount: 6, streams: { mode: 'single', fixed: 6, max: 6 } }).ok).toBe(
      true,
    )
  })

  it('share nothing with the configured settings or the override', () => {
    const override: SettingsOverride = { phases: ['download'] }
    const resolved = settings(override)
    resolved.streams.max = 1
    resolved.download.maxMs = 5000
    resolved.phases.push('upload')
    expect(STANDARD.streams.max).toBe(6)
    expect(STANDARD.download.maxMs).toBe(20_000)
    expect(override.phases).toEqual(['download'])
  })

  it('pass the label and the context label through to the result', () => {
    expect(settings({ label: 'kitchen AP', contextLabel: 'wg0' })).toMatchObject({
      label: 'kitchen AP',
      contextLabel: 'wg0',
    })
    // The 64-character limit counts characters, not UTF-16 code units.
    expect(resolveSettings(STANDARD, { label: '📶'.repeat(64) }).ok).toBe(true)
  })
})

describe('a preset switch', () => {
  it('takes the new preset durations, ping count and stream mode', () => {
    expect(settings({ preset: 'quick' })).toEqual({
      ...STANDARD,
      preset: 'quick',
      streams: { mode: 'fixed', fixed: 3, max: 6 },
      download: { minMs: 5000, maxMs: 10_000 },
      upload: { minMs: 5000, maxMs: 10_000 },
      pingCount: 10,
    })
    expect(settings({ preset: 'extended' })).toMatchObject({
      streams: { mode: 'auto' },
      download: { minMs: 20_000, maxMs: 40_000 },
      upload: { minMs: 20_000, maxMs: 40_000 },
      pingCount: 50,
    })
  })

  it('keeps Quick fixed streams within the configured maximum', () => {
    const resolution = resolveSettings({ ...STANDARD, streams: { mode: 'auto', fixed: 2, max: 2 } }, { preset: 'quick' })
    expect(resolution.ok && resolution.settings.streams).toEqual({ mode: 'fixed', fixed: 2, max: 2 })
  })

  it('lets the override fields win over the new preset values', () => {
    expect(settings({ preset: 'quick', pingCount: 30 }).pingCount).toBe(30)
  })
})

describe('the duration override', () => {
  it('sets the maximum and lowers the minimum to it: duration=8 on Standard is 8 s to 8 s', () => {
    const resolved = settings({ durationMs: 8000 })
    expect(resolved.download).toEqual({ minMs: 8000, maxMs: 8000 })
    expect(resolved.upload).toEqual({ minMs: 8000, maxMs: 8000 })
  })

  it('keeps a smaller preset minimum: duration=30 on Standard is 10 s to 30 s', () => {
    const resolved = settings({ durationMs: 30_000 })
    expect(resolved.download).toEqual({ minMs: 10_000, maxMs: 30_000 })
    expect(resolved.upload).toEqual({ minMs: 15_000, maxMs: 30_000 })
  })

  it('applies to the switched preset', () => {
    expect(settings({ preset: 'quick', durationMs: 7000 }).download).toEqual({ minMs: 5000, maxMs: 7000 })
  })
})

describe('Continuous', () => {
  it('has no bounds and runs download unless its direction is named (measurement.md section 8.5)', () => {
    expect(settings({ preset: 'continuous' })).toEqual({
      ...STANDARD,
      preset: 'continuous',
      download: { minMs: null, maxMs: null },
      upload: { minMs: null, maxMs: null },
      continuousDirection: 'download',
    })
  })

  it('runs upload when its direction is upload', () => {
    expect(settings({ preset: 'continuous', continuousDirection: 'upload' }).continuousDirection).toBe('upload')
  })

  it('takes the duration as its run length, 60 s to 7 days', () => {
    expect(settings({ preset: 'continuous', durationMs: 60_000 }).runLengthMs).toBe(60_000)
    expect(settings({ preset: 'continuous', durationMs: 604_800_000 })).toMatchObject({ runLengthMs: 604_800_000, download: { minMs: null, maxMs: null } })
  })

  it('runs without a run length when the override clears it, as Run again of a result that had none does', () => {
    const configured = settings({ preset: 'continuous', durationMs: 7_200_000 })
    expect(configured.runLengthMs).toBe(7_200_000)
    const resolution = resolveSettings(configured, { preset: 'continuous', continuousDirection: 'upload', runLengthMs: null })
    expect(resolution.ok && resolution.settings).not.toHaveProperty('runLengthMs')
    const kept = resolveSettings(configured, { runLengthMs: 3_600_000 })
    expect(kept.ok && kept.settings.runLengthMs).toBe(3_600_000)
  })

  it('takes the direction and run length the override names on a switch from a bounded preset', () => {
    const resolution = resolveSettings(STANDARD, { preset: 'continuous', continuousDirection: 'upload', runLengthMs: 7_200_000 })
    expect(resolution.ok && resolution.settings).toMatchObject({ preset: 'continuous', continuousDirection: 'upload', runLengthMs: 7_200_000, download: { minMs: null, maxMs: null } })
  })

  it('drops its fields on a switch back to a bounded preset', () => {
    const continuous = settings({ preset: 'continuous', durationMs: 120_000 })
    const resolution = resolveSettings(continuous, { preset: 'quick' })
    expect(resolution.ok && resolution.settings).toEqual({ ...STANDARD, preset: 'quick', streams: { mode: 'fixed', fixed: 3, max: 6 }, download: { minMs: 5000, maxMs: 10_000 }, upload: { minMs: 5000, maxMs: 10_000 }, pingCount: 10 })
  })
})

describe('invalid settings', () => {
  const cases: [string, SettingsOverride][] = [
    ['preset', { preset: 'turbo' as TestSettings['preset'] }],
    ['continuousDirection', { preset: 'continuous', continuousDirection: 'both' as 'upload' }],
    ['continuousDirection', { continuousDirection: 'download' }],
    ['runLengthMs', { runLengthMs: 60_000 }],
    ['runLengthMs', { preset: 'continuous', runLengthMs: 59_000 }],
    ['download', { preset: 'continuous', download: { minMs: 10_000, maxMs: 20_000 } }],
    ['download', { download: { minMs: null, maxMs: null } }],
    ['durationMs', { preset: 'continuous', durationMs: 59_000 }],
    ['durationMs', { preset: 'continuous', durationMs: 604_801_000 }],
    ['phases', { phases: [] }],
    ['phases', { phases: ['download', 'idle'] }],
    ['phases', { phases: ['download', 'download'] }],
    ['phases', { phases: ['info' as 'idle'] }],
    ['streams.mode', { streams: { mode: 'many' as 'auto', fixed: 3, max: 6 } }],
    ['streams.max', { streams: { mode: 'auto', fixed: 3, max: 0 } }],
    ['streams.max', { streams: { mode: 'auto', fixed: 3, max: 7 } }],
    ['streams.max', { streams: { mode: 'auto', fixed: 3, max: 4.5 } }],
    ['streams.fixed', { streams: { mode: 'fixed', fixed: 0, max: 6 } }],
    ['streams.fixed', { streams: { mode: 'fixed', fixed: 5, max: 4 } }],
    ['download', { download: { minMs: 4999, maxMs: 20_000 } }],
    ['download', { download: { minMs: 10_000, maxMs: 600_001 } }],
    ['download', { download: { minMs: 20_000, maxMs: 10_000 } }],
    ['upload', { upload: { minMs: 30_000, maxMs: 25_000 } }],
    ['upload', { upload: { minMs: 15_000.5, maxMs: 25_000 } }],
    ['dataCapBytes', { dataCapBytes: 1024 * 1024 - 1 }],
    ['dataCapBytes', { dataCapBytes: 0 }],
    ['units', { units: 'nibbles' as 'bits' }],
    ['warmup', { warmup: 999 }],
    ['warmup', { warmup: 60_001 }],
    ['warmup', { warmup: 'manual' as 'auto' }],
    ['pingCount', { pingCount: 5 }],
    ['pingCount', { pingCount: 201 }],
    ['pingCount', { pingCount: 10.5 }],
    ['overheadCompensationPercent', { overheadCompensationPercent: -1 }],
    ['overheadCompensationPercent', { overheadCompensationPercent: 20.01 }],
    ['overheadCompensationPercent', { overheadCompensationPercent: Number.NaN }],
    ['label', { label: 'x'.repeat(65) }],
    ['durationMs', { durationMs: 4000 }],
    ['durationMs', { durationMs: 601_000 }],
    ['durationMs', { durationMs: 8500 }],
  ]

  for (const [field, override] of cases) {
    it(`reject ${JSON.stringify(override)} with invalid-settings on ${field}`, () => {
      expect(resolveSettings(STANDARD, override)).toEqual({ ok: false, code: 'invalid-settings', field })
    })
  }
})
