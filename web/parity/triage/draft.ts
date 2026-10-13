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

// Suggests clusters for what no cluster owns or matches yet. The grouping is a starting point for a
// person, not a decision: each group comes with a rule that matches it, to be tried and narrowed
// before it becomes a cluster. The same input always gives the same groups in the same order.

import { identity } from '../baseline.ts'
import { ALL_PROJECT_NAMES, countDifferences } from './identity.ts'
import type { AvailableEntry } from './inputs.ts'
import type { Match } from './ledger.ts'

const SEGMENT = ' > '
const SAMPLES = 3

export interface DraftGroup {
  key: string
  differences: number
  entries: number
  baselined: number
  pending: number
  match: Match
  samples: AvailableEntry[]
}

export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')
}

function exactly(text: string): string {
  return `^${escapeRegExp(text)}$`
}

// A path prefix that ends on a segment boundary, so "nav" does not also select "navigation".
function pathPrefix(prefix: string): string {
  return `^${escapeRegExp(prefix)}(?: > |$)`
}

function segments(path: string, count: number): string {
  return path.split(SEGMENT).slice(0, count).join(SEGMENT)
}

interface Grouping {
  key: string
  rule: Pick<Match, 'path' | 'kind' | 'detail'>
}

function groupingOf(e: AvailableEntry): Grouping {
  if (e.layer === 'style') {
    return { key: ['style', e.kind, e.detail].join('\t'), rule: { path: null, kind: exactly(e.kind), detail: exactly(e.detail) } }
  }
  if (e.kind === 'changed') {
    return { key: ['content', 'changed', e.detail].join('\t'), rule: { path: null, kind: exactly('changed'), detail: exactly(e.detail) } }
  }
  if (e.kind === 'missing' || e.kind === 'extra') {
    const family = e.scenario.split('/')[0] ?? e.scenario
    const prefix = segments(e.path, 2)
    return { key: ['content', e.kind, family, prefix].join('\t'), rule: { path: pathPrefix(prefix), kind: exactly(e.kind), detail: null } }
  }
  const first = segments(e.path, 1)
  return { key: ['content', 'other', e.scenario, first].join('\t'), rule: { path: pathPrefix(first), kind: null, detail: null } }
}

function sortedUnique(values: Iterable<string>): string[] {
  return [...new Set(values)].sort()
}

export function draftGroups(unclustered: readonly AvailableEntry[]): DraftGroup[] {
  const groups = new Map<string, { rule: Grouping['rule']; entries: AvailableEntry[] }>()
  for (const entry of unclustered) {
    const { key, rule } = groupingOf(entry)
    const group = groups.get(key) ?? { rule, entries: [] }
    group.entries.push(entry)
    groups.set(key, group)
  }
  const drafts = [...groups].map(([key, { rule, entries }]): DraftGroup => {
    const projects = sortedUnique(entries.map((e) => e.project))
    // A group keyed on its path alone still names its kinds, so its rule cannot reach into the
    // changed, missing and extra groups that share the path.
    const kind = rule.kind ?? `^(?:${sortedUnique(entries.map((e) => escapeRegExp(e.kind))).join('|')})$`
    const allProjects = projects.length === ALL_PROJECT_NAMES.length
    const sorted = [...entries].sort((a, b) => compare(identity(a, a), identity(b, b)))
    return {
      key,
      differences: countDifferences(entries),
      entries: entries.length,
      baselined: entries.filter((e) => e.source === 'baselined').length,
      pending: entries.filter((e) => e.source === 'pending').length,
      match: {
        scenarios: sortedUnique(entries.map((e) => e.scenario)),
        projects: allProjects ? null : projects,
        layer: sorted[0]?.layer ?? null,
        ...rule,
        kind,
      },
      samples: sorted.slice(0, SAMPLES),
    }
  })
  return drafts.sort((a, b) => b.entries - a.entries || compare(a.key, b.key))
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}
