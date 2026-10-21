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

import { DEMO_LINKS, scenarioInfo } from '@/demo/fixtures'
import { DEFAULT_SCENARIO, DEMO_SCENARIOS, type DemoCommand, type DemoPressStop, type DemoScenario, isScenarioName } from '@/demo/scenarios'
import { DemoSession } from '@/demo/session'
import { BrowserClock } from '@/engine/clock'
import type { EngineCommand, EngineEvent } from '@/engine/messages'
import { browserIdentity } from '@/engine/wiring'

// The demo build's Worker entry (frontend.md section 9), in place of engine/worker.ts: the same
// engine and message loop, on the demo clock and the simulated link. A `demo` command replaces the
// scenario, abandoning a run in progress, and hands the new one the page's last `configure`, which
// may have arrived first; every other command is the engine's.

const FIRST: DemoCommand = { type: 'demo', scenario: DEFAULT_SCENARIO, speed: 1, cpuBound: false, timerResolutionMs: null, errorKind: 'requests', hold: true }

const clock = new BrowserClock()
const browser = browserIdentity(navigator.userAgent)
const emit = (event: EngineEvent) => self.postMessage(event)
const fail = (error: unknown) => self.reportError(error)
const PRESS_STOP: DemoPressStop = { type: 'demo-press-stop' }
const pressStop = () => self.postMessage(PRESS_STOP)

// A session's clock runs each due timer in a task of its own: a message on a channel, which the
// browser does not clamp as it clamps a nested zero timer.
const channel = new MessageChannel()
const tasks: (() => void)[] = []
channel.port1.onmessage = () => clock.task(() => tasks.shift()?.())
const nextTask = (fn: () => void) => {
  tasks.push(fn)
  channel.port2.postMessage(null)
}

function sessionFor(command: DemoCommand): DemoSession {
  const scenario: DemoScenario = DEMO_SCENARIOS[command.scenario]
  return new DemoSession({ base: clock, command, scenario, profile: DEMO_LINKS[scenario.link], info: scenarioInfo(command), browser, emit, fail, pressStop, nextTask })
}

let session = sessionFor(FIRST)
let configured: EngineCommand | null = null

self.addEventListener('message', (event: MessageEvent<EngineCommand | DemoCommand>) =>
  clock.task(() => {
    const command = event.data
    if (command.type !== 'demo') {
      if (command.type === 'configure') {
        configured = command
      }
      session.receive(command)
    } else if (isScenarioName(command.scenario) && command.speed > 0) {
      session.end()
      session = sessionFor(command)
      if (configured !== null) {
        session.receive(configured)
      }
    }
  }),
)
