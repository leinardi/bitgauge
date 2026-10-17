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

import { LOGO_BOX, LOGO_PATHS, LOGO_STROKE } from '@/components/brand/logo'
import type { ShareView } from '@/share/summary'

// The share image (frontend.md section 6, ui/flows.md section 8): 1200 × 630 on a canvas, always in
// the dark theme whatever the page's, with the dark palette's tokens read the way the charts read
// theirs (chart/palette.ts), from a hidden element under data-theme="dark", and the embedded fonts
// loaded first through document.fonts.load; exported as PNG. It draws exactly the share view the
// panel previews: the mark and wordmark with the label, a block per direction with its number,
// unit and qualifiers, the grade with its word, and the foot with the latencies, the date and the
// server.

export const IMAGE_WIDTH = 1200
export const IMAGE_HEIGHT = 630
const PAD = 64
const RIGHT = IMAGE_WIDTH - PAD

interface Palette {
  bg: string
  fg: string
  muted: string
  subtle: string
  primary: string
  download: string
  upload: string
  latency: string
  warn: string
  tones: Record<'ok' | 'warn' | 'danger', { border: string; bg: string; fg: string }>
  sans: string
  mono: string
  cond: string
}

function darkPalette(doc: Document): Palette {
  const probe = doc.createElement('div')
  probe.dataset.theme = 'dark'
  probe.hidden = true
  doc.body.append(probe)
  const style = getComputedStyle(probe)
  const token = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback
  const color = (name: string) => token(name, 'currentColor')
  const palette: Palette = {
    bg: color('--bg-base'),
    fg: color('--fg'),
    muted: color('--fg-muted'),
    subtle: color('--fg-subtle'),
    primary: color('--primary-text'),
    download: color('--series-download'),
    upload: color('--series-upload'),
    latency: color('--series-latency'),
    warn: color('--warn-fg'),
    tones: {
      ok: { border: color('--ok-border'), bg: color('--ok-bg'), fg: color('--grade-good') },
      warn: { border: color('--warn-border'), bg: color('--warn-bg'), fg: color('--grade-fair') },
      danger: { border: color('--danger-border'), bg: color('--danger-bg'), fg: color('--grade-poor') },
    },
    sans: token('--font-sans', 'sans-serif'),
    mono: token('--font-mono', 'monospace'),
    cond: token('--font-cond', 'sans-serif'),
  }
  probe.remove()
  return palette
}

const font = (weight: number, size: number, family: string) => `${weight} ${size}px ${family}`

function fonts(palette: Palette): string[] {
  return [font(600, 40, palette.sans), font(400, 26, palette.sans), font(500, 120, palette.mono), font(400, 24, palette.mono), font(600, 28, palette.cond)]
}

function toneOf(letter: string): 'ok' | 'warn' | 'danger' {
  return letter === 'F' ? 'danger' : letter === 'C' || letter === 'D' ? 'warn' : 'ok'
}

function drawLogo(context: CanvasRenderingContext2D, palette: Palette, x: number, y: number, size: number): void {
  context.save()
  context.translate(x, y)
  context.scale(size / LOGO_BOX, size / LOGO_BOX)
  context.lineCap = 'round'
  context.lineWidth = LOGO_STROKE.width
  context.globalAlpha = LOGO_STROKE.trackOpacity
  context.strokeStyle = palette.fg
  context.stroke(new Path2D(LOGO_PATHS.track))
  context.globalAlpha = 1
  context.strokeStyle = palette.download
  context.stroke(new Path2D(LOGO_PATHS.download))
  context.strokeStyle = palette.upload
  context.stroke(new Path2D(LOGO_PATHS.upload))
  context.lineCap = 'butt'
  context.lineWidth = LOGO_STROKE.latencyWidth
  context.setLineDash([...LOGO_STROKE.latencyDash])
  context.strokeStyle = palette.latency
  context.stroke(new Path2D(LOGO_PATHS.latency))
  context.restore()
}

function drawHeader(context: CanvasRenderingContext2D, view: ShareView, palette: Palette, wordmark: [string, string]): void {
  drawLogo(context, palette, PAD, 52, 60)
  context.font = font(600, 40, palette.sans)
  context.textBaseline = 'alphabetic'
  context.fillStyle = palette.fg
  context.fillText(wordmark[0], PAD + 76, 98)
  context.fillStyle = palette.primary
  context.fillText(wordmark[1], PAD + 76 + context.measureText(wordmark[0]).width, 98)
  if (view.head !== '') {
    context.font = font(400, 26, palette.mono)
    context.fillStyle = palette.subtle
    context.textAlign = 'right'
    context.fillText(view.head, RIGHT, 94, RIGHT - PAD - 420)
    context.textAlign = 'left'
  }
}

