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

import type { Page } from '@playwright/test'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { capture } from './capture.ts'
import type { SideDriver } from './side.ts'

const driver: SideDriver = {
  side: 'vue',
  startUrl: 'http://127.0.0.1:5180/',
  overlaySelector: '[role=dialog], [role=alertdialog]',
  toastSelector: '.toast',
  styleRegions: [['main', 'main']],
  prepare: () => Promise.resolve(),
}

/**
 * A page over this jsdom document: evaluate runs in it, and an element's accessibility snapshot is
 * the YAML its data-snapshot attribute holds, so the test decides what each landmark says.
 */
function page(): Page {
  const locator = (selector: string) => {
    const nth = (index: number) => ({
      ariaSnapshot: () => Promise.resolve((document.querySelectorAll(selector)[index] as HTMLElement | undefined)?.dataset['snapshot'] ?? ''),
    })
    return { count: () => Promise.resolve(document.querySelectorAll(selector).length), first: () => nth(0), nth }
  }
  return {
    locator,
    evaluate: (fn: (arg: unknown) => unknown, arg: unknown) => Promise.resolve(fn(arg)),
  } as unknown as Page
}

function el(tag: string, snapshot: string, attrs: Record<string, string> = {}, ...children: HTMLElement[]): HTMLElement {
  const node = document.createElement(tag)
  node.dataset['snapshot'] = snapshot
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value)
  node.append(...children)
  return node
}

describe('capture', () => {
  beforeEach(() => {
    // jsdom lays nothing out: an element is visible unless it, or an ancestor, is hidden.
    Element.prototype.checkVisibility = function (this: Element) {
      return this.closest('[hidden]') === null
    }
  })

  afterEach(() => {
    document.body.replaceChildren()
  })

  it('reads the header, main, notices and dialogs, each only once', async () => {
    document.body.append(
      el('header', '- banner:\n  - link "BitGauge home"', {}, el('nav', '- navigation "Primary"')),
      el('header', '- banner:\n  - text: the desktop bar', { hidden: '' }),
      el('main', '- main:\n  - heading "Speed test" [level=1]', {}, el('header', '- banner: inside main'), el('div', '- status: inside main', { role: 'status' })),
      el('nav', '- navigation "Primary":\n  - link "Test"'),
      el('div', '- alert: You are offline', { role: 'alert' }),
      el('div', '- status: Copied', { role: 'status', class: 'toast' }),
      el('div', '- dialog "Stop the test?"', { role: 'dialog' }),
    )
    const { trees, raw } = await capture(driver, page())
    expect(raw.header).toBe('- banner:\n  - link "BitGauge home"\n- navigation "Primary":\n  - link "Test"')
    expect(trees.header.map((node) => `${node.role} ${node.name}`)).toEqual(['banner ', 'navigation Primary'])
    // The main landmark's own node is not compared, only what it holds.
    expect(trees.main).toEqual([{ role: 'heading', name: 'Speed test', attrs: ['level=1'], children: [] }])
    expect(raw.notices).toBe('- alert: You are offline')
    expect(raw.dialogs).toBe('- dialog "Stop the test?"')
  })

  it('reads every alert and status outside the landmarks on a side without toasts', async () => {
    document.body.append(el('div', '- status: Copied', { role: 'status', class: 'toast' }), el('div', '- dialog "Stop the test?"', { role: 'dialog' }))
    const { raw } = await capture({ ...driver, toastSelector: null }, page())
    expect(raw.notices).toBe('- status: Copied')
    expect(raw.dialogs).toBe('- dialog "Stop the test?"')
  })

  it('reads a main element that is an alert as the main region, not as a notice', async () => {
    document.body.append(el('main', '- main:\n  - heading "This page is not at the server\'s base path" [level=1]', { role: 'alert' }))
    const { trees, raw } = await capture(driver, page())
    expect(trees.main.map((node) => node.role)).toEqual(['heading'])
    expect(raw.notices).toBe('')
    expect(trees.notices).toEqual([])
  })
})
