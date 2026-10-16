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

// The style layer: the same element on both sides should look the same. A bounded set of elements
// (headings, buttons, links, tabs, radios, column headers and status badges) is read with a short
// list of computed properties; elements are paired by region, role, name and occurrence, and only
// paired elements are compared. An element one side lacks is the content layer's to report.

import type { Page } from '@playwright/test'

import { finding, type Finding } from '../findings.ts'
import { normalizeValue, roleClass } from '../normalize.ts'
import type { Region } from './content.ts'

export interface StyledElement {
  region: Region
  role: string
  name: string
  occurrence: number
  props: Record<string, string>
}

// Lengths within this many CSS pixels are the same length: subpixel layout and font rasterizing
// differ between two documents without anyone being able to see it.
const LENGTH_TOLERANCE_PX = 1

const NAME_MAX = 48

const STYLE_PROPS = [
  'font-size',
  'font-weight',
  'line-height',
  'color',
  'background-color',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'column-gap',
  'border-top-left-radius',
  'border-top-width',
  'border-top-color',
  'width',
  'height',
] as const

// Runs in the page. Kept self-contained: Playwright serializes it, so it cannot close over anything.
function collect({ props, regionRoots }: { props: readonly string[]; regionRoots: [string, string][] }) {
  const SELECTOR =
    'h1, h2, h3, h4, button, [role=button], a[href], [role=link], [role=tab], [role=radio], th, [role=columnheader], [role=status]'
  const IMPLICIT: Record<string, string> = { H1: 'heading', H2: 'heading', H3: 'heading', H4: 'heading', BUTTON: 'button', A: 'link', TH: 'columnheader' }
  const canvas = document.createElement('canvas')
  canvas.width = 1
  canvas.height = 1
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  // Computed colors come back in whatever space the stylesheet used (oklch, color-mix, rgb), so
  // both sides are painted through a canvas and read back as sRGB bytes.
  const toRgba = (color: string): string => {
    if (ctx === null) return color
    ctx.clearRect(0, 0, 1, 1)
    ctx.fillStyle = '#000'
    ctx.fillStyle = color
    ctx.fillRect(0, 0, 1, 1)
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data
    return `rgba(${r ?? 0}, ${g ?? 0}, ${b ?? 0}, ${a ?? 0})`
  }
  const nameOf = (el: Element): string => el.getAttribute('aria-label') ?? el.textContent ?? ''
  // Shown to screen readers only: it, or an ancestor, is clipped to a box of at most 1 px, so none of
  // its style renders (a visually hidden live region).
  const screenReaderOnly = (el: Element): boolean => {
    for (let node: Element | null = el; node !== null; node = node.parentElement) {
      const box = node.getBoundingClientRect()
      if (box.width <= 1 && box.height <= 1 && getComputedStyle(node).overflow !== 'visible') return true
    }
    return false
  }
  const out: { region: string; role: string; name: string; props: Record<string, string> }[] = []
  for (const el of document.querySelectorAll(SELECTOR)) {
    if (el.closest('[aria-hidden="true"], [inert]') !== null) continue
    const rect = el.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0 || screenReaderOnly(el)) continue
    const region = regionRoots.find(([, selector]) => el.closest(selector) !== null)?.[0]
    if (region === undefined) continue
    const role = el.getAttribute('role') ?? IMPLICIT[el.tagName] ?? el.tagName.toLowerCase()
    const name = nameOf(el)
    const style = getComputedStyle(el)
    const values: Record<string, string> = {}
    for (const prop of props) {
      if (prop === 'width') values[prop] = `${rect.width.toFixed(1)}px`
      else if (prop === 'height') values[prop] = `${rect.height.toFixed(1)}px`
      else if (prop.endsWith('color')) values[prop] = toRgba(style.getPropertyValue(prop))
      else values[prop] = style.getPropertyValue(prop)
    }
    // Uncompared helpers: what decides whether a property can render at all.
    values['display'] = style.getPropertyValue('display')
    values['has-text'] = String(/\S/.test(el instanceof HTMLElement ? el.innerText : (el.textContent ?? '')))
    values['child-count'] = String(el.childElementCount)
    values['justify-content'] = style.getPropertyValue('justify-content')
    values['align-items'] = style.getPropertyValue('align-items')
    out.push({ region, role, name, props: values })
  }
  return out
}

// An element's name as the content layer reads it (normalize.ts), cut short, and numbered by its
// occurrence: two elements whose names differ only in a measured value pair as the first and the
// second.
export function nameElements(raw: readonly Omit<StyledElement, 'occurrence'>[]): StyledElement[] {
  const counts = new Map<string, number>()
  return raw.map((el) => {
    const full = normalizeValue(el.name)
    const name = full.length > NAME_MAX ? `${full.slice(0, NAME_MAX - 1)}…` : full
    const key = `${el.region}\u0000${el.role}\u0000${name}`
    const occurrence = (counts.get(key) ?? 0) + 1
    counts.set(key, occurrence)
    return { ...el, name, occurrence }
  })
}

