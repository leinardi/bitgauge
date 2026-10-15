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

// @vitest-environment node

import { describe, expect, it } from 'vitest'

import { ALL_PROJECTS, assertNoPlaywrightFilters, expectedPairs, filterScenarios, portFromEnv, type ScenarioRef, selectionFromEnv, VIEWPORTS } from './selection.ts'

const scenarios: ScenarioRef[] = [{ id: 'test/idle' }, { id: 'test/download' }, { id: 'about' }]

describe('the projects', () => {
  it('are light and dark, each on the desktop window and on the kit mobile frame', () => {
    expect(ALL_PROJECTS.map((p) => p.name)).toEqual(['light-desktop', 'light-narrow', 'dark-desktop', 'dark-narrow'])
    expect(VIEWPORTS).toEqual({ desktop: { width: 1440, height: 900 }, narrow: { width: 390, height: 844 } })
  })
})

describe('selectionFromEnv', () => {
  it('runs the default project over every scenario when nothing is set', () => {
    const selection = selectionFromEnv({}, scenarios)
    expect(selection.projects.map((p) => p.name)).toEqual(['light-desktop'])
    expect(selection.mode).toBe('check')
    expect(expectedPairs(selection)).toHaveLength(3)
  })

  it('runs all four projects for the full matrix', () => {
    const selection = selectionFromEnv({ PARITY_MATRIX: 'full' }, scenarios)
    expect(selection.projects).toHaveLength(4)
    expect(expectedPairs(selection)).toHaveLength(12)
  })

  it('refuses an unknown matrix or mode', () => {
    expect(() => selectionFromEnv({ PARITY_MATRIX: 'all' }, scenarios)).toThrow(/PARITY_MATRIX=all/)
    expect(() => selectionFromEnv({ PARITY_BASELINE: 'write' }, scenarios)).toThrow(/PARITY_BASELINE=write/)
  })

  it('refuses accept without a reason, and flattens one to a single field', () => {
    expect(() => selectionFromEnv({ PARITY_BASELINE: 'accept' }, scenarios)).toThrow(/PARITY_REASON/)
    expect(() => selectionFromEnv({ PARITY_BASELINE: 'accept', PARITY_REASON: '  ' }, scenarios)).toThrow(/PARITY_REASON/)
    const selection = selectionFromEnv({ PARITY_BASELINE: 'accept', PARITY_REASON: 'a\tb\nc' }, scenarios)
    expect(selection.reason).toBe('a b c')
  })
})

describe('filterScenarios', () => {
  it('selects exact ids and prefix globs', () => {
    expect(filterScenarios(scenarios, 'test/*').map((s) => s.id)).toEqual(['test/idle', 'test/download'])
    expect(filterScenarios(scenarios, 'about, test/download').map((s) => s.id)).toEqual(['test/download', 'about'])
  })

  it('refuses an item that selects nothing rather than running an empty set', () => {
    expect(() => filterScenarios(scenarios, 'abuot')).toThrow(/"abuot" matches no scenario/)
    expect(() => filterScenarios(scenarios, 'history/*')).toThrow(/matches no scenario/)
    expect(() => filterScenarios(scenarios, ' , ')).toThrow(/names no scenario/)
  })
})

describe('assertNoPlaywrightFilters', () => {
  const run =
    (...args: string[]) =>
    () =>
      assertNoPlaywrightFilters(['node', 'playwright', 'test', ...args])

  it('lets through flags that change how tests run', () => {
    expect(run()).not.toThrow()
    expect(run('--headed', '--workers', '2', '--trace=on', '-c', 'playwright.parity.config.ts')).not.toThrow()
  })

  it('refuses anything that would change which tests run', () => {
    for (const args of [['--grep', 'x'], ['-g', 'x'], ['--project=dark-narrow'], ['parity.parity.ts'], ['--last-failed'], ['--reporter=line']]) {
      expect(run(...args)).toThrow(/selects what runs itself/)
    }
  })

  it('ignores processes that are not the test runner', () => {
    expect(() => assertNoPlaywrightFilters(['node', 'worker.js', '--grep'])).not.toThrow()
  })
})

describe('portFromEnv', () => {
  it('falls back to the project port when the variable is unset or empty', () => {
    expect(portFromEnv({}, 'PARITY_DEMO_PORT', 5180)).toBe(5180)
    expect(portFromEnv({ PARITY_DEMO_PORT: '' }, 'PARITY_DEMO_PORT', 5180)).toBe(5180)
  })

  it('reads the port make passes', () => {
    expect(portFromEnv({ PARITY_DEMO_PORT: '5290' }, 'PARITY_DEMO_PORT', 5180)).toBe(5290)
  })

  it('refuses a value that is not a port', () => {
    for (const value of ['abc', '5180x', '-1', '0', '65536', '51.8']) {
      expect(() => portFromEnv({ PARITY_DEMO_PORT: value }, 'PARITY_DEMO_PORT', 5180)).toThrow(
        `PARITY_DEMO_PORT=${value}: expected a port number`,
      )
    }
  })
})
