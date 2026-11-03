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

// The focus hand-off (ui/i18n-a11y.md section 2.3): the focus moves on only when the part that
// goes held it, and one made from a toast's action holds in vue-sonner's real toaster, whose
// hotkey memory of the focus is spent as soon as the hotkey moves it.

import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { h } from 'vue'
import { toast, Toaster } from 'vue-sonner'

import { focusHandOff } from '@/lib/focus'

function button(text: string): HTMLButtonElement {
  return document.body.appendChild(Object.assign(document.createElement('button'), { textContent: text }))
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('the focus hand-off', () => {
  it('moves the focus from the part that goes, and leaves a focus it did not hold', async () => {
    const [leaving, next, elsewhere] = [button('Delete'), button('Next'), button('Elsewhere')]
    leaving.focus()
    const handOff = focusHandOff(leaving)
    leaving.remove()
    await handOff(() => next)
    expect(document.activeElement).toBe(next)
    // The focus was elsewhere: nothing moves.
    const other = button('Other')
    const untouched = focusHandOff(other)
    elsewhere.focus()
    other.remove()
    await untouched(() => next)
    expect(document.activeElement).toBe(elsewhere)
    // From the page body, nothing is held.
    elsewhere.blur()
    const fromBody = focusHandOff(document.body)
    elsewhere.focus()
    await fromBody(() => next)
    expect(document.activeElement).toBe(elsewhere)
  })

  it("holds a hand-off from a toast's action when the toast list appears again", async () => {
    const toaster = mount({ render: () => h(Toaster) }, { attachTo: document.body })
    const before = button('Download JSON')
    const target = button('Keep in history')
    before.focus()
    let handOff: ReturnType<typeof focusHandOff> = async () => undefined
    toast('Kept in history.', { action: { label: 'Undo', onClick: () => (handOff = focusHandOff(document.activeElement)) } })
    await vi.waitFor(() => expect(document.querySelector('[data-sonner-toaster] button[data-button]')).not.toBeNull())
    // The hotkey focuses the list, which notes where the focus was and gives it straight back.
    document.querySelector<HTMLElement>('[data-sonner-toaster]')?.focus()
    await flushPromises()
    expect(document.activeElement).toBe(before)
    // Tab reaches Undo.
    const undo = document.querySelector<HTMLButtonElement>('[data-sonner-toaster] button[data-button]')
    undo?.focus()
    undo?.click()
    await handOff(() => target)
    expect(document.activeElement).toBe(target)
    // The next toast, as the Undo's own confirmation: the focus stays where the hand-off put it.
    toast('Removed from history.')
    await vi.waitFor(() => expect(document.querySelectorAll('[data-sonner-toast]').length).toBeGreaterThan(1))
    await flushPromises()
    expect(document.activeElement).toBe(target)
    toaster.unmount()
  })
})