function drawBlocks(context: CanvasRenderingContext2D, view: ShareView, palette: Palette): void {
  let x = PAD
  for (const block of view.blocks) {
    context.font = font(600, 28, palette.cond)
    context.fillStyle = block.direction === 'download' ? palette.download : palette.upload
    context.fillText(block.label.toLocaleUpperCase(), x, 330)
    context.font = font(500, 120, palette.mono)
    context.fillStyle = block.value === '—' ? palette.subtle : palette.fg
    context.fillText(block.value, x, 446)
    let width = context.measureText(block.value).width
    if (block.unit !== '') {
      context.font = font(400, 32, palette.sans)
      context.fillStyle = palette.muted
      context.fillText(block.unit, x + width + 12, 446)
      width += 12 + context.measureText(block.unit).width
    }
    if (block.qualifier !== null) {
      context.font = font(400, 26, palette.sans)
      context.fillStyle = palette.warn
      context.fillText(block.qualifier, x, 492)
      width = Math.max(width, context.measureText(block.qualifier).width)
    }
    x += width + 72
  }
}

function drawGrade(context: CanvasRenderingContext2D, view: ShareView, palette: Palette, bufferbloat: string): void {
  if (view.grade === null) {
    return
  }
  const tone = palette.tones[toneOf(view.grade.letter)]
  context.font = font(600, 32, palette.sans)
  const word = context.measureText(view.grade.word).width
  context.font = font(400, 26, palette.sans)
  const words = Math.max(word, context.measureText(bufferbloat).width)
  const size = 112
  const left = RIGHT - words - 20 - size
  const top = 342
  context.beginPath()
  context.roundRect(left, top, size, size, 16)
  context.fillStyle = tone.bg
  context.fill()
  context.lineWidth = 2
  context.strokeStyle = tone.border
  context.stroke()
  context.font = font(600, 64, palette.mono)
  context.fillStyle = tone.fg
  context.textAlign = 'center'
  context.fillText(view.grade.letter, left + size / 2, top + 78)
  context.textAlign = 'left'
  context.font = font(600, 32, palette.sans)
  context.fillStyle = palette.fg
  context.fillText(view.grade.word, left + size + 20, top + 50)
  context.font = font(400, 26, palette.sans)
  context.fillStyle = palette.subtle
  context.fillText(bufferbloat, left + size + 20, top + 88)
}

function drawFoot(context: CanvasRenderingContext2D, view: ShareView, palette: Palette): void {
  context.font = font(400, 24, palette.mono)
  const server = context.measureText(view.server).width
  context.fillStyle = palette.subtle
  context.textAlign = 'right'
  context.fillText(view.server, RIGHT, 572)
  context.textAlign = 'left'
  context.fillStyle = palette.muted
  const limit = RIGHT - server - 36
  // The items wrap upward: the last line sits on the baseline, earlier ones above it.
  const rows: string[][] = [[]]
  let used = 0
  for (const item of view.foot) {
    const width = context.measureText(item).width
    if (used > 0 && used + width > limit - PAD) {
      rows.push([])
      used = 0
    }
    rows.at(-1)?.push(item)
    used += width + 36
  }
  rows.forEach((row, index) => {
    let x = PAD
    const y = 572 - (rows.length - 1 - index) * 36
    for (const item of row) {
      context.fillText(item, x, y)
      x += context.measureText(item).width + 36
    }
  })
}

/** The share image of `view` as a PNG, or null when the browser cannot make one. */
export async function renderShareImage(view: ShareView, words: { wordmark: [string, string]; bufferbloat: string }, doc: Document = document): Promise<Blob | null> {
  const palette = darkPalette(doc)
  try {
    await Promise.all(fonts(palette).map((spec) => doc.fonts.load(spec)))
  } catch {
    // A font that cannot load leaves the canvas on its fallback; the image still says the same.
  }
  const canvas = doc.createElement('canvas')
  canvas.width = IMAGE_WIDTH
  canvas.height = IMAGE_HEIGHT
  const context = canvas.getContext('2d')
  if (context === null) {
    return null
  }
  context.fillStyle = palette.bg
  context.fillRect(0, 0, IMAGE_WIDTH, IMAGE_HEIGHT)
  drawHeader(context, view, palette, words.wordmark)
  drawBlocks(context, view, palette)
  drawGrade(context, view, palette, words.bufferbloat)
  drawFoot(context, view, palette)
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png'))
}
