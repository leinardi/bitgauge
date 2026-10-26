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

import type { DurationBounds, MeasuringPhase, TestSettings } from '@/engine/messages'
import { same, storedOver } from '@/lib/settingsStorage'

// The settings summary of the Test screen (ui/screens.md section 1): the settings that differ from
// the server defaults under the run's preset, one chip each in the order of Settings' changed
// list, or the preset with its stream mode and data cap when nothing differs, beside the Edit link
// to the Settings screen; the stored settings and the URL parameters are what can differ.

export type SummaryPart =
  | { kind: 'preset'; preset: TestSettings['preset'] }
  | { kind: 'direction'; direction: NonNullable<TestSettings['continuousDirection']> }
  | { kind: 'runLength'; ms: number | null }
  | { kind: 'phases'; phases: MeasuringPhase[] }
  | { kind: 'streams'; mode: TestSettings['streams']['mode']; count: number }
  | { kind: 'download' | 'upload'; bounds: DurationBounds }
  | { kind: 'cap'; bytes: number | null }
  | { kind: 'units'; units: TestSettings['units'] }
  | { kind: 'warmup'; warmup: TestSettings['warmup'] }
  | { kind: 'pings'; count: number }
  | { kind: 'overhead'; percent: number }

function streams(settings: TestSettings): SummaryPart {
  return { kind: 'streams', mode: settings.streams.mode, count: settings.streams.mode === 'fixed' ? settings.streams.fixed : 1 }
}

/** The line shown when nothing differs: preset, stream mode, data cap. */
export function baseParts(settings: TestSettings): SummaryPart[] {
  return [{ kind: 'preset', preset: settings.preset }, streams(settings), { kind: 'cap', bytes: settings.dataCapBytes }]
}

const bounded = (bounds: TestSettings['download']): bounds is DurationBounds => bounds.minMs !== null

/**
 * The parts whose value differs from the defaults, in a fixed order. The defaults are taken under
 * the run's preset, so a preset's own durations, streams and ping count are no change; Continuous
 * has its direction and run length and no durations, and runs its direction whatever the phases.
 */
export function changedParts(settings: TestSettings, defaults: TestSettings): SummaryPart[] {
  const changed: SummaryPart[] = []
  if (settings.preset !== defaults.preset) {
    changed.push({ kind: 'preset', preset: settings.preset })
  }
  const base = storedOver(defaults, { preset: settings.preset })
  const continuous = settings.preset === 'continuous'
  if (continuous) {
    const direction = settings.continuousDirection ?? 'download'
    if (direction !== (base.continuousDirection ?? 'download')) {
      changed.push({ kind: 'direction', direction })
    }
    if (settings.runLengthMs !== base.runLengthMs) {
      changed.push({ kind: 'runLength', ms: settings.runLengthMs ?? null })
    }
  } else if (!same(settings.phases, base.phases)) {
    changed.push({ kind: 'phases', phases: [...settings.phases] })
  }
  const mine = streams(settings)
  if (!same(mine, streams(base))) {
    changed.push(mine)
  }
  for (const direction of ['download', 'upload'] as const) {
    const bounds = settings[direction]
    if (!continuous && bounded(bounds) && !same(bounds, base[direction])) {
      changed.push({ kind: direction, bounds: { ...bounds } })
    }
  }
  if (settings.dataCapBytes !== base.dataCapBytes) {
    changed.push({ kind: 'cap', bytes: settings.dataCapBytes })
  }
  if (settings.units !== base.units) {
    changed.push({ kind: 'units', units: settings.units })
  }
  if (settings.warmup !== base.warmup) {
    changed.push({ kind: 'warmup', warmup: settings.warmup })
  }
  if (settings.pingCount !== base.pingCount) {
    changed.push({ kind: 'pings', count: settings.pingCount })
  }
  if (settings.overheadCompensationPercent !== base.overheadCompensationPercent) {
    changed.push({ kind: 'overhead', percent: settings.overheadCompensationPercent })
  }
  return changed
}
