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

// Parses the YAML Playwright's locator.ariaSnapshot() prints into a tree. Only the subset that
// method emits is understood: one "- " item per line, two spaces per level, an optional quoted key
// and an optional inline value.
//
//   - heading "Speed test" [level=1]
//   - button "Open About":
//     - text: About
//   - link "Docs":
//     - /url: https://example.test
//   - 'paragraph "a: b"': inline text

export interface AriaNode {
  role: string
  name: string
  attrs: string[]
  children: AriaNode[]
}

interface Line {
  depth: number
  key: string
  value: string | null
  hasChildren: boolean
}

// A YAML scalar Playwright may quote: single quotes double an embedded quote, double quotes use JSON
// escapes.
function unquote(raw: string): string {
  if (raw.startsWith("'") && raw.endsWith("'") && raw.length >= 2) return raw.slice(1, -1).replace(/''/g, "'")
  if (raw.startsWith('"') && raw.endsWith('"') && raw.length >= 2) return JSON.parse(raw) as string
  return raw
}

// Splits "key: value" at the colon that ends the key, skipping colons inside a quoted key or inside
// the key's own quoted name.
function splitKeyValue(item: string): { key: string; rest: string | null } {
  let i = 0
  if (item.startsWith("'")) {
    i = 1
    while (i < item.length) {
      if (item[i] === "'" && item[i + 1] === "'") {
        i += 2
        continue
      }
      if (item[i] === "'") break
      i++
    }
    i++
  }
  let inName = false
  for (; i < item.length; i++) {
    const ch = item[i]
    if (inName && ch === '\\') {
      i++
      continue
    }
    if (ch === '"') inName = !inName
    if (!inName && ch === ':' && (i + 1 === item.length || item[i + 1] === ' ')) {
      return { key: item.slice(0, i), rest: item.slice(i + 1).trim() }
    }
  }
  return { key: item, rest: null }
}

function parseLines(yaml: string): Line[] {
  const lines: Line[] = []
  for (const raw of yaml.split('\n')) {
    if (raw.trim() === '') continue
    const match = /^( *)- (.*)$/.exec(raw)
    if (match === null) throw new Error(`aria snapshot: unexpected line ${JSON.stringify(raw)}`)
    const depth = (match[1] ?? '').length / 2
    const { key, rest } = splitKeyValue(match[2] ?? '')
    lines.push({ depth, key: unquote(key), value: rest === null || rest === '' ? null : unquote(rest), hasChildren: rest === '' })
  }
  return lines
}

// "role", "role \"name\"", "role \"name\" [level=1] [checked]".
function parseKey(key: string): { role: string; name: string; attrs: string[] } {
  const roleMatch = /^([^\s"[]+)\s*/.exec(key)
  const role = roleMatch?.[1] ?? key
  let rest = key.slice(roleMatch?.[0].length ?? key.length)
  let name = ''
  const nameMatch = /^"((?:[^"\\]|\\.)*)"\s*/.exec(rest)
  if (nameMatch !== null) {
    name = JSON.parse(`"${nameMatch[1] ?? ''}"`) as string
    rest = rest.slice(nameMatch[0].length)
  }
  const attrs = [...rest.matchAll(/\[([^\]]+)\]/g)].map((m) => m[1] ?? '')
  return { role, name, attrs }
}

export function parseAriaSnapshot(yaml: string): AriaNode[] {
  const root: AriaNode = { role: 'root', name: '', attrs: [], children: [] }
  const stack: { depth: number; node: AriaNode }[] = [{ depth: -1, node: root }]
  for (const line of parseLines(yaml)) {
    while ((stack[stack.length - 1]?.depth ?? -1) >= line.depth) stack.pop()
    const parent = stack[stack.length - 1]?.node ?? root
    // Properties such as /url and /placeholder describe the parent, not the page's content: a link
    // and a button that read the same are the same thing to a person comparing the two apps.
    if (line.key.startsWith('/')) continue
    let node: AriaNode
    if (line.key === 'text') {
      node = { role: 'text', name: line.value ?? '', attrs: [], children: [] }
    } else {
      const { role, name, attrs } = parseKey(line.key)
      node = { role, name, attrs, children: [] }
      // "button \"x\": label" is the same tree as "button \"x\":" with a single "- text: label".
      if (line.value !== null) node.children.push({ role: 'text', name: line.value, attrs: [], children: [] })
    }
    parent.children.push(node)
    if (line.hasChildren) stack.push({ depth: line.depth, node })
  }
  return root.children
}
