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

// How each side is driven. Everything that legitimately differs between the design kit's prototype
// and the Vue demo in how a state or a screen is reached lives here and only here; scenarios.ts
// names states and screens, never selectors.

import type { BrowserContext, Page } from '@playwright/test'

import { type HistoryVariant, KIT_SCOPE, type Screen, type TestState } from './scenarios.ts'
import { waitForSettled } from './settle.ts'
import { PROTO_ORIGIN, VUE_ORIGIN, type SideDriver } from './side.ts'

export interface Driver extends SideDriver {
  // Shows a Test screen state through the side's demo panel, held there.
  forceState: (page: Page, state: TestState) => Promise<void>
  // Makes the server unreachable through the side's demo panel.
  serverUnreachable: (page: Page) => Promise<void>
  // Opens the side's demo panel, left open for the demo scenarios to compare.
  openDemo: (page: Page) => Promise<void>
  // Puts a History variant in place through the side's demo panel.
  historyVariant: (page: Page, variant: HistoryVariant) => Promise<void>
}

const OVERLAYS = '[role=dialog], [role=alertdialog]'

// The demo panel first, so nothing in it is filed as a notice; then dialogs, and main before the
// header, so an element inside an overlay or the main content (the About page has a header of its
// own) is filed there. Both sides label the panel's aside the same (App.jsx, DemoPanel.vue).
const STYLE_REGIONS: SideDriver['styleRegions'] = [
  ['demo', 'aside[aria-label="Demo state"]'],
  ['dialogs', OVERLAYS],
  ['main', 'main'],
  ['header', 'header, nav'],
  ['notices', '[role=alert], [role=status]'],
]

// The prototype's Demo panel state (App.jsx DEMO_KEY) and its product preferences (Prototype.jsx
// PREFS_KEY), both in localStorage and read once when the page loads.
const KIT_DEMO_KEY = 'bitgauge-kit-demo'
const KIT_PREFS_KEY = 'bitgauge-kit-prefs'

// Runs the page again with a new demo choice, the way the prototype applies one: it is read once,
// on load.
async function storeAndReload(page: Page, key: string, patch: Record<string, unknown>): Promise<void> {
  await page.evaluate(
    ({ key, patch }) => {
      const stored = JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, unknown>
      localStorage.setItem(key, JSON.stringify({ ...stored, ...patch }))
    },
    { key, patch },
  )
  await page.reload()
}

export const proto: Driver = {
  side: 'proto',
  startUrl: `${PROTO_ORIGIN}/ui_kits/app/index.html`,
  // The kit's mocked server (ui_kits/app/fixtures.js).
  pageHost: 'speed.home.lan',
  overlaySelector: OVERLAYS,
  toastSelector: '.toast',
  styleRegions: STYLE_REGIONS,
  // Before the first load only, so a later choice survives a reload: the scope of KIT_SCOPE, v0.1
  // for now (no History, Settings, share or loaded latency; the panel's Scope select, which defaults
  // to v0.2),
  // Chrome as the browser, since the harness drives Chromium and the panel defaults to Firefox,
  // and the theme on System, which is the product's default and the Vue demo's, where the prototype
  // starts on Dark. With System both sides follow the project's emulated color scheme.
  prepare: async (context: BrowserContext) => {
    await context.addInitScript(
      ({ demoKey, prefsKey, scope }) => {
        if (localStorage.getItem(demoKey) === null) localStorage.setItem(demoKey, JSON.stringify({ scope, browser: 'Chrome' }))
        if (localStorage.getItem(prefsKey) === null) localStorage.setItem(prefsKey, JSON.stringify({ theme: 'system' }))
      },
      { demoKey: KIT_DEMO_KEY, prefsKey: KIT_PREFS_KEY, scope: KIT_SCOPE },
    )
  },
  // A forced state wins over the run timeline (Prototype.jsx cur()), so it shows without a run.
  forceState: (page, state) => storeAndReload(page, KIT_DEMO_KEY, { testState: state }),
  serverUnreachable: (page) => storeAndReload(page, KIT_DEMO_KEY, { aboutUnreachable: true }),
  historyVariant: (page, variant) => storeAndReload(page, KIT_DEMO_KEY, { historyVariant: variant }),
  openDemo: async (page) => {
    await page.getByRole('button', { name: 'Expand demo panel', exact: true }).click()
    await parkPointer(page)
  },
}

// A click leaves the pointer over whatever the panel puts beneath it once open (Reset, on one side),
// so each side would capture a different hover; park it in the corner, as a person moving on would.
async function parkPointer(page: Page): Promise<void> {
  await page.mouse.move(0, 0)
}

// Applies a demo panel control that loads the page again (DemoPanel.vue apply()), and waits for the
// new page.
async function applyAndWait(page: Page, action: () => Promise<unknown>): Promise<void> {
  await Promise.all([page.waitForEvent('load'), action()])
}

// The Vue demo's states that start a run (src/demo/scenarios.ts, where coverage.test.ts holds this
// list to the start flags). Until the demo panel has pressed Start, such a page sits quiet while it
// loads, and a page read then would show Idle with the run only about to begin.
export const VUE_STARTING_STATES: ReadonlySet<TestState> = new Set<TestState>([
  'connecting',
  'latency',
  'download',
  'ws-fallback',
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
  'insufficient',
])

