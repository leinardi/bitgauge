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

import type { Info } from '@/api/info'
import { type DurationBounds, type NoBounds, PRESETS, type TestSettings } from '@/engine/messages'

// The server's test defaults (wire-protocol.md section 5) as the engine's settings, which the
// stored settings and the URL parameters apply over. They arrive resolved: a bounded preset's
// bounds, and Continuous's none. Continuous runs download unless the stored settings or the URL
// name its direction; its run length is chosen per run in the browser and is never a default.

function bounds(range: Info['defaults']['download'], preset: DurationBounds): DurationBounds {
  return { minMs: range.minMs ?? preset.minMs, maxMs: range.maxMs ?? preset.maxMs }
}

/** The defaults as engine settings. */
export function settingsFromDefaults(defaults: Info['defaults']): TestSettings {
  const shared = {
    phases: [...defaults.phases],
    streams: { ...defaults.streams },
    dataCapBytes: defaults.dataCapBytes,
    units: defaults.units,
    warmup: defaults.warmup,
    pingCount: defaults.pingCount,
    overheadCompensationPercent: defaults.overheadCompensationPercent,
  }
  if (defaults.preset === 'continuous') {
    const none: NoBounds = { minMs: null, maxMs: null }
    return { preset: 'continuous', ...shared, download: { ...none }, upload: { ...none }, continuousDirection: 'download' }
  }
  // The server sends an empty bound as the preset's value; a bound still missing is the preset's.
  const table = PRESETS[defaults.preset]
  return { preset: defaults.preset, ...shared, download: bounds(defaults.download, table.download), upload: bounds(defaults.upload, table.upload) }
}
