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

// The theme: data-theme on <html>, the system's until one is chosen, the choice kept under the
// settings key with the object's other fields left alone, and a URL parameter over both for its
// page load (ui/url-params.md section 1).

import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent, nextTick } from 'vue'

import { createTheme, type ThemeEnvironment, useTheme } from '@/composables/useTheme'

const KEY = 'bitgauge.settings.v1'

/** A memory storage and a prefers-color-scheme query the test switches. */
function environment(stored: string | null = null, light = false) {
  const items = new Map<string, string>(stored === null ? [] : [[KEY, stored]])
  const listeners: ((event: { matches: boolean }) => void)[] = []
  const query = {
    matches: light,
    addEventListener: (_type: string, listener: (event: { matches: boolean }) => void) => listeners.push(listener),
  }
  const env: ThemeEnvironment = {
    storage: { getItem: (key) => items.get(key) ?? null, setItem: (key, value) => void items.set(key, value) },
    matchMedia: () => query as unknown as MediaQueryList,
    root: document.createElement('html'),
  }
  const setSystemLight = (matches: boolean) => listeners.forEach((listener) => listener({ matches }))
  return { env, items, setSystemLight }
}

describe('the theme', () => {
  it('follows the system by default', async () => {
    const { env, setSystemLight } = environment(null, true)
    const theme = createTheme(env)
    expect(theme.choice.value).toBe('system')
    expect(env.root.dataset.theme).toBe('light')
    setSystemLight(false)
    await nextTick()
    expect(env.root.dataset.theme).toBe('dark')
  })

  it('applies and persists a choice, keeping the other settings', async () => {
    const { env, items, setSystemLight } = environment('{"units":"bytes"}')
    const theme = createTheme(env)
    theme.setTheme('light')
    await nextTick()
    expect(env.root.dataset.theme).toBe('light')
    expect(JSON.parse(items.get(KEY) ?? '')).toEqual({ units: 'bytes', theme: 'light' })
    setSystemLight(false)
    await nextTick()
    expect(env.root.dataset.theme).toBe('light')
    // System is the default: choosing it removes the stored field.
    theme.setTheme('system')
    expect(theme.stored.value).toBeNull()
    expect(JSON.parse(items.get(KEY) ?? '')).toEqual({ units: 'bytes' })
  })

  it('takes the URL parameter over the stored choice, over the default, and stores none of it', () => {
    const { env, items } = environment('{"theme":"light"}')
    const theme = createTheme({ ...env, override: 'dark' })
    expect(theme.choice.value).toBe('dark')
    expect(env.root.dataset.theme).toBe('dark')
    expect(JSON.parse(items.get(KEY) ?? '')).toEqual({ theme: 'light' })
    const fresh = environment(null, true)
    expect(createTheme({ ...fresh.env, override: 'light' }).choice.value).toBe('light')
    expect(createTheme(environment('{"theme":"light"}').env).choice.value).toBe('light')
    expect(createTheme(environment().env).choice.value).toBe('system')
  })

  it('starts from the stored choice', () => {
    const { env } = environment('{"theme":"light"}')
    expect(createTheme(env).choice.value).toBe('light')
    expect(env.root.dataset.theme).toBe('light')
  })

  it.each(['not json', '[1]', '{"theme":"sepia"}'])('ignores the stored value %s', (stored) => {
    const { env } = environment(stored)
    expect(createTheme(env).choice.value).toBe('system')
  })

  it('still applies a choice when storage refuses it', async () => {
    const { env } = environment()
    env.storage.setItem = () => {
      throw new DOMException('quota', 'QuotaExceededError')
    }
    const theme = createTheme(env)
    theme.setTheme('dark')
    await nextTick()
    expect(env.root.dataset.theme).toBe('dark')
  })
})

describe('the shared theme', () => {
  it('keeps applying after the first component that asked for it unmounts', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined }))
    const first = mount(defineComponent({ setup: () => void useTheme(), render: () => null }))
    first.unmount()
    useTheme().setTheme('light')
    await nextTick()
    expect(document.documentElement.dataset.theme).toBe('light')
    useTheme().setTheme('dark')
    await nextTick()
    expect(document.documentElement.dataset.theme).toBe('dark')
    vi.unstubAllGlobals()
  })
})