// The starting states whose scenario holds the run in its state (a hold in src/demo/scenarios.ts);
// every other starting state ends its run, by a scripted stop, a failure or completion.
export const VUE_HELD_STATES: ReadonlySet<TestState> = new Set<TestState>(['connecting', 'latency', 'download', 'ws-fallback', 'upload', 'slow', 'insufficient'])

// Mid-run, the longest pause between two changes to the page measured about 200 ms with 32 demo
// pages running at once; a held or finished run never changes it again.
const RUN_ARRIVED_QUIET_MS = 1500
// The demo's longest run at real speed, a complete Standard test on the LAN, takes about 28 s.
const RUN_END_TIMEOUT_MS = 60_000

async function openPanel(page: Page): Promise<void> {
  const toggle = page.getByTestId('demo-toggle')
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click()
  await page.getByTestId('demo-scenario').waitFor()
}

// Back to collapsed, as the prototype's panel is, so the screenshots show the same page.
async function closePanel(page: Page): Promise<void> {
  const toggle = page.getByTestId('demo-toggle')
  if ((await toggle.getAttribute('aria-expanded')) === 'true') await toggle.click()
  await page.getByTestId('demo-scenario').waitFor({ state: 'detached' })
  // The open panel's toggle sits over the header's theme button in the compact layout, so the
  // pointer is left hovering it once the panel closes.
  await parkPointer(page)
}

export const vue: Driver = {
  side: 'vue',
  startUrl: `${VUE_ORIGIN}/`,
  pageHost: new URL(VUE_ORIGIN).host,
  overlaySelector: OVERLAYS,
  // v0.1 shows no toast.
  toastSelector: null,
  styleRegions: STYLE_REGIONS,
  prepare: () => Promise.resolve(),
  // A forced state plays that state's scenario and holds it at the kit's instant. At the panel's
  // default speed, 1x: a faster demo moves its simulated link in fewer, coarser timer ticks, and the
  // noisier throughput samples then mark a LAN result as unstable in some runs and not in others.
  forceState: async (page, state) => {
    // The auto-start countdown runs in the page, not in the engine, so the demo's hold cannot stop
    // it. It pauses while the page is hidden (ui/flows.md section 2), so from the next load on the
    // page reads as hidden, and the countdown stays at its start, as the prototype's forced one does.
    // The kit's base path state is the page-path mismatch: the page opened under /speed/ while the
    // server is configured for /, which the page detects before any request (edge-cases.md section
    // 20). The demo build is configured for /, so opening it there is that state.
    if (state === 'basepath') {
      // The build's assets are relative to the page, so under /speed/ they are asked for at
      // /speed/assets/, which the preview server answers with index.html; they are served from where
      // the build put them, as the reverse proxy in front of such a deployment would.
      await page.route(`${VUE_ORIGIN}/speed/**`, (route) => {
        const url = new URL(route.request().url())
        if (url.pathname === '/speed/') return route.continue()
        url.pathname = url.pathname.slice('/speed'.length)
        return route.continue({ url: url.toString() })
      })
      await page.goto(`${VUE_ORIGIN}/speed/`)
      await waitForSettled(page, RUN_ARRIVED_QUIET_MS)
      return
    }
    if (state === 'countdown') {
      await page.addInitScript(() => Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }))
    }
    await openPanel(page)
    await applyAndWait(page, () => page.getByTestId('demo-force-state').selectOption(state))
    // The run has begun once Start has turned into Stop. A run that ends has arrived once Stop is
    // gone again: a page still showing it is a run the page never saw end, which is the harness's
    // error, not a difference. A held run changes the page every couple of hundred milliseconds until
    // it holds and then never again, so a page quiet for longer than a busy browser ever leaves a
    // running one is a page whose run has arrived.
    if (VUE_STARTING_STATES.has(state)) {
      const stop = page.getByRole('button', { name: 'Stop test', exact: true })
      await stop.waitFor()
      if (!VUE_HELD_STATES.has(state)) await stop.waitFor({ state: 'detached', timeout: RUN_END_TIMEOUT_MS })
      await waitForSettled(page, RUN_ARRIVED_QUIET_MS)
    }
    await closePanel(page)
  },
  // The offline scenario's server answers nothing, GET /info included.
  serverUnreachable: async (page) => {
    await openPanel(page)
    await applyAndWait(page, () => page.getByTestId('demo-scenario').selectOption('offline'))
    await closePanel(page)
  },
  openDemo: async (page) => {
    await openPanel(page)
    await parkPointer(page)
  },
  // The variant replaces the page's history with the demo's results, or makes it unavailable, from
  // the next load on.
  historyVariant: async (page, variant) => {
    await openPanel(page)
    await applyAndWait(page, () => page.getByTestId('demo-history').selectOption(variant))
    await closePanel(page)
  },
}

// By the navigation item's name, in the one Primary navigation the window shows (the top bar's on a
// desktop window, the tab bar's on a narrow one); the item marked current is the proof it landed.
export async function goto(page: Page, screen: Screen): Promise<void> {
  const nav = page.getByRole('navigation', { name: 'Primary', exact: true })
  await nav.getByRole('link', { name: screen, exact: true }).click()
  await nav.locator('[aria-current="page"]').filter({ hasText: screen }).first().waitFor()
}
