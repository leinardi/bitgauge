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

// A snippet (kit Snippet.jsx): a focusable block named by its caption or copy label, whose Copy
// writes its text and says so, or says that the clipboard refused it.

import { flushPromises } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'

import Snippet from '@/components/about/Snippet.vue'
import { mountApp } from '@/test/mount'

const LINES = [[{ text: 'networkQuality -C https://speed.example.lan/nq/config -v', kind: 'command' as const }, { text: '      # verbose, per-flow detail' }], [{ text: 'second' }]]

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('a snippet', () => {
  it('is a focusable block that never wraps, named by its caption', async () => {
    const page = await mountApp(Snippet, '/about', { props: { caption: 'bitgauge.json', copyLabel: 'Copy bitgauge.json', lines: LINES } })
    const pre = page.get('pre')
    expect(pre.attributes('tabindex')).toBe('0')
    // Named as a region: a name on a generic element is not announced.
    expect(pre.attributes('role')).toBe('region')
    expect(pre.attributes('aria-label')).toBe('bitgauge.json')
    // The copy button is opaque on the terminal surface, and each line ends clear of it.
    expect(page.get('button').classes()).toContain('bg-(--term-bg)')
    expect(page.get('button').classes()).not.toContain('bg-transparent')
    expect(pre.classes()).toContain('pr-12')
    expect(pre.classes()).toEqual(expect.arrayContaining(['whitespace-pre', 'overflow-x-auto']))
    expect(pre.text()).toBe('networkQuality -C https://speed.example.lan/nq/config -v      # verbose, per-flow detail\nsecond')
    page.unmount()
  })

  it('copies its text, and says when the clipboard refuses it', async () => {
    const writeText = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('denied'))
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
    const page = await mountApp(Snippet, '/about', { props: { caption: null, copyLabel: 'Copy networkQuality command', lines: LINES } })
    expect(page.get('pre').attributes('aria-label')).toBe('Copy networkQuality command')
    await page.get('button').trigger('click')
    await flushPromises()
    expect(writeText).toHaveBeenCalledWith('networkQuality -C https://speed.example.lan/nq/config -v      # verbose, per-flow detail\nsecond')
    expect(page.get('[role="status"]').text()).toBe('Copied')
    await page.get('button').trigger('click')
    await flushPromises()
    expect(page.get('[data-testid="copy-failed"]').attributes('role')).toBe('status')
    expect(page.get('[data-testid="copy-failed"]').text()).toBe('Could not copy; select the text and copy it by hand.')
    page.unmount()
  })
})
