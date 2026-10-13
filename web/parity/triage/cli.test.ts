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

import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { formatBaseline, type BaselineEntry } from '../baseline.ts'
import type { Finding } from '../findings.ts'
import { completionRecord, computeCoverage } from '../judge.ts'
import type { Completion, Expected, RunRecord } from '../records.ts'
import { pairKey, type Pair } from '../selection.ts'
import { admitCommand, closeCommand, pathsFromEnv, releaseCommand, runCommand, showCommand, snapshotCommand, statusCommand, tryCommand, type Paths } from './cli.ts'
import { cluster, confirmation, DAY, decided, entry, EVIDENCE, match, ownedOf, verdict } from './fixtures.ts'
import { ALL_PROJECT_NAMES } from './identity.ts'
import { formatLedger, type Cluster, type Ledger } from './ledger.ts'

const SCENARIOS = ['test/idle', 'test/complete']
const LIGHT = ALL_PROJECT_NAMES.filter((p) => p.startsWith('light-'))

// A: in the baseline, in every project. B: in the baseline, unrelated. C: new in one project.
const A: Finding = { layer: 'style', path: 'main > button "Start test"', kind: 'font-weight', detail: '600 → 500' }
const B: Finding = { layer: 'style', path: 'main > table', kind: 'color', detail: 'red → blue' }
const C: Finding = { layer: 'style', path: 'main > button "Stop test"', kind: 'font-weight', detail: '700 → 500' }
const C_PROJECT = 'dark-narrow'

const baselineEntries: BaselineEntry[] = [
  ...ALL_PROJECT_NAMES.map((project) => ({ project, scenario: 'test/idle', ...A, reason: 'adopted' })),
  ...ALL_PROJECT_NAMES.map((project) => ({ project, scenario: 'test/complete', ...B, reason: 'adopted' })),
]

const allA = ALL_PROJECT_NAMES.map((project) => entry({ project, scenario: 'test/idle', ...A }))
const pendingC = entry({ project: C_PROJECT, scenario: 'test/idle', ...C, source: 'pending', reason: null })
const fontWeight = match({ scenarios: ['test/idle'], kind: '^font-weight$' })

interface RunShape {
  runId?: string
  matrix?: Expected['matrix']
  scenarios?: string[]
  outcome?: (pair: Pair) => string
  completion?: false
}

let dir = ''
let paths: Paths = { ledger: '' }

function findingsOf(pair: Pair): Finding[] {
  if (pair.scenario === 'test/complete') return [B]
  return pair.project === C_PROJECT ? [A, C] : [A]
}

function writeRun(shape: RunShape = {}): void {
  const runDir = paths.runDir ?? ''
  rmSync(runDir, { recursive: true, force: true })
  mkdirSync(path.join(runDir, 'records'), { recursive: true })
  const matrix = shape.matrix ?? 'full'
  const projects = matrix === 'full' ? ALL_PROJECT_NAMES : ['light-desktop']
  const pairs = projects.flatMap((project) => (shape.scenarios ?? SCENARIOS).map((scenario) => ({ project, scenario })))
  const expected: Expected = { runId: 'run', matrix, scenarioFilter: shape.scenarios === undefined ? null : shape.scenarios.join(','), mode: 'check', pairs }
  writeFileSync(path.join(runDir, 'expected.json'), JSON.stringify(expected))
  const records: RunRecord[] = pairs.map((pair) => ({ ...pair, runId: 'run', status: 'compared', findings: findingsOf(pair), error: null }))
  records.forEach((r, i) => writeFileSync(path.join(runDir, 'records', `${i}.json`), JSON.stringify(r)))
  if (shape.completion === false) return
  const outcomes = new Map(pairs.map((pair) => [pairKey(pair), shape.outcome?.(pair) ?? 'failed']))
  const coverage = computeCoverage('run', pairs, records, outcomes)
  const completion: Completion = { ...completionRecord(expected, coverage, 'failed', `${DAY}T10:00:00.000Z`), runId: shape.runId ?? 'run' }
  writeFileSync(path.join(runDir, 'completion.json'), JSON.stringify(completion))
}

function writeLedgerFile(...clusters: Cluster[]): void {
  writeFileSync(paths.ledger, formatLedger({ version: 1, clusters }))
}

