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
// @vitest-environment jsdom

// The share image (ui/flows.md section 8, share-panel.md "Share image layout"): the 480 × 252
// reference box at 2.5× on a 1200 × 630 PNG in the dark theme, its tokens read under
// data-theme="dark", its fonts loaded first, and exactly the view's words drawn.

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { IMAGE_HEIGHT, IMAGE_WIDTH, renderShareImage } from '@/share/render'
import type { ShareView } from '@/share/summary'

const VIEW: ShareView = {
  head: 'Home Wi-Fi',
  blocks: [
    { direction: 'download', label: '↓ Download', value: '612', unit: 'Mbit/s', qualifiers: [{ text: 'low confidence: unstable', tone: 'warn' }] },
    { direction: 'upload', label: '↑ Upload', value: '—', unit: '', qualifiers: [{ text: 'insufficient data', tone: 'warn' }] },
  ],
  grade: { letter: 'A', word: 'Low', basis: 'download only', name: 'Bufferbloat grade A · Low bufferbloat (download only)' },
  foot: ['3.1 ms idle', '0.4 ms jitter', '+12 ms under load (download)'],
  server: 'Basement NAS',
  date: 'Oct 8, 2026, 2:02 PM',
  lines: [],
}

/** A canvas that records the text it draws, the styles it fills with, and the type it exports. */
function recordCanvas() {
  const texts: string[] = []
  const fills: unknown[] = []
  const exported: (string | undefined)[] = []
  const scales: number[][] = []
  const context = new Proxy({} as Record<string | symbol, unknown>, {
    get(target, name) {
      if (name === 'fillText') {
        return (text: string) => texts.push(text)
      }
      if (name === 'scale') {
        return (x: number, y: number) => scales.push([x, y])
      }
      if (name === 'measureText') {
        return (text: string) => ({ width: text.length * 10 })
      }
      return name in target ? target[name] : () => undefined
    },
    set(target, name, value) {
      if (name === 'fillStyle') {
        fills.push(value)
      }
      target[name] = value
      return true
    },
  })
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D)
  const sizes: [number, number][] = []
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (this: HTMLCanvasElement, callback: BlobCallback, type?: string) {
    sizes.push([this.width, this.height])
    exported.push(type)
    callback(new Blob(['png'], { type: type ?? '' }))
  })
  return { texts, fills, exported, sizes, scales }
}

afterEach(() => {
  vi.restoreAllMocks()
  document.head.innerHTML = ''
  document.body.innerHTML = ''
})

// The export's tokens, as the app loads them (vitest gives a CSS import no content).
const tokens = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../../docs/design_system/colors_and_type.css'), 'utf8')

describe('renderShareImage', () => {
  it('draws the view on the reference box at 2.5× on a 1200 × 630 canvas in the dark palette, its fonts loaded first, and exports a PNG', async () => {
    const style = document.createElement('style')
    style.textContent = tokens
    document.head.append(style)
    const load = vi.fn().mockResolvedValue([])
    Object.defineProperty(document, 'fonts', { configurable: true, value: { load } })
    const { texts, fills, exported, sizes, scales } = recordCanvas()
    const blob = await renderShareImage(VIEW, { wordmark: ['bit', 'gauge'], bufferbloat: 'bufferbloat' })
    expect(blob?.type).toBe('image/png')
    expect(exported).toEqual(['image/png'])
    expect(sizes).toEqual([[IMAGE_WIDTH, IMAGE_HEIGHT]])
    expect([IMAGE_WIDTH, IMAGE_HEIGHT]).toEqual([1200, 630])
    expect(scales[0]).toEqual([2.5, 2.5])
    expect(fills[0]).toBe('oklch(0.165 0.013 255)')
    expect(load).toHaveBeenCalledWith(expect.stringMatching(/^500 42px "IBM Plex Mono"/))
    expect(texts).toEqual([
      'bit',
      'gauge',
      'Home Wi-Fi',
      '3.1 ms idle',
      '0.4 ms jitter',
      '+12 ms under load (download)',
      'Basement NAS\u00a0·\u00a0Oct 8, 2026, 2:02 PM',
      '↓ DOWNLOAD',
      '612',
      'Mbit/s',
      // A qualifier wraps inside its block's column, 148 wide, at this canvas's 10 per character.
      'low',
      'confidence:',
      'unstable',
      '↑ UPLOAD',
      '—',
      'insufficient',
      'data',
      'A',
      'Low',
      'bufferbloat',
      'download only',
    ])
    // The probe that read the dark palette is gone again.
    expect(document.querySelector('[data-theme="dark"]')).toBeNull()
  })

  it('still draws when the fonts cannot load, and gives null where the browser has no 2D context', async () => {
    Object.defineProperty(document, 'fonts', { configurable: true, value: { load: vi.fn().mockRejectedValue(new Error('font')) } })
    const { texts } = recordCanvas()
    expect(await renderShareImage({ ...VIEW, head: '', grade: null }, { wordmark: ['bit', 'gauge'], bufferbloat: 'bufferbloat' })).not.toBeNull()
    expect(texts).not.toContain('Home Wi-Fi')
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(null)
    expect(await renderShareImage(VIEW, { wordmark: ['bit', 'gauge'], bufferbloat: 'bufferbloat' })).toBeNull()
  })
})
