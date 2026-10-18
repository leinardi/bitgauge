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

import type { Direction, Result } from '@/engine/messages'

// Whether a partial or error result can be kept in history (ui/screens.md section 1, save-bar.md,
// flows.md section 4): it needs at least one finished phase, or the partial idle latency a stop
// during it kept, so idle latency counts whenever the result has it. A direction finished when it
// ended on its own, with or without a number, and not when the stop or the error ended it.

export function canKeep(result: Result): boolean {
  const stopped = new Set(result.notices.flatMap((notice) => (notice.code === 'stopped-early' ? [notice.direction] : [])))
  const finished = (direction: Direction) => {
    const status = result[direction]?.status
    return (status === 'measured' || status === 'insufficient-data') && !stopped.has(direction)
  }
  return result.idle !== undefined || finished('download') || finished('upload')
}
