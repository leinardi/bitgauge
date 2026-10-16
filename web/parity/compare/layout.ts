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

// The layout layer: the same element on both sides should sit in the same place at the same size.
// The content layer reads what a page says and the style layer how a bounded set of controls is
// drawn; neither sees a line that wraps, a row that grows or a box that moves. This layer measures
// every element that renders text of its own, every landmark, list, group, figure and image, and the
// region roots, pairs them as the style layer does (region, role class, name, occurrence), and
// compares the boxes of the pairs.
//
// A box is compared relative to the nearest ancestor both sides have, not to the page: a wrapper only
// one side's markup has never serves as the reference, and a row that grows is reported at the row,
// not again on everything below it. A region root is compared against the viewport, so a region that
// moves as a whole is reported once, on its root.

import type { Page } from '@playwright/test'

import { finding, type Finding } from '../findings.ts'
import { normalizeText, normalizeValue } from '../normalize.ts'
import type { LookRegion } from './content.ts'
import { elementPath, LENGTH_TOLERANCE_PX, nameElements, pairingKey } from './style.ts'

export interface Box {
  x: number
  y: number
  width: number
  height: number
}

export interface LaidOutElement {
  region: LookRegion
  role: string
  // The name as the content layer would read it (normalize.ts), cut short; `raw` is what the page
  // said, which tells a measured value apart.
  name: string
  raw: string
  occurrence: number
  box: Box
  // Indexes of the measured ancestors in the same region, nearest first. Empty for a region root.
  ancestors: number[]
}

type RawElement = Omit<LaidOutElement, 'name' | 'occurrence'> & { name: string }

// Runs in the page. Kept self-contained: Playwright serializes it, so it cannot close over anything.
function collect({ regionRoots }: { regionRoots: [string, string][] }) {
  // What is measured besides text: the style layer's controls, landmarks, lists, groups, figures,
  // images and canvases, and any element with an explicit role.
  const SELECTOR = [
    'h1, h2, h3, h4, button, a[href], th, td, tr, table',
    'main, header, nav, aside, section, article, form, fieldset',
    'ul, ol, li, dl, dt, dd, figure, img, svg[role=img], canvas, [role]',
  ].join(', ')
  const IMPLICIT: Record<string, string> = {
    H1: 'heading', H2: 'heading', H3: 'heading', H4: 'heading', BUTTON: 'button', A: 'link', TH: 'columnheader', TD: 'cell', TR: 'row',
    TABLE: 'table', MAIN: 'main', HEADER: 'banner', NAV: 'navigation', ASIDE: 'complementary', ARTICLE: 'article', FORM: 'form',
    FIELDSET: 'group', UL: 'list', OL: 'list', LI: 'listitem', DL: 'list', DT: 'term', DD: 'definition', FIGURE: 'figure', IMG: 'img',
    CANVAS: 'canvas',
  }
  // Roles whose name is the text they hold. Any other container is named by its label alone, so a
  // list or a region pairs by its label and its occurrence, not by everything inside it.
  const NAMED_BY_CONTENT = new Set(['button', 'link', 'heading', 'tab', 'radio', 'checkbox', 'switch', 'option', 'menuitem', 'columnheader', 'cell', 'listitem', 'term', 'definition', 'status', 'alert', 'tooltip'])
  const UNRENDERED = new Set(['SCRIPT', 'STYLE', 'TEMPLATE', 'NOSCRIPT', 'TITLE'])

  const ownText = (el: Element): string =>
    [...el.childNodes].filter((node) => node.nodeType === Node.TEXT_NODE).map((node) => node.textContent ?? '').join(' ')
  // Rendered text, which leaves out what is not displayed; an SVG element has only its source text.
  const shownText = (el: Element): string => (el instanceof HTMLElement ? el.innerText : (el.textContent ?? ''))
  const labelOf = (el: Element): string | null => {
    const label = el.getAttribute('aria-label')
    if (label !== null) return label
    const ids = el.getAttribute('aria-labelledby')
    if (ids === null) return null
    return ids
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent ?? '')
      .join(' ')
  }
  const roleOf = (el: Element): string | null => {
    const explicit = el.getAttribute('role')?.split(/\s+/)[0]
    if (explicit !== undefined && explicit !== 'none' && explicit !== 'presentation') return explicit
    // A section is a region only when it is labeled; unlabeled, it is a box like any div.
    if (el.tagName === 'SECTION') return labelOf(el) === null ? null : 'region'
    if (el.tagName === 'A' && !el.hasAttribute('href')) return null
    return IMPLICIT[el.tagName] ?? null
  }
  // Drawn: rendered, not hidden, not fully transparent, with a box. aria-hidden is not a reason to
  // leave an element out: decorative text (a chart's axis labels) is hidden from screen readers and
  // still seen.
  const drawn = (el: Element, rect: DOMRect): boolean =>
    rect.width > 0 && rect.height > 0 && el.checkVisibility({ visibilityProperty: true, opacityProperty: true })
  // Shown to screen readers only: it, or an ancestor, is clipped to a box of at most 1 px.
  const screenReaderOnly = (el: Element): boolean => {
    for (let node: Element | null = el; node !== null; node = node.parentElement) {
      const box = node.getBoundingClientRect()
      if (box.width <= 1 && box.height <= 1 && getComputedStyle(node).overflow !== 'visible') return true
    }
    return false
  }

  const candidates = new Set<Element>(document.querySelectorAll(SELECTOR))
  for (const [, selector] of regionRoots) for (const root of document.querySelectorAll(selector)) candidates.add(root)
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    const parent = node.parentElement
    if (parent !== null && /\S/.test(node.textContent ?? '') && !UNRENDERED.has(parent.tagName)) candidates.add(parent)
  }

  const regionOf = (el: Element): string | undefined => regionRoots.find(([, selector]) => el.closest(selector) !== null)?.[0]
  const indexOf = new Map<Element, number>()
  const regionAt: string[] = []
  const out: { region: string; role: string; name: string; raw: string; box: { x: number; y: number; width: number; height: number }; ancestors: number[] }[] = []
  // Document order, so occurrences count the same way on both sides.
  for (const el of document.querySelectorAll('*')) {
    if (!candidates.has(el)) continue
    const region = regionOf(el)
    if (region === undefined) continue
    const rect = el.getBoundingClientRect()
    if (!drawn(el, rect) || screenReaderOnly(el)) continue
    const own = ownText(el)
    const isRoot = regionRoots.some(([r, selector]) => r === region && el.matches(selector))
    const role = roleOf(el) ?? (/\S/.test(own) ? 'text' : isRoot ? el.tagName.toLowerCase() : null)
    if (role === null) continue
    const label = labelOf(el)
    const name = label ?? (role === 'text' ? own : role === 'img' ? (el.getAttribute('alt') ?? '') : NAMED_BY_CONTENT.has(role) ? shownText(el) : '')
    const ancestors: number[] = []
    for (let up = el.parentElement; up !== null; up = up.parentElement) {
      const index = indexOf.get(up)
      if (index !== undefined && regionAt[index] === region) ancestors.push(index)
    }
    indexOf.set(el, out.length)
    regionAt.push(region)
    out.push({ region, role, name, raw: name, box: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }, ancestors })
  }
  return out
}

