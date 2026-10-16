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

// The Test screen states v0.1 has: the kit's TEST_STATES (ui_kits/app/App.jsx) without the
// continuous ones, which are v0.2. coverage.test.ts holds this list to the kit's.
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

/** The screens both sides have in v0.1, by the label of their navigation item. */
export type Screen = 'Test' | 'About'

export type Step = { forceState: TestState } | { serverUnreachable: true } | { goto: Screen } | { openDemo: true }

export interface Scenario {
  id: string
  steps: Step[]
  // The regions compared: the whole page, header and tab bar included, since v0.1 has two screens
  // and every state can change the header's server status. The demo panel is compared only by the
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

export const SCENARIOS: readonly Scenario[] = [...testStates, ...about, ...demo]
