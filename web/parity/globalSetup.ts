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

// Starts the run manifest: a fresh run id, an empty record directory and the list of pairs this run
// must compare. Workers inherit the run id through the environment, so a record left over from an
// earlier run can never be counted for this one.

import { randomUUID } from 'node:crypto'

import { startRun } from './records.ts'
import { SCENARIOS } from './scenarios.ts'
import { expectedPairs, selectionFromEnv } from './selection.ts'

export default function globalSetup(): void {
  const selection = selectionFromEnv(process.env, SCENARIOS)
  const pairs = expectedPairs(selection)
  // Nothing passes on nothing: a run with no pair to compare is a broken run, not a clean one.
  if (pairs.length === 0) throw new Error('demo parity: the selection names no scenario to compare')
  const runId = randomUUID()
  process.env['PARITY_RUN_ID'] = runId
  startRun({
    runId,
    matrix: selection.matrix,
    scenarioFilter: selection.scenarioFilter,
    mode: selection.mode,
    pairs,
  })
}
