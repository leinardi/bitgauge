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
// flush, on unmount and when the page leaves or is hidden; flush resolves once every save it
// started or found running has finished.

import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'

import { useDebouncedSave } from '@/composables/useDebouncedSave'

function harness(save = vi.fn<(value: string) => Promise<unknown> | void>()) {
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
    void api.flush()
    void api.flush()
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

  it('saves what is pending when the page is hidden', () => {
    const hidden = harness()
    hidden.api.schedule('Porch')
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
    document.dispatchEvent(new Event('visibilitychange'))
    Reflect.deleteProperty(document, 'visibilityState')
    expect(hidden.save.mock.calls).toEqual([['Porch']])
    hidden.wrapper.unmount()
  })

  it('resolves flush once the save it starts and the one already running have finished', async () => {
    const releases: (() => void)[] = []
    const save = vi.fn((_value: string) => new Promise<void>((resolve) => releases.push(resolve)))
    vi.useFakeTimers()
    const { api, wrapper } = harness(save)
    api.schedule('First')
    vi.advanceTimersByTime(300)
    // The first save is running; a second one is pending.
    api.schedule('Second')
    let done = false
    const flushed = api.flush().then(() => {
      done = true
    })
    expect(save.mock.calls).toEqual([['First'], ['Second']])
    releases[1]?.()
    await Promise.resolve()
    await Promise.resolve()
    expect(done).toBe(false)
    releases[0]?.()
    await flushed
    expect(done).toBe(true)
    wrapper.unmount()
  })

  it('resolves flush after a running save even when nothing is pending, and after a failed one', async () => {
    let release: (() => void) | undefined
    const save = vi.fn((_value: string) => new Promise<void>((_resolve, reject) => (release = () => reject(new Error('quota')))))
    vi.useFakeTimers()
    const { api, wrapper } = harness(save)
    api.schedule('Only')
    vi.advanceTimersByTime(300)
    let done = false
    const flushed = api.flush().then(() => {
      done = true
    })
    await Promise.resolve()
    expect(done).toBe(false)
    release?.()
    await flushed
    expect(done).toBe(true)
    wrapper.unmount()
  })
})
