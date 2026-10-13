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

// The triage ledger, .parity-triage.json: one cluster per group of parity differences, what the user
// decided about it, and the exact entries that decision covers. It is the only state triage keeps, so
// a session resumes from the committed file alone; validateLedger is what keeps it trustworthy.

import { readFileSync } from 'node:fs'

import { writeFileAtomically } from '../records.ts'
import { SCENARIOS, type Scenario } from '../scenarios.ts'
import { filterScenarios } from '../selection.ts'
import { ALL, ALL_PROJECT_NAMES, ownedIdKey, type Owned, type OwnedId } from './identity.ts'

// A conflict is the spec, the kit and the Vue app disagreeing; an adapter cluster is the demo's link
// or scenario (web/src/demo/) not reaching the state the kit shows, a fixture cluster the demo's
// fixtures saying something else, a harness cluster the comparison itself.
const CLUSTER_TYPES = ['conflict', 'adapter', 'fixture', 'harness'] as const
const ASPECTS = ['style', 'content', 'behavior', 'feature', 'a11y'] as const
const STATUSES = ['open', 'decided', 'in-progress', 'accepted', 'deferred', 'done'] as const
const WINNERS = ['spec', 'kit', 'vue', 'new', 'keep'] as const
const DECISION_KINDS = ['verdict', 'confirmation', 'deferral'] as const
// No action edits the design export, which is never edited here (docs/README.md): a change the kit
// needs is an upstream action, a note in docs/engineering/design-system-upstream.md that is pasted
// into the Claude Design project, so the next export carries it.
const ACTION_TARGETS = ['vue', 'spec', 'adapter', 'fixture', 'harness', 'upstream'] as const

export type ClusterType = (typeof CLUSTER_TYPES)[number]
export type Aspect = (typeof ASPECTS)[number]
export type Status = (typeof STATUSES)[number]
export type Winner = (typeof WINNERS)[number]
export type ActionTarget = (typeof ACTION_TARGETS)[number]

export interface Match {
  scenarios: string[] | null
  projects: string[] | null
  layer: 'content' | 'style' | null
  path: string | null
  kind: string | null
  detail: string | null
}

export interface EvidenceSource {
  ref: string
  says: string
}

export interface Evidence {
  spec?: EvidenceSource | null
  kit?: EvidenceSource | null
  vue?: EvidenceSource | null
  notes?: string
}

export interface Decision {
  kind: (typeof DECISION_KINDS)[number]
  winner?: Winner | null
  text?: string | null
  rationale: string
  revisit?: string | null
  on: string
}

export interface Action {
  target: ActionTarget
  what: string
  done: boolean
}

export interface RunProof {
  runId: string
  finishedAt: string
  matrix: 'full'
  projects: string[]
  scenarios: string[]
  complete: true
}

export interface Resolution {
  note: string | null
  on: string
  run: RunProof
}

export interface Cluster {
  id: string
  title: string
  match: Match
  type: ClusterType
  aspect: Aspect | null
  evidence: Evidence | null
  decision: Decision | null
  owned: Owned
  actions: Action[]
  status: Status
  resolution: Resolution | null
}

export interface Ledger {
  version: 1
  clusters: Cluster[]
}

// The statuses in which a cluster holds a decision and owns what it decided about.
export const OWNING_STATUSES: readonly Status[] = ['decided', 'in-progress', 'accepted', 'deferred']

export function emptyLedger(): Ledger {
  return { version: 1, clusters: [] }
}

export function formatLedger(ledger: Ledger): string {
  const clusters = [...ledger.clusters].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  return `${JSON.stringify({ ...ledger, clusters }, null, 2)}\n`
}

export function writeLedger(ledger: Ledger, file: string): void {
  writeFileAtomically(file, formatLedger(ledger))
}

export interface LoadedLedger {
  ledger: Ledger | null
  problems: string[]
}

// Never throws: an unreadable or invalid ledger is reported as problems. The ledger itself comes back
// only when every cluster has the shape the assignment reads, so a hand edit that broke one can be
// reported, never crash the code that would read it, nor be written back by a mutation.
export function loadLedger(file: string, scenarios: readonly Scenario[] = SCENARIOS): LoadedLedger {
  let value: unknown
  try {
    value = JSON.parse(readFileSync(file, 'utf8'))
  } catch (error) {
    return { ledger: null, problems: [`ledger ${file}: ${error instanceof Error ? error.message : String(error)}`] }
  }
  const problems = validateLedger(value, scenarios)
  const usable = isObject(value) && Array.isArray(value['clusters']) && value['clusters'].every(isWellFormed)
  return { ledger: usable ? (value as unknown as Ledger) : null, problems }
}

