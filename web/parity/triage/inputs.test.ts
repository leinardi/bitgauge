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

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { BaselineEntry } from '../baseline.ts'
import type { Finding } from '../findings.ts'
import type { Completion, Expected, RunRecord } from '../records.ts'
import { availableSet, judgeCompletion, loadInputs, pendingEntries } from './inputs.ts'

const PROJECT = 'light-desktop'
const known: Finding = { layer: 'style', path: 'main > button', kind: 'color', detail: 'red → blue' }
const fresh: Finding = { layer: 'content', path: 'main', kind: 'missing', detail: 'button "Start test"' }

const baseline: BaselineEntry[] = [{ project: PROJECT, scenario: 'test/idle', ...known, reason: 'adopted' }]

const expected: Expected = {
  runId: 'run',
  matrix: 'default',
  scenarioFilter: null,
  mode: 'check',
  pairs: [
    { project: PROJECT, scenario: 'test/idle' },
    { project: PROJECT, scenario: 'test/complete' },
  ],
}

const record = (scenario: string, findings: Finding[], overrides: Partial<RunRecord> = {}): RunRecord => ({
  project: PROJECT,
  scenario,
  runId: 'run',
  status: 'compared',
  findings,
  error: null,
  ...overrides,
})

const completion = (overrides: Partial<Completion> = {}): Completion => ({
  runId: 'run',
  finishedAt: '2026-10-04T10:00:00.000Z',
  matrix: 'default',
  scenarioFilter: null,
  mode: 'check',
  runStatus: 'failed',
  projects: [PROJECT],
  scenarios: ['test/idle', 'test/complete'],
  covered: [{ project: PROJECT, scenario: 'test/idle' }],
  refusals: ['1 test did not finish'],
  complete: false,
  ...overrides,
})

describe('judgeCompletion', () => {
  const records = [record('test/idle', [known, fresh]), record('test/complete', [fresh])]

  it('accepts a completion of the manifest beside it whose covered pairs all have compared records', () => {
    expect(judgeCompletion(completion(), expected, records).invalid).toBeNull()
  })

  it('refuses a completion whose runId does not match the manifest', () => {
    expect(judgeCompletion(completion({ runId: 'old' }), expected, records).invalid).toContain('from run old')
  })

  it('refuses no completion, or no manifest', () => {
    expect(judgeCompletion(null, expected, records).invalid).toBe('no completion record')
    expect(judgeCompletion(completion(), null, records).invalid).toContain('no run manifest')
  })

  it('refuses a covered pair without a compared record from this run', () => {
    const covered = [{ project: PROJECT, scenario: 'test/complete' }]
    expect(judgeCompletion(completion({ covered }), expected, [record('test/complete', [], { status: 'harness-error' })]).invalid).toContain('1 covered pair')
    expect(judgeCompletion(completion({ covered }), expected, [record('test/complete', [], { runId: 'old' })]).invalid).toContain('1 covered pair')
  })
})

describe('pendingEntries', () => {
  const records = [record('test/idle', [known, fresh]), record('test/complete', [fresh])]

  it('comes only from covered pairs of a valid completion, and only what the baseline lacks', () => {
    const pending = pendingEntries(judgeCompletion(completion(), expected, records), records, baseline)
    expect(pending).toEqual([{ project: PROJECT, scenario: 'test/idle', ...fresh, source: 'pending', reason: null }])
  })

  it('is empty when the completion is not valid', () => {
    const state = judgeCompletion(completion({ runId: 'old' }), expected, records)
    expect(pendingEntries(state, records, baseline)).toEqual([])
    expect(pendingEntries(judgeCompletion(null, expected, records), records, baseline)).toEqual([])
  })

  it('ignores records left by another run', () => {
    const stale = [record('test/idle', [fresh], { runId: 'old' })]
    const covered = [{ project: PROJECT, scenario: 'test/idle' }]
    const state = { completion: completion({ covered }), invalid: null }
    expect(pendingEntries(state, stale, baseline)).toEqual([])
  })
})

describe('availableSet', () => {
  it('tags every entry with where it came from', () => {
    const pending = pendingEntries(judgeCompletion(completion(), expected, [record('test/idle', [fresh])]), [record('test/idle', [fresh])], baseline)
    expect(availableSet(baseline, pending).map((e) => [e.kind, e.source, e.reason])).toEqual([
      ['color', 'baselined', 'adopted'],
      ['missing', 'pending', null],
    ])
  })
})

describe('loadInputs', () => {
  let dir = ''
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'parity-inputs-'))
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('reads the baseline and the run from the paths it is given', () => {
    const runDir = path.join(dir, '.run')
    mkdirSync(path.join(runDir, 'records'), { recursive: true })
    writeFileSync(path.join(runDir, 'expected.json'), JSON.stringify(expected))
    writeFileSync(path.join(runDir, 'completion.json'), JSON.stringify(completion()))
    writeFileSync(path.join(runDir, 'records', 'idle.json'), JSON.stringify(record('test/idle', [known, fresh])))
    const baselineFile = path.join(dir, 'baseline')
    writeFileSync(baselineFile, `${PROJECT}\ttest/idle\tstyle\tmain > button\tcolor\tred → blue\tadopted\n`)

    const inputs = loadInputs({ baselineFile, runDir })
    expect(inputs.completion.invalid).toBeNull()
    expect(inputs.available.map((e) => e.source)).toEqual(['baselined', 'pending'])
  })

  it('has no pending entries without a run', () => {
    const inputs = loadInputs({ baselineFile: path.join(dir, 'none'), runDir: path.join(dir, 'none') })
    expect(inputs.completion.invalid).toBe('no completion record')
    expect(inputs.available).toEqual([])
  })
})
