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

// Puts every available entry where it belongs. Ownership comes first and is decided by identity
// alone: a cluster's owned entries are its own whatever its rule now says. Rules only find what no
// cluster owns yet, so narrowing or widening a rule can never quietly move a decided entry.

import type { Finding } from '../findings.ts'
import { SCENARIOS, type Scenario } from '../scenarios.ts'
import {
  describeCollision,
  differenceHash,
  entryOwnedId,
  expandOwned,
  findCollisions,
  ownedIdKey,
  type Collision,
  type OwnedId,
} from './identity.ts'
import type { AvailableEntry } from './inputs.ts'
import { OWNING_STATUSES, ruleScenarios, type Cluster, type Match } from './ledger.ts'

export type Matcher = (entry: AvailableEntry) => boolean

function pattern(source: string | null): RegExp | null | undefined {
  if (source === null) return null
  try {
    return new RegExp(source)
  } catch {
    return undefined
  }
}

// A rule that does not compile matches nothing; validateLedger reports why.
export function compileMatch(match: Match, scenarios: readonly Scenario[] = SCENARIOS): Matcher {
  const path = pattern(match.path)
  const kind = pattern(match.kind)
  const detail = pattern(match.detail)
  if (path === undefined || kind === undefined || detail === undefined) return () => false
  const inScenarios = ruleScenarios(match, scenarios)
  const projects = match.projects === null ? null : new Set(match.projects)
  return (e) =>
    inScenarios.has(e.scenario) &&
    (projects === null || projects.has(e.project)) &&
    (match.layer === null || match.layer === e.layer) &&
    (path === null || path.test(e.path)) &&
    (kind === null || kind.test(e.kind)) &&
    (detail === null || detail.test(e.detail))
}

export interface ClusterAssignment {
  cluster: Cluster
  ownedPresent: AvailableEntry[]
  ownedGone: OwnedId[]
  // Rule matches no cluster owns: scope growth on a decided cluster, candidates on an open one.
  unowned: AvailableEntry[]
  // Rule matches another cluster owns. Allowed, because ownership decides; shown so it is not a surprise.
  ownedElsewhere: AvailableEntry[]
}

export interface Overlap {
  entry: AvailableEntry
  clusters: string[]
}

export type FlagKind = 'regression' | 'scope-growth' | 'problems'

export interface Flag {
  kind: FlagKind
  cluster: string | null
  text: string
}

export interface Assignment {
  clusters: ClusterAssignment[]
  overlaps: Overlap[]
  collisions: Collision[]
  unclustered: AvailableEntry[]
  flags: Flag[]
  closeCandidates: string[]
  resolvedLookingOpen: string[]
}

const keys = new WeakMap<AvailableEntry, string>()

// One entry's place in the ownership index: project, scenario and hash. Cached, because every rule
// and the index ask for it and a hash per question would be the whole cost of a status run.
function entryKey(entry: AvailableEntry): string {
  let key = keys.get(entry)
  if (key === undefined) {
    key = ownedIdKey(entryOwnedId(entry))
    keys.set(entry, key)
  }
  return key
}

function ownershipIndex(clusters: readonly Cluster[]): Map<string, string> {
  const owners = new Map<string, string>()
  for (const cluster of clusters) {
    for (const id of expandOwned(cluster.owned)) {
      const key = ownedIdKey(id)
      // A second owner is a validation problem; the first one keeps the entry meanwhile.
      if (!owners.has(key)) owners.set(key, cluster.id)
    }
  }
  return owners
}

function indexAvailable(available: readonly AvailableEntry[]): Map<string, AvailableEntry[]> {
  const index = new Map<string, AvailableEntry[]>()
  for (const entry of available) {
    const key = entryKey(entry)
    index.set(key, [...(index.get(key) ?? []), entry])
  }
  return index
}