function isPatternField(value: unknown): boolean {
  return value === null || isString(value)
}

function isNameList(value: unknown): boolean {
  return value === null || (Array.isArray(value) && value.every(isString))
}

// The shape the assignment and the helper rely on; validateLedger says what is wrong with it.
function isWellFormed(cluster: unknown): boolean {
  if (!isObject(cluster) || !isString(cluster['id']) || !isString(cluster['type']) || !isString(cluster['status'])) return false
  const match = cluster['match']
  if (!isObject(match) || !isNameList(match['scenarios']) || !isNameList(match['projects'])) return false
  if (!(['layer', 'path', 'kind', 'detail'] as const).every((field) => isPatternField(match[field]))) return false
  const owned = cluster['owned']
  const ownedOk =
    isObject(owned) &&
    Object.values(owned).every((hashes) => isObject(hashes) && Object.values(hashes).every((p) => p === ALL || (Array.isArray(p) && p.every(isString))))
  const actions = cluster['actions']
  return (
    ownedOk &&
    Array.isArray(actions) &&
    actions.every(isObject) &&
    (cluster['decision'] === null || isObject(cluster['decision'])) &&
    (cluster['resolution'] === null || isObject(cluster['resolution']))
  )
}

// The scenario ids one match.scenarios item selects, or null when it selects none.
function scenarioItem(item: string, scenarios: readonly Scenario[] = SCENARIOS): string[] | null {
  if (item.includes(',') || item.trim() === '') return null
  try {
    return filterScenarios(scenarios, item).map((s) => s.id)
  } catch {
    return null
  }
}

export function ruleScenarios(match: Match, scenarios: readonly Scenario[] = SCENARIOS): Set<string> {
  if (match.scenarios === null) return new Set(scenarios.map((s) => s.id))
  return new Set(match.scenarios.flatMap((item) => scenarioItem(item, scenarios) ?? []))
}

// What a run must have covered before anything may be decided from it about this cluster: every
// scenario it owns an entry in, and every scenario its rule could find a new candidate in.
export function requiredScenarios(cluster: Cluster, scenarios: readonly Scenario[] = SCENARIOS): Set<string> {
  return new Set([...Object.keys(cluster.owned), ...ruleScenarios(cluster.match, scenarios)])
}

type Json = Record<string, unknown>

function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

function nonEmpty(value: unknown): value is string {
  return isString(value) && value.trim() !== ''
}

function nullable(value: unknown, check: (v: unknown) => boolean): boolean {
  return value === null || value === undefined || check(value)
}

function oneOf<T extends string>(values: readonly T[], value: unknown): value is T {
  return isString(value) && (values as readonly string[]).includes(value)
}

function isDate(value: unknown): boolean {
  if (!isString(value) || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value)
}

function compiles(pattern: string): boolean {
  try {
    new RegExp(pattern)
    return true
  } catch {
    return false
  }
}

function checkMatch(match: unknown, scenarios: readonly Scenario[], problem: (text: string) => void): void {
  if (!isObject(match)) {
    problem('match must be an object')
    return
  }
  const items = match['scenarios']
  if (items !== null) {
    if (!Array.isArray(items) || items.length === 0) problem('match.scenarios must be null or a non-empty list')
    else {
      for (const item of items) {
        if (!isString(item) || scenarioItem(item, scenarios) === null) problem(`match.scenarios item ${JSON.stringify(item)} selects no scenario`)
      }
    }
  }
  const projects = match['projects']
  if (projects !== null) {
    if (!Array.isArray(projects) || projects.length === 0) problem('match.projects must be null or a non-empty list')
    else {
      for (const project of projects) {
        if (!isString(project) || !ALL_PROJECT_NAMES.includes(project)) problem(`match.projects names unknown project ${JSON.stringify(project)}`)
      }
    }
  }
  const layer = match['layer']
  if (layer !== null && layer !== 'content' && layer !== 'style') {
    problem('match.layer must be "content", "style" or null')
  }
  for (const field of ['path', 'kind', 'detail'] as const) {
    const pattern = match[field]
    if (pattern === null) continue
    if (!isString(pattern)) problem(`match.${field} must be a regular expression or null`)
    else if (!compiles(pattern)) problem(`match.${field} ${JSON.stringify(pattern)} does not compile`)
  }
}