function ledgerNow(): Ledger {
  return JSON.parse(readFileSync(paths.ledger, 'utf8')) as Ledger
}

// Every file under the scratch directory, by relative path, as bytes.
function snapshotFiles(): Map<string, string> {
  const files = new Map<string, string>()
  const walk = (at: string): void => {
    for (const name of readdirSync(at, { withFileTypes: true })) {
      const full = path.join(at, name.name)
      if (name.isDirectory()) walk(full)
      else files.set(path.relative(dir, full), readFileSync(full, 'latin1'))
    }
  }
  walk(dir)
  return files
}

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'parity-triage-'))
  paths = { ledger: path.join(dir, 'ledger.json'), baseline: path.join(dir, 'baseline'), runDir: path.join(dir, '.run') }
  writeFileSync(paths.baseline ?? '', formatBaseline(baselineEntries))
  writeRun()
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

const decidedOpen = (): Cluster =>
  cluster({ match: fontWeight, evidence: EVIDENCE, decision: verdict('kit'), actions: [{ target: 'vue', what: 'weight 500', done: false }], status: 'decided' })
const acceptedOwning = (owned: Cluster['owned'], overrides: Partial<Cluster> = {}): Cluster =>
  cluster({ match: fontWeight, evidence: EVIDENCE, decision: verdict('keep', { rationale: 'the kit is wrong here' }), owned, status: 'accepted', ...overrides })
// Owns an entry the run no longer has, with every action done: ready to close.
const fixed = (): Cluster =>
  decided([entry({ scenario: 'test/idle', path: 'gone', kind: 'font-weight' })], {
    match: match({ scenarios: ['test/idle'], kind: '^padding$' }),
    actions: [{ target: 'vue', what: 'weight 500', done: true }],
  })

describe('mutations refuse without proof of a complete full-matrix run', () => {
  const commands: [string, () => Cluster, () => ReturnType<typeof snapshotCommand>][] = [
    ['snapshot', decidedOpen, () => snapshotCommand(paths, 'start-button-weight')],
    ['admit', () => acceptedOwning(ownedOf([...allA, pendingC])), () => admitCommand(paths, 'start-button-weight')],
    ['close', fixed, () => closeCommand(paths, 'start-button-weight', null, DAY)],
  ]
  const runs: [string, () => void, string][] = [
    ['no completion', () => writeRun({ completion: false }), 'no valid completion: no completion record'],
    ['an incomplete run', () => writeRun({ outcome: (p) => (p.project === C_PROJECT && p.scenario === 'test/complete' ? 'timedOut' : 'failed') }), 'the run did not complete: 1 test did not finish'],
    ['a completion from another run', () => writeRun({ runId: 'old' }), 'no valid completion: the completion record is from run old'],
    ['the default matrix', () => writeRun({ matrix: 'default' }), 'the run used the default matrix, not full'],
    ['a required scenario not covered', () => writeRun({ scenarios: ['test/complete'] }), 'the run did not cover required scenarios: test/idle'],
  ]
  for (const [name, makeCluster, run] of commands) {
    for (const [what, setUp, reason] of runs) {
      it(`${name} refuses ${what}, writing nothing`, () => {
        writeLedgerFile(makeCluster())
        setUp()
        const before = snapshotFiles()
        const result = run()
        expect(result.code).toBe(1)
        expect(result.text).toContain(reason)
        expect(snapshotFiles()).toEqual(before)
      })
    }
  }
})

