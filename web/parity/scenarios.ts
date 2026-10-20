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

// The Test screen states: the kit's TEST_STATES (ui_kits/app/App.jsx), the four Continuous ones
// (continuous, cont-upload, cont-warmup and cont-done) included. coverage.test.ts holds this list to
// the kit's.
export const TEST_STATES = [
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
  'continuous',
  'cont-upload',
  'cont-warmup',
  'cont-done',
  'offline',
  'basepath',
  'ws-fallback',
  'insufficient',
  'param-ignored',
] as const
export type TestState = (typeof TEST_STATES)[number]

/**
 * The kit panel's Responsiveness choices but its default, ok (App.jsx RESP_OPTS), each a case of
 * path B on the Test screen's complete run and on the Result detail. coverage.test.ts holds this
 * list to the kit's.
 */
export const RESPONSIVENESS_CASES = ['uncertain', 'needs-h2', 'not-reported', 'few-samples'] as const
export type Responsiveness = 'ok' | (typeof RESPONSIVENESS_CASES)[number]

/** The kit panel's Continuous run lengths but its default, none (App.jsx). */
export const RUN_LENGTH_CASES = ['2h'] as const
export type RunLength = 'none' | (typeof RUN_LENGTH_CASES)[number]

/** The kit panel's Compare B choices but its default, h1 (App.jsx). */
export const COMPARE_B_CASES = ['h2'] as const
export type CompareB = 'h1' | (typeof COMPARE_B_CASES)[number]

/** The kit panel's Continuous lengths of the Result detail (App.jsx resultContLen). */
export const CONTINUOUS_LENGTHS = ['2h', '9d'] as const
export type ContinuousLength = (typeof CONTINUOUS_LENGTHS)[number]

/** The kit panel's compatibility layers of the About screen (App.jsx). */
export const ABOUT_LAYERS = ['openspeedtest', 'librespeed', 'networkquality'] as const
export type AboutLayer = (typeof ABOUT_LAYERS)[number]