function checkSource(value: unknown): boolean {
  return value === null || value === undefined || (isObject(value) && isString(value['ref']) && isString(value['says']))
}

function hasAllEvidence(evidence: unknown): boolean {
  return isObject(evidence) && (['spec', 'kit', 'vue'] as const).every((side) => isObject(evidence[side]) && checkSource(evidence[side]))
}

function checkEvidence(evidence: unknown, problem: (text: string) => void): void {
  if (evidence === null || evidence === undefined) return
  if (!isObject(evidence)) {
    problem('evidence must be an object or null')
    return
  }
  for (const side of ['spec', 'kit', 'vue'] as const) {
    if (!checkSource(evidence[side])) problem(`evidence.${side} must be { ref, says } or null`)
  }
  if (!nullable(evidence['notes'], isString)) problem('evidence.notes must be a string')
}

function checkDecision(decision: unknown, problem: (text: string) => void): void {
  if (decision === null) return
  if (!isObject(decision)) {
    problem('decision must be an object or null')
    return
  }
  const kind = decision['kind']
  if (!oneOf(DECISION_KINDS, kind)) problem(`decision.kind ${JSON.stringify(kind)} is not one of ${DECISION_KINDS.join(', ')}`)
  if (kind === 'verdict' && !oneOf(WINNERS, decision['winner'])) {
    problem(`decision.winner ${JSON.stringify(decision['winner'])} is not one of ${WINNERS.join(', ')}`)
  }
  if (kind !== 'verdict' && decision['winner'] !== null && decision['winner'] !== undefined) problem(`a ${String(kind)} has no winner`)
  if (kind === 'verdict' && decision['winner'] === 'new' && !nonEmpty(decision['text'])) problem('a "new" verdict needs its text')
  if (!nullable(decision['text'], isString)) problem('decision.text must be a string or null')
  if (!isString(decision['rationale'])) problem('decision.rationale must be a string')
  if (!nullable(decision['revisit'], isString)) problem('decision.revisit must be a string or null')
  if (!isDate(decision['on'])) problem('decision.on must be a YYYY-MM-DD date')
}

function checkActions(actions: unknown, problem: (text: string) => void): void {
  if (!Array.isArray(actions)) {
    problem('actions must be a list')
    return
  }
  actions.forEach((action: unknown, i) => {
    if (!isObject(action) || !oneOf(ACTION_TARGETS, action['target']) || !isString(action['what']) || typeof action['done'] !== 'boolean') {
      problem(`actions[${i}] must be { target: ${ACTION_TARGETS.join('|')}, what, done }`)
    }
  })
}

function checkOwned(owned: unknown, scenarios: readonly Scenario[], problem: (text: string) => void): void {
  if (!isObject(owned)) {
    problem('owned must be an object')
    return
  }
  const known = new Set(scenarios.map((s) => s.id))
  for (const [scenario, hashes] of Object.entries(owned)) {
    if (!known.has(scenario)) problem(`owned names unknown scenario "${scenario}"`)
    if (!isObject(hashes)) {
      problem(`owned.${scenario} must be an object`)
      continue
    }
    for (const [hash, projects] of Object.entries(hashes)) {
      if (!/^[0-9a-f]{12}$/.test(hash)) problem(`owned.${scenario} key "${hash}" is not a 12-character hash`)
      if (projects === ALL) continue
      const list: unknown[] = Array.isArray(projects) ? projects : []
      const valid = list.length > 0 && list.every((p) => isString(p) && ALL_PROJECT_NAMES.includes(p))
      const sorted = list.every((p, i) => i === 0 || String(list[i - 1]) < String(p))
      if (!valid || !sorted) problem(`owned.${scenario}.${hash} must be "*" or a sorted list of known projects`)
    }
  }
}

function checkRunProof(run: unknown): boolean {
  return (
    isObject(run) &&
    isString(run['runId']) &&
    isString(run['finishedAt']) &&
    isString(run['matrix']) &&
    Array.isArray(run['projects']) &&
    run['projects'].every(isString) &&
    Array.isArray(run['scenarios']) &&
    run['scenarios'].every(isString) &&
    typeof run['complete'] === 'boolean'
  )
}

