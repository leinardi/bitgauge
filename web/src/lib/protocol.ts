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

// The negotiated protocol as ui/screens.md section 6 labels it, from a request's nextHopProtocol
// token; an empty or `unknown` token was not reported.

const LABELS: Partial<Record<string, string>> = { 'http/1.1': 'HTTP/1.1', h2: 'HTTP/2', h3: 'HTTP/3' }

/** HTTP/1.1, HTTP/2 or HTTP/3; another token as it is; null when the protocol was not reported. */
export function protocolLabel(token: string | null | undefined): string | null {
  if (token === null || token === undefined || token === '' || token === 'unknown') {
    return null
  }
  return LABELS[token] ?? token
}