/**
 * The kit panel's loaded-latency cases (App.jsx): its "WebSocket closes after idle latency"
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
export const RESULT_STATES = ['result', 'not-found', 'history-unavailable', 'not-saved-partial', 'not-saved-missing', 'deleted', 'clipboard-denied'] as const
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
  // The panel's Responsiveness, for the Test screen's run or the Result detail's.
  | { resp: Responsiveness; on: 'test' | 'result' }
  | { runLength: RunLength }
  | { compareB: CompareB }
  // The Result detail of the panel's Continuous result of that length.
  | { resultKind: 'continuous'; contLen: ContinuousLength }
  // The About screen's compatibility layers, each on or off.
  | { about: Record<AboutLayer, boolean> }

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
  // The scenario's own test timeout, for one whose run takes longer than the configuration's.
  timeoutMs?: number
}

const ALL: Region[] = ['header', 'main', 'notices', 'dialogs']

// The Continuous runs the Vue demo fast-forwards to the kit's 42:18 (src/demo/scenarios.ts).
const LONG_RUNS: readonly TestState[] = ['continuous', 'cont-upload', 'cont-done']
const LONG_RUN_TIMEOUT_MS = 300_000

const testStates: Scenario[] = TEST_STATES.map((state) => ({
  id: `test/${state}`,
  steps: [{ forceState: state }],
  regions: ALL,
  ...(LONG_RUNS.includes(state) ? { timeoutMs: LONG_RUN_TIMEOUT_MS } : {}),
}))

// The Test screen and the Result detail of a run in each of the kit's loaded-latency cases. The
// Test screen's are loaded/<case>, not test/<case>: the decided ledger clusters that name test/*
// were closed on the kit's Test screen states alone.
const loaded: Scenario[] = LOADED_CASES.flatMap((loadedCase) => [
  { id: `loaded/${loadedCase}`, steps: [{ loadedCase }], regions: ALL },
  { id: `result/${loadedCase}`, steps: [{ result: loadedCase }], regions: ALL },
])

// The Test screen's complete run and the Result detail in each case of path B, and a Continuous
// download with the 2 h run length. They sit outside test/, which holds the kit's Test screen states
// alone.
const responsiveness: Scenario[] = RESPONSIVENESS_CASES.flatMap((resp) => [
  { id: `responsiveness/${resp}`, steps: [{ resp, on: 'test' }, { forceState: 'complete' }], regions: ALL },
  { id: `result/resp-${resp}`, steps: [{ resp, on: 'result' }, { result: 'result' }], regions: ALL },
])
const runLength: Scenario[] = RUN_LENGTH_CASES.map((length) => ({
  id: `continuous/run-length-${length}`,
  steps: [{ runLength: length }, { forceState: 'continuous' }],
  regions: ALL,
  timeoutMs: LONG_RUN_TIMEOUT_MS,
}))

// The share dialog the Test screen's save bar opens on a complete result.
const share: Scenario[] = [{ id: 'share/complete', steps: [{ forceState: 'complete' }, { openShare: true }], regions: ALL }]

// The Settings screen in each state its controls reach. The prototype's navigation has Settings in
// the scope KIT_NEWEST_SCOPE pins, not in every scope.
const settings: Scenario[] = SETTINGS_STATES.map((state) => ({
  id: state === 'defaults' ? 'settings' : `settings/${state}`,
  steps: [{ settings: state }],
  regions: ALL,
}))

// The History screen in each of the kit's variants. Like Settings, History is in the scope
// KIT_NEWEST_SCOPE pins, not in every scope.
const history: Scenario[] = [
  ...HISTORY_VARIANTS.map((variant) => ({ id: `history/${variant}`, steps: [{ history: variant }], regions: ALL })),
  // Compare B over HTTP/2, path B measured.
  ...COMPARE_B_CASES.map((compareB) => ({ id: `history/compare-${compareB}`, steps: [{ compareB }, { history: 'compare' as const }], regions: ALL })),
]

// The Result detail in each of the kit's states, the first the newest populated result opened from
// the History list.
const result: Scenario[] = [
  ...RESULT_STATES.map((state) => ({ id: state === 'result' ? 'result' : `result/${state}`, steps: [{ result: state }], regions: ALL })),
  ...CONTINUOUS_LENGTHS.map((contLen) => ({ id: `result/continuous-${contLen}`, steps: [{ resultKind: 'continuous' as const, contLen }], regions: ALL })),
]

// The About screen with no layer on, each one alone, and all three, the page served over http on
// both sides (drivers.ts).
const layers = (on: readonly AboutLayer[]): Record<AboutLayer, boolean> =>
  Object.fromEntries(ABOUT_LAYERS.map((layer) => [layer, on.includes(layer)])) as Record<AboutLayer, boolean>
const aboutLayers: Scenario[] = [
  { id: 'about/layers-none', steps: [{ about: layers([]) }, { goto: 'About' }], regions: ALL },
  ...ABOUT_LAYERS.map((layer) => ({ id: `about/layers-${layer}`, steps: [{ about: layers([layer]) }, { goto: 'About' as const }], regions: ALL })),
  { id: 'about/layers-all', steps: [{ about: layers(ABOUT_LAYERS) }, { goto: 'About' }], regions: ALL },
]

const about: Scenario[] = [
  { id: 'about', steps: [{ goto: 'About' }], regions: ALL },
  { id: 'about/unreachable', steps: [{ serverUnreachable: true }, { goto: 'About' }], regions: ALL },
  ...aboutLayers,
]

// The demo panel, collapsed on the idle page and open: only how it looks, since the content layer
// does not read it (content.ts LookRegion).
const demo: Scenario[] = [
  { id: 'demo/closed', steps: [], regions: ['demo'] },
  { id: 'demo/open', steps: [{ openDemo: true }], regions: ['demo'] },
]

// The prototype's scope the harness drives (drivers.ts prepare): the newest entry of the kit's
// SCOPES (App.jsx:22), which has the screens and features the app has, pinned because the kit
// defaults to an older one. coverage.test.ts holds it to the last entry of SCOPES.
export const KIT_NEWEST_SCOPE = 'v0.3'

/** Every scenario a run compares, which coverage.test.ts holds each screen and state to. */
export const SCENARIOS: readonly Scenario[] = [...testStates, ...loaded, ...responsiveness, ...runLength, ...share, ...history, ...result, ...settings, ...about, ...demo]