describe('snapshot', () => {
  it('owns exactly the current rule matches, and is atomic', () => {
    writeLedgerFile(decidedOpen())
    expect(snapshotCommand(paths, 'start-button-weight').code).toBe(0)
    expect(ledgerNow().clusters[0]?.owned).toEqual(ownedOf([...allA, pendingC]))
    expect(readdirSync(dir).filter((f) => f.endsWith('.tmp'))).toEqual([])
  })

  it('never takes entries another cluster owns, and adds only new matches with --extend', () => {
    const other = decided([pendingC], { id: 'stop-button', match: match({ path: 'Stop' }) })
    writeLedgerFile(acceptedOwning(ownedOf(allA.filter((e) => LIGHT.includes(e.project)))), other)
    expect(snapshotCommand(paths, 'start-button-weight').text).toContain('already owns entries')
    expect(snapshotCommand(paths, 'start-button-weight', true).code).toBe(0)
    const [mine, theirs] = ledgerNow().clusters
    expect(mine?.owned).toEqual(ownedOf(allA))
    expect(theirs?.owned).toEqual(ownedOf([pendingC]))
  })

  it('refuses a cluster that is still open, or whose rule overlaps another on unowned entries', () => {
    writeLedgerFile(cluster({ match: fontWeight }))
    expect(snapshotCommand(paths, 'start-button-weight').text).toContain('status is open')
    writeLedgerFile(decidedOpen(), cluster({ id: 'all-weights', match: match({ kind: 'weight' }) }))
    expect(snapshotCommand(paths, 'start-button-weight').text).toContain('rule overlap')
  })

  it('refuses a decision that is not valid for the status', () => {
    writeLedgerFile(cluster({ match: fontWeight, evidence: EVIDENCE, decision: confirmation(), actions: [{ target: 'vue', what: 'x', done: false }], status: 'decided' }))
    expect(snapshotCommand(paths, 'start-button-weight').text).toContain('a conflict needs a verdict')
  })
})

describe('admit', () => {
  it('refuses while the rule matches entries the cluster does not own', () => {
    writeLedgerFile(acceptedOwning(ownedOf(allA)))
    const before = snapshotFiles()
    const result = admitCommand(paths, 'start-button-weight')
    expect(result.code).toBe(1)
    expect(result.text).toContain('1 difference / 1 entry match the rule but are not owned')
    expect(snapshotFiles()).toEqual(before)
  })

  it('adds exactly the owned pending entries and relabels exactly the owned baselined ones', () => {
    writeLedgerFile(acceptedOwning(ownedOf([...allA, pendingC])))
    const before = readFileSync(paths.baseline ?? '', 'utf8').split('\n')
    const result = admitCommand(paths, 'start-button-weight')
    expect(result.json).toEqual({ id: 'start-button-weight', added: 1, relabeled: 4 })
    const after = readFileSync(paths.baseline ?? '', 'utf8').split('\n')
    const reason = 'triage start-button-weight: the kit is wrong here'
    const aLine = `*\ttest/idle\tstyle\t${A.path}\t${A.kind}\t${A.detail}`
    const cLine = `${C_PROJECT}\ttest/idle\tstyle\t${C.path}\t${C.kind}\t${C.detail}`
    expect(after.filter((l) => !before.includes(l))).toEqual([`${aLine}\t${reason}`, `${cLine}\t${reason}`])
    expect(before.filter((l) => !after.includes(l))).toEqual([`${aLine}\tadopted`])
    expect(after.filter((l) => l.includes('main > table'))).toEqual(before.filter((l) => l.includes('main > table')))
    expect(readdirSync(dir).filter((f) => f.endsWith('.tmp'))).toEqual([])
  })

  it('refuses a cluster that is not accepted', () => {
    writeLedgerFile(decided([...allA, pendingC], { match: fontWeight }))
    expect(admitCommand(paths, 'start-button-weight').text).toContain('admit needs accepted')
  })
})

describe('close', () => {
  it('records the run the cluster was closed under', () => {
    writeLedgerFile(fixed())
    expect(closeCommand(paths, 'start-button-weight', 'fixed in Vue', DAY).code).toBe(0)
    const [closed] = ledgerNow().clusters
    expect(closed?.status).toBe('done')
    expect(closed?.resolution).toEqual({
      note: 'fixed in Vue',
      on: DAY,
      run: { runId: 'run', finishedAt: `${DAY}T10:00:00.000Z`, matrix: 'full', projects: ALL_PROJECT_NAMES, scenarios: SCENARIOS, complete: true },
    })
  })

  it('refuses when a narrowed rule hides an owned entry that is still present', () => {
    writeLedgerFile(decided(allA, { match: match({ scenarios: ['test/idle'], kind: '^padding$' }), actions: [{ target: 'vue', what: 'x', done: true }] }))
    const before = snapshotFiles()
    const result = closeCommand(paths, 'start-button-weight', null, DAY)
    expect(result.code).toBe(1)
    expect(result.text).toContain('1 difference / 4 entries it owns are still present')
    expect(snapshotFiles()).toEqual(before)
  })

  it('refuses open actions and unowned matches', () => {
    writeLedgerFile(decided([entry({ path: 'gone' })], { match: fontWeight }))
    const text = closeCommand(paths, 'start-button-weight', null, DAY).text
    expect(text).toContain('1 action not done')
    expect(text).toContain('match its rule but are not owned')
  })
})

