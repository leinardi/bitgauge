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
import { fileURLToPath } from 'node:url'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { cluster, confirmation, DAY, decided, deferral, entry, everywhere, EVIDENCE, fullRun, match, ownedOf, verdict } from './fixtures.ts'
import { loadInputs } from './inputs.ts'
import {
  emptyLedger,
  formatLedger,
  loadLedger,
  OWNING_STATUSES,
  requiredScenarios,
  ruleScenarios,
  validateLedger,
  writeLedger,
  type Cluster,
  type Ledger,
} from './ledger.ts'

const owned = ownedOf(everywhere())
const ledger = (...clusters: Cluster[]): Ledger => ({ version: 1, clusters })
const problems = (...clusters: Cluster[]): string[] => validateLedger(ledger(...clusters))

const done = (overrides: Partial<Cluster> = {}): Cluster =>
  decided(everywhere(), {
    match: match({ scenarios: ['test/idle'], kind: '^font-weight$' }),
    actions: [{ target: 'vue', what: 'use weight 500', done: true }],
    status: 'done',
    resolution: { note: null, on: DAY, run: fullRun(['test/idle']) },
    ...overrides,
  })

describe('validateLedger: any status', () => {
  it('accepts an empty ledger and a fresh open cluster', () => {
    expect(validateLedger(emptyLedger())).toEqual([])
    expect(problems(cluster())).toEqual([])
  })

  it('never throws, whatever it is given', () => {
    for (const value of [null, 42, [], { version: 1 }, { version: 1, clusters: [7, { id: 3, match: 'x', owned: [] }] }]) {
      expect(() => validateLedger(value)).not.toThrow()
      expect(validateLedger(value).length).toBeGreaterThan(0)
    }
  })

  it('needs kebab-case ids that are unique', () => {
    expect(problems(cluster({ id: 'Not_Kebab' }))).toEqual(['Not_Kebab: id must be kebab-case'])
    expect(problems(cluster(), cluster())).toEqual(['start-button-weight: id is not unique'])
  })

  it('rejects unknown enum values', () => {
    expect(problems(cluster({ type: 'bug' as Cluster['type'], aspect: null }))[0]).toContain('type "bug"')
    expect(problems(cluster({ aspect: 'look' as Cluster['aspect'] }))[0]).toContain('needs an aspect')
    expect(problems(cluster({ status: 'later' as Cluster['status'] }))[0]).toContain('status "later"')
    expect(problems(cluster({ match: match({ layer: 'visual' as 'style' }) }))[0]).toContain('match.layer')
    const badAction = decided(everywhere(), { actions: [{ target: 'docs' as 'vue', what: 'x', done: false }] })
    expect(problems(badAction)[0]).toContain('actions[0]')
    // The export is never edited: what the kit should change is an upstream note.
    expect(problems(decided(everywhere(), { actions: [{ target: 'kit' as 'vue', what: 'x', done: false }] }))[0]).toContain('actions[0]')
    expect(problems(decided(everywhere(), { actions: [{ target: 'upstream', what: 'note for Claude Design', done: false }] }))).toEqual([])
    expect(problems(decided(everywhere(), { decision: verdict('nobody' as 'kit') }))[0]).toContain('decision.winner')
  })

  it('needs regular expressions that compile', () => {
    expect(problems(cluster({ match: match({ path: '(' }) }))).toEqual(['start-button-weight: match.path "(" does not compile'])
  })

  it('needs every match.scenarios item to select a scenario', () => {
    expect(problems(cluster({ match: match({ scenarios: ['about/*', 'test/idle'] }) }))).toEqual([])
    expect(problems(cluster({ match: match({ scenarios: ['test/idel'] }) }))[0]).toContain('"test/idel" selects no scenario')
    expect(problems(cluster({ match: match({ scenarios: ['test/idle,test/complete'] }) }))[0]).toContain('selects no scenario')
  })

  it('needs known match.projects', () => {
    expect(problems(cluster({ match: match({ projects: ['dark-narrow'] }) }))).toEqual([])
    expect(problems(cluster({ match: match({ projects: ['sepia'] }) }))[0]).toContain('unknown project "sepia"')
  })

  it('sets an aspect exactly when the type is conflict', () => {
    expect(problems(cluster({ aspect: null }))[0]).toContain('a conflict needs an aspect')
    expect(problems(cluster({ type: 'adapter', aspect: 'style' }))).toEqual(['start-button-weight: only a conflict has an aspect'])
    expect(problems(cluster({ type: 'adapter', aspect: null }))).toEqual([])
  })

  it('needs owned scenarios to be known scenario ids', () => {
    const bad = decided(everywhere(), { owned: { nowhere: { aaaaaaaaaaaa: '*' } } })
    expect(problems(bad)).toContain('start-button-weight: owned names unknown scenario "nowhere"')
  })

  it('needs owned project lists sorted and known', () => {
    const unsorted = decided([], { owned: { 'test/idle': { aaaaaaaaaaaa: ['light-narrow', 'dark-narrow'] } } })
    expect(problems(unsorted)[0]).toContain('sorted list of known projects')
  })
})

