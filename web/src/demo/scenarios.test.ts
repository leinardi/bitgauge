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
// lists, except the Continuous preset's, which arrive in v0.3, one per loaded-latency case of its
// panel, and the run its Result detail shows; and each scripted scenario plays out in the real engine without an engine failure.
// The panel's Responsiveness cases each give their path B state on a played LAN run, and its
// compatibility layers reach GET /info.

import kitApp from '@design/ui_kits/app/App.jsx?raw'
import { describe, expect, it } from 'vitest'

import { commandOf, DEFAULTS, restore } from '@/demo/choice'
import { chooseScenario, demoInfo } from '@/demo/control'
import { scenarioInfo } from '@/demo/fixtures'
import { DEMO_RESPONSIVENESS, type DemoResponsiveness } from '@/demo/responsiveness'
import { DEMO_SCENARIOS, type DemoScenarioName, isScenarioName } from '@/demo/scenarios'
import { demoSession, ended, start } from '@/demo/test/play'
import type { Result } from '@/engine/messages'

/** The kit's states of the Continuous preset (v0.3). */
const LATER = ['continuous', 'cont-upload', 'cont-warmup', 'cont-done']

/** The names in the kit's `const TEST_STATES = [...]`. */
function kitStates(): string[] {
  const list = /const TEST_STATES = \[([^\]]*)\]/.exec(kitApp)?.[1]
  if (list === undefined) {
    throw new Error('App.jsx no longer declares TEST_STATES')
  }
  return [...list.matchAll(/'([^']+)'/g)].map((match) => match[1] ?? '')
}

/** The panel's loaded-latency cases: the WebSocket closing after idle latency, and each LL_GAPS reason. */
function kitLoadedCases(): string[] {
  const gaps = /const LL_GAPS = \[(.*)\];/.exec(kitApp)?.[1]
  if (gaps === undefined || !kitApp.includes('value={d.wsClose}')) {
    throw new Error('App.jsx no longer declares LL_GAPS and the wsClose control')
  }
  const reasons = [...gaps.matchAll(/\['([a-z-]+)', '[^']*'\]/g)].map((match) => match[1] ?? '').filter((reason) => reason !== 'none')
  return ['ws-close', ...reasons.map((reason) => `ll-${reason}`)]
}

/** The run of the kit's Result detail (ResultDetail.jsx), a state of no panel control. */
const RESULT_DETAIL = 'upload-gap'

const NAMES = Object.keys(DEMO_SCENARIOS) as DemoScenarioName[]

describe('the demo scenarios', () => {
  it('cover exactly the kit states v0.1 and v0.2 have, its loaded-latency cases and its Result detail', () => {
    const states = kitStates()
    expect(states).toEqual(expect.arrayContaining(LATER))
    expect(kitLoadedCases()).toHaveLength(5)
    expect([...NAMES].sort()).toEqual([...states.filter((state) => !LATER.includes(state)), ...kitLoadedCases(), RESULT_DETAIL].sort())
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

/** A complete LAN run with the panel's `responsiveness`, played to its result. */
async function result(responsiveness: DemoResponsiveness): Promise<Result> {
  const played = demoSession('complete', { responsiveness })
  start(played)
  for (let elapsed = 0; elapsed < 90_000 && !ended(played.events); elapsed += 250) {
    await played.base.advance(250)
  }
  const event = played.events.find((candidate) => candidate.type === 'result')
  if (event?.type !== 'result') {
    throw new Error('the run ended without a result')
  }
  return event.result
}

describe('the Responsiveness cases', () => {
  it('offer the kit’s five options, in its order and words', () => {
    const options = /const RESP_OPTS = \[(.*)\];/.exec(kitApp)?.[1] ?? ''
    expect([...options.matchAll(/\['([^']+)', '([^']+)'\]/g)].map((match) => [match[1], match[2]])).toEqual(DEMO_RESPONSIVENESS.map(([value, words]) => [value, words]))
  })

  it.each([
    ['ok', { state: 'measured', protocol: 'h2' }, { state: 'measured', protocol: 'h2' }],
    ['uncertain', { state: 'uncertain', protocol: 'h2' }, { state: 'uncertain', protocol: 'h2' }],
    ['needs-h2', { state: 'unavailable_h1', protocol: 'http/1.1' }, { state: 'unavailable_h1', protocol: 'http/1.1' }],
    ['not-reported', { state: 'unavailable_h1', protocol: '' }, { state: 'unavailable_h1', protocol: '' }],
    ['few-samples', { state: 'measured', protocol: 'h2' }, { state: 'unavailable_insufficient', protocol: 'h2' }],
  ] as const)('%s gives its path B state on a played LAN run', async (option, download, upload) => {
    const played = await result(option)
    expect(played.download?.responsiveness).toMatchObject(download)
    expect(played.upload?.responsiveness).toMatchObject(upload)
  })

  it('apply the Result detail’s case to the run it shows, and the Test screen’s to every other', () => {
    const choice = { ...DEFAULTS, responsiveness: 'uncertain' as const, resultResponsiveness: 'needs-h2' as const }
    expect(commandOf({ ...choice, scenario: 'upload-gap' }).responsiveness).toBe('needs-h2')
    expect(commandOf({ ...choice, scenario: 'complete' }).responsiveness).toBe('uncertain')
    expect(commandOf({ ...choice, scenario: 'idle', forceState: 'upload-gap' }).responsiveness).toBe('needs-h2')
  })
})

describe('the compatibility layers', () => {
  it('are all on by default, as in the kit, and read back as stored', () => {
    const storage = (value: object) => ({ getItem: () => JSON.stringify(value), setItem: () => undefined })
    expect(commandOf(DEFAULTS).compat).toEqual({ openspeedtest: true, librespeed: true, networkquality: true })
    expect(restore(storage({ librespeed: false, networkquality: 'off' }))).toMatchObject({ openspeedtest: true, librespeed: false, networkquality: true })
  })

  it('reach GET /info, on the Worker’s side and the page’s', async () => {
    const command = commandOf({ ...DEFAULTS, scenario: 'basepath', openspeedtest: false, networkquality: false })
    const flags = { openspeedtest: false, librespeed: true, networkquality: false }
    expect(command.compat).toEqual(flags)
    // The demo Worker's session answers with scenarioInfo, as the page's GET /info does.
    expect(scenarioInfo(command)).toMatchObject({ compat: flags, server: { basePath: '/speed' } })
    chooseScenario(command)
    expect((await demoInfo()).compat).toEqual(flags)
  })
})
