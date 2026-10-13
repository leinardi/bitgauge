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
// @vitest-environment node

import { describe, expect, it } from 'vitest'

import { completionRecord, computeCoverage, writeRefusals } from './judge.ts'
import type { Expected, RunRecord } from './records.ts'
import { pairKey, type Pair } from './selection.ts'

const pairs: Pair[] = [
  { project: 'p', scenario: 'one' },
  { project: 'p', scenario: 'two' },
]

const record = (pair: Pair, status: RunRecord['status'] = 'compared', runId = 'run'): RunRecord => ({
  ...pair,
  runId,
  status,
  findings: [],
  error: status === 'harness-error' ? 'harness: vue one step 1: timeout' : null,
})

const outcomes = (...statuses: string[]) => new Map(pairs.map((pair, i) => [pairKey(pair), statuses[i] ?? 'passed']))

describe('computeCoverage', () => {
  it('covers a pair only when this run compared it and the test finished', () => {
    const coverage = computeCoverage('run', pairs, pairs.map((p) => record(p)), outcomes('passed', 'failed'))
    expect(coverage.covered.size).toBe(2)
    expect(writeRefusals('failed', coverage)).toEqual([])
  })

  it('does not count a record left by another run', () => {
    const coverage = computeCoverage('run', pairs, [record(pairs[0] as Pair), record(pairs[1] as Pair, 'compared', 'old')], outcomes())
    expect(coverage.covered.size).toBe(1)
    expect(coverage.missing).toEqual([pairs[1]])
  })

  it('does not count a skipped, interrupted or unreported test even with a record', () => {
    const coverage = computeCoverage('run', pairs, pairs.map((p) => record(p)), new Map([[pairKey(pairs[0] as Pair), 'skipped']]))
    expect(coverage.covered.size).toBe(0)
    expect(coverage.unfinished.map((u) => u.status)).toEqual(['skipped', 'not run'])
  })
})

describe('writeRefusals', () => {
  it('refuses a run with a harness error, a missing record, or an interruption', () => {
    const harness = computeCoverage('run', pairs, [record(pairs[0] as Pair, 'harness-error'), record(pairs[1] as Pair)], outcomes('failed'))
    expect(writeRefusals('failed', harness)).toEqual(['1 harness error'])

    const missing = computeCoverage('run', pairs, [record(pairs[0] as Pair)], outcomes('passed', 'timedOut'))
    expect(writeRefusals('passed', missing)).toEqual(['1 pair has no record', '1 test did not finish'])

    const complete = computeCoverage('run', pairs, pairs.map((p) => record(p)), outcomes())
    expect(writeRefusals('interrupted', complete)).toEqual(['the run was interrupted'])
  })
})

describe('completionRecord', () => {
  const expected: Expected = { runId: 'run', matrix: 'full', scenarioFilter: null, mode: 'update', pairs }
  const finishedAt = '2026-10-04T10:00:00.000Z'

  it('marks a run that compared every pair complete, with every covered pair listed', () => {
    const coverage = computeCoverage('run', pairs, pairs.map((p) => record(p)), outcomes())
    expect(completionRecord(expected, coverage, 'passed', finishedAt)).toEqual({
      runId: 'run',
      finishedAt,
      matrix: 'full',
      scenarioFilter: null,
      mode: 'update',
      runStatus: 'passed',
      projects: ['p'],
      scenarios: ['one', 'two'],
      covered: pairs,
      refusals: [],
      complete: true,
    })
  })

  it('marks a run incomplete when a test timed out, even with every record compared', () => {
    const coverage = computeCoverage('run', pairs, pairs.map((p) => record(p)), outcomes('passed', 'timedOut'))
    const completion = completionRecord(expected, coverage, 'failed', finishedAt)
    expect(completion.complete).toBe(false)
    expect(completion.refusals).toEqual(['1 test did not finish'])
    expect(completion.covered).toEqual([pairs[0]])
  })

  it('marks an interrupted run incomplete', () => {
    const coverage = computeCoverage('run', pairs, pairs.map((p) => record(p)), outcomes())
    const completion = completionRecord(expected, coverage, 'interrupted', finishedAt)
    expect(completion.complete).toBe(false)
    expect(completion.refusals).toEqual(['the run was interrupted'])
  })

  it('keeps a run with parity failures complete: the failures are its result', () => {
    const coverage = computeCoverage('run', pairs, pairs.map((p) => record(p)), outcomes('failed', 'failed'))
    const completion = completionRecord(expected, coverage, 'failed', finishedAt)
    expect(completion.complete).toBe(true)
    expect(completion.covered).toEqual(pairs)
  })
})
