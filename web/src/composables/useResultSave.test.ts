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

// The automatic save of ui/flows.md section 1 step 5: a complete result once, as it arrives; a
// partial or error one never; and what the bar is told when history is unavailable or a write fails.

import { flushPromises } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { shallowRef } from 'vue'

import type { History } from '@/composables/useHistory'
import { useResultSave } from '@/composables/useResultSave'
import type { Result } from '@/engine/messages'
import { resultFixture } from '@/test/fixtures'

function history(saved: boolean, status: 'available' | 'unavailable' = 'available') {
  const save = vi.fn(() => Promise.resolve(saved))
  return { save, history: { save, status: shallowRef(status) } as unknown as History }
}

describe('saving the ended result', () => {
  it('saves a complete result once and reports it saved', async () => {
    const { save, history: h } = history(true)
    const result = shallowRef<Result | null>(null)
    const { state } = useResultSave(result, h)
    expect(state.value).toBeNull()
    result.value = resultFixture()
    expect(state.value).toBe('saving')
    await flushPromises()
    expect(state.value).toBe('saved')
    result.value = { ...resultFixture() }
    await flushPromises()
    expect(save).toHaveBeenCalledOnce()
  })

  it('tells a failed write from an unavailable history', async () => {
    const failed = history(false)
    const one = useResultSave(shallowRef<Result | null>(resultFixture()), failed.history)
    await flushPromises()
    expect(one.state.value).toBe('failed')
    const unavailable = history(false, 'unavailable')
    const two = useResultSave(shallowRef<Result | null>(resultFixture()), unavailable.history)
    await flushPromises()
    expect(two.state.value).toBe('unavailable')
  })

  it('never saves a partial or error result, and says only when history is unavailable', async () => {
    const { save, history: h } = history(true)
    const { state } = useResultSave(shallowRef<Result | null>(resultFixture({ status: 'partial' })), h)
    await flushPromises()
    expect(save).not.toHaveBeenCalled()
    expect(state.value).toBeNull()
    const off = history(true, 'unavailable')
    expect(useResultSave(shallowRef<Result | null>(resultFixture({ status: 'error' })), off.history).state.value).toBe('unavailable')
  })
})
