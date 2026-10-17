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

// The percentile of measurement.md section 2, for numbers the page shows on its own: linear
// interpolation between the closest ranks. The engine computes every number of the result with its
// own; this one only summarizes what the page already holds, as a live reading.

/** The q-th percentile of the values (q in [0, 100]), or null without any. */
export function percentile(values: readonly number[], q: number): number | null {
  if (values.length === 0) {
    return null
  }
  const sorted = [...values].sort((a, b) => a - b)
  const rank = ((sorted.length - 1) * Math.min(100, Math.max(0, q))) / 100
  const below = Math.floor(rank)
  const lower = sorted[below] ?? 0
  const upper = sorted[Math.min(below + 1, sorted.length - 1)] ?? lower
  return lower + (rank - below) * (upper - lower)
}
