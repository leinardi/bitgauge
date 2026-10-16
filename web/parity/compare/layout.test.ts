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

import { collectLayout, compareLayout, nameLayout, type Box, type LaidOutElement } from './layout.ts'

type Spec = [role: string, name: string, box: Box, ancestors?: number[]]

// A side as collect() would return it: in document order, ancestors as indexes, nearest first.
function side(...specs: Spec[]): LaidOutElement[] {
  return nameLayout(specs.map(([role, name, box, ancestors = []]) => ({ region: 'main', role, name, raw: name, box, ancestors })))
}

const box = (x: number, y: number, width = 100, height = 20): Box => ({ x, y, width, height })
const MAIN = box(0, 56, 1440, 800)

describe('compareLayout', () => {
  it('reports a box that sits lower against the ancestor both sides have', () => {
    const proto = side(['main', '', MAIN], ['text', 'Idle latency', box(20, 80), [0]], ['text', 'pending', box(300, 80), [0]])
    const vue = side(['main', '', MAIN], ['text', 'Idle latency', box(20, 80), [0]], ['text', 'pending', box(20, 114), [0]])
    expect(compareLayout(proto, vue, ['main'])).toEqual([
      { layer: 'layout', path: 'main > text "pending"', kind: 'x', detail: '300px → 20px' },
      { layer: 'layout', path: 'main > text "pending"', kind: 'y', detail: '24px → 58px' },
    ])
  })

  it('never takes a wrapper only one side has as the reference', () => {
    const proto = side(['main', '', MAIN], ['text', 'Packet loss', box(40, 300)])
    const vue = side(['main', '', MAIN], ['group', 'Test', box(30, 290, 400, 60), [0]], ['text', 'Packet loss', box(40, 300), [1, 0]])
    expect(compareLayout(proto, vue, ['main'])).toEqual([])
  })

  it('reports what moved with a parent the two sides do not share', () => {
    const proto = side(['main', '', MAIN], ['group', 'Kit row', box(0, 100, 400, 40), [0]], ['text', 'Packet loss', box(10, 110), [1, 0]])
    const vue = side(['main', '', MAIN], ['group', 'Vue row', box(0, 130, 400, 40), [0]], ['text', 'Packet loss', box(10, 140), [1, 0]])
    expect(compareLayout(proto, vue, ['main'])).toEqual([{ layer: 'layout', path: 'main > text "Packet loss"', kind: 'y', detail: '54px → 84px' }])
  })

  it('reports a region moved as a whole once, on its root', () => {
    const proto = side(['main', '', MAIN], ['heading', 'Speed test', box(20, 80), [0]])
    const vue = side(['main', '', box(0, 80, 1440, 800)], ['heading', 'Speed test', box(20, 104), [0]])
    expect(compareLayout(proto, vue, ['main'])).toEqual([{ layer: 'layout', path: 'main > main ""', kind: 'y', detail: '56px → 80px' }])
  })

  it('places an element whose ancestors do not pair against the viewport', () => {
    const proto = side(['main', 'Kit', MAIN], ['text', 'Ready', box(20, 80), [0]])
    const vue = side(['main', 'Vue', box(0, 80, 1440, 800)], ['text', 'Ready', box(20, 104), [0]])
    expect(compareLayout(proto, vue, ['main'])).toEqual([{ layer: 'layout', path: 'main > text "Ready"', kind: 'y', detail: '80px → 104px' }])
  })

  it('compares only the top and the height of an element that shows a measured value', () => {
    const proto = side(['main', '', MAIN], ['text', '612 Mbit/s', box(20, 80, 90, 34)])
    const vue = side(['main', '', MAIN], ['text', '598 Mbit/s', box(40, 80, 96, 45)])
    expect(compareLayout(proto, vue, ['main'])).toEqual([{ layer: 'layout', path: 'main > text "# Mbit/s"', kind: 'height', detail: '34px → 45px' }])
  })

  it('keeps the width of a label that only wraps differently in its source', () => {
    const proto = side(['main', '', MAIN], ['button', 'Start\n test', box(20, 80, 248, 46)])
    const vue = side(['main', '', MAIN], ['button', 'Start test', box(20, 80, 200, 46)])
    expect(compareLayout(proto, vue, ['main'])).toEqual([{ layer: 'layout', path: 'main > button "Start test"', kind: 'width', detail: '248px → 200px' }])
  })

  it('treats lengths within a pixel as equal and leaves out regions the scenario does not compare', () => {
    const proto = side(['main', '', MAIN], ['text', 'Ready', box(20, 80, 100.4, 20)])
    const vue = side(['main', '', MAIN], ['text', 'Ready', box(20.9, 80.6, 101.3, 20)])
    expect(compareLayout(proto, vue, ['main'])).toEqual([])
    expect(compareLayout(proto, side(['main', '', MAIN], ['text', 'Ready', box(90, 80)]), ['header'])).toEqual([])
  })
})

