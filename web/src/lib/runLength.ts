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
import { MAX_RUN_LENGTH_S, MIN_RUN_LENGTH_S } from '@/lib/urlValues'

// A Continuous run length as the Settings screen shows and takes it (ui/screens.md section 4): a
// whole number of minutes, hours or days from 1 minute to 7 days, stored in whole seconds. A stored
// value shows in the largest unit it is a whole number of; one that is not a whole number of
// minutes shows in minutes with up to two decimals.

export type RunLengthUnit = 'minutes' | 'hours' | 'days'

export const UNIT_S: Readonly<Record<RunLengthUnit, number>> = { minutes: 60, hours: 3600, days: 86_400 }

const LARGEST_FIRST: readonly RunLengthUnit[] = ['days', 'hours', 'minutes']

/** A stored run length in the unit it shows in. */
export function runLengthShown(seconds: number): { value: number; unit: RunLengthUnit } {
  const unit = LARGEST_FIRST.find((candidate) => seconds % UNIT_S[candidate] === 0)
  return unit === undefined ? { value: Number((seconds / UNIT_S.minutes).toFixed(2)), unit: 'minutes' } : { value: seconds / UNIT_S[unit], unit }
}

/** A typed run length in seconds: a whole number of `unit` from 1 minute to 7 days, else undefined. */
export function runLengthSeconds(text: string, unit: RunLengthUnit): number | undefined {
  if (!/^\d+$/.test(text)) {
    return undefined
  }
  const seconds = Number(text) * UNIT_S[unit]
  return seconds >= MIN_RUN_LENGTH_S && seconds <= MAX_RUN_LENGTH_S ? seconds : undefined
}
