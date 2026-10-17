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

import { readFile } from 'node:fs/promises'

import type { BrowserContext, Page } from '@playwright/test'

import { type HistoryVariant, KIT_SCOPE, LOADED_CASES, type LoadedCase, type ResultState, type Screen, type SettingsState, type TestState } from './scenarios.ts'
import { waitForSettled } from './settle.ts'
import { PROTO_ORIGIN, VUE_ORIGIN, type SideDriver } from './side.ts'

export interface Driver extends SideDriver {
  // Shows a Test screen state through the side's demo panel, held there.
  forceState: (page: Page, state: TestState) => Promise<void>
  // Shows the Test screen of a complete run in one of the kit's loaded-latency cases: the prototype
  // through its panel's switch and select, the Vue demo through its scenario of the same name.
  forceLoadedCase: (page: Page, loadedCase: LoadedCase) => Promise<void>
  // Makes the server unreachable through the side's demo panel.
  serverUnreachable: (page: Page) => Promise<void>
  // Opens the side's demo panel, left open for the demo scenarios to compare.
  openDemo: (page: Page) => Promise<void>
  // Shows the History screen in one of the kit's variants: the prototype forces it through its demo
  // panel, the Vue demo seeds its history through its own and then uses the screen as a person would.
  showHistory: (page: Page, variant: HistoryVariant) => Promise<void>
  // Shows the Result detail in one of the kit's states, the same way.
  showResult: (page: Page, state: ResultState) => Promise<void>
}

// Dialogs and menus, wherever a side puts them: the Vue demo portals them to the body, and the
// prototype draws a popover or a menu in place, inside the main content.
const OVERLAYS = '[role=dialog], [role=alertdialog], [role=menu]'

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

// The prototype panel's choice for each loaded-latency case (App.jsx wsClose and llGap).
function kitLoadedChoice(loadedCase: LoadedCase): Record<string, unknown> {
  return loadedCase === 'ws-close' ? { wsClose: true } : { llGap: loadedCase.slice('ll-'.length) }
}

function isLoadedCase(state: ResultState): state is LoadedCase {
  return (LOADED_CASES as readonly string[]).includes(state)
}

// The Test screen states whose kit page shows the last result (TestScreen.jsx lastLine): those
// that sit idle.
const KIT_LAST_RESULT_STATES: readonly TestState[] = ['idle', 'param-ignored']

// The kit's instant: when the run of its Result detail starts (ResultDetail.jsx), in local time.
const KIT_INSTANT = new Date(2026, 9, 8, 14, 2, 11)

// The label and note of the kit's Result detail (ResultDetail.jsx).
const KIT_RESULT = { label: 'Home Wi-Fi', note: 'Office desk, 5 GHz. Router is in the hallway, one wall between.' }

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
  // Before the first load only, so a later choice survives a reload: the scope of KIT_SCOPE, v0.2,
  // the screens and features the app has (History, Result detail, Settings, share, loaded latency;
  // the panel's Scope select, which also defaults to v0.2), Chrome as the browser, since the harness
  // drives Chromium and the panel defaults to Firefox,
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
  forceLoadedCase: (page, loadedCase) => storeAndReload(page, KIT_DEMO_KEY, { testState: 'complete', ...kitLoadedChoice(loadedCase) }),
  serverUnreachable: (page) => storeAndReload(page, KIT_DEMO_KEY, { aboutUnreachable: true }),
  // A forced variant wins over the one the screen's own buttons would pick (Prototype.jsx route()).
  showHistory: async (page, variant) => {
    await storeAndReload(page, KIT_DEMO_KEY, { historyVariant: variant })
    await goto(page, 'History')
  },
  // The panel's Result detail State and Demo choices; any link in the History list's main area opens
  // the Result detail (Prototype.jsx route()), which shows the forced state.
  showResult: async (page, state) => {
    const resultState = state === 'not-found' || state === 'history-unavailable' ? state : 'result'
    const resultDemo = state === 'deleted' || state === 'clipboard-denied' ? state : 'none'
    await storeAndReload(page, KIT_DEMO_KEY, { resultState, resultDemo, ...(isLoadedCase(state) ? kitLoadedChoice(state) : {}) })
    await goto(page, 'History')
    await page.locator('main a').first().click()
    await page.getByRole('navigation', { name: 'Breadcrumb' }).or(page.getByRole('heading', { name: /^Result (not found|deleted)$/ })).first().waitFor()
  },
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

