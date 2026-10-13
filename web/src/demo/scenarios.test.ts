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

// The scenario table against the UI kit: one scenario per Test-screen state the kit's App.jsx
// lists, except the Continuous preset's, which arrive in v0.3; and each scripted scenario plays out
// in the real engine without an engine failure.

import kitApp from '@design/ui_kits/app/App.jsx?raw'
import { describe, expect, it } from 'vitest'

import { DEMO_SCENARIOS, type DemoScenarioName, isScenarioName } from '@/demo/scenarios'
import { demoSession, ended, start } from '@/demo/test/play'

/** The kit's states of the Continuous preset (v0.3). */
const LATER = ['continuous', 'cont-warmup', 'cont-done']

/** The names in the kit's `const TEST_STATES = [...]`. */
function kitStates(): string[] {
  const list = /const TEST_STATES = \[([^\]]*)\]/.exec(kitApp)?.[1]
  if (list === undefined) {
    throw new Error('App.jsx no longer declares TEST_STATES')
  }
  return [...list.matchAll(/'([^']+)'/g)].map((match) => match[1] ?? '')
}

const NAMES = Object.keys(DEMO_SCENARIOS) as DemoScenarioName[]

describe('the demo scenarios', () => {
  it('cover exactly the kit states v0.1 has', () => {
    const states = kitStates()
    expect(states).toEqual(expect.arrayContaining(LATER))
    expect([...NAMES].sort()).toEqual(states.filter((state) => !LATER.includes(state)).sort())
  })

  it('accept only their own names', () => {
    expect(isScenarioName('complete')).toBe(true)
    expect(isScenarioName('continuous')).toBe(false)
    expect(isScenarioName('toString')).toBe(false)
  })

  it.each(NAMES.filter((name) => DEMO_SCENARIOS[name].start))('%s plays out without an engine failure', async (name) => {
    const played = demoSession(name)
    const { events, failures, session, base } = played
    const scenario = DEMO_SCENARIOS[name]
    start(played)
    await base.advance(90_000)
    expect(failures).toEqual([])
    const phases = events.flatMap((event) => (event.type === 'phase' && event.state === 'started' ? [event.phase] : []))
    if (!('hold' in scenario)) {
      // The run's last phase was reached, finished or skipped.
      expect(ended(events)).toBe(true)
    } else {
      // Held in the scripted phase: started, never left.
      const heldAt = session.clock.now()
      await base.advance(1000)
      expect(session.clock.now()).toBe(heldAt)
      expect(phases.at(-1)).toBe(scenario.hold.phase)
      expect(ended(events)).toBe(false)
    }
  })
})
