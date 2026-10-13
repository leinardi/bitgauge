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

// What triage looks at: every baseline entry, plus what the last run found that the baseline does not
// list. The last run counts only when its completion record belongs to the run manifest beside it and
// every pair it claims to have covered has this run's compared record.

import { identity, loadBaseline, type BaselineEntry } from '../baseline.ts'
import { readCompletion, readExpected, readRecords, type Completion, type Expected, type RunRecord } from '../records.ts'
import { pairKey } from '../selection.ts'
import type { Entry } from './identity.ts'

export type EntrySource = 'baselined' | 'pending'

export interface AvailableEntry extends Entry {
  source: EntrySource
  // The baseline's reason for a baselined entry; null for a pending one.
  reason: string | null
}

export interface CompletionState {
  completion: Completion | null
  // Null when the completion is valid, otherwise why it is not.
  invalid: string | null
}

export interface Inputs {
  baseline: BaselineEntry[]
  completion: CompletionState
  available: AvailableEntry[]
}

export function judgeCompletion(
  completion: Completion | null,
  expected: Expected | null,
  records: readonly RunRecord[],
): CompletionState {
  if (completion === null) return { completion, invalid: 'no completion record' }
  if (expected === null) return { completion, invalid: 'no run manifest beside the completion record' }
  if (completion.runId !== expected.runId) {
    return { completion, invalid: `the completion record is from run ${completion.runId}, the manifest from ${expected.runId}` }
  }
  const compared = new Set(records.filter((r) => r.runId === completion.runId && r.status === 'compared').map((r) => pairKey(r)))
  const unproven = completion.covered.filter((pair) => !compared.has(pairKey(pair)))
  if (unproven.length > 0) {
    return { completion, invalid: `${unproven.length} covered pair(s) have no compared record from this run` }
  }
  return { completion, invalid: null }
}

// The findings of each covered pair of a valid completion that the baseline does not list. Nothing
// from a pair the run did not cover, and nothing at all from a run that cannot be trusted.
export function pendingEntries(state: CompletionState, records: readonly RunRecord[], baseline: readonly BaselineEntry[]): AvailableEntry[] {
  const completion = state.completion
  if (completion === null || state.invalid !== null) return []
  const covered = new Set(completion.covered.map((pair) => pairKey(pair)))
  const listed = new Set(baseline.map((e) => identity(e, e)))
  const pending: AvailableEntry[] = []
  for (const record of records) {
    if (record.runId !== completion.runId || record.status !== 'compared' || !covered.has(pairKey(record))) continue
    for (const f of record.findings) {
      if (listed.has(identity(record, f))) continue
      pending.push({ project: record.project, scenario: record.scenario, layer: f.layer, path: f.path, kind: f.kind, detail: f.detail, source: 'pending', reason: null })
    }
  }
  return pending
}

export function availableSet(baseline: readonly BaselineEntry[], pending: readonly AvailableEntry[]): AvailableEntry[] {
  const baselined = baseline.map(
    (e): AvailableEntry => ({ project: e.project, scenario: e.scenario, layer: e.layer, path: e.path, kind: e.kind, detail: e.detail, source: 'baselined', reason: e.reason }),
  )
  return [...baselined, ...pending]
}

export interface InputPaths {
  baselineFile?: string
  runDir?: string
}

export function loadInputs(paths: InputPaths = {}): Inputs {
  const baseline = loadBaseline(paths.baselineFile)
  const records = readRecords(paths.runDir)
  const completion = judgeCompletion(readCompletion(paths.runDir), readExpected(paths.runDir), records)
  return { baseline, completion, available: availableSet(baseline, pendingEntries(completion, records, baseline)) }
}