describe('release', () => {
  it('moves the matched owned identities out, and reopens the cluster when nothing remains', () => {
    writeLedgerFile(acceptedOwning(ownedOf(allA)))
    const light = JSON.stringify({ projects: LIGHT })
    expect(releaseCommand(paths, 'start-button-weight', light).json).toEqual({ id: 'start-button-weight', released: 2, reopened: false })
    expect(ledgerNow().clusters[0]?.owned).toEqual(ownedOf(allA.filter((e) => !LIGHT.includes(e.project))))
    expect(ledgerNow().clusters[0]?.status).toBe('accepted')

    expect(releaseCommand(paths, 'start-button-weight', JSON.stringify({ kind: '^font-weight$' })).json).toMatchObject({ reopened: true })
    const [reopened] = ledgerNow().clusters
    expect(reopened).toMatchObject({ owned: {}, status: 'open', decision: null, resolution: null })
  })

  it('refuses a rule on finding fields while owned identities are gone, rather than release part', () => {
    writeLedgerFile(acceptedOwning(ownedOf([...allA, pendingC])))
    writeRun({ completion: false })
    const before = snapshotFiles()
    const result = releaseCommand(paths, 'start-button-weight', JSON.stringify({ kind: '^font-weight$' }))
    expect(result.code).toBe(1)
    expect(result.text).toContain('1 owned identity cannot be matched by layer, path, kind or detail')
    expect(snapshotFiles()).toEqual(before)
    expect(releaseCommand(paths, 'start-button-weight', JSON.stringify({ projects: [C_PROJECT] })).code).toBe(0)
  })

  it('needs no run, and refuses a rule that releases nothing', () => {
    writeLedgerFile(acceptedOwning(ownedOf(allA)))
    writeRun({ completion: false })
    expect(releaseCommand(paths, 'start-button-weight', JSON.stringify({ projects: LIGHT })).code).toBe(0)
    const before = snapshotFiles()
    expect(releaseCommand(paths, 'start-button-weight', JSON.stringify({ kind: '^color$' })).code).toBe(1)
    expect(snapshotFiles()).toEqual(before)
  })
})

describe('status', () => {
  it('exits 0 on a clean ledger', () => {
    writeLedgerFile()
    const result = statusCommand(paths)
    expect(result.code).toBe(0)
    expect(result.text).toContain('coverage: run run · matrix full · scenarios all · complete')
    expect(result.json).toMatchObject({ unclustered: { differences: 3, entries: 9, pending: { entries: 1 } } })
  })

  it('exits 1 on a regression', () => {
    const done = decided(allA, {
      match: fontWeight,
      actions: [{ target: 'vue', what: 'x', done: true }],
      status: 'done',
      resolution: { note: null, on: DAY, run: { runId: 'r', finishedAt: 'x', matrix: 'full', projects: [...ALL_PROJECT_NAMES], scenarios: SCENARIOS, complete: true } },
    })
    writeLedgerFile(done)
    expect(statusCommand(paths)).toMatchObject({ code: 1, json: { flags: [{ kind: 'regression' }] } })
  })

  it('exits 1 on scope growth', () => {
    writeLedgerFile(acceptedOwning(ownedOf(allA)))
    expect(statusCommand(paths)).toMatchObject({ code: 1, json: { flags: [{ kind: 'scope-growth' }] } })
  })

  it('exits 1 on problems', () => {
    writeLedgerFile(cluster({ id: 'Bad' }))
    expect(statusCommand(paths)).toMatchObject({ code: 1, json: { flags: [{ kind: 'problems' }] } })
    writeFileSync(paths.ledger, '{ broken')
    expect(statusCommand(paths).code).toBe(1)
  })

  it('reports the coverage of a filtered default-matrix run', () => {
    writeLedgerFile()
    writeRun({ matrix: 'default', scenarios: ['test/idle'] })
    expect(statusCommand(paths).text).toContain('matrix default · scenarios test/idle · complete')
  })
})

