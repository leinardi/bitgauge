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

import type { Browser, BrowserContextOptions, Page } from '@playwright/test'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { ALL_PROJECTS } from './selection.ts'
import { openSide, waitForSettled } from './settle.ts'
import type { SideDriver } from './side.ts'

const driver: SideDriver = {
  side: 'proto',
  startUrl: 'http://127.0.0.1:5181/ui_kits/app/index.html',
  overlaySelector: '[role=dialog]',
  toastSelector: '.toast',
  styleRegions: [],
  pageHost: '127.0.0.1:5180',
  prepare: () => Promise.resolve(),
}

/** A page over this jsdom document: evaluate runs in it, and the main element is waited for. */
function page(visited: string[] = []): Page {
  return {
    goto: (url: string) => {
      visited.push(url)
      return Promise.resolve(null)
    },
    locator: () => ({ first: () => ({ waitFor: () => Promise.resolve() }) }),
    evaluate: (fn: (arg: unknown) => unknown, arg: unknown) => Promise.resolve(fn(arg)),
  } as unknown as Page
}

describe('settle', () => {
  beforeEach(() => {
    Object.defineProperty(document, 'fonts', { value: { ready: Promise.resolve() }, configurable: true })
  })

  afterEach(() => {
    document.body.replaceChildren()
  })

  it('opens a side with the project media, the fixed instant and nothing off the allowlisted hosts', async () => {
    const project = ALL_PROJECTS.find((p) => p.name === 'dark-narrow')
    if (project === undefined) throw new Error('no dark-narrow project')
    let options: BrowserContextOptions | undefined
    const fixed: Date[] = []
    const routes: string[] = []
    const visited: string[] = []
    const browser = {
      newContext: (given: BrowserContextOptions) => {
        options = given
        return Promise.resolve({
          route: (pattern: string) => {
            routes.push(pattern)
            return Promise.resolve()
          },
          clock: {
            setFixedTime: (time: Date) => {
              fixed.push(time)
              return Promise.resolve()
            },
          },
          newPage: () => Promise.resolve(page(visited)),
        })
      },
    } as unknown as Browser
    const prepared: unknown[] = []
    await openSide(browser, { ...driver, prepare: (context) => Promise.resolve(void prepared.push(context)) }, project)
    expect(prepared).toHaveLength(1)
    expect(options).toEqual({ viewport: { width: 390, height: 844 }, colorScheme: 'dark', reducedMotion: 'reduce', timezoneId: 'UTC', locale: 'en-US' })
    expect(routes).toEqual(['**/*'])
    expect(fixed.map((time) => time.toISOString())).toEqual(['2026-09-30T08:20:00.000Z'])
    expect(visited).toEqual([driver.startUrl])
  })

  it('waits until the page has stopped changing', async () => {
    let lastChange = Number.NaN
    const ticking = setInterval(() => {
      document.body.append(document.createElement('span'))
      lastChange = performance.now()
    }, 100)
    setTimeout(() => clearInterval(ticking), 450)
    await waitForSettled(page())
    // Settled only once the changes stopped, and 300 ms after the last of them.
    expect(document.body.childElementCount).toBeGreaterThanOrEqual(3)
    expect(performance.now() - lastChange).toBeGreaterThanOrEqual(290)
  })
})