describe('validateLedger: open', () => {
  it('has no decision, owns nothing and has no resolution', () => {
    expect(problems(cluster({ decision: deferral() }))).toContain('start-button-weight: an open cluster has no decision')
    expect(problems(cluster({ owned }))).toContain('start-button-weight: an open cluster owns nothing')
    expect(problems(cluster({ resolution: { note: null, on: DAY, run: fullRun(['test/idle']) } }))).toContain(
      'start-button-weight: an open cluster has no resolution',
    )
  })
})

describe('validateLedger: decided and in-progress', () => {
  it('accepts a conflict with a winner, owned entries and an action', () => {
    expect(problems(decided(everywhere()))).toEqual([])
    expect(problems(decided(everywhere(), { status: 'in-progress' }))).toEqual([])
  })

  it('accepts a confirmed non-conflict', () => {
    expect(problems(decided(everywhere(), { type: 'adapter', aspect: null, evidence: null, decision: confirmation() }))).toEqual([])
  })

  it('refuses a conflict confirmed instead of decided, or a non-conflict given a verdict', () => {
    expect(problems(decided(everywhere(), { decision: confirmation() }))).toContain(
      'start-button-weight: a conflict needs a verdict whose winner is spec, kit, vue or new',
    )
    expect(problems(decided(everywhere(), { type: 'harness', aspect: null, decision: verdict('kit') }))).toContain(
      'start-button-weight: a harness cluster needs a confirmation',
    )
  })

  it('refuses keep, and new without its text', () => {
    expect(problems(decided(everywhere(), { decision: verdict('keep') }))[0]).toContain('winner is spec, kit, vue or new')
    expect(problems(decided(everywhere(), { decision: verdict('new') }))).toContain('start-button-weight: a "new" verdict needs its text')
    expect(problems(decided(everywhere(), { decision: verdict('new', { text: 'weight 550' }) }))).toEqual([])
  })

  it('needs owned entries and an action', () => {
    expect(problems(decided([]))[0]).toContain('must own the entries')
    expect(problems(decided(everywhere(), { actions: [] }))).toEqual(['start-button-weight: a decided cluster needs at least one action'])
  })

  it('needs the evidence a conflict was decided on', () => {
    expect(problems(decided(everywhere(), { evidence: null }))).toEqual([
      'start-button-weight: a decided conflict records the evidence it was decided on: spec, kit and vue',
    ])
  })
})

describe('validateLedger: accepted', () => {
  const accepted = (overrides: Partial<Cluster> = {}): Cluster =>
    decided(everywhere(), { decision: verdict('keep'), actions: [], status: 'accepted', ...overrides })

  it('accepts keep with a rationale and owned entries', () => {
    expect(problems(accepted())).toEqual([])
  })

  it('refuses any winner but keep, an empty rationale, or nothing owned', () => {
    expect(problems(accepted({ decision: verdict('vue') }))).toEqual(['start-button-weight: an accepted cluster needs a verdict whose winner is keep'])
    expect(problems(accepted({ decision: verdict('keep', { rationale: ' ' }) }))).toEqual(['start-button-weight: an accepted cluster needs a rationale'])
    expect(problems(accepted({ owned: {} }))[0]).toContain('must own the entries')
  })
})

