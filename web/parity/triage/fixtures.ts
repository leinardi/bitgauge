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

// In-memory builders shared by the triage tests: entries, clusters and decisions that are valid
// unless a test overrides the part it is about.

import { ALL_PROJECT_NAMES, collapseOwned, entryOwnedId } from './identity.ts'
import type { AvailableEntry } from './inputs.ts'
import type { Cluster, Decision, Match, RunProof } from './ledger.ts'

export const DAY = '2026-10-04'

export function entry(overrides: Partial<AvailableEntry> = {}): AvailableEntry {
  return {
    project: 'light-desktop',
    scenario: 'test/idle',
    layer: 'style',
    path: 'main > button "Start test"',
    kind: 'font-weight',
    detail: '600 → 500',
    source: 'baselined',
    reason: 'present when the harness was adopted',
    ...overrides,
  }
}

// The same difference in every project.
export function everywhere(overrides: Partial<AvailableEntry> = {}): AvailableEntry[] {
  return ALL_PROJECT_NAMES.map((project) => entry({ ...overrides, project }))
}

export function match(overrides: Partial<Match> = {}): Match {
  return { scenarios: null, projects: null, layer: null, path: null, kind: null, detail: null, ...overrides }
}

export const verdict = (winner: Decision['winner'], overrides: Partial<Decision> = {}): Decision => ({
  kind: 'verdict',
  winner,
  text: null,
  rationale: 'the user decided',
  revisit: null,
  on: DAY,
  ...overrides,
})

export const confirmation = (overrides: Partial<Decision> = {}): Decision => ({
  kind: 'confirmation',
  rationale: 'confirmed',
  on: DAY,
  ...overrides,
})

export const deferral = (overrides: Partial<Decision> = {}): Decision => ({
  kind: 'deferral',
  rationale: 'after the release',
  revisit: null,
  on: DAY,
  ...overrides,
})

export const EVIDENCE: Cluster['evidence'] = {
  spec: { ref: 'docs/features/ui/screens.md', says: 'silent' },
  kit: { ref: 'docs/design_system/ui_kits/app/TestScreen.jsx', says: 'weight 500' },
  vue: { ref: 'web/src/components/test/StartButton.vue', says: 'weight 600' },
  notes: '',
}

export function cluster(overrides: Partial<Cluster> = {}): Cluster {
  return {
    id: 'start-button-weight',
    title: 'Start button weight',
    match: match({ kind: '^font-weight$' }),
    type: 'conflict',
    aspect: 'style',
    evidence: null,
    decision: null,
    owned: {},
    actions: [],
    status: 'open',
    resolution: null,
    ...overrides,
  }
}

export function ownedOf(entries: readonly AvailableEntry[]): Cluster['owned'] {
  return collapseOwned(entries.map(entryOwnedId))
}

export function decided(entries: readonly AvailableEntry[], overrides: Partial<Cluster> = {}): Cluster {
  return cluster({
    evidence: EVIDENCE,
    decision: verdict('kit'),
    owned: ownedOf(entries),
    actions: [{ target: 'vue', what: 'use weight 500', done: false }],
    status: 'decided',
    ...overrides,
  })
}

export function fullRun(scenarios: string[], overrides: Partial<RunProof> = {}): RunProof {
  return {
    runId: 'run',
    finishedAt: `${DAY}T10:00:00.000Z`,
    matrix: 'full',
    projects: [...ALL_PROJECT_NAMES],
    scenarios,
    complete: true,
    ...overrides,
  }
}
