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

import type { AriaNode } from './compare/ariaTree.ts'

// What the comparison deliberately treats as equal. Every rule here hides a class of difference from
// the harness for good, so each one says why that difference is not one a person would see.

// Roles that read and behave the same to a person. A link and a button are both pressed to go
// somewhere or do something, and a prototype built for looks picks between them freely (its
// navigation items are links to "#" that act on click).
const ROLE_CLASSES: Record<string, string> = {
  link: 'button',
}

export function roleClass(role: string): string {
  return ROLE_CLASSES[role] ?? role
}

// ARIA states the comparison ignores. "active" only marks the focused element, which depends on how
// the step got there rather than on what the page shows.
const IGNORED_ATTRS = new Set(['active'])

export function comparableAttrs(attrs: readonly string[]): string[] {
  return attrs.filter((attr) => !IGNORED_ATTRS.has(attr.split('=')[0] ?? attr)).sort()
}

export function normalizeText(text: string): string {
  return text.replace(/[\u200B\u200C\u200D\uFEFF]/g, '').replace(/\s+/g, ' ').trim()
}

// Measured values. The demo measures its simulated link in real time, so every rate, latency, size
// and duration it shows differs a little from run to run, and the prototype's are made-up examples:
// whether a value is right is the engine's and the demo's tests' to say (the demo session tests hold
// the LAN within 5 % of its rate), not parity's. The number becomes "#", so what is compared is
// everything around it: its unit, its label and its qualifiers.
const UNIT = String.raw`(?:[GMk]?bit\/s|(?:giga|mega|kilo)?bits per second|[GMk]?B|ms|milliseconds|s|seconds|%)(?![\w/])`
const NUMBER = String.raw`\d+(?:[.,]\d+)*`
// A range is never measured: it is a phase's estimated duration (~10–20 s) or a scale's bounds, so
// it is matched first and kept whole.
const MEASURED = new RegExp(String.raw`(~?${NUMBER}(?: ?${UNIT})? ?– ?${NUMBER}(?: ?${UNIT})?)|(?<![\w.])${NUMBER}(?= ?${UNIT})`, 'g')

// A time of day. The demo stamps a result with the wall clock of its Worker, which the page's fixed
// clock does not reach; the format around the digits is still compared, with a 12-hour clock's
// AM or PM marker read as one marker, so that a run after noon finds the baseline of one before.
const TIME_OF_DAY = /(?<![\w.])\d{1,2}:\d{2}(?::\d{2})?(?: [AP]M)?(?![\w.])/g

// The data a run has used crosses a unit boundary (997 MB, then 1.0 GB) at a slightly different
// instant each run, so its prefix is part of the measured value. A rate's prefix is kept: no demo
// link sits near a boundary, and how a rate is scaled is worth comparing.
const DATA_SIZE = /# [GMk]?B(?![\w/])/g

// The streams a run has open move with the ramp, which a held or stopped run reaches at a slightly
// different instant each run.
const STREAMS_IN_USE = /\bStreams \d+\b/g

// The gauge's note words measured values without their unit, which the readout above it carries:
// the steady average and peak so far ("avg so far 597 · peak 610") and the running median ("median
// 3.1"). They differ from run to run like any other measured value; the words around them, and the
// ping counter beside the median, are still compared.
const GAUGE_NOTE = new RegExp(String.raw`\b(avg so far) ${NUMBER} · (peak) ${NUMBER}|\b(median) ${NUMBER}(?= ·)`, 'g')

// The result tiles word a peak and a minimum without the unit their headline or their p90 carries
// ("peak 641 · 6 streams", "min 2.4 · p90 4.1 ms"); a live tile's peak follows the run like any
// other measured value. A stopped upload's steady window counts the requests it confirmed ("based
// on a 3.6 s steady window · 21 requests"), which move with the instant of the stop. The words
// around them, and the stream count, are still compared.
const TILE_VALUE = new RegExp(String.raw`\b(peak|min) ${NUMBER}(?![\w.,/%])`, 'g')
const WINDOW_REQUESTS = new RegExp(String.raw`\b(steady window · )${NUMBER}( requests?)\b`, 'g')

export function normalizeValue(text: string): string {
  return normalizeText(text)
    .replace(TIME_OF_DAY, (time) => time.replace(/\d+/g, '#').replace(/[AP]M$/, '#M'))
    .replace(MEASURED, (_value, range: string | undefined) => range ?? '#')
    .replace(DATA_SIZE, '# B')
    .replace(STREAMS_IN_USE, 'Streams #')
    .replace(GAUGE_NOTE, (_note, avg: string | undefined, peak: string | undefined, median: string | undefined) => (median === undefined ? `${avg} # · ${peak} #` : `${median} #`))
    .replace(TILE_VALUE, '$1 #')
    .replace(WINDOW_REQUESTS, '$1#$2')
}

// Nodes whose children the comparison reads in their place. A paragraph is a <p> on one side and a
// <div> of text on the other, which a person cannot tell apart.
const TRANSPARENT_ROLES = new Set(['paragraph'])

// An unnamed image is a decorative icon, which one side may expose to the accessibility tree and the
// other hide; neither is something a person compares.
function isDecorative(node: AriaNode): boolean {
  return node.role === 'img' && normalizeText(node.name) === ''
}

// A live region with nothing in it shows nothing; whether a side keeps an idle one mounted is not a
// difference a person can see.
const LIVE_ROLES = new Set(['status', 'alert', 'log'])

function isEmptyLiveRegion(node: AriaNode, children: readonly AriaNode[]): boolean {
  return LIVE_ROLES.has(node.role) && normalizeText(node.name) === '' && children.length === 0
}

// The page's own host, which each side shows as the spec asks: the demo's is wherever it is served,
// the prototype's a mocked name. Only the side's own host is replaced, never a host in general.
export const PAGE_HOST = '<page host>'

function replaceHost(text: string, pageHost: string | undefined): string {
  return pageHost === undefined || pageHost === '' ? text : text.split(pageHost).join(PAGE_HOST)
}

export function normalizeTree(nodes: readonly AriaNode[], pageHost?: string): AriaNode[] {
  const out: AriaNode[] = []
  for (const node of nodes) {
    if (isDecorative(node)) continue
    const children = normalizeTree(node.children, pageHost)
    if (isEmptyLiveRegion(node, children)) continue
    if (TRANSPARENT_ROLES.has(node.role)) {
      out.push(...children)
      continue
    }
    const name = normalizeValue(replaceHost(node.name, pageHost))
    // A lone text child that repeats its parent's name is the name again: Playwright leaves it out
    // when the label is the element's only content, and keeps it when an icon sits beside it.
    const only = children.length === 1 ? children[0] : undefined
    const redundant = only?.role === 'text' && only.children.length === 0 && only.name === name
    out.push({ ...node, name, children: redundant ? [] : children })
  }
  // Adjacent text runs are one run of text, however many elements the markup split it into.
  return out.reduce<AriaNode[]>((merged, node) => {
    const last = merged[merged.length - 1]
    if (last?.role === 'text' && node.role === 'text') {
      merged[merged.length - 1] = { ...last, name: `${last.name} ${node.name}` }
    } else {
      merged.push(node)
    }
    return merged
  }, [])
}
