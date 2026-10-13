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

// The base-path check of edge-cases.md section 20: the page must sit under the base path the server
// wrote into index.html, on one of the SPA's fixed routes, and GET /api/v1/info must report the
// same base path. A page that fails it shows the base-path error instead of the application.

/** A base path without its trailing slash, `/` for the root: `/speed/` and `/speed` are one. */
export function normalizeBasePath(path: string): string {
  const trimmed = path.trim().replace(/\/+$/, '')
  return trimmed === '' ? '/' : trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}

/** The route path of `pathname` under `basePath`, or null when the page is not under it. */
export function routeUnder(pathname: string, basePath: string): string | null {
  const base = normalizeBasePath(basePath)
  if (base === '/') {
    return pathname
  }
  if (pathname === base) {
    return '/'
  }
  return pathname.startsWith(`${base}/`) ? pathname.slice(base.length) : null
}

/** What the error screen shows: where the page is and what the server is configured for. */
export interface BasePathMismatch {
  pagePath: string
  basePath: string
  /** The base path GET /api/v1/info reported, when that is what differs. */
  apiBasePath: string | null
}

/** The mismatch of the page's own path, or null when it sits on a fixed route under the base path. */
export function pageMismatch(pathname: string, basePath: string, isRoute: (path: string) => boolean): BasePathMismatch | null {
  const route = routeUnder(pathname, basePath)
  return route !== null && isRoute(route) ? null : { pagePath: pathname, basePath: normalizeBasePath(basePath), apiBasePath: null }
}

/** The mismatch between the page's base path and the one GET /api/v1/info reported, or null. */
export function apiMismatch(pathname: string, basePath: string, apiBasePath: string): BasePathMismatch | null {
  const base = normalizeBasePath(basePath)
  const api = normalizeBasePath(apiBasePath)
  return base === api ? null : { pagePath: pathname, basePath: base, apiBasePath: api }
}
