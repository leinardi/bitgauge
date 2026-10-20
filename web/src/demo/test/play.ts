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

import { DEMO_LINKS, infoFor } from '@/demo/fixtures'
import type { LinkProfile } from '@/demo/link'
import { DEMO_SCENARIOS, type DemoCommand, type DemoScenario, type DemoScenarioName } from '@/demo/scenarios'
import { DemoSession } from '@/demo/session'
import type { Direction, EngineEvent, TestSettings } from '@/engine/messages'
import { FakeClock } from '@/engine/test/fakeClock'

// A demo session for the tests, as the demo Worker builds one, on a fake base clock that only the
// test moves; the session plays a scenario's fast-forward itself.

/** Standard with the server defaults, as the fixture's GET /info offers them. */
const SETTINGS: TestSettings = {
  ...infoFor('lan').defaults,
  preset: 'standard',
  download: { minMs: 10_000, maxMs: 20_000 },
  upload: { minMs: 15_000, maxMs: 25_000 },
}

export interface Played {
  events: EngineEvent[]
  failures: unknown[]
  session: DemoSession
  base: FakeClock
  /** The scripted stops the session asked the page to press. */
  stopsPressed: number[]
}

/**
 * The session of scenario `name`, with the panel's defaults under `command`; `scenario` replaces
 * its script and `profile` its link.
 */
export function demoSession(
  name: DemoScenarioName,
  command: Partial<DemoCommand> = {},
  scenario: DemoScenario = DEMO_SCENARIOS[name],
  profile: LinkProfile = DEMO_LINKS[scenario.link],
): Played {
  const base = new FakeClock()
  const events: EngineEvent[] = []
  const failures: unknown[] = []
  const stopsPressed: number[] = []
  const session: DemoSession = new DemoSession({
    base,
    command: { type: 'demo', scenario: name, speed: 1, cpuBound: false, timerResolutionMs: null, errorKind: 'requests', hold: true, ...command },
    scenario,
    profile,
    info: infoFor(scenario.link, scenario.basePath, command.compat),
    browser: { name: 'Firefox', major: 131, os: 'Linux' },
    emit: (event) => events.push(event),
    fail: (error) => failures.push(error),
    // The page presses Stop, which sends the engine's stop.
    pressStop: () => {
      stopsPressed.push(session.clock.now())
      session.receive({ type: 'stop' })
    },
  })
  return { events, failures, session, base, stopsPressed }
}

/**
 * Configures the session and starts a run, as the page does: with SETTINGS, or for a Continuous
 * scenario with the Continuous preset in its direction, as its URL parameters ask the page to.
 */
export function start(played: Played, scenario?: DemoScenario): void {
  const continuous = scenario?.continuous
  const settings: TestSettings = continuous === undefined ? SETTINGS : { ...SETTINGS, preset: 'continuous', download: { minMs: null, maxMs: null }, upload: { minMs: null, maxMs: null }, continuousDirection: continuous }
  played.session.receive({ type: 'configure', settings, basePath: '/' })
  played.session.receive({ type: 'start', visible: true })
}

/** Whether a Continuous run's one direction ended: finished, failed or stopped. */
export function continuousEnded(events: readonly EngineEvent[], direction: Direction): boolean {
  return events.some((event) => event.type === 'phase' && event.phase === direction && event.state !== 'started')
}

/** Whether the run reached its last phase and left it: finished, failed or skipped. */
export function ended(events: readonly EngineEvent[]): boolean {
  return events.some((event) => event.type === 'phase' && event.phase === 'upload' && event.state !== 'started')
}
