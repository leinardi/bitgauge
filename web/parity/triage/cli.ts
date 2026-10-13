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

// The triage helper: node parity/triage/cli.ts <command>, or make demo-parity-triage CMD="...".
// It is the only writer of a cluster's owned and resolution fields, and of the reasons triage puts in
// .parity-baseline. Every write it makes needs the completion record of a complete full-matrix run
// that covered what the cluster is about, and a refused command writes nothing at all.
//
// Environment overrides, for working on scratch copies instead of the committed files:
//   PARITY_TRIAGE_LEDGER  the ledger to read and write (default: .parity-triage.json)
//   PARITY_BASELINE_FILE  the baseline to read and write (default: .parity-baseline)
// A relative override is taken from the repository root, wherever the helper runs from (make runs it
// in web/), and an overridden baseline must exist: a mistyped path must not read as an empty baseline.

import { existsSync, realpathSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { identity, loadBaseline, writeBaseline, type BaselineEntry } from '../baseline.ts'
import type { Completion } from '../records.ts'
import { assign, compileMatch, type Assignment, type ClusterAssignment } from './assign.ts'
import { draftGroups } from './draft.ts'
import { collapseOwned, countDifferences, describeCollision, entryOwnedId, expandOwned, ownedIdKey, type OwnedId } from './identity.ts'
import { loadInputs, type AvailableEntry, type Inputs } from './inputs.ts'
import { loadLedger, OWNING_STATUSES, requiredScenarios, validateLedger, writeLedger, type Cluster, type Ledger, type Match } from './ledger.ts'

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url))
const LEDGER_FILE = path.join(REPO_ROOT, '.parity-triage.json')
const DEFAULT_DRAFT_LIMIT = 20
const SAMPLES = 3

export interface Paths {
  ledger: string
  // Unset: the harness's own default, .parity-baseline and web/parity/.run/.
  baseline?: string
  runDir?: string
}

export interface Result {
  code: 0 | 1 | 2
  text: string
  json: unknown
}

export function pathsFromEnv(env: NodeJS.ProcessEnv): Paths {
  const ledger = env['PARITY_TRIAGE_LEDGER']
  const baseline = env['PARITY_BASELINE_FILE']
  return {
    ledger: ledger === undefined || ledger === '' ? LEDGER_FILE : path.resolve(REPO_ROOT, ledger),
    ...(baseline === undefined || baseline === '' ? {} : { baseline: path.resolve(REPO_ROOT, baseline) }),
  }
}

interface Context {
  ledger: Ledger | null
  problems: string[]
  inputs: Inputs
  assignment: Assignment
}

// The default baseline may be missing, as it is before a first run; a named one may not, because
// reading it as empty would make every finding look pending and let admit write a new baseline.
function load(paths: Paths): Context {
  if (paths.baseline !== undefined && !existsSync(paths.baseline)) throw new Error(`baseline ${paths.baseline} does not exist`)
  const { ledger, problems } = loadLedger(paths.ledger)
  const inputs = loadInputs({ ...(paths.baseline === undefined ? {} : { baselineFile: paths.baseline }), ...(paths.runDir === undefined ? {} : { runDir: paths.runDir }) })
  const assignment = assign(ledger?.clusters ?? [], inputs.available, { problems })
  return { ledger, problems, inputs, assignment }
}

function usage(text: string): Result {
  return { code: 2, text: `${text}\n\n${USAGE}`, json: { error: text } }
}

const USAGE = `usage: node parity/triage/cli.ts <command> [--json]
  status                         coverage, clusters, flags and the next work
  drafts [--limit N]             suggested clusters for unclustered entries (default 20)
  show <id>                      a cluster's owned present, owned gone and unowned matches
  try '<match JSON>'             what a candidate rule would match
  snapshot <id> [--extend]       own the cluster's current rule matches
  admit <id>                     put an accepted cluster's owned entries in the baseline
  close <id> [--note "..."]      mark a fixed cluster done
  release <id> --match '<JSON>'  give up the owned entries a rule matches
environment: PARITY_TRIAGE_LEDGER, PARITY_BASELINE_FILE (scratch copies of the ledger and baseline)`