function checkResolution(resolution: unknown, problem: (text: string) => void): void {
  if (resolution === null) return
  if (!isObject(resolution) || !nullable(resolution['note'], isString) || !isDate(resolution['on']) || !checkRunProof(resolution['run'])) {
    problem('resolution must be null or { note, on, run: { runId, finishedAt, matrix, projects, scenarios, complete } }')
  }
}

// A cluster that has been decided, as its type requires: a conflict needs a winner other than keep,
// anything else a confirmation.
function actionableDecision(cluster: Json, decision: Json | null): string | null {
  if (cluster['type'] === 'conflict') {
    const winner = decision?.['winner']
    if (decision?.['kind'] !== 'verdict' || !oneOf(['spec', 'kit', 'vue', 'new'] as const, winner)) {
      return 'a conflict needs a verdict whose winner is spec, kit, vue or new'
    }
    return null
  }
  return decision?.['kind'] === 'confirmation' ? null : `a ${String(cluster['type'])} cluster needs a confirmation`
}

function checkStatus(cluster: Json, scenarios: readonly Scenario[], problem: (text: string) => void): void {
  const status = cluster['status']
  const decision = isObject(cluster['decision']) ? cluster['decision'] : null
  const ownsNothing = safeOwnedIds(cluster['owned']).length === 0
  const actions: unknown[] = Array.isArray(cluster['actions']) ? cluster['actions'] : []
  const needOwned = (): void => {
    if (ownsNothing) problem(`a ${String(status)} cluster must own the entries it was decided about (run snapshot)`)
  }
  switch (status) {
    case 'open':
      if (cluster['decision'] !== null) problem('an open cluster has no decision')
      if (!ownsNothing) problem('an open cluster owns nothing')
      if (cluster['resolution'] !== null) problem('an open cluster has no resolution')
      return
    case 'decided':
    case 'in-progress': {
      const wrong = actionableDecision(cluster, decision)
      if (wrong !== null) problem(wrong)
      needOwned()
      if (actions.length === 0) problem(`a ${status} cluster needs at least one action`)
      return
    }
    case 'accepted':
      if (decision?.['kind'] !== 'verdict' || decision['winner'] !== 'keep') problem('an accepted cluster needs a verdict whose winner is keep')
      if (!nonEmpty(decision?.['rationale'])) problem('an accepted cluster needs a rationale')
      needOwned()
      return
    case 'deferred':
      if (decision?.['kind'] !== 'deferral') problem('a deferred cluster needs a deferral')
      if (!nonEmpty(decision?.['rationale'])) problem('a deferred cluster needs a rationale')
      needOwned()
      return
    case 'done':
      checkDone(cluster, decision, actions, scenarios, problem)
      return
    default:
      // An unknown status is reported by the enum check.
      return
  }
}

function checkDone(
  cluster: Json,
  decision: Json | null,
  actions: unknown[],
  scenarios: readonly Scenario[],
  problem: (text: string) => void,
): void {
  const owned = safeOwnedIds(cluster['owned'])
  if (owned.length === 0) problem('a done cluster must own the entries it was decided about')
  const wrong = actionableDecision(cluster, decision)
  if (wrong !== null) problem(wrong)
  if (actions.some((a) => !isObject(a) || a['done'] !== true)) problem('a done cluster has every action done')
  const resolution = isObject(cluster['resolution']) ? cluster['resolution'] : null
  const run = resolution !== null && checkRunProof(resolution['run']) ? (resolution['run'] as unknown as RunProof) : null
  if (run === null) {
    problem('a done cluster needs a resolution with the run it was closed under')
    return
  }
  if (run.matrix !== 'full') problem('a done cluster was closed under a full-matrix run')
  if (!run.complete) problem('a done cluster was closed under a complete run')
  const projects = new Set(run.projects)
  const missingProjects = [...new Set(owned.map((id) => id.project))].filter((p) => !projects.has(p))
  if (missingProjects.length > 0) problem(`resolution.run does not cover owned projects: ${missingProjects.sort().join(', ')}`)
  const covered = new Set(run.scenarios)
  const match = isObject(cluster['match']) ? (cluster['match'] as unknown as Match) : null
  const required = new Set([...owned.map((id) => id.scenario), ...(match === null ? [] : safeRuleScenarios(match, scenarios))])
  const missingScenarios = [...required].filter((s) => !covered.has(s))
  if (missingScenarios.length > 0) problem(`resolution.run does not cover required scenarios: ${missingScenarios.sort().join(', ')}`)
}

