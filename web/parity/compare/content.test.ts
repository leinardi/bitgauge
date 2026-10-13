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

import { describe, expect, it } from 'vitest'

import { normalizeTree } from '../normalize.ts'
import { parseAriaSnapshot } from './ariaTree.ts'
import { compareContent, textChange, type RegionTrees } from './content.ts'

function trees(main: string): RegionTrees {
  return { header: [], main: normalizeTree(parseAriaSnapshot(main)), notices: [], dialogs: [] }
}

function diff(proto: string, vue: string) {
  return compareContent(trees(proto), trees(vue), ['main']).map((f) => `${f.kind} ${f.path} | ${f.detail}`)
}

describe('parseAriaSnapshot', () => {
  it('reads roles, names, attributes, inline text and quoted keys', () => {
    const [heading, button, para] = parseAriaSnapshot(
      ['- heading "Speed test" [level=1]', '- button "Open x":', '  - text: x', "- 'paragraph \"a: b\"': \"quoted: value\""].join('\n'),
    )
    expect(heading).toMatchObject({ role: 'heading', name: 'Speed test', attrs: ['level=1'] })
    expect(button?.children).toEqual([{ role: 'text', name: 'x', attrs: [], children: [] }])
    expect(para).toMatchObject({ role: 'paragraph', name: 'a: b', children: [{ role: 'text', name: 'quoted: value' }] })
  })

  it('drops properties such as /url', () => {
    expect(parseAriaSnapshot('- link "Docs":\n  - /url: /docs')).toEqual([{ role: 'link', name: 'Docs', attrs: [], children: [] }])
  })
})

describe('compareContent', () => {
  it('finds nothing between equivalent markup', () => {
    // A link reads as a button, a paragraph as its text, and a decorative icon as nothing.
    const proto = '- button "About":\n  - img\n  - text: About\n- text: Intro'
    const vue = '- link "About":\n  - /url: /about\n- paragraph: Intro'
    expect(diff(proto, vue)).toEqual([])
  })

  it('reports one missing row instead of a cascade of changes', () => {
    const proto = '- button "a"\n- button "b"\n- button "c"'
    const vue = '- button "a"\n- button "c"'
    expect(diff(proto, vue)).toEqual(['missing main | button "b"'])
  })

  it('reports a renamed element, an extra one and a changed state', () => {
    const proto = '- heading "Result" [level=1]\n- button "Copy result for x"'
    const vue = '- heading "Result" [level=2]\n- button "Copy result"\n- button "Download JSON"'
    expect(diff(proto, vue)).toEqual([
      'attrs main > heading "Result" | [level=1] → [level=2]',
      'changed main | button "Copy result for x" → "Copy result"',
      'extra main | button "Download JSON"',
    ])
  })

  it('does not report a row renamed only because its cells changed', () => {
    const proto = '- row "Download 2026-09-30":\n  - cell "Download"\n  - cell "2026-09-30"'
    const vue = '- row "Download 9/30/2026":\n  - cell "Download"\n  - cell "9/30/2026"'
    expect(diff(proto, vue)).toEqual(['changed main > row "Download 2026-09-30" | cell "2026-09-30" → "9/30/2026"'])
  })

  it('treats an empty live region as nothing, and a live region with text as content', () => {
    expect(diff('- heading "Speed test" [level=1]', '- heading "Speed test" [level=1]\n- status')).toEqual([])
    expect(diff('- heading "Speed test" [level=1]', '- heading "Speed test" [level=1]\n- status: Download started')).toEqual([
      'extra main | status',
    ])
  })
})

describe('textChange', () => {
  it('cuts the shared start and end down to some context', () => {
    const before = `${'x'.repeat(60)} Jitter — ${'y'.repeat(60)}`
    const after = `${'x'.repeat(60)} Jitter 0.8 ms ${'y'.repeat(60)}`
    expect(textChange(before, after)).toBe(`"…${'x'.repeat(16)} Jitter — ${'y'.repeat(23)}…" → "…${'x'.repeat(16)} Jitter 0.8 ms ${'y'.repeat(23)}…"`)
  })
})
