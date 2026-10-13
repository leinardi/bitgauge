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

import globalSetup from './globalSetup.ts'
import { SCENARIOS } from './scenarios.ts'

describe('globalSetup', () => {
  it('fails a run with nothing to compare instead of starting it', () => {
    expect(SCENARIOS).toEqual([])
    expect(() => globalSetup()).toThrow('demo parity: the selection names no scenario to compare')
  })
})
