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

import { LOGO_BOX, logoGeometry } from '@/components/brand/logo'
import type { QualifierTone, ShareView } from '@/share/summary'
import type { ShareTokens } from '@/share/tokens'

// The share image's layout and painting (share-panel.md "Share image layout"), on the 480 × 252
// reference box SharePreview.vue lays out with CSS, scaled by --share-scale: the header on the top
// padding, the foot on the bottom padding, wrapping upward, and between them one group of label
// row, number row and qualifier stacks, with the grade beside them, centered in the band that is
// left. Both numbers sit in one row of fixed height, so a qualifier never lifts one number above
// the other. Each step mirrors the CSS rule it stands for.

type Context = CanvasRenderingContext2D

interface Font {
  weight: number
  size: number
  family: string
  /** Letter spacing, in em. */
  tracking?: number
}

function setFont(context: Context, { weight, size, family, tracking = 0 }: Font): void {
  context.font = `${weight} ${size}px ${family}`
  context.letterSpacing = `${tracking * size}px`
}

/** The baseline of a line box `height` tall at `top`, with the font's content area centered in it, as CSS does. */
function baseline(context: Context, top: number, height: number): number {
  const metrics = context.measureText('Hg')
  const ascent = Number.isFinite(metrics.fontBoundingBoxAscent) ? metrics.fontBoundingBoxAscent : height
  const descent = Number.isFinite(metrics.fontBoundingBoxDescent) ? metrics.fontBoundingBoxDescent : 0
  return top + (height - ascent - descent) / 2 + ascent
}

/** `text` cut to `max` with an ellipsis at the end, as text-overflow: ellipsis. */
function ellipsize(context: Context, text: string, max: number): string {
  if (context.measureText(text).width <= max) {
    return text
  }
  let end = text.length
  while (end > 0 && context.measureText(`${text.slice(0, end)}…`).width > max) {
    end -= 1
  }
  return `${text.slice(0, end)}…`
}

/** `text` broken into lines of at most `max` at its spaces. */
function wrap(context: Context, text: string, max: number): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of text.split(' ')) {
    const next = line === '' ? word : `${line} ${word}`
    if (line !== '' && context.measureText(next).width > max) {
      lines.push(line)
      line = word
    } else {
      line = next
    }
  }
  return [...lines, line]
}

function paintLogo(context: Context, colors: ShareTokens['colors'], x: number, y: number, size: number): void {
  const geometry = logoGeometry(size)
  context.save()
  context.translate(x, y)
  context.scale(size / LOGO_BOX, size / LOGO_BOX)
  context.lineCap = 'round'
  context.lineWidth = geometry.width
  context.globalAlpha = geometry.trackOpacity
  context.strokeStyle = colors.fg
  context.stroke(new Path2D(geometry.paths.track))
  context.globalAlpha = 1
  context.strokeStyle = colors.download
  context.stroke(new Path2D(geometry.paths.download))
  context.strokeStyle = colors.upload
  context.stroke(new Path2D(geometry.paths.upload))
  if (geometry.latency !== null) {
    context.lineCap = 'butt'
    context.lineWidth = geometry.latency.width
    context.setLineDash([...geometry.latency.dash])
    context.strokeStyle = colors.latency
    context.stroke(new Path2D(geometry.latency.path))
  }
  context.restore()
}

/** The mark and wordmark at the left of the header, the label right-aligned in what they leave. */
function paintHeader(context: Context, view: ShareView, { sizes: s, colors, fonts }: ShareTokens, wordmark: [string, string]): void {
  // The mark fills the header's row, as Logo does at 20 px.
  paintLogo(context, colors, s.padX, s.padY, s.headerH)
  setFont(context, { weight: s.semibold, size: s.wordmark, family: fonts.sans, tracking: s.trackingTight })
  const x = s.padX + s.headerH + s.space2
  const y = baseline(context, s.padY, s.headerH)
  const bit = context.measureText(wordmark[0]).width
  context.fillStyle = colors.fg
  context.fillText(wordmark[0], x, y)
  context.fillStyle = colors.primary
  context.fillText(wordmark[1], x + bit, y)
  if (view.head === '') {
    return
  }
  const left = x + bit + context.measureText(wordmark[1]).width + s.space45
  setFont(context, { weight: s.regular, size: s.head, family: fonts.mono })
  context.fillStyle = colors.subtle
  context.textAlign = 'right'
  context.fillText(ellipsize(context, view.head, s.width - s.padX - left), s.width - s.padX, baseline(context, s.padY, s.headerH))
  context.textAlign = 'left'
}

/** The foot on the bottom padding: whole items wrapping left to right, server · date pushed right. Returns its top. */
function paintFoot(context: Context, view: ShareView, { sizes: s, colors, fonts }: ShareTokens): number {
  setFont(context, { weight: s.regular, size: s.meta, family: fonts.mono })
  const right = s.width - s.padX
  const where = `${ellipsize(context, view.server, s.serverMax)}\u00a0·\u00a0${view.date}`
  const rows: string[][] = [[]]
  let used = 0
  for (const item of [...view.foot, where]) {
    const width = context.measureText(item).width
    if (used > 0 && used + s.space35 + width > right - s.padX) {
      rows.push([])
      used = 0
    }
    used += (used > 0 ? s.space35 : 0) + width
    rows.at(-1)?.push(item)
  }
  const line = s.meta * s.lhSnug
  const top = s.height - s.padY - rows.length * line - (rows.length - 1) * s.space075
  rows.forEach((row, index) => {
    const y = baseline(context, top + index * (line + s.space075), line)
    let x = s.padX
    for (const item of row) {
      if (item === where) {
        context.fillStyle = colors.subtle
        context.textAlign = 'right'
        context.fillText(item, right, y)
        context.textAlign = 'left'
      } else {
        context.fillStyle = colors.muted
        context.fillText(item, x, y)
        x += context.measureText(item).width + s.space35
      }
    }
  })
  return top
}

