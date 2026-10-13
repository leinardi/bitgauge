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

// The ratchet. .parity-baseline lists the differences known and accepted for now, one per line; a
// run fails on any difference it does not list and on any listed one that has gone. Entries leave by
// `make demo-parity-update` and arrive only by `make demo-parity-accept` with a reason.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import type { Finding } from './findings.ts'
import { writeFileAtomically } from './records.ts'
import { ALL_PROJECTS, pairKey, type Pair } from './selection.ts'

const BASELINE_FILE = fileURLToPath(new URL('../../.parity-baseline', import.meta.url))

const HEADER = `# Demo parity baseline: differences between the design kit's prototype and the Vue demo that are
# known and accepted for now. One line per difference, tab-separated:
#   projects  scenario  layer  path  kind  detail  reason
# where projects is * for all four projects, or the comma-separated projects it occurs in.
# Maintained by the harness, never by hand: make demo-parity-update removes what has been fixed,
# make demo-parity-accept REASON=... adds what is accepted. See docs/engineering/demo-parity.md.
`

export interface BaselineEntry extends Pair, Finding {
  reason: string
}

const FIELDS = 7

export function identity(pair: Pair, f: Finding): string {
  return [pair.project, pair.scenario, f.layer, f.path, f.kind, f.detail].join('\t')
}

// Most differences occur in every project alike, so the file stores each once with the projects it
// occurs in; in memory every entry is one project's, which is what the ratchet reasons about.
const ALL = '*'
const ALL_PROJECT_NAMES = ALL_PROJECTS.map((p) => p.name)

function expandProjects(field: string): string[] {
  return field === ALL ? ALL_PROJECT_NAMES : field.split(',')
}

function collapseProjects(projects: readonly string[]): string {
  const set = new Set(projects)
  const all = set.size === ALL_PROJECT_NAMES.length && ALL_PROJECT_NAMES.every((name) => set.has(name))
  return all ? ALL : [...set].sort().join(',')
}

export function parseBaseline(text: string): BaselineEntry[] {
  const entries: BaselineEntry[] = []
  const seen = new Set<string>()
  text.split('\n').forEach((line, index) => {
    if (line.trim() === '' || line.startsWith('#')) return
    const parts = line.split('\t')
    const [projects, scenario, layer, findingPath, kind, detail, reason] = parts
    if (parts.length !== FIELDS || projects === undefined || scenario === undefined || findingPath === undefined || kind === undefined || detail === undefined || reason === undefined) {
      throw new Error(`.parity-baseline:${index + 1}: expected ${FIELDS} tab-separated fields, found ${parts.length}`)
    }
    if (layer !== 'content' && layer !== 'style') {
      throw new Error(`.parity-baseline:${index + 1}: unknown layer "${layer ?? ''}"`)
    }
    for (const project of expandProjects(projects)) {
      const entry: BaselineEntry = { project, scenario, layer, path: findingPath, kind, detail, reason }
      const id = identity(entry, entry)
      if (seen.has(id)) throw new Error(`.parity-baseline:${index + 1}: duplicate entry for ${project}`)
      seen.add(id)
      entries.push(entry)
    }
  })
  return entries
}

export function loadBaseline(file = BASELINE_FILE): BaselineEntry[] {
  let text: string
  try {
    text = readFileSync(file, 'utf8')
  } catch {
    return []
  }
  return parseBaseline(text)
}

export function formatBaseline(entries: readonly BaselineEntry[]): string {
  const groups = new Map<string, string[]>()
  for (const e of entries) {
    const rest = [e.scenario, e.layer, e.path, e.kind, e.detail, e.reason].join('\t')
    groups.set(rest, [...(groups.get(rest) ?? []), e.project])
  }
  const lines = [...groups].map(([rest, projects]) => `${collapseProjects(projects)}\t${rest}`)
  // Sorted on the scenario onward, so one difference keeps its place when its projects change.
  const sortKey = (line: string): string => line.slice(line.indexOf('\t') + 1)
  lines.sort((a, b) => (sortKey(a) < sortKey(b) ? -1 : sortKey(a) > sortKey(b) ? 1 : 0))
  return HEADER + lines.map((line) => `${line}\n`).join('')
}

export function writeBaseline(entries: readonly BaselineEntry[], file = BASELINE_FILE): void {
  writeFileAtomically(file, formatBaseline(entries))
}

export interface PairVerdict {
  unexpected: Finding[]
  stale: BaselineEntry[]
}

// One pair's findings against the entries the baseline holds for that pair.
export function judgePair(pair: Pair, findings: readonly Finding[], entries: readonly BaselineEntry[]): PairVerdict {
  const listed = entries.filter((e) => e.project === pair.project && e.scenario === pair.scenario)
  const listedIds = new Set(listed.map((e) => identity(e, e)))
  const foundIds = new Set(findings.map((f) => identity(pair, f)))
  return {
    unexpected: findings.filter((f) => !listedIds.has(identity(pair, f))),
    stale: listed.filter((e) => !foundIds.has(identity(e, e))),
  }
}

export function isOrphan(entry: BaselineEntry, projects: ReadonlySet<string>, scenarios: ReadonlySet<string>): boolean {
  return !projects.has(entry.project) || !scenarios.has(entry.scenario)
}

export interface MergeInput {
  old: readonly BaselineEntry[]
  // Pairs this run compared successfully, with what it found. Nothing else may change.
  covered: ReadonlyMap<string, { pair: Pair; findings: readonly Finding[] }>
  mode: 'update' | 'accept'
  reason: string
  projects: ReadonlySet<string>
  scenarios: ReadonlySet<string>
}

export function mergeBaseline(input: MergeInput): BaselineEntry[] {
  const { old, covered, mode, reason, projects, scenarios } = input
  const kept = old.filter((e) => !isOrphan(e, projects, scenarios) && !covered.has(pairKey(e)))
  const next: BaselineEntry[] = [...kept]
  for (const { pair, findings } of covered.values()) {
    const previous = new Map(
      old.filter((e) => e.project === pair.project && e.scenario === pair.scenario).map((e) => [identity(e, e), e]),
    )
    for (const f of findings) {
      const existing = previous.get(identity(pair, f))
      if (existing !== undefined) next.push(existing)
      else if (mode === 'accept') next.push({ ...pair, ...f, reason })
    }
  }
  return next
}
