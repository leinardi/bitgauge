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

import type { DirectionResult, Responsiveness } from '@/engine/messages'

// HTTP loaded responsiveness in the result object (measurement.md sections 12.6 and 17): the block
// each direction that ran settled as it finished, already quantized, on its direction.

/** The direction with its responsiveness block; one that did not run, or a result without the block, is unchanged. */
export function withResponsiveness<T extends DirectionResult>(block: T, responsiveness: Responsiveness | null): T {
  return responsiveness === null || block.status === 'skipped' ? block : { ...block, responsiveness }
}
