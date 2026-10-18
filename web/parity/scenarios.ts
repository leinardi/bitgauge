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

// Every scenario runs the same steps on the design kit's prototype and on the Vue demo, then the two
// rendered pages are compared. Steps name states and screens, never selectors: how each side reaches
// them lives in drivers.ts, so a markup change on one side is one driver edit.

import type { LookRegion, Region } from './compare/content.ts'

// The Test screen states v0.1 and v0.2 have: the kit's TEST_STATES (ui_kits/app/App.jsx) without
// the continuous ones, which are v0.3. coverage.test.ts holds this list to the kit's.
export const V01_TEST_STATES = [
  'idle',
  'countdown',
  'connecting',
  'latency',
  'download',
  'upload',
  'complete',
  'upload-interrupted',
  'error',
  'error-early',
  'cancelled',
  'cancelled-late',
  'cancelled-latency',
  'cancelled-download',
  'cancelled-slow',
  'cancelled-slow-up',
  'slow',
  'slowdone',
  'offline',
  'basepath',
  'ws-fallback',
  'insufficient',
  'param-ignored',
] as const
export type TestState = (typeof V01_TEST_STATES)[number]

/**
 * The kit panel's v0.2 loaded-latency cases (App.jsx): its "WebSocket closes after idle latency"
 * switch and each reason of LL_GAPS for the upload's loaded latency, shown on a complete run. The
 * Vue demo has a scenario of the same name for each (src/demo/scenarios.ts). coverage.test.ts holds
 * this list to the kit's.
 */
export const LOADED_CASES = ['ws-close', 'll-no-steady-window', 'll-insufficient-samples', 'll-reservation-broken', 'll-no-probe-path'] as const
export type LoadedCase = (typeof LOADED_CASES)[number]

/** The screens both sides have, by the label of their navigation item. */
export type Screen = 'Test' | 'History' | 'Settings' | 'About'

/** The kit's History variants (App.jsx HISTORY_VARIANTS), which coverage.test.ts holds this list to. */
export const HISTORY_VARIANTS = [
  'populated',
  'single',
  'select3',
  'deleted',
  'compare',
  'confirm',
  'export',
  'daterange',
  'loading',
  'nomatch',
  'empty',
  'unavailable',
  'importing',
  'importresult',
  'importerror',
  'safari',
] as const
export type HistoryVariant = (typeof HISTORY_VARIANTS)[number]

/**
 * The Result detail's states: the kit panel's Result detail State choices and its Demo choices
 * other than none (App.jsx), which coverage.test.ts holds this list to.
 */
export const RESULT_STATES = ['result', 'not-found', 'history-unavailable', 'deleted', 'clipboard-denied'] as const
export type ResultState = (typeof RESULT_STATES)[number] | LoadedCase

/**
 * The Settings screen's states, each reached through the screen's own controls from the defaults:
 * Advanced open, a preset chosen, a duration out of range, and Reset all asking first (the
 * advanced, invalid and confirmReset props of Settings.jsx, which coverage.test.ts holds this list
 * to, and the changed list the last one needs).
 */
export const SETTINGS_STATES = ['defaults', 'advanced', 'changed', 'invalid', 'confirm-reset'] as const
export type SettingsState = (typeof SETTINGS_STATES)[number]

export type Step =
  | { forceState: TestState }
  | { loadedCase: LoadedCase }
  | { serverUnreachable: true }
  | { goto: Screen }
  | { openDemo: true }
  | { history: HistoryVariant }
  | { result: ResultState }
  | { settings: SettingsState }
  | { openShare: true }

export interface Scenario {
  id: string
  steps: Step[]
  // The regions compared: the whole page, header and tab bar included, since the navigation is part
  // of every screen and every state can change the header's server status. The demo panel is compared only by the
  // demo scenarios, so a difference of the panel's is one finding and not one per page.
  regions: LookRegion[]
  // Leaves the style layer out. For a scenario whose computed styles are not stable from run to run,
  // so it is excluded rather than left to flap; say why where it is set.
  style?: false
  // Leaves the layout layer out, on the same terms.
  layout?: false
}

const ALL: Region[] = ['header', 'main', 'notices', 'dialogs']

const testStates: Scenario[] = V01_TEST_STATES.map((state) => ({
  id: `test/${state}`,
  steps: [{ forceState: state }],
  regions: ALL,
}))

// The Test screen and the Result detail of a run in each of the kit's loaded-latency cases. The
// Test screen's are loaded/<case>, not test/<case>: the decided ledger clusters that name test/*
// were closed on the kit's Test screen states alone.
const loaded: Scenario[] = LOADED_CASES.flatMap((loadedCase) => [
  { id: `loaded/${loadedCase}`, steps: [{ loadedCase }], regions: ALL },
  { id: `result/${loadedCase}`, steps: [{ result: loadedCase }], regions: ALL },
])

// The share dialog the Test screen's save bar opens on a complete result.
const share: Scenario[] = [{ id: 'share/complete', steps: [{ forceState: 'complete' }, { openShare: true }], regions: ALL }]

// The Settings screen in each state its controls reach. The prototype's navigation has Settings only
// in its v0.2 scope.
const settings: Scenario[] = SETTINGS_STATES.map((state) => ({
  id: state === 'defaults' ? 'settings' : `settings/${state}`,
  steps: [{ settings: state }],
  regions: ALL,
}))

// The History screen in each of the kit's variants. Like Settings, History is in the prototype's
// v0.2 scope.
const history: Scenario[] = HISTORY_VARIANTS.map((variant) => ({
  id: `history/${variant}`,
  steps: [{ history: variant }],
  regions: ALL,
}))

// The Result detail in each of the kit's states, the first the newest populated result opened from
// the History list.
const result: Scenario[] = RESULT_STATES.map((state) => ({
  id: state === 'result' ? 'result' : `result/${state}`,
  steps: [{ result: state }],
  regions: ALL,
}))

const about: Scenario[] = [
  { id: 'about', steps: [{ goto: 'About' }], regions: ALL },
  { id: 'about/unreachable', steps: [{ serverUnreachable: true }, { goto: 'About' }], regions: ALL },
]

// The demo panel, collapsed on the idle page and open: only how it looks, since the content layer
// does not read it (content.ts LookRegion).
const demo: Scenario[] = [
  { id: 'demo/closed', steps: [], regions: ['demo'] },
  { id: 'demo/open', steps: [{ openDemo: true }], regions: ['demo'] },
]

// The prototype's scope the harness drives (drivers.ts prepare): v0.2, the screens and features the
// app has.
export const KIT_SCOPE = 'v0.2'

/** Every scenario a run compares, which coverage.test.ts holds each screen and state to. */
export const SCENARIOS: readonly Scenario[] = [...testStates, ...loaded, ...share, ...history, ...result, ...settings, ...about, ...demo]
