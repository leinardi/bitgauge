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

// The fixed routes under the base path of the page's meta element (architecture.md section 3).

import { afterEach, describe, expect, it } from 'vitest'
import { createMemoryHistory } from 'vue-router'

import { appHistory, createAppRouter } from '@/router'
import { readBasePath } from '@/router/base'

function page(content: string | null): Document {
  const doc = document.implementation.createHTMLDocument('BitGauge')
  if (content !== null) {
    const meta = doc.createElement('meta')
    meta.name = 'bitgauge-base-path'
    meta.content = content
    doc.head.append(meta)
  }
  return doc
}

describe('the base path', () => {
  it.each([
    ['/speed', '/speed'],
    ['/', '/'],
    ['', '/'],
    [null, '/'],
  ])('reads %j from the meta element as %j', (content, base) => {
    expect(readBasePath(page(content))).toBe(base)
  })

  it('is the history base of the router', () => {
    expect(appHistory(page('/speed')).base).toBe('/speed')
  })
})

describe('the routes', () => {
  afterEach(() => {
    window.history.replaceState(null, '', '/')
  })

  it.each([
    ['/', 'test'],
    ['/about', 'about'],
    ['/history', 'history'],
    ['/settings', 'settings'],
    ['/result/abc', 'result'],
  ])('resolve %s to %s', (path, name) => {
    expect(createAppRouter(createMemoryHistory()).resolve(path).name).toBe(name)
  })

  it('match nothing else', () => {
    expect(createAppRouter(createMemoryHistory()).resolve('/unknown').matched).toHaveLength(0)
  })

  it('resolve under the base path', () => {
    window.history.replaceState(null, '', '/speed/about')
    const router = createAppRouter(appHistory(page('/speed')))
    expect(router.resolve('/about').href).toBe('/speed/about')
  })
})
