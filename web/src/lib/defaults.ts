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
import type { DurationBounds, TestSettings } from '@/engine/messages'

// The server's test defaults (wire-protocol.md section 5) as the engine's settings. v0.1 applies
// them with the URL parameters on top and stores none in the browser (ui/screens.md section 1).

function bounds(range: Info['defaults']['download']): DurationBounds | null {
  return range.minMs === null || range.maxMs === null ? null : { minMs: range.minMs, maxMs: range.maxMs }
}

/** The defaults as engine settings, or null when they name what v0.1 cannot run (Continuous). */
export function settingsFromDefaults(defaults: Info['defaults']): TestSettings | null {
  const download = bounds(defaults.download)
  const upload = bounds(defaults.upload)
  if (defaults.preset === 'continuous' || download === null || upload === null) {
    return null
  }
  return {
    preset: defaults.preset,
    phases: [...defaults.phases],
    streams: { ...defaults.streams },
    download,
    upload,
    dataCapBytes: defaults.dataCapBytes,
    units: defaults.units,
    warmup: defaults.warmup,
    pingCount: defaults.pingCount,
    overheadCompensationPercent: defaults.overheadCompensationPercent,
  }
}