describe('validateLedger: deferred', () => {
  const deferred = (overrides: Partial<Cluster> = {}): Cluster =>
    decided(everywhere(), { decision: deferral(), actions: [], status: 'deferred', ...overrides })

  it('accepts a deferral with no winner', () => {
    expect(problems(deferred())).toEqual([])
    expect(problems(deferred({ decision: deferral({ revisit: 'v0.3' }) }))).toEqual([])
  })

  it('refuses another decision, an empty rationale, or nothing owned', () => {
    expect(problems(deferred({ decision: verdict('keep') }))).toEqual(['start-button-weight: a deferred cluster needs a deferral'])
    expect(problems(deferred({ decision: deferral({ rationale: '' }) }))).toEqual(['start-button-weight: a deferred cluster needs a rationale'])
    expect(problems(deferred({ owned: {} }))[0]).toContain('must own the entries')
  })

  it('refuses a winner on a deferral', () => {
    expect(problems(deferred({ decision: deferral({ winner: 'kit' }) }))).toEqual(['start-button-weight: a deferral has no winner'])
  })
})

describe('validateLedger: done', () => {
  it('accepts a closure proved by its own resolution.run, with no .run directory anywhere', () => {
    expect(problems(done())).toEqual([])
  })

  it('needs owned entries, a decision that is not keep, and every action done', () => {
    expect(problems(done({ owned: {} }))[0]).toContain('must own the entries')
    expect(problems(done({ decision: verdict('keep') }))[0]).toContain('winner is spec, kit, vue or new')
    expect(problems(done({ actions: [{ target: 'vue', what: 'x', done: false }] }))).toEqual(['start-button-weight: a done cluster has every action done'])
  })

  it('accepts a confirmed non-conflict', () => {
    expect(problems(done({ type: 'fixture', aspect: null, evidence: null, decision: confirmation() }))).toEqual([])
  })

  it('needs a resolution.run from a complete full-matrix run', () => {
    expect(problems(done({ resolution: null }))).toEqual(['start-button-weight: a done cluster needs a resolution with the run it was closed under'])
    const filtered = { note: null, on: DAY, run: { ...fullRun(['test/idle']), matrix: 'default' as 'full' } }
    expect(problems(done({ resolution: filtered }))).toEqual(['start-button-weight: a done cluster was closed under a full-matrix run'])
    const incomplete = { note: null, on: DAY, run: { ...fullRun(['test/idle']), complete: false as true } }
    expect(problems(done({ resolution: incomplete }))).toEqual(['start-button-weight: a done cluster was closed under a complete run'])
  })

  it('needs resolution.run to cover every owned project', () => {
    const resolution = { note: null, on: DAY, run: fullRun(['test/idle'], { projects: ['light-desktop'] }) }
    expect(problems(done({ resolution }))[0]).toContain('does not cover owned projects: dark-desktop')
  })

  it('fails when resolution.run lacks a required scenario', () => {
    const rule = done({ match: match({ scenarios: ['test/idle', 'about/*'] }) })
    expect(problems(rule)[0]).toContain('does not cover required scenarios: about/unreachable')
    const ownedElsewhere = done({ owned: ownedOf(everywhere({ scenario: 'about' })) })
    expect(problems(ownedElsewhere)).toEqual(['start-button-weight: resolution.run does not cover required scenarios: about'])
  })

  it('needs every scenario when its rule names none', () => {
    expect(problems(done({ match: match() }))[0]).toContain('does not cover required scenarios')
  })

  it('stays valid after a later filtered run', () => {
    // A default-matrix run of one scenario: valid, but nothing like the run the cluster closed under.
    const dir = mkdtempSync(path.join(tmpdir(), 'parity-filtered-'))
    try {
      const runDir = path.join(dir, '.run')
      const pair = { project: 'light-desktop', scenario: 'test/complete' }
      mkdirSync(path.join(runDir, 'records'), { recursive: true })
      writeFileSync(path.join(runDir, 'expected.json'), JSON.stringify({ runId: 'later', matrix: 'default', scenarioFilter: 'test/complete', mode: 'check', pairs: [pair] }))
      writeFileSync(path.join(runDir, 'records', 'r.json'), JSON.stringify({ ...pair, runId: 'later', status: 'compared', findings: [], error: null }))
      const completion = { runId: 'later', finishedAt: `${DAY}T11:00:00.000Z`, matrix: 'default', scenarioFilter: 'test/complete', mode: 'check', runStatus: 'passed' }
      writeFileSync(path.join(runDir, 'completion.json'), JSON.stringify({ ...completion, projects: [pair.project], scenarios: [pair.scenario], covered: [pair], refusals: [], complete: true }))
      const inputs = loadInputs({ baselineFile: path.join(dir, 'baseline'), runDir })
      expect(inputs.completion.invalid).toBeNull()

      expect(problems(done())).toEqual([])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('validateLedger: across clusters', () => {
  it('refuses one identity owned by two clusters', () => {
    const a = decided(everywhere(), { id: 'a' })
    const b = decided([entry()], { id: 'b' })
    expect(problems(a, b)).toEqual([`b: owns light-desktop test/idle ${Object.keys(owned['test/idle'] ?? {})[0] ?? ''}, already owned by a`])
  })

  it('accepts two clusters that split one difference by project', () => {
    const [first, ...rest] = everywhere()
    const a = decided(first === undefined ? [] : [first], { id: 'a' })
    const b = decided(rest, { id: 'b' })
    expect(problems(a, b)).toEqual([])
  })
})

describe('ruleScenarios', () => {
  it('is every scenario for a rule that names none, and the union of its items otherwise', () => {
    expect(ruleScenarios(match()).size).toBe(24)
    expect([...ruleScenarios(match({ scenarios: ['about/*', 'test/idle', 'about'] }))].sort()).toEqual(['about', 'about/unreachable', 'test/idle'])
  })
})

describe('OWNING_STATUSES', () => {
  it('are the statuses in which a cluster must own what it was decided about', () => {
    const decisions: Record<string, Cluster['decision']> = { accepted: verdict('keep'), deferred: deferral() }
    for (const status of OWNING_STATUSES) {
      const owning = decided([], { status, decision: decisions[status] ?? verdict('kit') })
      expect(problems(owning).join('\n')).toContain(`a ${status} cluster must own the entries it was decided about`)
    }
    expect(OWNING_STATUSES).not.toContain('open')
    expect(OWNING_STATUSES).not.toContain('done')
  })
})

describe('requiredScenarios', () => {
  it('is the owned scenarios and the rule scenarios together', () => {
    const c = decided(everywhere({ scenario: 'test/idle' }), { match: match({ scenarios: ['about/*'] }) })
    expect([...requiredScenarios(c)].sort()).toEqual(['about/unreachable', 'test/idle'])
  })
})

describe('ledger file', () => {
  let dir = ''
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'parity-ledger-'))
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('writes clusters sorted by id, two-space JSON with a trailing newline, and nothing else', () => {
    const file = path.join(dir, 'ledger.json')
    writeLedger(ledger(cluster({ id: 'b' }), cluster({ id: 'a' })), file)
    const text = readFileSync(file, 'utf8')
    expect(text.endsWith('}\n')).toBe(true)
    expect(text).toContain('\n  "clusters": [\n    {\n      "id": "a"')
    expect(readdirSync(dir)).toEqual(['ledger.json'])
    expect(loadLedger(file)).toEqual({ ledger: JSON.parse(text) as Ledger, problems: [] })
  })

  it('hands back no ledger when a cluster has a shape the assignment cannot read', () => {
    const file = path.join(dir, 'ledger.json')
    const malformed = [
      { ...cluster(), match: { ...match(), scenarios: 'test/complete' } },
      { ...cluster(), owned: null },
      { ...decided(everywhere()), actions: undefined },
    ]
    for (const bad of malformed) {
      writeFileSync(file, JSON.stringify({ version: 1, clusters: [cluster({ id: 'fine' }), bad] }))
      const loaded = loadLedger(file)
      expect(loaded.ledger).toBeNull()
      expect(loaded.problems.length).toBeGreaterThan(0)
    }
  })

  it('reports an unreadable ledger as a problem instead of throwing', () => {
    const file = path.join(dir, 'ledger.json')
    writeFileSync(file, '{ not json')
    const loaded = loadLedger(file)
    expect(loaded.ledger).toBeNull()
    expect(loaded.problems).toHaveLength(1)
    expect(loadLedger(path.join(dir, 'missing.json')).ledger).toBeNull()
  })

  it('reads the committed ledger without a problem, in the form writeLedger gives it', () => {
    const committed = fileURLToPath(new URL('../../../.parity-triage.json', import.meta.url))
    const loaded = loadLedger(committed)
    expect(loaded.problems).toEqual([])
    expect(formatLedger(loaded.ledger ?? emptyLedger())).toBe(readFileSync(committed, 'utf8'))
  })

  it('round-trips the evidence a decision was made on', () => {
    expect(JSON.parse(formatLedger(ledger(decided(everywhere()))))).toEqual(ledger(decided(everywhere(), { evidence: EVIDENCE })))
  })
})
