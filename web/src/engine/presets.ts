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

import type { DurationBounds, Preset } from '@/engine/messages'

// The presets of measurement.md section 8.5. Continuous arrives in v0.3 and is absent.

export interface PresetDefinition {
  /** Quick runs three fixed streams; the others ramp (measurement.md section 4). */
  streams: { mode: 'fixed'; fixed: number } | { mode: 'auto' }
  download: DurationBounds
  upload: DurationBounds
  pingCount: number
}

export const PRESETS: Readonly<Record<Preset, PresetDefinition>> = {
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
}

const ORDER: readonly Preset[] = ['quick', 'standard', 'extended']

/** The next larger preset, offered on a shortfall (measurement.md section 8.6); null after Extended. */
export function nextPreset(preset: Preset): Preset | null {
  return ORDER[ORDER.indexOf(preset) + 1] ?? null
}
