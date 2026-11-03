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

import type { Wording } from '@/components/test/wording'
import type { Result } from '@/engine/messages'

// Why a result has no bufferbloat grade (ui/screens.md section 6): one reason, the same on every
// screen that shows the grade.

/** Why a result has no grade (ui/screens.md section 6), the same on the Test screen and the Result detail. */
export type UngradedReason = 'no-idle' | 'no-loaded' | 'no-gradable' | 'incomplete'

/**
 * The one reason a result has no grade, from what it holds: no idle latency, or a measured loaded
 * latency without its increase over it; else, when an error ended the run before any direction
 * measured its loaded latency, an incomplete test; else no direction with a loaded latency; else
 * none of them gradable (measurement.md section 11.3, ui/screens.md section 6).
 */
export function ungradedReason(result: Result): UngradedReason {
  if (result.idle?.medianMs === undefined) {
    return 'no-idle'
  }
  const loaded = (['download', 'upload'] as const).flatMap((direction) => result[direction]?.loadedLatency ?? [])
  // An error before any direction measured its loaded latency is an incomplete test: an unavailable
  // block is no measured loaded latency. Without an error, an unavailable one is not gradable.
  if (result.status === 'error' && loaded.every((value) => 'status' in value)) {
    return 'incomplete'
  }
  if (loaded.length === 0) {
    return 'no-loaded'
  }
  // A measured loaded latency without its increase had no idle median to compare with.
  return loaded.some((value) => !('status' in value) && value.increaseMs === undefined) ? 'no-idle' : 'no-gradable'
}

/** The reason's words, as the Result detail, History and Compare show them beside "Not graded". */
export function ungradedText(result: Result, t: Wording['t']): string {
  switch (ungradedReason(result)) {
    case 'no-idle':
      return t('result.load.ungraded.noIdle')
    case 'no-loaded':
      return t('result.load.ungraded.noLoaded')
    case 'no-gradable':
      return t('result.load.ungraded.noGradable')
    case 'incomplete':
      return t('result.load.ungraded.incomplete')
  }
}