// The validators read the ledger before knowing it is well formed, so these tolerate any shape.
function safeOwnedIds(owned: unknown): OwnedId[] {
  if (!isObject(owned)) return []
  const ids: OwnedId[] = []
  for (const [scenario, hashes] of Object.entries(owned)) {
    if (!isObject(hashes)) continue
    for (const [hash, projects] of Object.entries(hashes)) {
      const names = projects === ALL ? ALL_PROJECT_NAMES : Array.isArray(projects) ? projects.filter(isString) : []
      for (const project of names) ids.push({ project, scenario, hash })
    }
  }
  return ids
}

function safeRuleScenarios(match: Match, scenarios: readonly Scenario[]): string[] {
  if (match.scenarios === null) return scenarios.map((s) => s.id)
  if (!Array.isArray(match.scenarios)) return []
  return match.scenarios.flatMap((item) => (isString(item) ? (scenarioItem(item, scenarios) ?? []) : []))
}

function checkCluster(cluster: Json, scenarios: readonly Scenario[], problem: (text: string) => void): void {
  if (!nonEmpty(cluster['title'])) problem('title must be a non-empty string')
  checkMatch(cluster['match'], scenarios, problem)
  if (!oneOf(CLUSTER_TYPES, cluster['type'])) problem(`type ${JSON.stringify(cluster['type'])} is not one of ${CLUSTER_TYPES.join(', ')}`)
  if (cluster['type'] === 'conflict') {
    if (!oneOf(ASPECTS, cluster['aspect'])) problem(`a conflict needs an aspect: one of ${ASPECTS.join(', ')}`)
  } else if (cluster['aspect'] !== null) problem('only a conflict has an aspect')
  checkEvidence(cluster['evidence'], problem)
  if (cluster['type'] === 'conflict' && cluster['decision'] !== null && !hasAllEvidence(cluster['evidence'])) {
    problem('a decided conflict records the evidence it was decided on: spec, kit and vue')
  }
  checkDecision(cluster['decision'], problem)
  checkActions(cluster['actions'], problem)
  checkOwned(cluster['owned'], scenarios, problem)
  checkResolution(cluster['resolution'], problem)
  if (!oneOf(STATUSES, cluster['status'])) problem(`status ${JSON.stringify(cluster['status'])} is not one of ${STATUSES.join(', ')}`)
  else checkStatus(cluster, scenarios, problem)
}

// Every problem with the ledger, as readable lines; empty when it is valid. Never throws, so a broken
// ledger is something status can report rather than something that stops it.
export function validateLedger(value: unknown, scenarios: readonly Scenario[] = SCENARIOS): string[] {
  const problems: string[] = []
  if (!isObject(value)) return ['the ledger must be a JSON object']
  if (value['version'] !== 1) problems.push(`ledger version ${JSON.stringify(value['version'])}: expected 1`)
  const clusters = value['clusters']
  if (!Array.isArray(clusters)) return [...problems, 'ledger.clusters must be a list']

  const ids = new Set<string>()
  const owners = new Map<string, string>()
  clusters.forEach((raw: unknown, index) => {
    if (!isObject(raw)) {
      problems.push(`clusters[${index}]: must be an object`)
      return
    }
    const id = raw['id']
    const name = isString(id) ? id : `clusters[${index}]`
    const problem = (text: string): void => {
      problems.push(`${name}: ${text}`)
    }
    if (!isString(id) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) problem('id must be kebab-case')
    else if (ids.has(id)) problem('id is not unique')
    else ids.add(id)
    checkCluster(raw, scenarios, problem)

    for (const ownedId of safeOwnedIds(raw['owned'])) {
      const key = ownedIdKey(ownedId)
      const other = owners.get(key)
      if (other === undefined) owners.set(key, name)
      else if (other !== name) problem(`owns ${ownedId.project} ${ownedId.scenario} ${ownedId.hash}, already owned by ${other}`)
    }
  })
  return problems
}