// The demo scenario of the run the kit's Result detail shows (ResultDetail.jsx): a LAN run whose
// upload lost one request and carried on.
export const VUE_RESULT_RUN = 'upload-gap'

// A demo scenario the Vue driver forces: a Test screen state, a loaded-latency case, or the Result
// detail's run.
type VueRun = TestState | LoadedCase | typeof VUE_RESULT_RUN

// The Vue demo's states that start a run (src/demo/scenarios.ts, where coverage.test.ts holds this
// list to the start flags). Until the demo panel has pressed Start, such a page sits quiet while it
// loads, and a page read then would show Idle with the run only about to begin.
export const VUE_STARTING_STATES: ReadonlySet<VueRun> = new Set<VueRun>([
  ...LOADED_CASES,
  VUE_RESULT_RUN,
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
export const VUE_HELD_STATES: ReadonlySet<VueRun> = new Set<VueRun>(['connecting', 'latency', 'download', 'ws-fallback', 'upload', 'slow', 'insufficient'])

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

// A forced state, or a loaded-latency case, plays the scenario of that name and holds it at the
// kit's instant. At the panel's default speed, 1x: a faster demo moves its simulated link in fewer,
// coarser timer ticks, and the noisier throughput samples then mark a LAN result as unstable in some
// runs and not in others.
async function forceVue(page: Page, state: VueRun): Promise<void> {
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
}

export const vue: Driver = {
  side: 'vue',
  startUrl: `${VUE_ORIGIN}/`,
  pageHost: new URL(VUE_ORIGIN).host,
  overlaySelector: OVERLAYS,
  // vue-sonner's toaster, which holds every toast.
  toastSelector: '[data-sonner-toaster]',
  styleRegions: STYLE_REGIONS,
  // The page's clock stands at the kit's instant, which the demo Worker dates its runs from too
  // (src/demo/session.ts), so the History screen's date ranges count from the kit's day whatever
  // the day of the run.
  prepare: (context: BrowserContext) => context.clock.setFixedTime(KIT_INSTANT),
  forceLoadedCase: (page, loadedCase) => forceVue(page, loadedCase),
  // The kit's idle Test screen shows the last result its history holds (TestScreen.jsx); the demo's
  // history is empty until the panel fills it.
  forceState: async (page, state) => {
    if (KIT_LAST_RESULT_STATES.includes(state)) await seedHistory(page, 'populated')
    await forceVue(page, state)
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
  showHistory: async (page, variant) => {
    // Safari is recognized by Apple's navigator.vendor (lib/safari.ts), from the next load on.
    if (variant === 'safari') {
      await page.addInitScript(() => Object.defineProperty(navigator, 'vendor', { configurable: true, get: () => 'Apple Computer, Inc.' }))
    }
    await seedHistory(page, VUE_HISTORY_SEEDS[variant] ?? 'populated')
    await goto(page, 'History')
    await reachHistory(page, variant)
    await parkPointer(page)
  },
  showResult: async (page, state) => {
    if (state === 'not-found') {
      // A result this browser does not hold, as a stale link opens one. The demo build's assets are
      // relative to the page, so a page loaded at that path would ask for them under /result/; the
      // router is sent there instead, as the browser's Back and Forward send it.
      await page.evaluate(() => {
        history.pushState(null, '', '/result/d0000000-0000-4000-8000-0000000000ff')
        dispatchEvent(new PopStateEvent('popstate'))
      })
      await page.getByTestId('result-missing').waitFor()
      return
    }
    // The Result detail of this session's run, from its Details: the kit's run (VUE_RESULT_RUN), or
    // its run in a loaded-latency case. It carries the kit's label from the Result label setting,
    // which a run held in memory (stopped, or with history unavailable) has no save bar to set; it is
    // saved when complete, with the kit's note.
    await goto(page, 'Settings')
    const label = page.getByRole('textbox', { name: 'Result label', exact: true })
    await label.fill(KIT_RESULT.label)
    await label.blur()
    await goto(page, 'Test')
    if (state === 'history-unavailable') await seedHistory(page, 'unavailable')
    await forceVue(page, isLoadedCase(state) ? state : VUE_RESULT_RUN)
    await page.getByTestId('result-details').filter({ visible: true }).click()
    await page.getByRole('navigation', { name: 'Breadcrumb' }).waitFor()
    const note = page.getByTestId('note-field').filter({ visible: true })
    if ((await note.getAttribute('readonly')) === null) {
      await note.fill(KIT_RESULT.note)
      await note.blur()
    }
    if (state === 'deleted') {
      await page.getByTestId('delete-result').filter({ visible: true }).click()
      await page.getByTestId('result-missing').waitFor()
    } else if (state === 'clipboard-denied') {
      // A browser that refuses the page the clipboard.
      await page.evaluate(() =>
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.reject(new DOMException('denied', 'NotAllowedError')) } }),
      )
      await page.getByTestId('copy-summary').filter({ visible: true }).click()
      await page.getByTestId('copy-denied').waitFor()
    }
    // The note and the copy button scroll the page; the kit's screen shows it from its top.
    await page.evaluate(() => window.scrollTo(0, 0))
    await parkPointer(page)
  },
}

