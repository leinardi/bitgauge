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

// The rules the reporter applies to a finished run, kept free of Playwright so they can be tested on
// their own: which expected pairs count as compared, and why a run may not write the baseline.

import type { Finding } from './findings.ts'
import type { Completion, Expected, RunRecord } from './records.ts'
import { pairKey, type Pair } from './selection.ts'

// Test outcomes that mean the test did not run to its end, whatever its record says.
const UNFINISHED: ReadonlySet<string> = new Set(['skipped', 'interrupted', 'timedOut'])

export interface Coverage {
  covered: Map<string, { pair: Pair; findings: Finding[] }>
  harness: RunRecord[]
  missing: Pair[]
  unfinished: { pair: Pair; status: string }[]
}

// A pair is covered only when this run's record says it was compared and the test itself finished.
// A record from another run, a test Playwright never reported, or one it skipped all leave the pair
// uncovered, so nothing can pass for compared without having been compared.
export function computeCoverage(
  runId: string,
  pairs: readonly Pair[],
  records: readonly RunRecord[],
  outcomes: ReadonlyMap<string, string>,
): Coverage {
  const byPair = new Map(records.filter((r) => r.runId === runId).map((r) => [pairKey(r), r]))
  const coverage: Coverage = { covered: new Map(), harness: [], missing: [], unfinished: [] }
  for (const pair of pairs) {
    const key = pairKey(pair)
    const record = byPair.get(key)
    const outcome = outcomes.get(key)
    const finished = outcome !== undefined && !UNFINISHED.has(outcome)
    if (!finished) coverage.unfinished.push({ pair, status: outcome ?? 'not run' })
    if (record === undefined) coverage.missing.push(pair)
    else if (record.status === 'harness-error') coverage.harness.push(record)
    else if (finished) coverage.covered.set(key, { pair, findings: record.findings })
  }
  return coverage
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

// Why this run may not write .parity-baseline; empty when it may. Writing from a partial run would
// drop the entries of every pair it failed to compare, so it is a complete run or nothing.
export function writeRefusals(runStatus: string, coverage: Coverage): string[] {
  const refusals: string[] = []
  if (runStatus === 'interrupted' || runStatus === 'timedout') refusals.push(`the run was ${runStatus}`)
  if (coverage.missing.length > 0) refusals.push(plural(coverage.missing.length, 'pair has no record', 'pairs have no record'))
  if (coverage.unfinished.length > 0) refusals.push(plural(coverage.unfinished.length, 'test did not finish', 'tests did not finish'))
  if (coverage.harness.length > 0) refusals.push(plural(coverage.harness.length, 'harness error', 'harness errors'))
  return refusals
}

// The run's completion record. Projects and scenarios are what the run was asked to cover, in the
// manifest's order, so a reader can tell a filtered or default-matrix run from a full one.
export function completionRecord(expected: Expected, coverage: Coverage, runStatus: string, finishedAt: string): Completion {
  const refusals = writeRefusals(runStatus, coverage)
  return {
    runId: expected.runId,
    finishedAt,
    matrix: expected.matrix,
    scenarioFilter: expected.scenarioFilter,
    mode: expected.mode,
    runStatus,
    projects: [...new Set(expected.pairs.map((p) => p.project))],
    scenarios: [...new Set(expected.pairs.map((p) => p.scenario))],
    covered: [...coverage.covered.values()].map(({ pair }) => ({ project: pair.project, scenario: pair.scenario })),
    refusals,
    complete: refusals.length === 0,
  }
}
