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

export function normalizeTree(nodes: readonly AriaNode[]): AriaNode[] {
  const out: AriaNode[] = []
  for (const node of nodes) {
    if (isDecorative(node)) continue
    const children = normalizeTree(node.children)
    if (isEmptyLiveRegion(node, children)) continue
    if (TRANSPARENT_ROLES.has(node.role)) {
      out.push(...children)
      continue
    }
    const name = normalizeText(node.name)
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
