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

// How the triage ledger names a finding. A cluster's owned snapshot stores one short hash per
// difference instead of the difference itself, so the ledger stays readable; the hash is taken over
// the finding's own fields only, never its baseline reason, so relabeling an entry keeps its owner.

import { createHash } from 'node:crypto'

import type { Finding } from '../findings.ts'
import { ALL_PROJECTS, type Pair } from '../selection.ts'

export const ALL = '*'
export const ALL_PROJECT_NAMES: readonly string[] = ALL_PROJECTS.map((p) => p.name)

const HASH_LENGTH = 12

// One project's finding: the unit ownership, assignment and admission all work on.
export interface Entry extends Pair, Finding {}

// scenario -> hash -> the projects owned, "*" for all of them.
export type Owned = Record<string, Record<string, typeof ALL | string[]>>

export interface OwnedId {
  project: string
  scenario: string
  hash: string
}

export function differenceKey(f: Finding): string {
  return [f.layer, f.path, f.kind, f.detail].join('\t')
}

export function differenceHash(f: Finding): string {
  return createHash('sha256').update(differenceKey(f)).digest('hex').slice(0, HASH_LENGTH)
}

export function ownedIdKey(id: OwnedId): string {
  return [id.project, id.scenario, id.hash].join('\u0000')
}

export function entryOwnedId(entry: Entry): OwnedId {
  return { project: entry.project, scenario: entry.scenario, hash: differenceHash(entry) }
}

// The same difference across projects: what counts are reported in alongside entries.
function differenceOf(entry: Entry): string {
  return `${entry.scenario}\t${differenceKey(entry)}`
}

export function countDifferences(entries: Iterable<Entry>): number {
  const differences = new Set<string>()
  for (const e of entries) differences.add(differenceOf(e))
  return differences.size
}

export function expandOwned(owned: Owned): OwnedId[] {
  const ids: OwnedId[] = []
  for (const [scenario, hashes] of Object.entries(owned)) {
    for (const [hash, projects] of Object.entries(hashes)) {
      for (const project of projects === ALL ? ALL_PROJECT_NAMES : projects) ids.push({ project, scenario, hash })
    }
  }
  return ids
}

// Scenarios and hashes sorted, projects collapsed to "*" when all four are owned, so the same set of
// identities always serializes to the same ledger text.
export function collapseOwned(ids: Iterable<OwnedId>): Owned {
  const byScenario = new Map<string, Map<string, Set<string>>>()
  for (const id of ids) {
    const hashes = byScenario.get(id.scenario) ?? new Map<string, Set<string>>()
    byScenario.set(id.scenario, hashes)
    const projects = hashes.get(id.hash) ?? new Set<string>()
    hashes.set(id.hash, projects)
    projects.add(id.project)
  }
  const owned: Owned = {}
  for (const scenario of [...byScenario.keys()].sort()) {
    const hashes = byScenario.get(scenario) ?? new Map<string, Set<string>>()
    const out: Record<string, typeof ALL | string[]> = {}
    for (const hash of [...hashes.keys()].sort()) {
      const projects = hashes.get(hash) ?? new Set<string>()
      const all = projects.size === ALL_PROJECT_NAMES.length && ALL_PROJECT_NAMES.every((name) => projects.has(name))
      out[hash] = all ? ALL : [...projects].sort()
    }
    owned[scenario] = out
  }
  return owned
}

export interface Collision {
  scenario: string
  hash: string
  keys: [string, string]
}

// Two different differences of one scenario that share a hash would make ownership ambiguous. The
// hash function is a parameter only so a test can force a collision sha256 will not produce.
export function findCollisions(entries: Iterable<Entry>, hashOf: (f: Finding) => string = differenceHash): Collision[] {
  const seen = new Map<string, string>()
  const collisions = new Map<string, Collision>()
  for (const e of entries) {
    const hash = hashOf(e)
    const at = `${e.scenario}\u0000${hash}`
    const key = differenceKey(e)
    const first = seen.get(at)
    if (first === undefined) seen.set(at, key)
    else if (first !== key && !collisions.has(at)) {
      collisions.set(at, { scenario: e.scenario, hash, keys: [first, key] })
    }
  }
  return [...collisions.values()]
}

export function describeCollision(c: Collision): string {
  return `hash collision in ${c.scenario} on ${c.hash}: "${c.keys[0]}" and "${c.keys[1]}"`
}
