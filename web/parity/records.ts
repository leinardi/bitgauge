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

// The run manifest: what a run was asked to compare (expected.json, written by globalSetup) and what
// each test reports it actually compared (one record per pair). The reporter judges coverage from
// these files alone, so a test that never ran, or died before reporting, cannot pass for covered.

import { mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import type { Finding } from './findings.ts'
import type { BaselineMode, Matrix, Pair } from './selection.ts'

const RUN_DIR = fileURLToPath(new URL('./.run/', import.meta.url))
const EXPECTED_FILE = 'expected.json'
const RECORDS_DIR = 'records'

export interface Expected {
  runId: string
  matrix: Matrix
  scenarioFilter: string | null
  mode: BaselineMode
  pairs: Pair[]
}

// What the reporter concluded about the run as a whole. A run is complete only when nothing kept it
// from comparing every expected pair; parity failures do not make it incomplete, they are its result.
export interface Completion {
  runId: string
  finishedAt: string
  matrix: Matrix
  scenarioFilter: string | null
  mode: BaselineMode
  runStatus: string
  projects: string[]
  scenarios: string[]
  covered: Pair[]
  refusals: string[]
  complete: boolean
}

export type RecordStatus = 'compared' | 'harness-error'

export interface RunRecord extends Pair {
  runId: string
  status: RecordStatus
  findings: Finding[]
  error: string | null
}

// Same directory, then rename: a reader sees the whole file or no file.
export function writeFileAtomically(file: string, data: string): void {
  const temp = `${file}.${process.pid}.tmp`
  writeFileSync(temp, data)
  renameSync(temp, file)
}

// Everything the harness writes or reads of a run takes the run directory as a parameter, so its tests
// and the triage helper's can point it at a scratch run.
export function startRun(expected: Expected, runDir = RUN_DIR): void {
  rmSync(runDir, { recursive: true, force: true })
  mkdirSync(path.join(runDir, RECORDS_DIR), { recursive: true })
  writeFileAtomically(path.join(runDir, EXPECTED_FILE), JSON.stringify(expected, null, 2))
}

export function readExpected(runDir = RUN_DIR): Expected | null {
  try {
    return JSON.parse(readFileSync(path.join(runDir, EXPECTED_FILE), 'utf8')) as Expected
  } catch {
    return null
  }
}

function recordFile(pair: Pair, runDir: string): string {
  const safe = `${pair.project}__${pair.scenario}`.replace(/[^A-Za-z0-9._-]/g, '_')
  return path.join(runDir, RECORDS_DIR, `${safe}.json`)
}

export function writeRecord(record: RunRecord, runDir = RUN_DIR): void {
  writeFileAtomically(recordFile(record, runDir), JSON.stringify(record, null, 2))
}

export function readRecords(runDir = RUN_DIR): RunRecord[] {
  const dir = path.join(runDir, RECORDS_DIR)
  let files: string[]
  try {
    files = readdirSync(dir).filter((file) => file.endsWith('.json'))
  } catch {
    return []
  }
  return files.map((file) => JSON.parse(readFileSync(path.join(dir, file), 'utf8')) as RunRecord)
}

export function writeCompletion(completion: Completion, runDir = RUN_DIR): void {
  writeFileAtomically(path.join(runDir, 'completion.json'), `${JSON.stringify(completion, null, 2)}\n`)
}

export function readCompletion(runDir = RUN_DIR): Completion | null {
  try {
    return JSON.parse(readFileSync(path.join(runDir, 'completion.json'), 'utf8')) as Completion
  } catch {
    return null
  }
}