describe('a broken ledger', () => {
  it('is never written back by a mutation, even with the cluster itself valid', () => {
    writeFileSync(paths.ledger, formatLedger({ version: 2 as 1, clusters: [decidedOpen()] }))
    const before = snapshotFiles()
    const result = snapshotCommand(paths, 'start-button-weight')
    expect(result.code).toBe(1)
    expect(result.text).toContain('ledger version 2: expected 1')
    expect(snapshotFiles()).toEqual(before)
  })

  it('makes show name the ledger problem', () => {
    writeFileSync(paths.ledger, '{ broken')
    const result = showCommand(paths, 'start-button-weight')
    expect(result.code).toBe(1)
    expect(result.text).toContain('the ledger cannot be read')
  })
})

describe('read-only commands', () => {
  it('show lists owned present, owned gone and unowned matches', () => {
    writeLedgerFile(acceptedOwning(ownedOf([...allA, entry({ path: 'gone' })])))
    expect(showCommand(paths, 'start-button-weight').json).toMatchObject({
      ownedPresent: { length: 4 },
      ownedGone: [{ project: 'light-desktop', scenario: 'test/idle' }],
      unowned: [{ project: C_PROJECT, source: 'pending' }],
    })
  })

  it('try counts what a rule matches and what other clusters own of it', () => {
    writeLedgerFile(acceptedOwning(ownedOf(allA)))
    expect(tryCommand(paths, JSON.stringify({ kind: 'font-weight' })).json).toMatchObject({
      matched: { differences: 2, entries: 5 },
      unowned: { entries: 1 },
      ownedElsewhere: { 'start-button-weight': { entries: 4 } },
    })
  })
})

describe('runCommand', () => {
  it('exits 2 on usage errors', () => {
    writeLedgerFile()
    expect(runCommand(['frobnicate'], paths).code).toBe(2)
    expect(runCommand(['show'], paths).code).toBe(2)
    expect(runCommand(['show', 'nope'], paths).code).toBe(2)
    expect(runCommand(['status', '--extend'], paths).code).toBe(2)
    expect(runCommand(['drafts', '--limit', '0'], paths).code).toBe(2)
    expect(runCommand(['try', '{"color":1}'], paths).code).toBe(2)
    expect(runCommand(['release', 'start-button-weight'], paths).code).toBe(2)
  })

  it('runs status by default and drafts with a limit', () => {
    writeLedgerFile()
    expect(runCommand([], paths).code).toBe(0)
    expect(runCommand(['drafts', '--limit', '1', '--json'], paths).json).toMatchObject({ total: 3, entries: 9, groups: { length: 1 } })
  })
})

describe('pathsFromEnv', () => {
  it('reads the scratch overrides', () => {
    expect(pathsFromEnv({ PARITY_TRIAGE_LEDGER: '/tmp/l.json', PARITY_BASELINE_FILE: '/tmp/b' })).toEqual({ ledger: '/tmp/l.json', baseline: '/tmp/b' })
    expect(pathsFromEnv({}).ledger.endsWith('.parity-triage.json')).toBe(true)
    expect(pathsFromEnv({}).baseline).toBeUndefined()
  })

  it('takes relative overrides from the repository root, not the working directory', () => {
    const fromRoot = pathsFromEnv({ PARITY_TRIAGE_LEDGER: 'scratch.json', PARITY_BASELINE_FILE: 'scratch-baseline' })
    const root = path.dirname(pathsFromEnv({}).ledger)
    expect(fromRoot).toEqual({ ledger: path.join(root, 'scratch.json'), baseline: path.join(root, 'scratch-baseline') })
  })

  it('refuses a named baseline that does not exist instead of reading it as empty', () => {
    writeLedgerFile()
    expect(() => statusCommand({ ...paths, baseline: path.join(dir, 'missing') })).toThrow(/baseline .*missing does not exist/)
  })
})
