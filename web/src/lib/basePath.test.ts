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

// The base-path check of edge-cases.md section 20 on plain values.

import { describe, expect, it } from 'vitest'

import { apiMismatch, normalizeBasePath, pageMismatch, routeUnder } from '@/lib/basePath'

const ROUTES = new Set(['/', '/about', '/history', '/settings'])
const isRoute = (path: string) => ROUTES.has(path) || /^\/result\/[^/]+$/.test(path)

describe('normalizeBasePath', () => {
  it.each([
    ['/', '/'],
    ['', '/'],
    ['/speed/', '/speed'],
    ['/speed', '/speed'],
    ['speed', '/speed'],
  ])('reads %j as %j', (path, base) => {
    expect(normalizeBasePath(path)).toBe(base)
  })
})

describe('routeUnder', () => {
  it.each([
    ['/about', '/', '/about'],
    ['/speed', '/speed', '/'],
    ['/speed/', '/speed/', '/'],
    ['/speed/result/x', '/speed', '/result/x'],
    ['/speedy/', '/speed', null],
    ['/', '/speed', null],
  ])('puts %s under %s at %j', (pathname, base, route) => {
    expect(routeUnder(pathname, base)).toBe(route)
  })
})

describe('pageMismatch', () => {
  it('passes a fixed route under the base path', () => {
    expect(pageMismatch('/speed/about', '/speed', isRoute)).toBeNull()
    expect(pageMismatch('/', '/', isRoute)).toBeNull()
  })

  it('fails a page outside the base path', () => {
    expect(pageMismatch('/', '/speed/', isRoute)).toEqual({ pagePath: '/', basePath: '/speed', apiBasePath: null })
  })

  it('fails a page whose path under the base path is no fixed route', () => {
    expect(pageMismatch('/speed/', '/', isRoute)).toEqual({ pagePath: '/speed/', basePath: '/', apiBasePath: null })
  })
})

describe('apiMismatch', () => {
  it('passes the same base path written either way', () => {
    expect(apiMismatch('/speed/', '/speed', '/speed/')).toBeNull()
  })

  it('fails a different one', () => {
    expect(apiMismatch('/speed/', '/speed', '/')).toEqual({ pagePath: '/speed/', basePath: '/speed', apiBasePath: '/' })
  })
})