/** A page over this jsdom document: evaluate runs in it. */
function page(): Page {
  return { evaluate: (fn: (arg: unknown) => unknown, arg: unknown) => Promise.resolve(fn(arg)) } as unknown as Page
}

function el(tag: string, attrs: Record<string, string>, ...children: (Node | string)[]): HTMLElement {
  const node = document.createElement(tag)
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value)
  node.append(...children)
  return node
}

describe('collectLayout', () => {
  const saved = {
    rect: Element.prototype.getBoundingClientRect,
    visible: Element.prototype.checkVisibility,
    innerText: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'innerText'),
  }

  beforeEach(() => {
    // jsdom lays nothing out: a box is the element's data-box (the document's is the window), and
    // visibility honors the options the way a browser does, so leaving one out keeps a hidden or
    // transparent element.
    Element.prototype.getBoundingClientRect = function (this: Element) {
      const fallback = this === document.body || this === document.documentElement ? '0,0,1440,900' : ''
      const [x = 0, y = 0, width = 0, height = 0] = (this.getAttribute('data-box') ?? fallback).split(',').map(Number)
      return { x, y, width, height } as DOMRect
    }
    Element.prototype.checkVisibility = function (this: HTMLElement, options?: CheckVisibilityOptions) {
      if (options?.visibilityProperty === true && this.style.visibility === 'hidden') return false
      if (options?.opacityProperty === true && this.style.opacity === '0') return false
      return true
    }
    Object.defineProperty(HTMLElement.prototype, 'innerText', {
      configurable: true,
      get(this: HTMLElement) {
        return this.textContent
      },
    })
  })

  afterEach(() => {
    Element.prototype.getBoundingClientRect = saved.rect
    Element.prototype.checkVisibility = saved.visible
    if (saved.innerText === undefined) Reflect.deleteProperty(HTMLElement.prototype, 'innerText')
    else Object.defineProperty(HTMLElement.prototype, 'innerText', saved.innerText)
    document.body.replaceChildren()
  })

  it('measures what is drawn, decorative labels included, and leaves out what is not', async () => {
    document.body.append(
      el(
        'main',
        { 'data-box': '0,56,1440,800' },
        el('span', { 'data-box': '600,300,60,12', 'aria-hidden': 'true' }, '800 Mbit/s'),
        el('span', { 'data-box': '10,10,80,20', style: 'visibility: hidden' }, 'Hidden'),
        el('span', { 'data-box': '10,40,80,20', style: 'opacity: 0' }, 'Transparent'),
        el('span', { 'data-box': '0,0,1,1', style: 'overflow: hidden' }, 'Announced only'),
        el('ul', { 'data-box': '20,100,400,60' }, el('li', { 'data-box': '20,100,400,20' }, el('span', { 'data-box': '24,102,80,16' }, 'Data used'))),
      ),
    )
    const out = await collectLayout(page(), [['main', 'main']])
    expect(out.map(({ role, name, ancestors }) => [role, name, ancestors])).toEqual([
      ['main', '', []],
      ['text', '# Mbit/s', [0]],
      ['list', '', [0]],
      ['listitem', 'Data used', [2, 0]],
      ['text', 'Data used', [3, 2, 0]],
    ])
    expect(out[1]?.raw).toBe('800 Mbit/s')
  })

  it('files an element under the first region root it sits in', async () => {
    document.body.append(
      el('aside', { 'aria-label': 'Demo state', 'data-box': '570,10,300,40' }, el('span', { 'data-box': '600,20,40,14' }, 'Demo'), el('div', { role: 'status', 'data-box': '600,30,40,14' }, 'Saved')),
      el('div', { role: 'status', 'data-box': '0,900,200,20' }, 'Offline'),
    )
    const out = await collectLayout(page(), [
      ['demo', 'aside[aria-label="Demo state"]'],
      ['notices', '[role=status]'],
    ])
    expect(out.map(({ region, role, name }) => [region, role, name])).toEqual([
      ['demo', 'complementary', 'Demo state'],
      ['demo', 'text', 'Demo'],
      ['demo', 'status', 'Saved'],
      ['notices', 'status', 'Offline'],
    ])
  })
})
