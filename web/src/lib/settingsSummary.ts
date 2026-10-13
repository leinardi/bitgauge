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

import type { TestSettings } from '@/engine/messages'

// The settings summary of the Test screen (ui/screens.md section 1): the settings that differ from
// the server defaults, one chip each, or the preset with its stream mode and data cap when nothing
// differs. v0.1 has no Settings screen, so there is no Edit link; the URL parameters are what can
// differ.

export type SummaryPart =
  | { kind: 'preset'; preset: TestSettings['preset'] }
  | { kind: 'streams'; mode: TestSettings['streams']['mode']; count: number }
  | { kind: 'cap'; bytes: number | null }
  | { kind: 'units'; units: TestSettings['units'] }

function streams(settings: TestSettings): SummaryPart {
  return { kind: 'streams', mode: settings.streams.mode, count: settings.streams.mode === 'fixed' ? settings.streams.fixed : 1 }
}

/** The line shown when nothing differs: preset, stream mode, data cap. */
export function baseParts(settings: TestSettings): SummaryPart[] {
  return [{ kind: 'preset', preset: settings.preset }, streams(settings), { kind: 'cap', bytes: settings.dataCapBytes }]
}

/** The parts whose value differs from the defaults, in a fixed order. */
export function changedParts(settings: TestSettings, defaults: TestSettings): SummaryPart[] {
  const changed: SummaryPart[] = []
  if (settings.preset !== defaults.preset) {
    changed.push({ kind: 'preset', preset: settings.preset })
  }
  const mine = streams(settings)
  const theirs = streams(defaults)
  if (JSON.stringify(mine) !== JSON.stringify(theirs)) {
    changed.push(mine)
  }
  if (settings.dataCapBytes !== defaults.dataCapBytes) {
    changed.push({ kind: 'cap', bytes: settings.dataCapBytes })
  }
  if (settings.units !== defaults.units) {
    changed.push({ kind: 'units', units: settings.units })
  }
  return changed
}
