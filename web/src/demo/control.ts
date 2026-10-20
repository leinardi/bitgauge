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

import { scenarioInfo } from '@/demo/fixtures'
import { type ContinuousLength, continuousFixture } from '@/demo/continuousResults'
import { type DemoCompareB, type DemoHistory, demoHistoryResults } from '@/demo/history'
import type { DemoResponsiveness } from '@/demo/responsiveness'
import { DEMO_SCENARIOS, type DemoCommand, type DemoScenario } from '@/demo/scenarios'
import type { Result } from '@/engine/messages'
import type { Info } from '@/engine/types'

// The page's side of the demo (frontend.md section 9): the choice the demo panel restored when the
// page loaded, handed to every demo Worker the page starts and answered as the page's own
// GET /info, and the History variant the page's history starts from. Each waits for the panel, so
// none runs on a default the panel then replaces.

let choose: (command: DemoCommand) => void = () => undefined
const chosen = new Promise<DemoCommand>((resolve) => {
  choose = resolve
})

/** The panel's choice for this page load; a later call changes nothing, as a reload applies a new one. */
export function chooseScenario(command: DemoCommand): void {
  choose(command)
}

let pressStop: () => void = () => undefined
/** Whether a run has ended on the scenario's unreachable server: the page's GET /info fails from then on. */
let gone = false
/** The chosen scenario, once the panel has chosen it. */
let current: DemoCommand | null = null
void chosen.then((command) => {
  current = command
})

/** What presses the page's Stop when the demo's script stops the run. */
export function onScriptedStop(press: () => void): void {
  pressStop = press
}

/** Runs a page update at the next animation frame, or sooner while the page is hidden. */
export type FrameScheduler = (update: () => void) => void

/**
 * Hands a demo Worker the chosen scenario as soon as there is one, and presses Stop when its
 * script asks to; that message is the demo's own, so no engine listener sees it. A fast-forward's
 * other messages, a thousand a second, are replayed to the page's listeners once per `frame`, in
 * their order, so the page renders once per batch rather than once per message.
 */
export function attachWorker(worker: Pick<Worker, 'postMessage' | 'addEventListener' | 'dispatchEvent'>, frame?: FrameScheduler): void {
  const replayed = new WeakSet<Event>()
  let queued: unknown[] = []
  const replay = () => {
    const batch = queued
    queued = []
    for (const data of batch) {
      const event = new MessageEvent('message', { data })
      replayed.add(event)
      worker.dispatchEvent(event)
    }
  }
  worker.addEventListener('message', (event) => {
    if (replayed.has(event)) {
      return
    }
    const type = (event.data as { type?: unknown } | null)?.type
    if (type === 'demo-press-stop') {
      event.stopImmediatePropagation()
      pressStop()
      return
    }
    if (type === 'error' && current !== null) {
      const scenario: DemoScenario = DEMO_SCENARIOS[current.scenario]
      // The scenario's fault, or the panel's error kind for one that leaves it open, as the session plays it.
      gone ||= scenario.fault !== undefined && (scenario.fault.kind ?? current.errorKind) === 'unreachable'
    }
    const fastForward = current === null ? undefined : (DEMO_SCENARIOS[current.scenario] as DemoScenario).fastForward
    if (frame !== undefined && fastForward !== undefined) {
      event.stopImmediatePropagation()
      if (queued.length === 0) {
        frame(replay)
      }
      queued.push(event.data)
    }
  })
  void chosen.then((command) => worker.postMessage({ ...command, wallClockMs: Date.now() }))
}

/** GET /info as the chosen scenario's server answers it: unreachable for the offline one, and once a run ended on its unreachable fault. */
export async function demoInfo(): Promise<Info> {
  const command = await chosen
  const scenario: DemoScenario = DEMO_SCENARIOS[command.scenario]
  if (scenario.offline === true || gone) {
    throw new TypeError('the demo server is unreachable')
  }
  return scenarioInfo(command)
}

/**
 * The panel's History choice: the variant, the protocol the compared B result ran over, and the
 * Continuous result the Result detail opens, if any, with its path B case.
 */
export interface HistoryChoice {
  variant: DemoHistory
  compareB: DemoCompareB
  continuous?: { length: ContinuousLength; responsiveness: DemoResponsiveness }
}

let chooseVariant: (choice: HistoryChoice) => void = () => undefined
const variantChosen = new Promise<HistoryChoice>((resolve) => {
  chooseVariant = resolve
})

/** The panel's History choice for this page load; a later call changes nothing. */
export function chooseHistory(choice: HistoryChoice): void {
  chooseVariant(choice)
}

/** What the page's history starts from: the results to write, and whether they replace what it holds. */
export interface HistorySeed {
  results: Result[]
  replace: boolean
}

/**
 * What the page's history starts from: unavailable; the variant's results in place of what it
 * holds; or, for '', the browser's own history as it is. The Continuous result the Result detail
 * opens joins either. For 'loading' it never settles, so the history stays loading for the page load.
 */
export async function demoHistory(): Promise<'unavailable' | HistorySeed> {
  const { variant, compareB, continuous } = await variantChosen
  if (variant === 'loading') {
    return new Promise<never>(() => undefined)
  }
  if (variant === 'unavailable') {
    return 'unavailable'
  }
  const added = continuous === undefined ? [] : [continuousFixture(continuous.length, continuous.responsiveness)]
  return variant === '' ? { results: added, replace: false } : { results: [...demoHistoryResults(variant, new Date(), compareB), ...added], replace: true }
}
