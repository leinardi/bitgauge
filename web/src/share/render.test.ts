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

// The share image (ui/flows.md section 8): a 1200 × 630 PNG in the dark theme, its tokens read under
// data-theme="dark", its fonts loaded first, and exactly the view's words drawn.

import { afterEach, describe, expect, it, vi } from 'vitest'

import { IMAGE_HEIGHT, IMAGE_WIDTH, renderShareImage } from '@/share/render'
import type { ShareView } from '@/share/summary'

const VIEW: ShareView = {
  head: 'Home Wi-Fi',
  blocks: [
    { direction: 'download', label: '↓ Download', value: '612', unit: 'Mbit/s', qualifier: null },
    { direction: 'upload', label: '↑ Upload', value: '—', unit: '', qualifier: 'insufficient data' },
  ],
  grade: { letter: 'A', word: 'Low', name: 'Bufferbloat grade A · Low bufferbloat' },
  foot: ['3.1 ms idle', '0.4 ms jitter', 'Oct 8, 2026, 2:02 PM'],
  server: 'Basement NAS',
  lines: [],
}

/** A canvas that records the text it draws, the styles it fills with, and the type it exports. */
function recordCanvas() {
  const texts: string[] = []
  const fills: unknown[] = []
  const exported: (string | undefined)[] = []
  const context = new Proxy({} as Record<string | symbol, unknown>, {
    get(target, name) {
      if (name === 'fillText') {
        return (text: string) => texts.push(text)
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
  return { texts, fills, exported, sizes }
}

afterEach(() => {
  vi.restoreAllMocks()
  document.head.innerHTML = ''
  document.body.innerHTML = ''
})

describe('renderShareImage', () => {
  it('draws the view on a 1200 × 630 canvas in the dark palette, its fonts loaded first, and exports a PNG', async () => {
    const style = document.createElement('style')
    style.textContent = ':root { --bg-base: #fafafa; } [data-theme="dark"] { --bg-base: #0a0b0d; --font-mono: "JetBrains Mono"; }'
    document.head.append(style)
    const load = vi.fn().mockResolvedValue([])
    Object.defineProperty(document, 'fonts', { configurable: true, value: { load } })
    const { texts, fills, exported, sizes } = recordCanvas()
    const blob = await renderShareImage(VIEW, { wordmark: ['bit', 'gauge'], bufferbloat: 'bufferbloat' })
    expect(blob?.type).toBe('image/png')
    expect(exported).toEqual(['image/png'])
    expect(sizes).toEqual([[IMAGE_WIDTH, IMAGE_HEIGHT]])
    expect([IMAGE_WIDTH, IMAGE_HEIGHT]).toEqual([1200, 630])
    expect(fills[0]).toBe('#0a0b0d')
    expect(load).toHaveBeenCalledWith('500 120px "JetBrains Mono"')
    expect(texts).toEqual(['bit', 'gauge', 'Home Wi-Fi', '↓ DOWNLOAD', '612', 'Mbit/s', '↑ UPLOAD', '—', 'insufficient data', 'A', 'Low', 'bufferbloat', 'Basement NAS', '3.1 ms idle', '0.4 ms jitter', 'Oct 8, 2026, 2:02 PM'])
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
