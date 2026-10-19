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

// The share image's tokens (share-panel.md "Share image layout"): every size and color the image
// draws with, read from the dark palette the way the charts read theirs (chart/palette.ts), from a
// hidden element under data-theme="dark". Sizes are on the 480 × 252 reference box; the trackings
// are em, a fraction of their font's size.

const COLORS = {
  bg: '--bg-base',
  fg: '--fg',
  muted: '--fg-muted',
  subtle: '--fg-subtle',
  primary: '--primary-text',
  download: '--series-download',
  upload: '--series-upload',
  latency: '--series-latency',
  warn: '--warn-fg',
  danger: '--danger-fg',
  okBorder: '--ok-border',
  okBg: '--ok-bg',
  okFg: '--grade-good',
  warnBorder: '--warn-border',
  warnBg: '--warn-bg',
  warnFg: '--grade-fair',
  dangerBorder: '--danger-border',
  dangerBg: '--danger-bg',
  dangerFg: '--grade-poor',
} as const
const FONTS = { sans: '--font-sans', mono: '--font-mono', cond: '--font-cond' } as const
const SIZES = {
  scale: '--share-scale',
  width: '--share-w',
  height: '--share-h',
  padY: '--share-pad-y',
  padX: '--share-pad-x',
  headerH: '--share-header-h',
  gapMin: '--share-gap-min',
  labelH: '--share-label-h',
  blockW: '--share-block-w',
  gradeSize: '--share-grade-size',
  gradeW: '--share-grade-w',
  serverMax: '--share-server-max',
  value: '--type-share-value',
  label: '--type-share-label',
  unit: '--type-share-unit',
  qual: '--type-share-qual',
  meta: '--type-share-meta',
  head: '--type-share-head',
  grade: '--type-share-grade',
  wordmark: '--text-md',
  lhSnug: '--lh-snug',
  lhTight: '--lh-tight',
  trackingCaps: '--tracking-caps',
  trackingTight: '--tracking-tight',
  trackingMetric: '--tracking-metric',
  space05: '--space-0-5',
  space075: '--space-0-75',
  space1: '--space-1',
  space125: '--space-1-25',
  space2: '--space-2',
  space35: '--space-3-5',
  space45: '--space-4-5',
  radius: '--radius-md',
  border: '--border-width',
  regular: '--weight-regular',
  medium: '--weight-medium',
  semibold: '--weight-semibold',
  bold: '--weight-bold',
} as const

export interface ShareTokens {
  colors: Record<keyof typeof COLORS, string>
  fonts: Record<keyof typeof FONTS, string>
  sizes: Record<keyof typeof SIZES, number>
}

export function darkTokens(doc: Document): ShareTokens {
  const probe = doc.createElement('div')
  probe.dataset.theme = 'dark'
  probe.hidden = true
  doc.body.append(probe)
  const style = getComputedStyle(probe)
  // A browser substitutes var() in a custom property's computed value; resolve what is left.
  const read = (name: string, depth = 0): string => {
    const value = style.getPropertyValue(name).trim()
    const reference = /^var\((--[\w-]+)\)$/.exec(value)
    return reference?.[1] !== undefined && depth < 8 ? read(reference[1], depth + 1) : value
  }
  function pick<K extends string, V>(names: Record<K, string>, as: (value: string) => V): Record<K, V> {
    const values = {} as Record<K, V>
    for (const key of Object.keys(names) as K[]) {
      values[key] = as(read(names[key]))
    }
    return values
  }
  const tokens: ShareTokens = {
    colors: pick(COLORS, (value) => value || 'currentColor'),
    fonts: pick(FONTS, (value) => value || 'sans-serif'),
    sizes: pick(SIZES, (value) => Number.parseFloat(value) || 0),
  }
  probe.remove()
  return tokens
}
