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

import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { type Completion, type Expected, readCompletion, readExpected, readRecords, type RunRecord, startRun, writeCompletion, writeRecord } from './records.ts'

describe('completion record file', () => {
  let dir = ''
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'parity-run-'))
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  const completion: Completion = {
    runId: 'run',
    finishedAt: '2026-10-04T10:00:00.000Z',
    matrix: 'full',
    scenarioFilter: null,
    mode: 'update',
    runStatus: 'passed',
    projects: ['p'],
    scenarios: ['one'],
    covered: [{ project: 'p', scenario: 'one' }],
    refusals: [],
    complete: true,
  }

  it('reads back what was written, leaving no temporary file behind', () => {
    writeCompletion(completion, dir)
    expect(readCompletion(dir)).toEqual(completion)
    expect(readdirSync(dir)).toEqual(['completion.json'])
  })

  it('reads no completion from a run that never wrote one', () => {
    expect(readCompletion(dir)).toBeNull()
  })
})

describe('the run manifest and its records', () => {
  let dir = ''
  beforeEach(() => {
    dir = path.join(mkdtempSync(path.join(tmpdir(), 'parity-run-')), '.run')
  })
  afterEach(() => {
    rmSync(path.dirname(dir), { recursive: true, force: true })
  })

  const expected: Expected = { runId: 'run', matrix: 'default', scenarioFilter: null, mode: 'check', pairs: [{ project: 'light-desktop', scenario: 'test/idle' }] }
  const record: RunRecord = { project: 'light-desktop', scenario: 'test/idle', runId: 'run', status: 'compared', findings: [], error: null }

  it('starts a run afresh: the manifest written, the records of the last run gone', () => {
    startRun(expected, dir)
    writeRecord(record, dir)
    startRun({ ...expected, runId: 'next' }, dir)
    expect(readExpected(dir)).toEqual({ ...expected, runId: 'next' })
    expect(readRecords(dir)).toEqual([])
  })

  it('keeps one record per pair, under a file name safe for any scenario id', () => {
    startRun(expected, dir)
    writeRecord(record, dir)
    writeRecord({ ...record, status: 'harness-error', error: 'harness: timeout' }, dir)
    expect(readRecords(dir)).toEqual([{ ...record, status: 'harness-error', error: 'harness: timeout' }])
    expect(readdirSync(path.join(dir, 'records'))).toEqual(['light-desktop__test_idle.json'])
  })

  it('reads no manifest and no records from a run that never started', () => {
    expect(readExpected(dir)).toBeNull()
    expect(readRecords(dir)).toEqual([])
  })
})