/** The grade tile at the number row's top in the right column, its words centered under it. */
function paintGrade(context: Context, grade: NonNullable<ShareView['grade']>, { sizes: s, colors, fonts }: ShareTokens, words: string[], top: number): void {
  const tone =
    grade.letter === 'F'
      ? { border: colors.dangerBorder, bg: colors.dangerBg, fg: colors.dangerFg }
      : grade.letter === 'C' || grade.letter === 'D'
        ? { border: colors.warnBorder, bg: colors.warnBg, fg: colors.warnFg }
        : { border: colors.okBorder, bg: colors.okBg, fg: colors.okFg }
  const center = s.width - s.padX - s.gradeW / 2
  const left = center - s.gradeSize / 2
  // The border sits inside the tile, as CSS draws it.
  context.beginPath()
  context.roundRect(left + s.border / 2, top + s.border / 2, s.gradeSize - s.border, s.gradeSize - s.border, s.radius - s.border / 2)
  context.fillStyle = tone.bg
  context.fill()
  context.lineWidth = s.border
  context.strokeStyle = tone.border
  context.stroke()
  context.textAlign = 'center'
  setFont(context, { weight: s.semibold, size: s.grade, family: fonts.mono, tracking: s.trackingMetric })
  context.fillStyle = tone.fg
  context.fillText(grade.letter, center, baseline(context, top, s.gradeSize))
  const line = s.meta * s.lhSnug
  words.forEach((word, index) => {
    setFont(context, { weight: index === 0 ? s.bold : s.regular, size: s.meta, family: fonts.sans })
    context.fillStyle = index === 0 ? colors.fg : colors.subtle
    context.fillText(word, center, baseline(context, top + s.gradeSize + s.space125 + index * line, line))
  })
  context.textAlign = 'left'
}

/** The group, centered between `top` and `bottom`: the blocks' label, number and qualifier rows, and the grade. */
function paintGroup(context: Context, view: ShareView, tokens: ShareTokens, bufferbloat: string, top: number, bottom: number): void {
  const { sizes: s, colors, fonts } = tokens
  const qualifierFont: Font = { weight: s.regular, size: s.qual, family: fonts.mono }
  const qualifierLine = s.qual * s.lhSnug
  setFont(context, qualifierFont)
  const stacks = view.blocks.map((block) => block.qualifiers.flatMap(({ text, tone }) => wrap(context, text, s.blockW).map((line) => ({ line, tone }))))
  const gradeWords = view.grade === null ? [] : [view.grade.word, bufferbloat, ...(view.grade.basis === null ? [] : [view.grade.basis])]
  const gradeHeight = view.grade === null ? 0 : s.gradeSize + s.space125 + gradeWords.length * s.meta * s.lhSnug
  // The qualifier row is as tall as the tallest stack, or as the grade needs below the number row.
  const third = Math.max(0, ...stacks.map((stack) => (stack.length === 0 ? 0 : s.space05 + stack.length * qualifierLine)), gradeHeight - s.value - s.space075)
  const height = s.labelH + s.space075 + s.value + s.space075 + third
  const labelTop = top + (bottom - top - height) / 2
  const numberTop = labelTop + s.labelH + s.space075
  const tones: Record<QualifierTone, string> = { muted: colors.muted, warn: colors.warn, danger: colors.danger }

  view.blocks.forEach((block, index) => {
    const x = s.padX + index * (s.blockW + s.space45)
    setFont(context, { weight: s.semibold, size: s.label, family: fonts.cond, tracking: s.trackingCaps })
    context.fillStyle = block.direction === 'download' ? colors.download : colors.upload
    context.fillText(block.label.toLocaleUpperCase(), x, baseline(context, labelTop, s.labelH))
    setFont(context, { weight: s.medium, size: s.value, family: fonts.mono })
    const y = baseline(context, numberTop, s.value)
    context.fillStyle = block.value === '—' ? colors.subtle : colors.fg
    context.fillText(block.value, x, y)
    if (block.unit !== '') {
      const after = x + context.measureText(block.value).width + s.space1
      setFont(context, { weight: s.regular, size: s.unit, family: fonts.sans })
      context.fillStyle = colors.muted
      context.fillText(block.unit, after, y)
    }
    setFont(context, qualifierFont)
    stacks[index]?.forEach(({ line, tone }, row) => {
      context.fillStyle = tones[tone]
      context.fillText(line, x, baseline(context, numberTop + s.value + s.space075 + s.space05 + row * qualifierLine, qualifierLine))
    })
  })
  if (view.grade !== null) {
    paintGrade(context, view.grade, tokens, gradeWords, numberTop)
  }
}

/** Paints `view` on `context`: the reference box at --share-scale, in the dark palette. */
export function paintShareImage(context: Context, view: ShareView, tokens: ShareTokens, words: { wordmark: [string, string]; bufferbloat: string }): void {
  const { sizes: s, colors } = tokens
  context.save()
  context.scale(s.scale, s.scale)
  context.fillStyle = colors.bg
  context.fillRect(0, 0, s.width, s.height)
  context.textBaseline = 'alphabetic'
  context.textAlign = 'left'
  paintHeader(context, view, tokens, words.wordmark)
  const footTop = paintFoot(context, view, tokens)
  paintGroup(context, view, tokens, words.bufferbloat, s.padY + s.headerH + s.gapMin, footTop - s.gapMin)
  context.restore()
}
