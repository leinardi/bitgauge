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
import { DEMO_SCENARIOS, type DemoCommand, type DemoScenario } from '@/demo/scenarios'
import type { Info } from '@/engine/types'

// The page's side of the demo (frontend.md section 9): the choice the demo panel restored when the
// page loaded, handed to every demo Worker the page starts and answered as the page's own
// GET /info. Both wait for the panel, so neither runs on a default the panel then replaces.

let choose: (command: DemoCommand) => void = () => undefined
const chosen = new Promise<DemoCommand>((resolve) => {
  choose = resolve
})

/** The panel's choice for this page load; a later call changes nothing, as a reload applies a new one. */
export function chooseScenario(command: DemoCommand): void {
  choose(command)
}

/** Hands a demo Worker the chosen scenario as soon as there is one. */
export function attachWorker(worker: Pick<Worker, 'postMessage'>): void {
  void chosen.then((command) => worker.postMessage(command))
}

/** GET /info as the chosen scenario's server answers it: unreachable for the offline one. */
export async function demoInfo(): Promise<Info> {
  const scenario: DemoScenario = DEMO_SCENARIOS[(await chosen).scenario]
  if (scenario.offline === true) {
    throw new TypeError('the demo server is unreachable')
  }
  return infoFor(scenario.link, scenario.basePath)
}