function assignCluster(
  cluster: Cluster,
  matcher: Matcher,
  available: readonly AvailableEntry[],
  index: ReadonlyMap<string, AvailableEntry[]>,
  owners: ReadonlyMap<string, string>,
): ClusterAssignment {
  const ownedPresent: AvailableEntry[] = []
  const ownedGone: OwnedId[] = []
  for (const id of expandOwned(cluster.owned)) {
    const found = index.get(ownedIdKey(id))
    if (found === undefined) ownedGone.push(id)
    else ownedPresent.push(...found)
  }
  const unowned: AvailableEntry[] = []
  const ownedElsewhere: AvailableEntry[] = []
  for (const entry of available) {
    if (!matcher(entry)) continue
    const owner = owners.get(entryKey(entry))
    if (owner === undefined) unowned.push(entry)
    else if (owner !== cluster.id) ownedElsewhere.push(entry)
  }
  return { cluster, ownedPresent, ownedGone, unowned, ownedElsewhere }
}

function flagsFor(a: ClusterAssignment): Flag[] {
  const { cluster } = a
  const flags: Flag[] = []
  if (cluster.status === 'done' && (a.ownedPresent.length > 0 || a.unowned.length > 0)) {
    flags.push({
      kind: 'regression',
      cluster: cluster.id,
      text: `${cluster.id} is done, but ${a.ownedPresent.length} owned entries are back and ${a.unowned.length} new ones match its rule`,
    })
  }
  if (OWNING_STATUSES.includes(cluster.status) && a.unowned.length > 0) {
    flags.push({ kind: 'scope-growth', cluster: cluster.id, text: `${cluster.id} (${cluster.status}): ${a.unowned.length} entries match its rule but are not owned` })
  }
  return flags
}

export interface AssignOptions {
  // Validation problems, reported among the flags.
  problems?: readonly string[]
  scenarios?: readonly Scenario[]
  // Only so a test can force the hash collision sha256 will not produce.
  hashOf?: (f: Finding) => string
}

export function assign(clusters: readonly Cluster[], available: readonly AvailableEntry[], options: AssignOptions = {}): Assignment {
  const { problems = [], scenarios = SCENARIOS, hashOf = differenceHash } = options
  const owners = ownershipIndex(clusters)
  const index = indexAvailable(available)
  // By position, not id: a duplicate id is a validation problem, and must not swap two rules meanwhile.
  const matchers = clusters.map((c) => compileMatch(c.match, scenarios))
  const assigned = clusters.map((c, i) => assignCluster(c, matchers[i] ?? (() => false), available, index, owners))

  const overlaps: Overlap[] = []
  const unclustered: AvailableEntry[] = []
  for (const entry of available) {
    if (owners.has(entryKey(entry))) continue
    const matching = clusters.filter((_, i) => matchers[i]?.(entry) === true).map((c) => c.id)
    if (matching.length === 0) unclustered.push(entry)
    else if (matching.length > 1) overlaps.push({ entry, clusters: matching })
  }

  const collisions = findCollisions(available, hashOf)
  const flags: Flag[] = [
    ...problems.map((text): Flag => ({ kind: 'problems', cluster: null, text })),
    ...overlaps.map((o): Flag => ({
      kind: 'problems',
      cluster: null,
      text: `rule overlap: ${o.clusters.join(', ')} all match ${o.entry.project} ${o.entry.scenario} ${o.entry.path} ${o.entry.kind}`,
    })),
    ...collisions.map((c): Flag => ({ kind: 'problems', cluster: null, text: describeCollision(c) })),
    ...assigned.flatMap(flagsFor),
  ]

  const closeCandidates = assigned
    .filter(
      (a) =>
        (a.cluster.status === 'decided' || a.cluster.status === 'in-progress') &&
        a.ownedPresent.length === 0 &&
        a.unowned.length === 0 &&
        a.cluster.actions.every((action) => action.done),
    )
    .map((a) => a.cluster.id)
  const resolvedLookingOpen = assigned
    .filter((a) => a.cluster.status === 'open' && a.unowned.length === 0 && a.ownedElsewhere.length === 0)
    .map((a) => a.cluster.id)

  return { clusters: assigned, overlaps, collisions, unclustered, flags, closeCandidates, resolvedLookingOpen }
}
