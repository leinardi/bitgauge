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

import { infoFor } from '@/demo/fixtures'
import { type DemoHistory, demoHistoryResults } from '@/demo/history'
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

/**
 * Hands a demo Worker the chosen scenario as soon as there is one, and presses Stop when its
 * script asks to; that message is the demo's own, so no engine listener sees it.
 */
export function attachWorker(worker: Pick<Worker, 'postMessage' | 'addEventListener'>): void {
  worker.addEventListener('message', (event) => {
    const type = (event.data as { type?: unknown } | null)?.type
    if (type === 'demo-press-stop') {
      event.stopImmediatePropagation()
      pressStop()
    } else if (type === 'error' && current !== null) {
      const scenario: DemoScenario = DEMO_SCENARIOS[current.scenario]
      // The scenario's fault, or the panel's error kind for one that leaves it open, as the session plays it.
      gone ||= scenario.fault !== undefined && (scenario.fault.kind ?? current.errorKind) === 'unreachable'
    }
  })
  void chosen.then((command) => worker.postMessage(command))
}

/** GET /info as the chosen scenario's server answers it: unreachable for the offline one, and once a run ended on its unreachable fault. */
export async function demoInfo(): Promise<Info> {
  const scenario: DemoScenario = DEMO_SCENARIOS[(await chosen).scenario]
  if (scenario.offline === true || gone) {
    throw new TypeError('the demo server is unreachable')
  }
  return infoFor(scenario.link, scenario.basePath)
}

let chooseVariant: (variant: DemoHistory) => void = () => undefined
const variantChosen = new Promise<DemoHistory>((resolve) => {
  chooseVariant = resolve
})

/** The panel's History variant for this page load; a later call changes nothing. */
export function chooseHistory(variant: DemoHistory): void {
  chooseVariant(variant)
}

/**
 * What the page's history starts from: unavailable, the results to replace it with, or, for '',
 * the browser's own history as it is (null).
 */
export async function demoHistory(): Promise<'unavailable' | Result[] | null> {
  const variant = await variantChosen
  return variant === 'unavailable' ? 'unavailable' : variant === '' ? null : demoHistoryResults(variant)
}
