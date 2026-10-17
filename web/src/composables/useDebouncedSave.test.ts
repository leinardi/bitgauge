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
// @vitest-environment jsdom

// A field saved as it changes: the last value a moment after the typing pauses, and at once on
// flush, on unmount and when the page leaves.

import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'

import { useDebouncedSave } from '@/composables/useDebouncedSave'

function harness() {
  const save = vi.fn<(value: string) => void>()
  let api: ReturnType<typeof useDebouncedSave<string>> | undefined
  const wrapper = mount(
    defineComponent({
      setup() {
        api = useDebouncedSave(save)
        return () => null
      },
    }),
  )
  return { save, wrapper, api: api! }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('useDebouncedSave', () => {
  it('saves the last value once the changes pause', () => {
    vi.useFakeTimers()
    const { save, api } = harness()
    api.schedule('H')
    vi.advanceTimersByTime(200)
    api.schedule('Ho')
    vi.advanceTimersByTime(299)
    expect(save).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(save.mock.calls).toEqual([['Ho']])
  })

  it('saves at once on flush, and only once', () => {
    vi.useFakeTimers()
    const { save, api } = harness()
    api.schedule('Home')
    api.flush()
    api.flush()
    vi.runAllTimers()
    expect(save.mock.calls).toEqual([['Home']])
  })

  it('saves what is pending when the component unmounts or the page leaves', () => {
    const unmounted = harness()
    unmounted.api.schedule('Attic')
    unmounted.wrapper.unmount()
    expect(unmounted.save.mock.calls).toEqual([['Attic']])
    const left = harness()
    left.api.schedule('Garage')
    window.dispatchEvent(new Event('pagehide'))
    expect(left.save.mock.calls).toEqual([['Garage']])
    left.wrapper.unmount()
  })
})