// The demo's history each kit variant starts from (src/demo/history.ts): the kit's eight results,
// none, unavailable, or never opened; a variant not listed starts from the eight and reaches its
// state through the screen (reachHistory below).
const VUE_HISTORY_SEEDS: Partial<Record<HistoryVariant, 'populated' | 'empty' | 'unavailable' | 'loading'>> = {
  empty: 'empty',
  unavailable: 'unavailable',
  loading: 'loading',
}

// Replaces the page's history with a demo variant from the next load on.
async function seedHistory(page: Page, seed: 'populated' | 'empty' | 'unavailable' | 'loading'): Promise<void> {
  await openPanel(page)
  await applyAndWait(page, () => page.getByTestId('demo-history').selectOption(seed))
  await closePanel(page)
}

// The rows the kit's variants select (History.jsx selIdx), newest first, as both lists are sorted:
// three in select3, none once deleted, and otherwise the pair it compares.
const KIT_SELECTED = { select3: [1, 3, 5], pair: [3, 5] }

// The kit's variants that show results (History.jsx hasData): each filtered to the VPN context over
// the last 30 days, or the last 7 in nomatch, as the kit's are.
const KIT_EMPTY_VARIANTS: readonly HistoryVariant[] = ['empty', 'unavailable', 'loading']

// The file the kit's import variants name (History.jsx), and its import result: 12 added, 3 skipped
// as duplicates, and 1 rejected for its newer schema version, of 16 records.
const KIT_IMPORT_FILE = 'bitgauge-2026-10-01'
const KIT_IMPORT = { added: 12, duplicates: 3, newerSchema: 3 }
const DAY_MS = 86_400_000

/** The History screen's controls the kit's variants show, used as a person would. */
async function reachHistory(page: Page, variant: HistoryVariant): Promise<void> {
  if (KIT_EMPTY_VARIANTS.includes(variant)) return
  await driveHistory(page, variant)
  // The clicks scroll the rows they select into view; the kit's screens show the page from its top.
  await page.evaluate(() => window.scrollTo(0, 0))
}

async function driveHistory(page: Page, variant: HistoryVariant): Promise<void> {
  const select = async (rows: readonly number[]) => {
    const boxes = page.getByRole('checkbox', { name: /^Select / }).filter({ visible: true })
    for (const row of rows) await boxes.nth(row).click()
  }
  const button = (name: string) => page.getByRole('button', { name, exact: true }).filter({ visible: true }).first()
  const importFile = (name: string, buffer: Buffer) => page.getByTestId('import-input').setInputFiles({ name, mimeType: name.endsWith('.csv') ? 'text/csv' : 'application/json', buffer })
  await filterHistory(page, variant === 'nomatch' ? 'Last 7 days' : 'Last 30 days')
  if (variant === 'nomatch') {
    await page.getByTestId('history-search').filter({ visible: true }).fill('airport')
    await page.getByTestId('history-no-match').waitFor()
    return
  }
  await select(variant === 'select3' ? KIT_SELECTED.select3 : KIT_SELECTED.pair)
  switch (variant) {
    case 'compare':
      await button('Compare').click()
      await page.getByRole('dialog').waitFor()
      return
    case 'deleted':
      await button('Delete selected').click()
      await page.locator('[data-sonner-toast]').first().waitFor()
      return
    case 'confirm':
      await button('Clear all').click()
      await page.getByRole('alertdialog').waitFor()
      return
    case 'export':
      await page.getByTestId('export-menu').filter({ visible: true }).click()
      await page.getByRole('menu').waitFor()
      return
    case 'daterange':
      await page.getByTestId('date-range').filter({ visible: true }).click()
      await page.getByTestId('range-apply').waitFor()
      return
    case 'importing':
      // A file that takes as long as the harness looks at it to read.
      await page.evaluate(() => {
        Blob.prototype.text = () => new Promise<string>(() => undefined)
      })
      await importFile(`${KIT_IMPORT_FILE}.json`, Buffer.from('{}'))
      await page.getByTestId('import-busy').waitFor()
      return
    case 'importresult': {
      await page.getByTestId('export-menu').filter({ visible: true }).click()
      const [file] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-json-all').click()])
      await importFile(`${KIT_IMPORT_FILE}.json`, kitImport(await readFile(await file.path(), 'utf8')))
      await page.getByTestId('import-done').waitFor()
      return
    }
    case 'importerror':
      // A CSV export, which import refuses.
      await importFile(`${KIT_IMPORT_FILE}.csv`, Buffer.from('date,label\n'))
      await page.getByTestId('import-failed').waitFor()
      return
    default:
      return
  }
}

