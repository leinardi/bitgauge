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

// The run's elapsed time on the page's clock: read at each change of progress while running, held
// at the end, reset by the next run.

import { describe, expect, it } from 'vitest'
import { effectScope, nextTick, shallowRef } from 'vue'

import { useElapsed } from '@/composables/useElapsed'

describe('useElapsed', () => {
  it('moves with progress while running, holds where the run ended, and starts over with the next', async () => {
    let clock = 1000
    const running = shallowRef(false)
    const progress = shallowRef(0)
    const scope = effectScope()
    const elapsed = scope.run(() => useElapsed(running, progress, () => clock))
    expect(elapsed?.value).toBeNull()
    running.value = true
    await nextTick()
    expect(elapsed?.value).toBe(0)
    clock += 1500
    await nextTick()
    expect(elapsed?.value).toBe(0)
    progress.value += 1
    await nextTick()
    expect(elapsed?.value).toBe(1500)
    clock += 250
    running.value = false
    await nextTick()
    expect(elapsed?.value).toBe(1750)
    clock += 5000
    progress.value += 1
    await nextTick()
    expect(elapsed?.value).toBe(1750)
    running.value = true
    await nextTick()
    expect(elapsed?.value).toBe(0)
    scope.stop()
  })
})
