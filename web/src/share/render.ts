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

import { paintShareImage } from '@/share/paint'
import type { ShareView } from '@/share/summary'
import { darkTokens } from '@/share/tokens'

// The share image (frontend.md section 6, ui/flows.md section 8, share-panel.md "Share image
// layout"): the 480 × 252 reference box SharePreview.vue shows, drawn at --share-scale (2.5) on a
// 1200 × 630 canvas, always in the dark theme whatever the page's, with the dark palette's tokens
// (share/tokens.ts) and the embedded fonts, loaded first through document.fonts.load; exported as
// PNG. It draws exactly the share view the panel previews.

export const IMAGE_WIDTH = 1200
export const IMAGE_HEIGHT = 630

/** The share image of `view` as a PNG, or null when the browser cannot make one. */
export async function renderShareImage(view: ShareView, words: { wordmark: [string, string]; bufferbloat: string }, doc: Document = document): Promise<Blob | null> {
  const tokens = darkTokens(doc)
  const { sans, mono, cond } = tokens.fonts
  const { regular, medium, semibold, bold, value } = tokens.sizes
  const faces = [`${semibold} ${sans}`, `${bold} ${sans}`, `${regular} ${sans}`, `${medium} ${mono}`, `${regular} ${mono}`, `${semibold} ${mono}`, `${semibold} ${cond}`]
  try {
    await Promise.all(faces.map((face) => doc.fonts.load(face.replace(' ', ` ${value}px `))))
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
  paintShareImage(context, view, tokens, words)
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png'))
}
