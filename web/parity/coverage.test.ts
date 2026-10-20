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

import { VUE_HELD_STATES, VUE_RESULT_RUN, VUE_STARTING_STATES } from './drivers.ts'
import {
  ABOUT_LAYERS,
  COMPARE_B_CASES,
  CONTINUOUS_LENGTHS,
  HISTORY_VARIANTS,
  KIT_NEWEST_SCOPE,
  LOADED_CASES,
  RESPONSIVENESS_CASES,
  RESULT_STATES,
  RUN_LENGTH_CASES,
  SCENARIOS,
  SETTINGS_STATES,
  TEST_STATES,
} from './scenarios.ts'
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
  { route: 'test', kit: 'test', scenarios: 'test/*,loaded/*,share/*,responsiveness/*,continuous/*' },
  { route: 'about', kit: 'about', scenarios: 'about,about/*' },
  { route: 'history', kit: 'history', scenarios: 'history/*' },
  { route: 'result', kit: 'result', scenarios: 'result,result/*' },
  { route: 'settings', kit: 'settings', scenarios: 'settings,settings/*' },
]

// Prototype screens the app does not have yet, each with the reason.
const KIT_NOT_AVAILABLE_SCREENS: Record<string, string> = {}

// Vue pages the prototype has no screen for, each with the reason.
const VUE_ONLY_PAGES: Record<string, string> = {}

// The page each Vue route renders: its own, or the not-available page.
const vueRoutes = captures(source('../src/router/index.ts'), /\{ path: '[^']*', name: '([^']+)', component: (.*) \},?$/gm, 'the Vue routes').map(
  ([name, component]) => ({ name: name ?? '', page: component === 'NotAvailablePage' ? 'not-available' : (name ?? '') }),
)
const kitScreens = captures(source(`${KIT}Prototype.jsx`), /is[A-Z]\w*: S === '([a-z]+)'/g, 'the prototype screens').map(([screen]) => screen ?? '')
const kitApp = source(`${KIT}App.jsx`)
const kitStates = captures(/const TEST_STATES = \[([^\]]*)\]/.exec(kitApp)?.[1] ?? '', /'([a-z-]+)'/g, 'TEST_STATES in App.jsx').map(([state]) => state ?? '')
const kitHistoryVariants = captures(/const HISTORY_VARIANTS = \[([^\]]*)\]/.exec(kitApp)?.[1] ?? '', /'([a-z0-9-]+)'/g, 'HISTORY_VARIANTS in App.jsx').map(
  ([variant]) => variant ?? '',
)
// The Result detail section's State and Demo selects, by their value bindings.
const kitResultChoice = (binding: string) =>
  captures(new RegExp(`value=\\{d\\.${binding}\\} options=\\{\\[([^\\]]*)\\]`).exec(kitApp)?.[1] ?? '', /'([a-z-]+)'/g, `the ${binding} choices in App.jsx`).map(
    ([choice]) => choice ?? '',
  )
