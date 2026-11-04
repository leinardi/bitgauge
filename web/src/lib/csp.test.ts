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

// @vitest-environment node

// The one inline style the SPA inserts (security.md section 5): reka-ui's SelectViewport renders a
// fixed <style> that hides the list's scrollbar, which the server's CSP allows by its SHA-256. This
// hashes the text in the installed package against the hash the server sends, so an upgrade that
// changes the text fails here until the hash is updated in src/server/classify.rs and
// security.md together.

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

describe('the CSP style hash', () => {
  it('is the SHA-256 of the style text reka-ui SelectViewport inserts', () => {
    const source = read('../../node_modules/reka-ui/dist/Select/SelectViewport.js')
    const style = /as: "style",[\s\S]*?createTextVNode\("((?:[^"\\]|\\.)*)", -1\)/u.exec(source)?.[1]
    expect(style).toBeDefined()
    const hash = `'sha256-${createHash('sha256').update(JSON.parse(`"${style}"`) as string).digest('base64')}'`
    const server = /STYLE_HASH: &str = "('sha256-[^']+')"/u.exec(read('../../../src/server/classify.rs'))?.[1]
    expect(server).toBe(hash)
    expect(read('../../../docs/features/security.md')).toContain(hash)
  })
})