export async function collectStyles(page: Page, regionRoots: readonly [Region, string][]): Promise<StyledElement[]> {
  const raw = await page.evaluate(collect, { props: [...STYLE_PROPS], regionRoots: [...regionRoots] })
  return nameElements(raw as Omit<StyledElement, 'occurrence'>[])
}

function pairingKey(el: StyledElement): string {
  return `${el.region}\u0000${roleClass(el.role)}\u0000${el.name}\u0000${el.occurrence}`
}

function px(value: string): number | null {
  const match = /^(-?[\d.]+)px$/.exec(value.trim())
  return match === null ? null : Number(match[1])
}

function sameValue(a: string, b: string): boolean {
  if (a === b) return true
  const pa = px(a)
  const pb = px(b)
  return pa !== null && pb !== null && Math.abs(pa - pb) <= LENGTH_TOLERANCE_PX
}

// The radius a corner is drawn with: a radius larger than half the box's shorter side is scaled down
// to it (CSS Backgrounds 3, overlapping curves), so 9999px and Tailwind's calc(infinity * 1px), which
// a browser reports as 3.35544e+07px, both draw the same pill. Corners are assumed uniform, as only
// the top-left one is read.
function drawnRadius(side: Record<string, string>): string {
  const radius = Number.parseFloat(side['border-top-left-radius'] ?? '')
  const width = px(side['width'] ?? '')
  const height = px(side['height'] ?? '')
  if (Number.isNaN(radius) || width === null || height === null) return side['border-top-left-radius'] ?? ''
  return `${Math.min(radius, Math.min(width, height) / 2)}px`
}

// A border draws only with a width and a color that is not fully transparent.
function drawsBorder(side: Record<string, string>): boolean {
  return (px(side['border-top-width'] ?? '') ?? 0) > 0 && !/, 0\)$/.test(side['border-top-color'] ?? '')
}

// An icon-only button: no text, at most one child, centered in a symmetric flex or grid box.
function isCentredIconBox(side: Record<string, string>): boolean {
  return (
    side['has-text'] === 'false' &&
    Number(side['child-count']) <= 1 &&
    /^(inline-)?(flex|grid)$/.test(side['display'] ?? '') &&
    side['justify-content'] === 'center' &&
    side['align-items'] === 'center' &&
    side['padding-left'] === side['padding-right'] &&
    side['padding-top'] === side['padding-bottom']
  )
}

const ICON_BOX_UNRENDERED = new Set(['padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'column-gap', 'font-weight'])

// Properties that only show under a condition: a border color on a border that draws on neither
// side (no width, or fully transparent, as the kit's buttons carry), or a gap on an element that is
// neither flex nor grid, draws nothing however it differs. Neither does the
// padding, gap or weight of an icon-only button whose box is the same size on both sides: the icon
// sits centered whatever the padding, there is no second child to space and no text to weigh.
function applies(prop: string, a: Record<string, string>, b: Record<string, string>): boolean {
  if (
    ICON_BOX_UNRENDERED.has(prop) &&
    isCentredIconBox(a) &&
    isCentredIconBox(b) &&
    sameValue(a['width'] ?? '', b['width'] ?? '') &&
    sameValue(a['height'] ?? '', b['height'] ?? '')
  )
    return false
  if (prop === 'border-top-color') return drawsBorder(a) || drawsBorder(b)
  if (prop === 'column-gap') return [a, b].some((side) => /flex|grid/.test(side['display'] ?? ''))
  return true
}

export function compareStyles(proto: readonly StyledElement[], vue: readonly StyledElement[], regions: readonly Region[]): Finding[] {
  const vueByKey = new Map(vue.map((el) => [pairingKey(el), el]))
  const out: Finding[] = []
  for (const p of proto) {
    if (!regions.includes(p.region)) continue
    const v = vueByKey.get(pairingKey(p))
    if (v === undefined) continue
    const where = `${p.region} > ${roleClass(p.role)} "${p.name}"${p.occurrence > 1 ? ` #${p.occurrence}` : ''}`
    for (const prop of STYLE_PROPS) {
      const radius = prop === 'border-top-left-radius'
      const a = radius ? drawnRadius(p.props) : (p.props[prop] ?? '')
      const b = radius ? drawnRadius(v.props) : (v.props[prop] ?? '')
      if (applies(prop, p.props, v.props) && !sameValue(a, b)) out.push(finding('style', where, prop, `${a} → ${b}`))
    }
  }
  return out
}