const kitResultStates = [...kitResultChoice('resultState'), ...kitResultChoice('resultDemo').filter((choice) => choice !== 'none')]
// The Settings component's documented boolean states (Settings.jsx props), in the scenarios' words:
// every boolean prop but mobile, the frame every screen takes.
const kitSettingsStates = captures(source(`${KIT}Settings.jsx`), /^ \* {3}(\w+): boolean/gm, 'the Settings.jsx boolean props')
  .map(([prop]) => prop ?? '')
  .filter((prop) => prop !== 'mobile')
  .map((prop) => prop.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`))
// A panel segment's choices, by its value binding: [['h1', 'HTTP/1.1'], ...].
const kitSegment = (binding: string) =>
  captures(new RegExp(`value=\\{d\\.${binding}\\} options=\\{\\[(.*?)\\]\\} onChange`).exec(kitApp)?.[1] ?? '', /\['([a-z0-9-]+)', '[^']*'\]/g, `the ${binding} choices in App.jsx`).map(
    ([choice]) => choice ?? '',
  )
// The panel's Responsiveness choices (RESP_OPTS), shared by the Test and Result detail sections.
const kitResponsiveness = captures(/const RESP_OPTS = \[(.*)\];/.exec(kitApp)?.[1] ?? '', /\['([a-z0-9-]+)', '[^']*'\]/g, 'RESP_OPTS in App.jsx').map(([choice]) => choice ?? '')
// The About section's switches, by their value bindings.
const kitAboutSection = /About · compatibility layers<\/span>([\s\S]*?)<\/div>/.exec(kitApp)?.[1] ?? ''
const kitAboutKeys = captures(kitAboutSection, /value=\{d\.(\w+)\}/g, 'the About switches in App.jsx').map(([key]) => key ?? '')
// The panel's loaded-latency cases: the WebSocket-close switch, and each LL_GAPS reason but none.
const kitLoadedCases = [
  ...(kitApp.includes('value={d.wsClose}') ? ['ws-close'] : []),
  ...captures(/const LL_GAPS = \[(.*)\];/.exec(kitApp)?.[1] ?? '', /\['([a-z-]+)', '[^']*'\]/g, 'LL_GAPS in App.jsx')
    .map(([reason]) => reason ?? '')
    .filter((reason) => reason !== 'none')
    .map((reason) => `ll-${reason}`),
]
// The panel's Scope choices (SCOPES), oldest first.
const kitScopes = captures(/const SCOPES = \[([^\]]*)\]/.exec(kitApp)?.[1] ?? '', /'([^']+)'/g, 'SCOPES in App.jsx').map(([scope]) => scope ?? '')

describe('screens', () => {
  it('gives every Vue page a row, or a reason the prototype has no screen for it', () => {
    const known = new Set([...PAGES.map((p) => p.route), ...Object.keys(VUE_ONLY_PAGES)])
    expect(
      sorted(vueRoutes.map((route) => route.page)).filter((page) => !known.has(page)),
      'new Vue page: add a scenario to scenarios.ts and a PAGES row here, or a VUE_ONLY_PAGES reason',
    ).toEqual([])
  })

  it('gives every prototype screen a row, or a reason the app does not have it yet', () => {
    const known = new Set([...PAGES.map((p) => p.kit), ...Object.keys(KIT_NOT_AVAILABLE_SCREENS)])
    expect(
      sorted(kitScreens).filter((screen) => !known.has(screen)),
      'new prototype screen: add a scenario to scenarios.ts and a PAGES row here, or a KIT_NOT_AVAILABLE_SCREENS reason',
    ).toEqual([])
  })

  it('answers exactly the prototype screens the app does not have with the not-available page', () => {
    expect(sorted(vueRoutes.filter((route) => route.page === 'not-available').map((route) => route.name))).toEqual(sorted(Object.keys(KIT_NOT_AVAILABLE_SCREENS)))
  })

  it('names no route, page or screen that is gone', () => {
    const pages = new Set(vueRoutes.map((route) => route.page))
    const screens = new Set(kitScreens)
    expect(PAGES.filter((p) => !pages.has(p.route)).map((p) => p.route)).toEqual([])
    expect(PAGES.filter((p) => !screens.has(p.kit)).map((p) => p.kit)).toEqual([])
    expect(Object.keys(VUE_ONLY_PAGES).filter((page) => !pages.has(page))).toEqual([])
    expect(Object.keys(KIT_NOT_AVAILABLE_SCREENS).filter((screen) => !screens.has(screen))).toEqual([])
  })

  it.each(PAGES)('compares $route in at least one scenario', ({ scenarios }) => {
    expect(() => filterScenarios(SCENARIOS, scenarios)).not.toThrow()
  })
})

describe('the driven scope', () => {
  it('pins the kit to its newest scope', () => {
    expect(kitScopes.length, 'SCOPES in App.jsx is empty').toBeGreaterThan(0)
    expect(KIT_NEWEST_SCOPE, 'KIT_NEWEST_SCOPE in scenarios.ts is not the last of SCOPES').toBe(kitScopes.at(-1))
  })
})

describe('the kit panel choices', () => {
  const ids = new Set(SCENARIOS.map((s) => s.id))

  it('drives every Responsiveness choice of the kit on the Test screen and the Result detail', () => {
    expect(sorted(['ok', ...RESPONSIVENESS_CASES]), 'RESPONSIVENESS_CASES in scenarios.ts is out of date').toEqual(sorted(kitResponsiveness))
    expect(RESPONSIVENESS_CASES.filter((resp) => !ids.has(`responsiveness/${resp}`) || !ids.has(`result/resp-${resp}`))).toEqual([])
  })

  it('drives every Continuous run length of the kit', () => {
    expect(sorted(['none', ...RUN_LENGTH_CASES]), 'RUN_LENGTH_CASES in scenarios.ts is out of date').toEqual(sorted(kitSegment('runLength')))
    expect(RUN_LENGTH_CASES.filter((length) => !ids.has(`continuous/run-length-${length}`))).toEqual([])
  })

  it('drives every Compare B choice of the kit', () => {
    expect(sorted(['h1', ...COMPARE_B_CASES]), 'COMPARE_B_CASES in scenarios.ts is out of date').toEqual(sorted(kitSegment('compareB')))
    expect(COMPARE_B_CASES.filter((compareB) => !ids.has(`history/compare-${compareB}`))).toEqual([])
  })

  it('drives every Result detail Kind and Continuous length of the kit', () => {
    expect(sorted(kitSegment('resultKind')), 'a Result detail Kind the harness does not drive').toEqual(sorted(['standard', 'continuous']))
    expect(sorted(CONTINUOUS_LENGTHS), 'CONTINUOUS_LENGTHS in scenarios.ts is out of date').toEqual(sorted(kitSegment('resultContLen')))
    expect(CONTINUOUS_LENGTHS.filter((length) => !ids.has(`result/continuous-${length}`))).toEqual([])
  })

  it('drives every About switch of the kit', () => {
    expect(sorted(kitAboutKeys), 'an About switch the harness does not drive').toEqual(sorted(['aboutUnreachable', 'aboutInsecure', ...ABOUT_LAYERS]))
    expect(ABOUT_LAYERS.filter((layer) => !ids.has(`about/layers-${layer}`))).toEqual([])
  })
})

describe('the History, Result detail, loaded-latency and Settings scenarios', () => {
  const ids = new Set(SCENARIOS.map((s) => s.id))

  it('has a History scenario for every variant of the kit', () => {
    expect(sorted(HISTORY_VARIANTS), 'HISTORY_VARIANTS in scenarios.ts is out of date').toEqual(sorted(kitHistoryVariants))
    expect(kitHistoryVariants.filter((variant) => !ids.has(`history/${variant}`))).toEqual([])
  })

  it('has a Result detail scenario for every state and demo of the kit', () => {
    expect(sorted(RESULT_STATES), 'RESULT_STATES in scenarios.ts is out of date').toEqual(sorted(kitResultStates))
    expect(kitResultStates.filter((state) => !ids.has(state === 'result' ? 'result' : `result/${state}`))).toEqual([])
  })

  it('has a Test screen and a Result detail scenario for every loaded-latency case of the kit', () => {
    expect(sorted(LOADED_CASES), 'LOADED_CASES in scenarios.ts is out of date').toEqual(sorted(kitLoadedCases))
    expect(kitLoadedCases.filter((loadedCase) => !ids.has(`loaded/${loadedCase}`) || !ids.has(`result/${loadedCase}`))).toEqual([])
  })

  it('has a Settings scenario for the defaults and every state of the kit', () => {
    expect(kitSettingsStates.filter((state) => !(SETTINGS_STATES as readonly string[]).includes(state))).toEqual([])
    expect(SETTINGS_STATES.filter((state) => !ids.has(state === 'defaults' ? 'settings' : `settings/${state}`))).toEqual([])
  })
})

describe('Test screen states', () => {
  const scenarioStates = SCENARIOS.filter((s) => s.id.startsWith('test/')).map((s) => s.id.slice('test/'.length))

  it('has a scenario for every state of the kit', () => {
    expect(sorted(TEST_STATES), 'TEST_STATES in scenarios.ts is out of date').toEqual(sorted(kitStates))
    expect(sorted(scenarioStates)).toEqual(sorted(kitStates))
  })

  it('names no state the kit dropped', () => {
    const kit = new Set(kitStates)
    expect(scenarioStates.filter((state) => !kit.has(state))).toEqual([])
  })
})

describe('the Vue driver', () => {
  it('knows which demo states start a run', () => {
    const flags = captures(source('../src/demo/scenarios.ts'), /^ {2}'?([a-z-]+)'?: \{ link: '[a-z0-9-]+', start: (true|false)\b/gm, 'the start flags of DEMO_SCENARIOS')
    expect(sorted(flags.map(([state]) => state ?? '')), 'a demo state has no start flag this test can read').toEqual(sorted([...TEST_STATES, ...LOADED_CASES, VUE_RESULT_RUN]))
    expect(sorted(VUE_STARTING_STATES)).toEqual(sorted(flags.filter(([, start]) => start === 'true').map(([state]) => state ?? '')))
  })

  it('knows which demo states hold their run', () => {
    const held = captures(source('../src/demo/scenarios.ts'), /^ {2}'?([a-z-]+)'?: \{[^\n]*\bhold: /gm, 'the holds of DEMO_SCENARIOS').map(([state]) => state ?? '')
    expect(sorted(VUE_HELD_STATES)).toEqual(sorted(held))
    expect([...VUE_HELD_STATES].filter((state) => !VUE_STARTING_STATES.has(state))).toEqual([])
  })
})
