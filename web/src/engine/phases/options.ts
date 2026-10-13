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

import type { DurationBounds, Preset, TestSettings } from '@/engine/messages'
import type { Clock } from '@/engine/types'

/** What a throughput phase, download or upload, takes from the run. */
export interface ThroughputOptions {
  clock: Clock
  preset: Preset
  streams: TestSettings['streams']
  bounds: DurationBounds
  warmup: TestSettings['warmup']
  dataCapBytes: number | null
  /** The data the test used before this phase, which counts against the data cap. */
  dataUsedBefore: number
  /** The idle-latency median, or null when idle latency was skipped. */
  rttMs: number | null
}

/**
 * What the data cap still allows after the data used, this phase's included, and the bytes still
 * to move of the requests in flight (measurement.md section 3); null without a data cap.
 */
export function dataBudget(options: Pick<ThroughputOptions, 'dataCapBytes' | 'dataUsedBefore'>, used: number, pending: number): number | null {
  return options.dataCapBytes === null ? null : options.dataCapBytes - options.dataUsedBefore - used - pending
}
