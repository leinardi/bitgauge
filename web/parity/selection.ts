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

// What one run must compare. Every consumer (the config's projects, the spec's tests, the reporter's
// coverage check and the baseline merge) reads the selection from here, so the set a run was asked to
// cover and the set it is judged against cannot drift apart.

export type Theme = 'light' | 'dark'

// The desktop window, and the kit's mobile frame, 390 px wide (ui_kits/app/Prototype.jsx).
export const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  narrow: { width: 390, height: 844 },
} as const
export type ViewportName = keyof typeof VIEWPORTS

export interface ParityProject {
  name: string
  theme: Theme
  viewport: ViewportName
}

const THEMES: readonly Theme[] = ['light', 'dark']
const VIEWPORT_NAMES = Object.keys(VIEWPORTS) as ViewportName[]

export const ALL_PROJECTS: readonly ParityProject[] = THEMES.flatMap((theme) =>
  VIEWPORT_NAMES.map((viewport) => ({ name: `${theme}-${viewport}`, theme, viewport })),
)

const DEFAULT_PROJECT = 'light-desktop'

/** What the selection needs of a scenario: its id. */
export interface ScenarioRef {
  id: string
}

export type Matrix = 'default' | 'full'
export type BaselineMode = 'check' | 'update' | 'accept'

export interface Selection<S extends ScenarioRef = ScenarioRef> {
  matrix: Matrix
  scenarioFilter: string | null
  mode: BaselineMode
  reason: string
  projects: ParityProject[]
  scenarios: S[]
}

export interface Pair {
  project: string
  scenario: string
}

export function pairKey(pair: Pair): string {
  return `${pair.project}\u0000${pair.scenario}`
}

function parseMatrix(raw: string | undefined): Matrix {
  const value = raw === undefined || raw === '' ? 'default' : raw
  if (value !== 'default' && value !== 'full') {
    throw new Error(`PARITY_MATRIX=${value}: expected "default" or "full"`)
  }
  return value
}

function parseMode(raw: string | undefined): BaselineMode {
  const value = raw === undefined || raw === '' ? 'check' : raw
  if (value !== 'check' && value !== 'update' && value !== 'accept') {
    throw new Error(`PARITY_BASELINE=${value}: expected "check", "update" or "accept"`)
  }
  return value
}

// A filter item is an exact scenario id or "prefix/*". An item that selects nothing is an error:
// a typo must not turn into a run that covers nothing and passes.
export function filterScenarios<S extends ScenarioRef>(all: readonly S[], filter: string | null): S[] {
  if (filter === null) return [...all]
  const items = filter
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item !== '')
  if (items.length === 0) throw new Error('PARITY_SCENARIOS is set but names no scenario')
  const chosen = new Set<string>()
  for (const item of items) {
    const matches = item.endsWith('/*') ? all.filter((s) => s.id.startsWith(item.slice(0, -1))) : all.filter((s) => s.id === item)
    if (matches.length === 0) throw new Error(`PARITY_SCENARIOS: "${item}" matches no scenario`)
    for (const s of matches) chosen.add(s.id)
  }
  return all.filter((s) => chosen.has(s.id))
}

export function selectionFromEnv<S extends ScenarioRef>(env: NodeJS.ProcessEnv, scenarios: readonly S[]): Selection<S> {
  const matrix = parseMatrix(env['PARITY_MATRIX'])
  const mode = parseMode(env['PARITY_BASELINE'])
  // One baseline field: tabs and newlines would split the line.
  const reason = (env['PARITY_REASON'] ?? '').replace(/\s+/g, ' ').trim()
  if (mode === 'accept' && reason === '') {
    throw new Error('PARITY_BASELINE=accept needs PARITY_REASON: say why these differences are accepted')
  }
  const rawFilter = env['PARITY_SCENARIOS']
  const scenarioFilter = rawFilter === undefined || rawFilter.trim() === '' ? null : rawFilter
  return {
    matrix,
    scenarioFilter,
    mode,
    reason,
    projects: matrix === 'full' ? [...ALL_PROJECTS] : ALL_PROJECTS.filter((p) => p.name === DEFAULT_PROJECT),
    scenarios: filterScenarios(scenarios, scenarioFilter),
  }
}

export function expectedPairs(selection: Selection): Pair[] {
  return selection.projects.flatMap((project) => selection.scenarios.map((scenario) => ({ project: project.name, scenario: scenario.id })))
}

// Playwright's own filters would shrink a run without the selection knowing, and the ratchet would
// then judge the run against pairs it never ran. Only flags that change how tests run, never which
// ones, are let through; the selection is made with PARITY_MATRIX and PARITY_SCENARIOS instead.
const ALLOWED_FLAGS = new Set(['--headed', '--debug', '--quiet'])
const ALLOWED_VALUE_FLAGS = new Set(['--workers', '-j', '--trace', '--config', '-c'])

export function assertNoPlaywrightFilters(argv: readonly string[]): void {
  const testIndex = argv.indexOf('test')
  if (testIndex === -1) return
  const args = argv.slice(testIndex + 1)
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] ?? ''
    const flag = arg.split('=')[0] ?? ''
    if (ALLOWED_FLAGS.has(arg)) continue
    if (ALLOWED_VALUE_FLAGS.has(flag)) {
      if (!arg.includes('=')) i++
      continue
    }
    throw new Error(
      `playwright test ${arg}: the parity harness selects what runs itself. ` +
        'Use PARITY_SCENARIOS (make demo-parity SCENARIO=...) and PARITY_MATRIX (MATRIX=full) instead.',
    )
  }
}
