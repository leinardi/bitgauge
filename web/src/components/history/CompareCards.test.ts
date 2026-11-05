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

// The compare view's paging on narrow screens (ui/screens.md section 3): a paging button disables
// itself on the page it reaches, and the focus moves to the other one, inside the dialog
// (ui/i18n-a11y.md section 2.3, QA-103).

import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import { compare } from '@/components/history/compare'
import CompareCards from '@/components/history/CompareCards.vue'
import { createAppI18n } from '@/i18n'
import { resultFixture, uuidFor } from '@/test/fixtures'

const i18n = createAppI18n('', ['en'])
const t = i18n.global.t as unknown as Parameters<typeof compare>[4]

describe('the compare cards', () => {
  it('moves the focus to the other paging button when the pressed one disables itself', async () => {
    const a = resultFixture({ id: uuidFor('a'), startedAt: '2026-09-26T16:20:00.000Z' })
    const b = resultFixture({ id: uuidFor('b'), startedAt: '2026-10-02T07:05:00.000Z' })
    const sides = [
      { side: 'A' as const, id: a.id, label: 'A', date: 'Sep 26', startedAt: a.startedAt },
      { side: 'B' as const, id: b.id, label: 'B', date: 'Oct 2', startedAt: b.startedAt },
    ]
    // jsdom has no scrollTo: one that does nothing, for this test only.
    Object.defineProperty(Element.prototype, 'scrollTo', { configurable: true, value: () => undefined })
    const cards = mount(CompareCards, { props: { comparison: compare(a, b, 'bits', 'en', t), sides }, global: { plugins: [i18n], stubs: { RouterLink: RouterLinkStub } }, attachTo: document.body })
    const button = (name: string) => cards.get<HTMLButtonElement>(`button[aria-label="${name}"]`)
    button('Next result').element.focus()
    await button('Next result').trigger('click')
    await flushPromises()
    expect(button('Next result').attributes('disabled')).toBeDefined()
    expect(document.activeElement).toBe(button('Previous result').element)
    const scroller = cards.get('[role="group"]')
    Object.defineProperty(scroller.element.children[0], 'offsetWidth', { configurable: true, value: 300 })
    // Early animation frames are still near A; they must not disable focused Previous (QA-124).
    await scroller.trigger('scroll')
    expect(button('Previous result').attributes('disabled')).toBeUndefined()
    expect(document.activeElement).toBe(button('Previous result').element)
    await button('Previous result').trigger('click')
    await flushPromises()
    expect(document.activeElement).toBe(button('Next result').element)
    cards.unmount()
    Reflect.deleteProperty(Element.prototype, 'scrollTo')
  })
})
