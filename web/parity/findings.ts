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

// A finding is one difference between the two rendered pages. Its fields, together with the project
// and the scenario, are its identity in the baseline, so every field must be stable across runs and
// free of tabs and newlines.

export const LAYERS = ['content', 'style', 'layout'] as const
export type Layer = (typeof LAYERS)[number]

export function isLayer(value: unknown): value is Layer {
  return (LAYERS as readonly unknown[]).includes(value)
}

export interface Finding {
  layer: Layer
  path: string
  kind: string
  detail: string
}

// Keeps one baseline line per finding and the fields readable: whitespace runs collapse to one space
// and very long text is cut, with a marker so a cut value is never mistaken for the whole one.
function field(value: string, max = 160): string {
  const flat = value.replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat
}

export function finding(layer: Layer, path: string, kind: string, detail: string): Finding {
  return { layer, path: field(path, 400), kind, detail: field(detail) }
}

// Two identical differences under the same parent (two missing "Restart" buttons) are still two; the
// later ones are numbered so every finding keeps an identity of its own.
export function numberDuplicates(findings: readonly Finding[]): Finding[] {
  const seen = new Map<string, number>()
  return findings.map((f) => {
    const id = [f.layer, f.path, f.kind, f.detail].join('\t')
    const count = (seen.get(id) ?? 0) + 1
    seen.set(id, count)
    return count === 1 ? f : { ...f, detail: `${f.detail} (#${count})` }
  })
}
