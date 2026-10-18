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

import { normalizeTree, normalizeValue, PAGE_HOST, PAGE_SCHEME } from '../normalize.ts'
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

  it('pairs a live region with the one that says the most of the same, not the first', () => {
    const proto = '- heading "Speed test" [level=1]\n- status: Upload finished. Test complete.'
    const vue = '- heading "Speed test" [level=1]\n- status: Upload result: 438 megabits per second\n- status: Test complete. Download 612 megabits per second.'
    expect(diff(proto, vue)).toEqual([
      'changed main > status | text "Upload finished. Test complete." → "Test complete. Download # megabits per second."',
      'extra main | status',
    ])
  })

  it('treats an empty live region as nothing, and a live region with text as content', () => {
    expect(diff('- heading "Speed test" [level=1]', '- heading "Speed test" [level=1]\n- status')).toEqual([])
    expect(diff('- heading "Speed test" [level=1]', '- heading "Speed test" [level=1]\n- status: Download started')).toEqual([
      'extra main | status',
    ])
  })
})

describe('normalizeTree', () => {
  it("reads each side's own page host as one token, and no other host", () => {
    const tree = parseAriaSnapshot('- text: Basement NAS, connected speed.home.lan, not example.org')
    expect(normalizeTree(tree, 'speed.home.lan')[0]?.name).toBe(`Basement NAS, connected ${PAGE_HOST}, not example.org`)
    expect(normalizeTree(tree)[0]?.name).toBe('Basement NAS, connected speed.home.lan, not example.org')
  })

  it("reads http and https before the page host as one scheme, and no other host's", () => {
    const kit = parseAriaSnapshot('- text: https://speed.home.lan/?run=1 and https://example.org')
    const vue = parseAriaSnapshot('- text: http://127.0.0.1:5182/?run=1 and https://example.org')
    const read = `${PAGE_SCHEME}://${PAGE_HOST}/?run=1 and https://example.org`
    expect(normalizeTree(kit, 'speed.home.lan')[0]?.name).toBe(read)
    expect(normalizeTree(vue, '127.0.0.1:5182')[0]?.name).toBe(read)
  })
})

describe('normalizeValue', () => {
  it.each([
    ['Download 605 Mbit/s peak 667 Mbit/s', 'Download # Mbit/s peak # Mbit/s'],
    ['Upload · sending 19.2 kbit/s', 'Upload · sending # kbit/s'],
    ['Upload result: 424 megabits per second', 'Upload result: # megabits per second'],
    ['Data used 1.21 GB Duration 27.7 s', 'Data used # B Duration # s'],
    ['Data used 997 MB, then 76.5 kB', 'Data used # B, then # B'],
    ['Data used 1.15 gigabytes. Data used 956 kilobytes. Data used 0 bytes.', 'Data used # bytes. Data used # bytes. Data used # bytes.'],
    ['Protocol h2 Streams 2 auto, up to 6', 'Protocol h2 Streams # auto, up to 6'],
    ['Idle latency done · 2.9 ms, 0 % probe timeouts', 'Idle latency done · # ms, # % probe timeouts'],
    ['Auto-start in 3 seconds, 2.5 s left', 'Auto-start in # seconds, # s left'],
    ['Test complete 5:41:54 PM', 'Test complete #:#:# #M'],
    ['Test complete 8:02:10 AM', 'Test complete #:#:# #M'],
    ['Download 597 Mbit/s avg so far 597 · peak 610', 'Download # Mbit/s avg so far # · peak #'],
    ['Latency 3.2 ms median 3.1 · ping 14 of 20', 'Latency # ms median # · ping 14 of 20'],
    ['Download 612 Mbit/s peak 641 · 6 streams · plateau: cap', 'Download # Mbit/s peak # · 6 streams · plateau: cap'],
    ['Upload Live 438 Mbit/s peak 455 Idle latency', 'Upload Live # Mbit/s peak # Idle latency'],
    ['Idle latency 3.1 ms min 2.4 · p90 4.1 ms', 'Idle latency # ms min # · p90 # ms'],
    ['Upload 438 Mbit/s based on a 3.6 s steady window · 21 requests', 'Upload # Mbit/s based on a # s steady window · # requests'],
    ['in-flight requests were aborted, and the 21 requests confirmed by 13.1 s give', 'in-flight requests were aborted, and the # requests confirmed by # s give'],
  ])('reads %j as %j', (raw, normalized) => {
    expect(normalizeValue(raw)).toBe(normalized)
  })

  it('keeps every number that is not a measured value', () => {
    for (const fixed of ['Streams — auto, up to 6 streams', 'IPv4 192.168.1.42', 'HTTP/2', 'v1.4.0', 'p90', 'Download pending · ~10–20 s', 'log scale · 1 Mbit/s – 10 Gbit/s', '1 – 1000 ms', 'Connection lost 12 of 20 pings', 'median of 11 pings', 'error · 3 requests in a row failed', 'the 3 requests in a row']) {
      expect(normalizeValue(fixed)).toBe(fixed)
    }
  })
})

describe('textChange', () => {
  it('cuts the shared start and end down to some context', () => {
    const before = `${'x'.repeat(60)} Jitter — ${'y'.repeat(60)}`
    const after = `${'x'.repeat(60)} Jitter 0.8 ms ${'y'.repeat(60)}`
    expect(textChange(before, after)).toBe(`"…${'x'.repeat(16)} Jitter — ${'y'.repeat(23)}…" → "…${'x'.repeat(16)} Jitter 0.8 ms ${'y'.repeat(23)}…"`)
  })
})
