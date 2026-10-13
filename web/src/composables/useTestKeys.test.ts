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

// The Test screen's keys (ui/i18n-a11y.md section 2.4): Enter on the page body or a non-interactive
// element, and nowhere else; Escape from anywhere on the screen.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'

import { useTestKeys } from '@/composables/useTestKeys'

function listening(canEnter = true) {
  const keys = { canEnter: vi.fn(() => canEnter), enter: vi.fn(), escape: vi.fn() }
  const scope = effectScope()
  scope.run(() => useTestKeys(keys))
  return { keys, scope }
}

/** Presses a key with focus on `target`. */
function press(target: Element, key: string, init: KeyboardEventInit & { keyCode?: number } = {}): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })
  if (init.keyCode !== undefined) {
    Object.defineProperty(event, 'keyCode', { value: init.keyCode })
  }
  target.dispatchEvent(event)
  return event
}

function element(html: string): Element {
  document.body.innerHTML = html
  const found = document.body.querySelector('[data-target]')
  if (found === null) {
    throw new Error('no target')
  }
  return found
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('Enter', () => {
  it.each([
    ['the page body', '<main data-target></main>'],
    ['a paragraph', '<p data-target>Result</p>'],
    ['a status message', '<div role="status" data-target></div>'],
  ])('starts a test from %s', (_where, html) => {
    const { keys, scope } = listening()
    const event = press(element(html), 'Enter')
    expect(keys.enter).toHaveBeenCalledOnce()
    expect(event.defaultPrevented).toBe(true)
    scope.stop()
  })

  it.each([
    ['a link', '<a href="/about" data-target>About</a>'],
    ['a button', '<button data-target>Retry</button>'],
    ['an icon inside a button', '<button><svg data-target></svg></button>'],
    ['an input', '<input data-target>'],
    ['a select', '<select data-target></select>'],
    ['a textarea', '<textarea data-target></textarea>'],
    ['editable text', '<div contenteditable="true" data-target></div>'],
    ['a menu item', '<div role="menuitemradio" data-target></div>'],
    ['a focusable widget', '<div tabindex="0" data-target></div>'],
  ])('does nothing on %s', (_where, html) => {
    const { keys, scope } = listening()
    press(element(html), 'Enter')
    expect(keys.enter).not.toHaveBeenCalled()
    scope.stop()
  })

  it.each([
    ['Shift', { shiftKey: true }],
    ['Ctrl', { ctrlKey: true }],
    ['Alt', { altKey: true }],
    ['Meta', { metaKey: true }],
    ['IME composition', { isComposing: true }],
    ['the IME keyCode', { keyCode: 229 }],
    ['a held key', { repeat: true }],
  ])('does nothing with %s', (_what, init) => {
    const { keys, scope } = listening()
    press(element('<main data-target></main>'), 'Enter', init)
    expect(keys.enter).not.toHaveBeenCalled()
    scope.stop()
  })

  it('does nothing while a dialog is open', () => {
    const { keys, scope } = listening()
    document.body.innerHTML = '<main data-target></main><div role="dialog" aria-modal="true"></div>'
    press(document.body.querySelector('[data-target]') ?? document.body, 'Enter')
    expect(keys.enter).not.toHaveBeenCalled()
    scope.stop()
  })

  it('does nothing while Start is disabled or a test runs', () => {
    const { keys, scope } = listening(false)
    press(element('<main data-target></main>'), 'Enter')
    expect(keys.canEnter).toHaveBeenCalled()
    expect(keys.enter).not.toHaveBeenCalled()
    scope.stop()
  })

  it('has no character-key shortcut', () => {
    const { keys, scope } = listening()
    const target = element('<main data-target></main>')
    for (const key of ['s', ' ', 'r', 'Space']) {
      press(target, key)
    }
    expect(keys.enter).not.toHaveBeenCalled()
    expect(keys.escape).not.toHaveBeenCalled()
    scope.stop()
  })
})

describe('Escape', () => {
  it.each([
    ['the page body', '<main data-target></main>'],
    ['a button', '<button data-target>Stop</button>'],
    ['an input', '<input data-target>'],
  ])('stops or cancels from %s', (_where, html) => {
    const { keys, scope } = listening(false)
    press(element(html), 'Escape')
    expect(keys.escape).toHaveBeenCalledOnce()
    scope.stop()
  })

  it('leaves an open dialog, a composition and a key another control handled alone', () => {
    const { keys, scope } = listening()
    const target = element('<main data-target></main>')
    press(target, 'Escape', { isComposing: true })
    target.addEventListener('keydown', (event) => event.preventDefault(), { once: true })
    press(target, 'Escape')
    document.body.insertAdjacentHTML('beforeend', '<dialog open></dialog>')
    press(target, 'Escape')
    expect(keys.escape).not.toHaveBeenCalled()
    scope.stop()
  })

  it('stops listening with its scope', () => {
    const { keys, scope } = listening()
    scope.stop()
    press(element('<main data-target></main>'), 'Escape')
    expect(keys.escape).not.toHaveBeenCalled()
  })
})
