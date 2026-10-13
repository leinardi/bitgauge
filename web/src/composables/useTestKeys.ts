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

import { onScopeDispose } from 'vue'

// The Test screen's keys (ui/i18n-a11y.md section 2.4). Enter starts a test, or starts it now
// during the countdown, when focus is on the page body or a non-interactive element; it does
// nothing on an interactive control, while a dialog is open, with a modifier held, during IME
// composition, or when the screen says starting is not possible (Start disabled, a test running).
// Escape stops a running test or cancels the countdown from anywhere on the screen, except while a
// dialog is open or another control has already handled it. There is no character-key shortcut.

/** What keeps its own Enter: links, form controls, editable text and the ARIA widget roles. */
const INTERACTIVE = [
  'a[href]',
  'area[href]',
  'button',
  'input',
  'select',
  'textarea',
  'summary',
  'iframe',
  '[contenteditable]:not([contenteditable="false"])',
  '[tabindex]:not([tabindex="-1"])',
  ...['button', 'link', 'checkbox', 'radio', 'switch', 'tab', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'option', 'combobox', 'textbox', 'searchbox', 'slider', 'spinbutton', 'listbox', 'menu', 'menubar', 'tree', 'treeitem', 'grid', 'gridcell'].map((role) => `[role="${role}"]`),
].join(', ')

const DIALOG = 'dialog[open], [role="dialog"], [role="alertdialog"], [aria-modal="true"]'

/** The IME's own key events: composing, or the 229 keyCode some browsers send instead. */
function composing(event: KeyboardEvent): boolean {
  return event.isComposing || event.keyCode === 229
}

function onInteractive(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(INTERACTIVE) !== null
}

function dialogOpen(): boolean {
  return document.querySelector(DIALOG) !== null
}

export interface TestKeys {
  /** Whether Enter may start, or start now: Start is usable and no test runs. */
  canEnter: () => boolean
  enter: () => void
  escape: () => void
}

/** Listens on the window while the calling scope lives. */
export function useTestKeys(keys: TestKeys): void {
  function onKeydown(event: KeyboardEvent): void {
    if (event.defaultPrevented || composing(event) || dialogOpen()) {
      return
    }
    if (event.key === 'Escape') {
      keys.escape()
      return
    }
    const modified = event.altKey || event.ctrlKey || event.metaKey || event.shiftKey
    if (event.key !== 'Enter' || modified || event.repeat || onInteractive(event.target) || !keys.canEnter()) {
      return
    }
    event.preventDefault()
    keys.enter()
  }

  window.addEventListener('keydown', onKeydown)
  onScopeDispose(() => window.removeEventListener('keydown', onKeydown))
}