// Named as the style layer names its elements. The raw name is kept, since whether an element shows
// a measured value decides what of its box is compared.
export function nameLayout(raw: readonly RawElement[]): LaidOutElement[] {
  return nameElements(raw.map((el) => ({ ...el, raw: el.name })))
}

export async function collectLayout(page: Page, regionRoots: readonly [LookRegion, string][]): Promise<LaidOutElement[]> {
  const raw = await page.evaluate(collect, { regionRoots: [...regionRoots] })
  return nameLayout(raw as RawElement[])
}

// An element that shows a measured value (a rate, a latency, a size, a time of day: normalize.ts)
// has a width that follows the number, and an x that follows it when it is right-aligned, from run to
// run; its top and height do not. Whitespace alone ("Start\n test") is not a measured value.
function holdsMeasuredValue(el: LaidOutElement): boolean {
  return normalizeValue(el.raw) !== normalizeText(el.raw)
}

const VIEWPORT: Box = { x: 0, y: 0, width: 0, height: 0 }

// The reference box of a pair: the nearest ancestor of the prototype's element whose partner is an
// ancestor of the Vue element. The region root is the last ancestor in the chain, so it is the
// reference when nothing nearer pairs; a region root itself, or an element whose roots do not pair,
// is placed against the viewport.
function anchors(
  p: LaidOutElement,
  v: LaidOutElement,
  proto: readonly LaidOutElement[],
  vue: readonly LaidOutElement[],
  partnerOf: Map<number, number>,
): [Box, Box] {
  for (const ancestor of p.ancestors) {
    const partner = partnerOf.get(ancestor)
    if (partner !== undefined && v.ancestors.includes(partner)) {
      const a = proto[ancestor]
      const b = vue[partner]
      if (a !== undefined && b !== undefined) return [a.box, b.box]
    }
  }
  return [VIEWPORT, VIEWPORT]
}

function differs(a: number, b: number): boolean {
  return Math.abs(a - b) > LENGTH_TOLERANCE_PX
}

export function compareLayout(proto: readonly LaidOutElement[], vue: readonly LaidOutElement[], regions: readonly LookRegion[]): Finding[] {
  const vueIndex = new Map(vue.map((el, index) => [pairingKey(el), index]))
  const partnerOf = new Map<number, number>()
  proto.forEach((el, index) => {
    const partner = vueIndex.get(pairingKey(el))
    if (partner !== undefined) partnerOf.set(index, partner)
  })
  const out: Finding[] = []
  for (const [index, p] of proto.entries()) {
    if (!regions.includes(p.region)) continue
    const partner = partnerOf.get(index)
    const v = partner === undefined ? undefined : vue[partner]
    if (v === undefined) continue
    const [pa, va] = anchors(p, v, proto, vue, partnerOf)
    const measured = holdsMeasuredValue(p) || holdsMeasuredValue(v)
    const sides: [string, number, number][] = [
      ['x', p.box.x - pa.x, v.box.x - va.x],
      ['y', p.box.y - pa.y, v.box.y - va.y],
      ['width', p.box.width, v.box.width],
      ['height', p.box.height, v.box.height],
    ]
    for (const [kind, a, b] of sides) {
      if (measured && (kind === 'x' || kind === 'width')) continue
      if (differs(a, b)) out.push(finding('layout', elementPath(p), kind, `${Math.round(a)}px → ${Math.round(b)}px`))
    }
  }
  return out
}
