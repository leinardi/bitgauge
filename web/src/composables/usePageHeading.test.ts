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

// The focus after an in-app navigation (ui/i18n-a11y.md section 2.3, D-16): a navigation to
// another path focuses the page's h1 once it has rendered and is ready; the first load and a
// query-only replace move nothing; a newer navigation cancels an older page's pending focus.

import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, type Ref, shallowRef, useTemplateRef } from 'vue'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'

import { createAppI18n } from '@/i18n'

type Module = typeof import('@/composables/usePageHeading')

let heading: Module

beforeEach(async () => {
  vi.resetModules()
  heading = await import('@/composables/usePageHeading')
  document.body.innerHTML = ''
})

/** A page whose h1 names it, ready when `ready` is. */
function page(name: string, ready: Ref<boolean> = shallowRef(true)) {
  return defineComponent({
    setup() {
      const h1 = useTemplateRef<HTMLElement>('h1')
      heading.usePageHeading(() => h1.value, () => ready.value)
      heading.usePageTitle(() => name)
      return () => h('main', [h('h1', { ref: 'h1' }, name)])
    },
  })
}

async function app(pages: Record<string, ReturnType<typeof page>>) {
  const router = createRouter({ history: createMemoryHistory(), routes: Object.entries(pages).map(([path, component]) => ({ path, component })) })
  router.afterEach(heading.countNavigation)
  await router.push('/a')
  const wrapper = mount(RouterView, { global: { plugins: [router, createAppI18n('', ['en'])] }, attachTo: document.body })
  await flushPromises()
  return { router, wrapper }
}

const focusedText = () => (document.activeElement?.tagName === 'H1' ? document.activeElement.textContent : null)

describe('the heading after a navigation', () => {
  it('stays put on the first load, and focuses the h1 after a path change, with the page title', async () => {
    const { router, wrapper } = await app({ '/a': page('A'), '/b': page('B') })
    expect(document.activeElement).toBe(document.body)
    expect(document.title).toBe('A · BitGauge')
    await router.push('/b')
    await flushPromises()
    expect(focusedText()).toBe('B')
    expect(document.activeElement?.getAttribute('tabindex')).toBe('-1')
    expect(document.title).toBe('B · BitGauge')
    wrapper.unmount()
  })

  it('moves nothing on a query-only replace', async () => {
    const { router, wrapper } = await app({ '/a': page('A'), '/b': page('B') })
    await router.push('/b')
    await flushPromises()
    const elsewhere = document.body.appendChild(document.createElement('button'))
    elsewhere.focus()
    await router.replace({ query: { q: 'hotel' } })
    await flushPromises()
    expect(document.activeElement).toBe(elsewhere)
    wrapper.unmount()
  })

  it('waits for the page to be ready, and a newer navigation cancels an older page’s focus', async () => {
    const loadingB = shallowRef(false)
    const loadingC = shallowRef(false)
    const { router, wrapper } = await app({ '/a': page('A'), '/b': page('B', loadingB), '/c': page('C', loadingC) })
    await router.push('/b')
    await flushPromises()
    expect(focusedText()).not.toBe('B')
    loadingB.value = true
    await flushPromises()
    expect(focusedText()).toBe('B')
    // A fast A → B → C: B is still loading when C arrives; only C takes the focus, once ready.
    await router.push('/a')
    await flushPromises()
    loadingB.value = false
    await router.push('/b')
    await router.push('/c')
    await flushPromises()
    loadingB.value = true
    await flushPromises()
    expect(focusedText()).not.toBe('B')
    loadingC.value = true
    await flushPromises()
    expect(focusedText()).toBe('C')
    wrapper.unmount()
  })
})
