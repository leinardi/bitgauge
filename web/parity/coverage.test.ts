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

// The harness compares only what scenarios.ts visits, so a screen or a Test screen state added to
// either side is invisible to it until someone adds a scenario. This test makes that a failure
// instead of a silent gap: it reads the screens and states both sides declare straight from their
// sources. Dialogs cannot be enumerated this way; the checklist in docs/engineering/demo-parity.md
// covers them.

import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { VUE_HELD_STATES, VUE_STARTING_STATES } from './drivers.ts'
import { ALL_SCENARIOS, KIT_SCOPE, SCENARIOS, V01_TEST_STATES } from './scenarios.ts'
import { filterScenarios } from './selection.ts'

function source(relative: string): string {
  return readFileSync(new URL(relative, import.meta.url), 'utf8')
}

const KIT = '../../docs/design_system/ui_kits/app/'

// Every capture of `pattern` in `text`, which must find at least one: a refactor that moves the list
// this reads should fail here by name, not pass because it found nothing to compare.
function captures(text: string, pattern: RegExp, what: string): string[][] {
  const found = [...text.matchAll(pattern)].map((m) => m.slice(1).map((group) => group ?? ''))
  if (found.length === 0) throw new Error(`coverage.test.ts could not read ${what}; update its pattern`)
  return found
}

const sorted = (items: Iterable<string>): string[] => [...new Set(items)].sort()

// One row per screen both sides have: its Vue route name, its prototype screen, and the scenarios
// that compare it.
const PAGES = [
  { route: 'test', kit: 'test', scenarios: 'test/*' },
  { route: 'about', kit: 'about', scenarios: 'about,about/*' },
  { route: 'history', kit: 'history', scenarios: 'history/*' },
  { route: 'settings', kit: 'settings', scenarios: 'settings' },
]

// Prototype screens the app does not have yet, each with the reason.
const KIT_V02_SCREENS: Record<string, string> = {
  result: 'Result detail lands later in v0.2; until then its route answers with the not-available page',
}

// Vue pages the prototype has no screen for, each with the reason.
const VUE_ONLY_PAGES: Record<string, string> = {
  'not-available': 'the page for the Result detail route until its screen lands, which the prototype shows instead',
}

// Test screen states the kit has and v0.1 does not, each with the reason.
const KIT_V03_STATES: Record<string, string> = {
  continuous: 'Continuous mode is v0.3',
  'cont-warmup': 'Continuous mode is v0.3',
  'cont-done': 'Continuous mode is v0.3',
}

// The page each Vue route renders: its own, or the not-available page.
const vueRoutes = captures(source('../src/router/index.ts'), /\{ path: '[^']*', name: '([^']+)', component: (.*) \},?$/gm, 'the Vue routes').map(
  ([name, component]) => ({ name: name ?? '', page: component === 'NotAvailablePage' ? 'not-available' : (name ?? '') }),
)
const kitScreens = captures(source(`${KIT}Prototype.jsx`), /is[A-Z]\w*: S === '([a-z]+)'/g, 'the prototype screens').map(([screen]) => screen ?? '')
const kitStates = captures(
  /const TEST_STATES = \[([^\]]*)\]/.exec(source(`${KIT}App.jsx`))?.[1] ?? '',
  /'([a-z-]+)'/g,
  'TEST_STATES in App.jsx',
).map(([state]) => state ?? '')