// The kit's filter: the VPN context chip, then a preset date range.
async function filterHistory(page: Page, range: 'Last 30 days' | 'Last 7 days'): Promise<void> {
  await page.getByRole('group', { name: 'Filter by context label', exact: true }).filter({ visible: true }).getByRole('button', { name: /^VPN \d/ }).click()
  await page.waitForURL(/contexts=VPN/)
  await page.getByTestId('date-range').filter({ visible: true }).click()
  await page.getByRole('radio', { name: new RegExp(`^${range}`) }).click()
  await page.waitForURL(range === 'Last 7 days' ? /range=7d/ : /range=30d/)
}

// The kit's import file from the page's own export: its first results again, as duplicates; new
// results older than the kit's 30 days, so the filtered list still shows the kit's eight; and one
// record of a later schema version.
function kitImport(exported: string): Buffer {
  const file = JSON.parse(exported) as { results: { id: string; startedAt: string; schemaVersion: number }[] }
  const { results } = file
  const added = Array.from({ length: KIT_IMPORT.added }, (_, n) => {
    const result = results[n % results.length] ?? { id: '', startedAt: '', schemaVersion: 0 }
    return { ...result, id: `c0000000-0000-4000-8000-${String(n).padStart(12, '0')}`, startedAt: new Date(Date.parse(result.startedAt) - 40 * DAY_MS).toISOString() }
  })
  const newer = { ...results[0], id: 'c0000000-0000-4000-8000-0000000000ff', schemaVersion: KIT_IMPORT.newerSchema }
  return Buffer.from(JSON.stringify({ ...file, results: [...added, ...results.slice(0, KIT_IMPORT.duplicates), newer] }))
}

/** Puts the Settings screen in a state through its own controls, the same on both sides. */
export async function settingsState(page: Page, state: SettingsState): Promise<void> {
  await goto(page, 'Settings')
  if (state === 'advanced') {
    await page.getByRole('button', { name: /^Advanced/ }).click()
  }
  if (state === 'changed' || state === 'confirm-reset') {
    await page.getByRole('radio', { name: /^Quick/ }).click()
  }
  if (state === 'confirm-reset') {
    await page.getByRole('button', { name: 'Reset all to defaults', exact: true }).filter({ visible: true }).click()
    await page.getByRole('alertdialog').or(page.getByRole('dialog')).first().waitFor()
  }
  if (state === 'invalid') {
    // A minimum above the Standard preset's 20 s maximum.
    const field = page.getByRole('textbox', { name: 'Download minimum seconds', exact: true })
    await field.fill('30')
    await field.press('Enter')
  }
  await parkPointer(page)
}

/** Opens the share dialog from the Test screen's save bar, the same on both sides. */
export async function openShare(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Share', exact: true }).filter({ visible: true }).first().click()
  await page.getByRole('dialog').waitFor()
  await parkPointer(page)
}

// By the navigation item's name, in the one Primary navigation the window shows (the top bar's on a
// desktop window, the tab bar's on a narrow one); the item marked current is the proof it landed.
export async function goto(page: Page, screen: Screen): Promise<void> {
  const nav = page.getByRole('navigation', { name: 'Primary', exact: true })
  await nav.getByRole('link', { name: screen, exact: true }).click()
  await nav.locator('[aria-current="page"]').filter({ hasText: screen }).first().waitFor()
}
