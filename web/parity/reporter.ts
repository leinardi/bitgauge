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

// Judges the run as a whole: which expected pairs were really compared, which were not and why, and
// which baseline entries this run said nothing about. In update and accept modes it is also the only
// writer of .parity-baseline, and it writes only after the whole run is known to be complete.

import type { FullResult, Reporter, TestCase, TestResult } from '@playwright/test/reporter'

import { identity, isOrphan, loadBaseline, mergeBaseline, writeBaseline, type BaselineEntry } from './baseline.ts'
import { completionRecord, computeCoverage } from './judge.ts'
import { readExpected, readRecords, writeCompletion } from './records.ts'
import { SCENARIOS } from './scenarios.ts'
import { ALL_PROJECTS, pairKey, selectionFromEnv, type Pair } from './selection.ts'

function plural(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`
}

function label(pair: Pair): string {
  return `${pair.project}  ${pair.scenario}`
}

export default class ParityReporter implements Reporter {
  private readonly outcomes = new Map<string, string>()

  onTestEnd(test: TestCase, result: TestResult): void {
    const project = test.parent.project()?.name ?? ''
    this.outcomes.set(pairKey({ project, scenario: test.title }), result.status)
  }

  async onEnd(result: FullResult): Promise<{ status?: FullResult['status'] } | undefined> {
    const lines: string[] = []
    const status = this.judge(result, lines)
    console.log(`\n${lines.join('\n')}\n`)
    return status === undefined ? undefined : { status }
  }

  private judge(result: FullResult, lines: string[]): FullResult['status'] | undefined {
    const selection = selectionFromEnv(process.env, SCENARIOS)
    const expected = readExpected()
    if (expected === null) {
      lines.push('demo parity: no run manifest; globalSetup did not run, so nothing was compared')
      return 'failed'
    }
    const coverage = computeCoverage(expected.runId, expected.pairs, readRecords(), this.outcomes)
    // Written in every mode, before anything below can return: the triage helper refuses to mutate
    // the ledger or the baseline without proof that this run compared everything it was asked to.
    const completion = completionRecord(expected, coverage, result.status, new Date().toISOString())
    writeCompletion(completion)

    let baseline: BaselineEntry[]
    try {
      baseline = loadBaseline()
    } catch (error) {
      lines.push(`demo parity: ${error instanceof Error ? error.message : String(error)}`)
      return 'failed'
    }
    const projects = new Set(ALL_PROJECTS.map((p) => p.name))
    const scenarios = new Set(SCENARIOS.map((s) => s.id))
    const orphans = baseline.filter((e) => isOrphan(e, projects, scenarios))
    const selectedProjects = new Set(expected.pairs.map((p) => p.project))
    const selectedScenarios = new Set(expected.pairs.map((p) => p.scenario))
    const unchecked = baseline.filter((e) => !isOrphan(e, projects, scenarios) && !coverage.covered.has(pairKey(e)))
    const notSelected = unchecked.filter((e) => !selectedProjects.has(e.project)).length
    const filteredOut = unchecked.filter((e) => selectedProjects.has(e.project) && !selectedScenarios.has(e.scenario)).length
    const notCompared = unchecked.length - notSelected - filteredOut

    lines.push(
      `demo parity · run ${expected.runId.slice(0, 8)} · matrix ${expected.matrix} · scenarios ${expected.scenarioFilter ?? 'all'} · mode ${expected.mode}`,
      `  expected  ${plural(expected.pairs.length, 'pair')} (${plural(selectedProjects.size, 'project')} × ${plural(selectedScenarios.size, 'scenario')})`,
      `  compared  ${coverage.covered.size}`,
    )
    for (const r of coverage.harness) lines.push(`  harness error  ${label(r)}\n      ${r.error ?? ''}`)
    for (const pair of coverage.missing) lines.push(`  missing   ${label(pair)}: no record; the test died before reporting`)
    for (const { pair, status } of coverage.unfinished) lines.push(`  ${status.padEnd(9)} ${label(pair)}`)
    for (const e of orphans) lines.push(`  orphan    ${e.project}  ${e.scenario}: the baseline names a project or scenario that no longer exists`)
    lines.push(
      `  baseline  ${baseline.length - unchecked.length - orphans.length} checked · not checked this run: ` +
        `${notSelected} (project not selected), ${filteredOut} (scenario filtered out), ${notCompared} (not compared)`,
    )

    const refusals = completion.refusals
    if (selection.mode === 'check') {
      return refusals.length > 0 || orphans.length > 0 ? 'failed' : undefined
    }
    if (refusals.length > 0) {
      lines.push(`  .parity-baseline NOT written: ${refusals.join('; ')}`)
      return 'failed'
    }
    const next = mergeBaseline({
      old: baseline,
      covered: coverage.covered,
      mode: selection.mode,
      reason: selection.reason,
      projects,
      scenarios,
    })
    const before = new Set(baseline.map((e) => identity(e, e)))
    const after = new Set(next.map((e) => identity(e, e)))
    const removed = baseline.filter((e) => !after.has(identity(e, e))).length
    const added = next.filter((e) => !before.has(identity(e, e))).length
    writeBaseline(next)
    lines.push(`  .parity-baseline written: ${removed} removed, ${added} added, ${next.length} total`)
    return undefined
  }
}