function plural(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`
}

function entries(n: number): string {
  return `${n} ${n === 1 ? 'entry' : 'entries'}`
}

function counted(list: readonly AvailableEntry[]): string {
  return `${plural(countDifferences(list), 'difference')} / ${entries(list.length)}`
}

function readable(e: AvailableEntry): string {
  return [e.project, e.scenario, e.layer, e.path, e.kind, e.detail].join('  ') + (e.source === 'pending' ? '  [pending]' : '')
}

function findingJson(e: AvailableEntry): Record<string, string | null> {
  return { project: e.project, scenario: e.scenario, layer: e.layer, path: e.path, kind: e.kind, detail: e.detail, source: e.source, reason: e.reason }
}

function coverageLine(inputs: Inputs): string {
  const { completion, invalid } = inputs.completion
  if (completion === null || invalid !== null) return `coverage: no valid completion (${invalid ?? 'none'})`
  const state = completion.complete ? 'complete' : `incomplete: ${completion.refusals.join('; ')}`
  return `coverage: run ${completion.runId.slice(0, 8)} · matrix ${completion.matrix} · scenarios ${completion.scenarioFilter ?? 'all'} · ${state}`
}

function nextWork(ctx: Context): string[] {
  const { assignment } = ctx
  const clusters = assignment.clusters
  const of = (kind: string): string[] => assignment.flags.filter((f) => f.kind === kind).map((f) => f.cluster ?? '')
  const next: string[] = []
  if (assignment.flags.some((f) => f.kind === 'problems')) next.push('fix the problems listed above')
  for (const id of of('regression')) next.push(`regression in ${id}: reopen it, or create a cluster for what came back`)
  for (const id of of('scope-growth')) next.push(`scope growth in ${id}: snapshot ${id} --extend, or split it out with release and a new cluster`)
  for (const id of assignment.closeCandidates) next.push(`close ${id}`)
  if (assignment.unclustered.length > 0) next.push(`${counted(assignment.unclustered)} unclustered: run drafts`)
  for (const a of clusters.filter((c) => c.cluster.status === 'open' && c.cluster.decision === null)) {
    next.push(a.cluster.type === 'conflict' ? `decide conflict ${a.cluster.id}` : `confirm ${a.cluster.id}`)
  }
  for (const a of clusters.filter((c) => c.cluster.status === 'decided')) next.push(`fix ${a.cluster.id}`)
  return next
}

function clusterRow(a: ClusterAssignment): Record<string, unknown> {
  return {
    id: a.cluster.id,
    status: a.cluster.status,
    type: a.cluster.type,
    ownedPresent: { differences: countDifferences(a.ownedPresent), entries: a.ownedPresent.length },
    ownedGone: a.ownedGone.length,
    unowned: { differences: countDifferences(a.unowned), entries: a.unowned.length },
    openActions: a.cluster.actions.filter((action) => !action.done).length,
  }
}

export function statusCommand(paths: Paths): Result {
  const ctx = load(paths)
  const { assignment, inputs } = ctx
  const unclustered = assignment.unclustered
  const pending = unclustered.filter((e) => e.source === 'pending')
  const baselined = unclustered.filter((e) => e.source === 'baselined')
  const rows = assignment.clusters.map(clusterRow)
  const next = nextWork(ctx)
  const failing = assignment.flags.length > 0
  const lines = [coverageLine(inputs)]
  if (ctx.problems.length > 0) lines.push('problems:', ...ctx.problems.map((p) => `  ${p}`))
  lines.push(`clusters: ${assignment.clusters.length}`)
  for (const a of assignment.clusters) {
    lines.push(
      `  ${a.cluster.id.padEnd(32)} ${a.cluster.status.padEnd(11)} ${a.cluster.type.padEnd(8)} ` +
        `owned ${counted(a.ownedPresent)} present, ${a.ownedGone.length} gone · unowned ${counted(a.unowned)} · ` +
        `${a.cluster.actions.filter((action) => !action.done).length} open actions`,
    )
  }
  lines.push(failing ? 'flags:' : 'flags: none', ...assignment.flags.map((f) => `  ${f.kind}: ${f.text}`))
  for (const id of assignment.resolvedLookingOpen) lines.push(`  note: open cluster ${id} matches nothing; it may already be resolved`)
  lines.push(`unclustered: ${counted(unclustered)} (baselined ${counted(baselined)}, pending ${counted(pending)})`)
  lines.push(next.length > 0 ? 'next:' : 'next: nothing to do', ...next.map((n) => `  ${n}`))
  const { completion, invalid } = inputs.completion
  return {
    code: failing ? 1 : 0,
    text: lines.join('\n'),
    json: {
      coverage: invalid === null && completion !== null ? { ...completion, covered: completion.covered.length } : { invalid },
      problems: ctx.problems,
      clusters: rows,
      flags: assignment.flags,
      resolvedLookingOpen: assignment.resolvedLookingOpen,
      closeCandidates: assignment.closeCandidates,
      unclustered: {
        differences: countDifferences(unclustered),
        entries: unclustered.length,
        baselined: { differences: countDifferences(baselined), entries: baselined.length },
        pending: { differences: countDifferences(pending), entries: pending.length },
      },
      next,
    },
  }
}

export function draftsCommand(paths: Paths, limit = DEFAULT_DRAFT_LIMIT): Result {
  const { assignment } = load(paths)
  const groups = draftGroups(assignment.unclustered)
  const shown = groups.slice(0, limit)
  const lines = [`${plural(groups.length, 'draft group')} over ${counted(assignment.unclustered)}; showing ${shown.length}`]
  shown.forEach((g, i) => {
    lines.push(
      `${i + 1}. ${g.key.replace(/\t/g, ' · ')}`,
      `   ${plural(g.differences, 'difference')} / ${entries(g.entries)} (baselined ${g.baselined}, pending ${g.pending})`,
      `   match: ${JSON.stringify(g.match)}`,
      ...g.samples.map((s) => `   - ${readable(s)}`),
    )
  })
  return {
    code: 0,
    text: lines.join('\n'),
    json: { total: groups.length, entries: assignment.unclustered.length, groups: shown.map((g) => ({ ...g, samples: g.samples.map(findingJson) })) },
  }
}

function findCluster(ctx: Context, id: string): ClusterAssignment | undefined {
  return ctx.assignment.clusters.find((a) => a.cluster.id === id)
}

function ownedIdText(id: OwnedId): string {
  return `${id.project}  ${id.scenario}  ${id.hash}`
}

export function showCommand(paths: Paths, id: string): Result {
  const ctx = load(paths)
  if (ctx.ledger === null) return { code: 1, text: ['the ledger cannot be read:', ...ctx.problems.map((p) => `  ${p}`)].join('\n'), json: { problems: ctx.problems } }
  const a = findCluster(ctx, id)
  if (a === undefined) return usage(`no cluster "${id}"`)
  const lines = [
    `${a.cluster.id} (${a.cluster.status}, ${a.cluster.type}): ${a.cluster.title}`,
    `owned present: ${counted(a.ownedPresent)}`,
    ...a.ownedPresent.map((e) => `  ${readable(e)}`),
    `owned gone: ${a.ownedGone.length}`,
    ...a.ownedGone.map((g) => `  ${ownedIdText(g)}`),
    `unowned matches: ${counted(a.unowned)}`,
    ...a.unowned.map((e) => `  ${readable(e)}`),
  ]
  return {
    code: 0,
    text: lines.join('\n'),
    json: { id: a.cluster.id, ownedPresent: a.ownedPresent.map(findingJson), ownedGone: a.ownedGone, unowned: a.unowned.map(findingJson) },
  }
}

const MATCH_FIELDS = ['scenarios', 'projects', 'layer', 'path', 'kind', 'detail'] as const

// A rule given on the command line: fields left out mean any. Problems are those validateLedger
// would report for the same rule in a cluster.
function parseMatch(raw: string): { match: Match } | { error: string } {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch (error) {
    return { error: `match is not JSON: ${error instanceof Error ? error.message : String(error)}` }
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return { error: 'match must be a JSON object' }
  const unknown = Object.keys(value).filter((k) => !(MATCH_FIELDS as readonly string[]).includes(k))
  if (unknown.length > 0) return { error: `match has unknown fields: ${unknown.join(', ')}` }
  const fields = value as Record<string, unknown>
  const match = Object.fromEntries(MATCH_FIELDS.map((f) => [f, fields[f] ?? null])) as unknown as Match
  const probe: Cluster = { id: 'try', title: 'try', match, type: 'harness', aspect: null, evidence: null, decision: null, owned: {}, actions: [], status: 'open', resolution: null }
  const problems = validateLedger({ version: 1, clusters: [probe] })
  return problems.length > 0 ? { error: problems.map((p) => p.replace(/^try: /, '')).join('; ') } : { match }
}

export function tryCommand(paths: Paths, raw: string): Result {
  const parsed = parseMatch(raw)
  if ('error' in parsed) return usage(parsed.error)
  const ctx = load(paths)
  const matcher = compileMatch(parsed.match)
  const owners = new Map<string, string>()
  for (const cluster of ctx.ledger?.clusters ?? []) {
    for (const id of expandOwned(cluster.owned)) {
      // The first owner, as in the assignment; a second one is a problem status reports.
      if (!owners.has(ownedIdKey(id))) owners.set(ownedIdKey(id), cluster.id)
    }
  }
  const matched = ctx.inputs.available.filter(matcher)
  const unowned = matched.filter((e) => !owners.has(ownedIdKey(entryOwnedId(e))))
  const elsewhere = new Map<string, AvailableEntry[]>()
  for (const e of matched) {
    const owner = owners.get(ownedIdKey(entryOwnedId(e)))
    if (owner !== undefined) elsewhere.set(owner, [...(elsewhere.get(owner) ?? []), e])
  }
  const lines = [
    `matches ${counted(matched)}`,
    `  not owned by any cluster: ${counted(unowned)}`,
    ...unowned.slice(0, SAMPLES).map((e) => `    - ${readable(e)}`),
    ...[...elsewhere].map(([owner, entries]) => `  owned by ${owner}: ${counted(entries)}`),
  ]
  return {
    code: 0,
    text: lines.join('\n'),
    json: {
      match: parsed.match,
      matched: { differences: countDifferences(matched), entries: matched.length },
      unowned: { differences: countDifferences(unowned), entries: unowned.length, samples: unowned.slice(0, SAMPLES).map(findingJson) },
      ownedElsewhere: Object.fromEntries([...elsewhere].map(([owner, entries]) => [owner, { differences: countDifferences(entries), entries: entries.length }])),
    },
  }
}

function refused(command: string, reasons: readonly string[]): Result {
  return { code: 1, text: [`${command} refused, nothing written:`, ...reasons.map((r) => `  - ${r}`)].join('\n'), json: { refused: reasons } }
}

// What every mutation needs: a usable ledger, and the completion of a complete full-matrix run that
// covered every scenario this cluster owns an entry in or could find one in.
function runReasons(ctx: Context, cluster: Cluster): string[] {
  const reasons: string[] = []
  const { completion, invalid } = ctx.inputs.completion
  if (completion === null || invalid !== null) return [`no valid completion: ${invalid ?? 'none'}`]
  if (!completion.complete) reasons.push(`the run did not complete: ${completion.refusals.join('; ')}`)
  if (completion.matrix !== 'full') reasons.push(`the run used the ${completion.matrix} matrix, not full`)
  const covered = new Set(completion.scenarios)
  const missing = [...requiredScenarios(cluster)].filter((s) => !covered.has(s)).sort()
  if (missing.length > 0) reasons.push(`the run did not cover required scenarios: ${missing.join(', ')}`)
  return reasons
}

interface Target {
  ctx: Context
  ledger: Ledger
  a: ClusterAssignment
}

function target(paths: Paths, id: string): Target | Result {
  const ctx = load(paths)
  if (ctx.ledger === null) return refused('the command', ['the ledger cannot be read: fix the problems status lists', ...ctx.problems])
  const a = findCluster(ctx, id)
  if (a === undefined) return usage(`no cluster "${id}"`)
  return { ctx, ledger: ctx.ledger, a }
}

function replaceCluster(ledger: Ledger, next: Cluster): Ledger {
  return { ...ledger, clusters: ledger.clusters.map((c) => (c.id === next.id ? next : c)) }
}

// The problems the change would leave on this cluster or on the ledger as a whole. A mutation that
// would leave either is refused, so the helper never writes back a ledger it found broken; another
// cluster's problems are that cluster's, and status reports them.
function problemsAfter(ledger: Ledger, id: string): string[] {
  const others = ledger.clusters.map((c) => c.id).filter((other) => other !== id)
  return validateLedger(ledger).filter((p) => p.startsWith(`${id}: `) || !others.some((other) => p.startsWith(`${other}: `)))
}

function collisionReasons(ctx: Context): string[] {
  return ctx.assignment.collisions.map(describeCollision)
}

export function snapshotCommand(paths: Paths, id: string, extend = false): Result {
  const found = target(paths, id)
  if ('code' in found) return found
  const { ctx, ledger, a } = found
  const reasons = [...runReasons(ctx, a.cluster), ...collisionReasons(ctx)]
  if (!OWNING_STATUSES.includes(a.cluster.status)) reasons.push(`status is ${a.cluster.status}; snapshot needs ${OWNING_STATUSES.join(', ')}`)
  const ownedNow = expandOwned(a.cluster.owned)
  if (!extend && ownedNow.length > 0) reasons.push('the cluster already owns entries: use --extend to add the new matches')
  const overlaps = ctx.assignment.overlaps.filter((o) => o.clusters.includes(id))
  if (overlaps.length > 0) reasons.push(`${plural(overlaps.length, 'rule overlap')} with ${[...new Set(overlaps.flatMap((o) => o.clusters))].filter((c) => c !== id).join(', ')}`)
  if (a.unowned.length === 0) reasons.push('the rule matches nothing that is not owned already')
  const next: Cluster = { ...a.cluster, owned: collapseOwned([...ownedNow, ...a.unowned.map(entryOwnedId)]) }
  const after = replaceCluster(ledger, next)
  reasons.push(...problemsAfter(after, id))
  if (reasons.length > 0) return refused(`snapshot ${id}`, reasons)
  writeLedger(after, paths.ledger)
  return { code: 0, text: `snapshot ${id}: now owns ${counted([...a.ownedPresent, ...a.unowned])}`, json: { id, added: a.unowned.length } }
}

function baselineReason(cluster: Cluster): string {
  // One baseline field: tabs and newlines would split the line.
  return `triage ${cluster.id}: ${cluster.decision?.rationale ?? ''}`.replace(/\s+/g, ' ').trim()
}

export function admitCommand(paths: Paths, id: string): Result {
  const found = target(paths, id)
  if ('code' in found) return found
  const { ctx, a } = found
  const reasons = [...runReasons(ctx, a.cluster), ...collisionReasons(ctx)]
  if (a.cluster.status !== 'accepted') reasons.push(`status is ${a.cluster.status}; admit needs accepted`)
  if (a.unowned.length > 0) reasons.push(`${counted(a.unowned)} match the rule but are not owned: snapshot --extend or narrow the rule first`)
  reasons.push(...problemsAfter(found.ledger, id))
  if (reasons.length > 0) return refused(`admit ${id}`, reasons)

  const reason = baselineReason(a.cluster)
  const owned = new Set(expandOwned(a.cluster.owned).map(ownedIdKey))
  const isOwned = (e: BaselineEntry): boolean => owned.has(ownedIdKey(entryOwnedId(e)))
  const baseline = loadBaseline(paths.baseline)
  const relabeled = baseline.map((e) => (isOwned(e) ? { ...e, reason } : e))
  const listed = new Set(baseline.map((e) => identity(e, e)))
  const added = a.ownedPresent
    .filter((e) => e.source === 'pending' && !listed.has(identity(e, e)))
    .map((e): BaselineEntry => ({ project: e.project, scenario: e.scenario, layer: e.layer, path: e.path, kind: e.kind, detail: e.detail, reason }))
  writeBaseline([...relabeled, ...added], paths.baseline)
  const relabeledCount = baseline.filter(isOwned).length
  return { code: 0, text: `admit ${id}: ${added.length} entries added, ${relabeledCount} relabeled`, json: { id, added: added.length, relabeled: relabeledCount } }
}

function today(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function closeCommand(paths: Paths, id: string, note: string | null = null, on = today()): Result {
  const found = target(paths, id)
  if ('code' in found) return found
  const { ctx, ledger, a } = found
  const reasons = [...runReasons(ctx, a.cluster), ...collisionReasons(ctx)]
  if (a.cluster.status !== 'decided' && a.cluster.status !== 'in-progress') reasons.push(`status is ${a.cluster.status}; close needs decided or in-progress`)
  const open = a.cluster.actions.filter((action) => !action.done)
  if (open.length > 0) reasons.push(`${plural(open.length, 'action')} not done`)
  if (a.ownedPresent.length > 0) reasons.push(`${counted(a.ownedPresent)} it owns are still present`)
  if (a.unowned.length > 0) reasons.push(`${counted(a.unowned)} match its rule but are not owned`)
  const completion = ctx.inputs.completion.completion
  if (reasons.length > 0 || completion === null) return refused(`close ${id}`, reasons)
  const next: Cluster = { ...a.cluster, status: 'done', resolution: { note, on, run: proofOf(completion) } }
  const after = replaceCluster(ledger, next)
  const problems = problemsAfter(after, id)
  if (problems.length > 0) return refused(`close ${id}`, problems)
  writeLedger(after, paths.ledger)
  return { code: 0, text: `close ${id}: done under run ${completion.runId.slice(0, 8)}`, json: { id, run: completion.runId } }
}

function proofOf(c: Completion): NonNullable<Cluster['resolution']>['run'] {
  return { runId: c.runId, finishedAt: c.finishedAt, matrix: 'full', projects: [...c.projects], scenarios: [...c.scenarios], complete: true }
}

function testsFields(match: Match): boolean {
  return match.layer !== null || match.path !== null || match.kind !== null || match.detail !== null
}

// Matching an owned identity needs its finding. One that is gone is known by its hash alone, so a
// rule that tests its fields cannot match it; a rule on scenarios and projects alone still can.
function releasable(match: Match, a: ClusterAssignment): Set<string> {
  const matcher = compileMatch(match)
  const keys = new Set(a.ownedPresent.filter(matcher).map((e) => ownedIdKey(entryOwnedId(e))))
  if (!testsFields(match)) {
    for (const id of a.ownedGone) {
      const probe: AvailableEntry = { project: id.project, scenario: id.scenario, layer: 'style', path: '', kind: '', detail: '', source: 'baselined', reason: null }
      if (matcher(probe)) keys.add(ownedIdKey(id))
    }
  }
  return keys
}

export function releaseCommand(paths: Paths, id: string, raw: string): Result {
  const parsed = parseMatch(raw)
  if ('error' in parsed) return usage(parsed.error)
  const found = target(paths, id)
  if ('code' in found) return found
  const { ledger, a } = found
  // A partial release would look like a whole one. Gone identities include pending ones the last run
  // cannot vouch for, so a rule on finding fields is refused rather than applied to what it can see.
  if (testsFields(parsed.match) && a.ownedGone.length > 0) {
    return refused(`release ${id}`, [
      `${a.ownedGone.length} owned ${a.ownedGone.length === 1 ? 'identity' : 'identities'} cannot be matched by layer, path, kind or detail because the finding is not available; ` +
        'release by scenarios and projects only, or after a run that finds them',
    ])
  }
  const released = releasable(parsed.match, a)
  if (released.size === 0) return refused(`release ${id}`, ['the rule matches no identity this cluster owns'])
  const remaining = expandOwned(a.cluster.owned).filter((o) => !released.has(ownedIdKey(o)))
  const reopened = remaining.length === 0
  const next: Cluster = reopened
    ? { ...a.cluster, owned: {}, status: 'open', decision: null, resolution: null }
    : { ...a.cluster, owned: collapseOwned(remaining) }
  const after = replaceCluster(ledger, next)
  const problems = problemsAfter(after, id)
  if (problems.length > 0) return refused(`release ${id}`, problems)
  writeLedger(after, paths.ledger)
  const text = `release ${id}: ${released.size} identities released${reopened ? '; nothing left, so it is open again' : ''}`
  return { code: 0, text, json: { id, released: released.size, reopened } }
}

interface Parsed {
  positional: string[]
  flags: Map<string, string | true>
}

const VALUE_FLAGS = new Set(['--limit', '--note', '--match'])
const BOOLEAN_FLAGS = new Set(['--json', '--extend'])

function parseArgs(argv: readonly string[]): Parsed | string {
  const positional: string[] = []
  const flags = new Map<string, string | true>()
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? ''
    if (VALUE_FLAGS.has(arg)) {
      const value = argv[i + 1]
      if (value === undefined) return `${arg} needs a value`
      flags.set(arg, value)
      i++
    } else if (BOOLEAN_FLAGS.has(arg)) flags.set(arg, true)
    else if (arg.startsWith('--')) return `unknown flag ${arg}`
    else positional.push(arg)
  }
  return { positional, flags }
}

const ALLOWED: Record<string, { args: number; flags: string[] }> = {
  status: { args: 0, flags: [] },
  drafts: { args: 0, flags: ['--limit'] },
  show: { args: 1, flags: [] },
  try: { args: 1, flags: [] },
  snapshot: { args: 1, flags: ['--extend'] },
  admit: { args: 1, flags: [] },
  close: { args: 1, flags: ['--note'] },
  release: { args: 1, flags: ['--match'] },
}

export function runCommand(argv: readonly string[], paths: Paths): Result {
  const parsed = parseArgs(argv)
  if (typeof parsed === 'string') return usage(parsed)
  const [command = 'status', ...args] = parsed.positional
  const spec = ALLOWED[command]
  if (spec === undefined) return usage(`unknown command "${command}"`)
  if (args.length !== spec.args) return usage(`${command} takes ${plural(spec.args, 'argument')}`)
  const stray = [...parsed.flags.keys()].filter((f) => f !== '--json' && !spec.flags.includes(f))
  if (stray.length > 0) return usage(`${command} does not take ${stray.join(', ')}`)
  const value = (flag: string): string | undefined => {
    const v = parsed.flags.get(flag)
    return typeof v === 'string' ? v : undefined
  }
  const id = args[0] ?? ''
  switch (command) {
    case 'drafts': {
      const raw = value('--limit')
      const limit = raw === undefined ? DEFAULT_DRAFT_LIMIT : Number(raw)
      if (!Number.isInteger(limit) || limit < 1) return usage('--limit needs a positive whole number')
      return draftsCommand(paths, limit)
    }
    case 'show':
      return showCommand(paths, id)
    case 'try':
      return tryCommand(paths, id)
    case 'snapshot':
      return snapshotCommand(paths, id, parsed.flags.has('--extend'))
    case 'admit':
      return admitCommand(paths, id)
    case 'close':
      return closeCommand(paths, id, value('--note') ?? null)
    case 'release': {
      const match = value('--match')
      if (match === undefined) return usage('release needs --match')
      return releaseCommand(paths, id, match)
    }
    default:
      return statusCommand(paths)
  }
}

export function main(argv: readonly string[], env: NodeJS.ProcessEnv): number {
  const json = argv.includes('--json')
  let result: Result
  try {
    result = runCommand(argv, pathsFromEnv(env))
  } catch (error) {
    // A baseline that does not parse, or a run directory that cannot be read.
    result = { code: 1, text: `demo-parity-triage: ${error instanceof Error ? error.message : String(error)}`, json: { error: String(error) } }
  }
  const out = json ? `${JSON.stringify(result.json, null, 2)}\n` : `${result.text}\n`
  ;(result.code === 2 ? process.stderr : process.stdout).write(out)
  return result.code
}

// Node gives this module its real path, so the invoked one is compared once symlinks are resolved too.
function invokedDirectly(invoked: string | undefined): boolean {
  if (invoked === undefined) return false
  try {
    return realpathSync(invoked) === fileURLToPath(import.meta.url)
  } catch {
    return false
  }
}

if (invokedDirectly(process.argv[1])) {
  process.exitCode = main(process.argv.slice(2), process.env)
}