describe('screens', () => {
  it('gives every Vue page a row, or a reason the prototype has no screen for it', () => {
    const known = new Set([...PAGES.map((p) => p.route), ...Object.keys(VUE_ONLY_PAGES)])
    expect(
      sorted(vueRoutes.map((route) => route.page)).filter((page) => !known.has(page)),
      'new Vue page: add a scenario to scenarios.ts and a PAGES row here, or a VUE_ONLY_PAGES reason',
    ).toEqual([])
  })

  it('gives every prototype screen a row, or a reason the app does not have it yet', () => {
    const known = new Set([...PAGES.map((p) => p.kit), ...Object.keys(KIT_V02_SCREENS)])
    expect(
      sorted(kitScreens).filter((screen) => !known.has(screen)),
      'new prototype screen: add a scenario to scenarios.ts and a PAGES row here, or a KIT_V02_SCREENS reason',
    ).toEqual([])
  })

  it('answers exactly the prototype v0.2 screens with the not-available page', () => {
    expect(sorted(vueRoutes.filter((route) => route.page === 'not-available').map((route) => route.name))).toEqual(sorted(Object.keys(KIT_V02_SCREENS)))
  })

  it('names no route, page or screen that is gone', () => {
    const pages = new Set(vueRoutes.map((route) => route.page))
    const screens = new Set(kitScreens)
    expect(PAGES.filter((p) => !pages.has(p.route)).map((p) => p.route)).toEqual([])
    expect(PAGES.filter((p) => !screens.has(p.kit)).map((p) => p.kit)).toEqual([])
    expect(Object.keys(VUE_ONLY_PAGES).filter((page) => !pages.has(page))).toEqual([])
    expect(Object.keys(KIT_V02_SCREENS).filter((screen) => !screens.has(screen))).toEqual([])
  })

  it.each(PAGES)('compares $route in at least one scenario', ({ scenarios }) => {
    expect(() => filterScenarios(ALL_SCENARIOS, scenarios)).not.toThrow()
  })
})

describe('the driven scope', () => {
  it('runs every scenario of the scope the prototype is driven in, and none of a later one', () => {
    expect(SCENARIOS.map((s) => s.id)).toEqual(ALL_SCENARIOS.filter((s) => s.kitScope === undefined || s.kitScope === KIT_SCOPE).map((s) => s.id))
    expect(SCENARIOS.some((s) => s.id === 'settings')).toBe(KIT_SCOPE === 'v0.2')
    expect(SCENARIOS.some((s) => s.id.startsWith('history/'))).toBe(KIT_SCOPE === 'v0.2')
  })
})

describe('Test screen states', () => {
  const scenarioStates = SCENARIOS.filter((s) => s.id.startsWith('test/')).map((s) => s.id.slice('test/'.length))

  it('has a scenario for every v0.1 state of the kit', () => {
    const v01 = kitStates.filter((state) => !(state in KIT_V03_STATES))
    expect(sorted(V01_TEST_STATES), 'V01_TEST_STATES in scenarios.ts is out of date').toEqual(sorted(v01))
    expect(sorted(scenarioStates)).toEqual(sorted(v01))
  })

  it('names no state the kit dropped, and no v0.3 state', () => {
    const kit = new Set(kitStates)
    expect(scenarioStates.filter((state) => !kit.has(state) || state in KIT_V03_STATES)).toEqual([])
    expect(Object.keys(KIT_V03_STATES).filter((state) => !kit.has(state))).toEqual([])
  })
})

describe('the Vue driver', () => {
  it('knows which demo states start a run', () => {
    const flags = captures(source('../src/demo/scenarios.ts'), /^ {2}'?([a-z-]+)'?: \{ link: '[a-z0-9-]+', start: (true|false)\b/gm, 'the start flags of DEMO_SCENARIOS')
    expect(sorted(flags.map(([state]) => state ?? '')), 'a demo state has no start flag this test can read').toEqual(sorted(V01_TEST_STATES))
    expect(sorted(VUE_STARTING_STATES)).toEqual(sorted(flags.filter(([, start]) => start === 'true').map(([state]) => state ?? '')))
  })

  it('knows which demo states hold their run', () => {
    const held = captures(source('../src/demo/scenarios.ts'), /^ {2}'?([a-z-]+)'?: \{[^\n]*\bhold: /gm, 'the holds of DEMO_SCENARIOS').map(([state]) => state ?? '')
    expect(sorted(VUE_HELD_STATES)).toEqual(sorted(held))
    expect([...VUE_HELD_STATES].filter((state) => !VUE_STARTING_STATES.has(state))).toEqual([])
  })
})
