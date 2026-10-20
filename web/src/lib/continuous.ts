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

import type { Direction, MeasuringPhase, TestSettings } from '@/engine/messages'

// A Continuous run runs one direction, `continuousDirection`, whatever `phases` lists of the two
// (measurement.md sections 8.5 and 15).

/** The one direction a Continuous run runs, or null for a bounded run. */
export function continuousDirection(settings: Pick<TestSettings, 'preset' | 'continuousDirection'> | null): Direction | null {
  return settings?.preset === 'continuous' ? (settings.continuousDirection ?? 'download') : null
}

/** The phases a run runs, in order: a Continuous run's idle latency, if listed, and its one direction. */
export function runPhases(settings: Pick<TestSettings, 'preset' | 'phases' | 'continuousDirection'>): MeasuringPhase[] {
  const direction = continuousDirection(settings)
  return direction === null ? settings.phases : [...settings.phases.filter((phase) => phase === 'idle'), direction]
}
