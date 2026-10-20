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

// The content layer: what each page says, read through the accessibility tree. Siblings are aligned
// by role and name with a longest common subsequence, so one missing row is one finding rather than a
// cascade of "changed" for every row after it.

import { finding, type Finding } from '../findings.ts'
import { comparableAttrs, normalizeText, roleClass } from '../normalize.ts'
import type { AriaNode } from './ariaTree.ts'

// The regions a page is read in. A region the page does not render at all is an empty list, so a
// region one side has and the other lacks shows up as findings rather than as an error.
export type Region = 'header' | 'main' | 'notices' | 'dialogs'

export type RegionTrees = Record<Region, AriaNode[]>

// The regions the style and layout layers read: the content layer's, and the demo panel. The panel's
// controls differ on purpose (frontend.md section 9: Vue has the kit's as far as the app goes), so
// what it says is never compared, only how what both sides have looks and sits.
export type LookRegion = Region | 'demo'

export function isContentRegion(region: LookRegion): region is Region {
  return region !== 'demo'
}

// Longest name a path segment keeps: enough to tell siblings apart, short enough that a row's whole
// text does not become part of every finding under it.
const SEGMENT_NAME = 48

function describe(node: AriaNode, max = Number.POSITIVE_INFINITY): string {
  const full = normalizeText(node.name)
  const name = full.length > max ? `${full.slice(0, max - 1)}…` : full
  return name === '' ? node.role : `${node.role} "${name}"`
}

function segment(path: string, node: AriaNode): string {
  return `${path} > ${describe(node, SEGMENT_NAME)}`
}

function textOf(node: AriaNode): string {
  return node.children.length === 0 ? node.name : node.children.map(textOf).join(' ')
}

// A row, cell or card named from its own content changes name whenever its content does, and the
// content's own findings already say how; only a name that is not its content (an aria-label) is a
// difference of its own.
function nameFromContent(node: AriaNode): boolean {
  const squash = (s: string): string => normalizeText(s).replace(/\s+/g, '')
  return node.children.length > 0 && squash(node.name) === squash(textOf(node))
}

// Context kept on each side of a changed stretch of text.
const CONTEXT = 24

// "a" → "b" with the common start and end cut down to a little context, so a change deep inside a
// long card text stays readable and its identity does not depend on how the line was truncated.
export function textChange(a: string, b: string): string {
  let start = 0
  while (start < a.length && start < b.length && a[start] === b[start]) start++
  let end = 0
  while (end < a.length - start && end < b.length - start && a[a.length - 1 - end] === b[b.length - 1 - end]) end++
  const from = Math.max(0, start - CONTEXT)
  const clip = (s: string): string => {
    const to = Math.min(s.length, s.length - end + CONTEXT)
    return `${from > 0 ? '…' : ''}${s.slice(from, to)}${to < s.length ? '…' : ''}`
  }
  return `"${clip(a)}" → "${clip(b)}"`
}

// A page can hold several live regions, and which one carries a given message is a choice of
// structure, not something a person sees: the prototype says everything in one region, the app
// splits the phase announcements from the result summary. A live region therefore pairs with the
// leftover one on the other side whose text shares the most words with it, not with the first.
const LIVE_ROLES = new Set(['status', 'alert', 'log'])

function words(node: AriaNode): Set<string> {
  return new Set(normalizeText(textOf(node)).toLowerCase().split(/[^\p{L}\p{N}#]+/u).filter((word) => word !== ''))
}

function shared(a: Set<string>, b: Set<string>): number {
  let count = 0
  for (const word of a) if (b.has(word)) count++
  return count
}

function pick(proto: AriaNode, candidates: readonly AriaNode[]): number {
  const same = (vue: AriaNode) => roleClass(vue.role) === roleClass(proto.role)
  const first = candidates.findIndex(same)
  if (first === -1 || !LIVE_ROLES.has(proto.role)) return first
  const own = words(proto)
  let best = first
  let bestShared = -1
  candidates.forEach((vue, index) => {
    const count = same(vue) ? shared(own, words(vue)) : -1
    if (count > bestShared) {
      best = index
      bestShared = count
    }
  })
  return best
}

function key(node: AriaNode): string {
  // A live region's message is its text, so only the same message aligns it as an anchor; otherwise
  // it is paired by its words (pick).
  const text = LIVE_ROLES.has(node.role) ? `\u0000${normalizeText(textOf(node))}` : ''
  return `${roleClass(node.role)}\u0000${normalizeText(node.name)}${text}`
}

// Index pairs of the longest common subsequence of the two key lists.
function lcs(a: readonly string[], b: readonly string[]): [number, number][] {
  const rows = a.length + 1
  const cols = b.length + 1
  const table = new Uint32Array(rows * cols)
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i * cols + j] =
        a[i] === b[j]
          ? (table[(i + 1) * cols + j + 1] ?? 0) + 1
          : Math.max(table[(i + 1) * cols + j] ?? 0, table[i * cols + j + 1] ?? 0)
    }
  }
  const pairs: [number, number][] = []
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      pairs.push([i, j])
      i++
      j++
    } else if ((table[(i + 1) * cols + j] ?? 0) >= (table[i * cols + j + 1] ?? 0)) {
      i++
    } else {
      j++
    }
  }
  return pairs
}

function compareNodes(proto: AriaNode, vue: AriaNode, path: string, out: Finding[]): void {
  const here = segment(path, proto)
  const protoAttrs = comparableAttrs(proto.attrs).join(' ')
  const vueAttrs = comparableAttrs(vue.attrs).join(' ')
  if (protoAttrs !== vueAttrs) out.push(finding('content', here, 'attrs', `[${protoAttrs}] → [${vueAttrs}]`))
  compareLists(proto.children, vue.children, here, out)
}

// Between two aligned anchors, leftover siblings of the same role class are the same element with a
// different name; whatever is still left over exists on one side only.
function compareGap(protoGap: AriaNode[], vueGap: AriaNode[], path: string, out: Finding[]): void {
  const unmatchedVue = [...vueGap]
  for (const proto of protoGap) {
    const index = pick(proto, unmatchedVue)
    const vue = index === -1 ? undefined : unmatchedVue.splice(index, 1)[0]
    if (vue === undefined) {
      out.push(finding('content', path, 'missing', describe(proto)))
      continue
    }
    if (normalizeText(proto.name) !== normalizeText(vue.name) && !(nameFromContent(proto) && nameFromContent(vue))) {
      out.push(finding('content', path, 'changed', `${proto.role} ${textChange(normalizeText(proto.name), normalizeText(vue.name))}`))
    }
    compareLists(proto.children, vue.children, segment(path, proto), out)
  }
  for (const vue of unmatchedVue) out.push(finding('content', path, 'extra', describe(vue)))
}

function compareLists(proto: readonly AriaNode[], vue: readonly AriaNode[], path: string, out: Finding[]): void {
  const pairs = lcs(proto.map(key), vue.map(key))
  let i = 0
  let j = 0
  for (const [pi, vj] of [...pairs, [proto.length, vue.length] as [number, number]]) {
    compareGap(proto.slice(i, pi), vue.slice(j, vj), path, out)
    const p = proto[pi]
    const v = vue[vj]
    if (p !== undefined && v !== undefined) compareNodes(p, v, path, out)
    i = pi + 1
    j = vj + 1
  }
}

export function compareContent(proto: RegionTrees, vue: RegionTrees, regions: readonly Region[]): Finding[] {
  const out: Finding[] = []
  for (const region of regions) compareLists(proto[region], vue[region], region, out)
  return out
}
