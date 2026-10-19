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

import { MEASURED_SECONDS, type Retention } from '@/engine/continuous/retention'
import type { ContinuousSoFar } from '@/engine/messages'
import { bitsPerSecond } from '@/engine/stats/units'

// A Continuous run's live figures (architecture.md section 4, measurement.md section 15): the four
// rates from the retention's running aggregates, absent until three fully known 1 s cells exist,
// so the UI shows a dash and never 0.

const SECOND_MS = 1000

/** What the run adds to the retention's figures. */
export interface LiveContext {
  elapsedMs: number
  runLengthMs: number | null
  dataBytes: number
  loadedMs: number | null
}

export function continuousSoFar(retention: Retention, context: LiveContext): ContinuousSoFar {
  const { seconds, bytes, minBytes, maxBytes, peakLastHourBytes } = retention.aggregates()
  const rate = (cell: number) => bitsPerSecond(cell, SECOND_MS)
  const rates =
    seconds < MEASURED_SECONDS || minBytes === null || maxBytes === null
      ? {}
      : {
          minBitsPerSecond: rate(minBytes),
          avgBitsPerSecond: bitsPerSecond(bytes, seconds * SECOND_MS),
          maxBitsPerSecond: rate(maxBytes),
          ...(peakLastHourBytes === null ? {} : { peakLastHourBitsPerSecond: rate(peakLastHourBytes) }),
        }
  return {
    elapsedMs: context.elapsedMs,
    ...(context.runLengthMs === null ? {} : { runLengthMs: context.runLengthMs }),
    ...rates,
    dataBytes: context.dataBytes,
    ...(context.loadedMs === null ? {} : { loadedLastMinuteMedianMs: context.loadedMs }),
  }
}
