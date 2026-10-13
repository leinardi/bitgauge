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

// The visual layer: both pages as pictures and a heatmap of where they differ. It never produces a
// finding: two documents built differently never match pixel for pixel, so this is for a person
// reading the report, not for the ratchet.

import type { Page, TestInfo } from '@playwright/test'

// A channel difference below this is antialiasing, not a different pixel.
const CHANNEL_TOLERANCE = 24

async function shoot(page: Page): Promise<Buffer> {
  return page.screenshot({ fullPage: true, animations: 'disabled', caret: 'hide' })
}

// Runs in a blank page: pads both screenshots to the same size, marks every differing pixel red over
// a faded copy of the prototype, and reports the share of pixels that differ.
function heatmap({ a, b, tolerance }: { a: string; b: string; tolerance: number }): Promise<{ png: string; ratio: number }> {
  const load = (src: string) =>
    new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('screenshot did not decode'))
      img.src = src
    })
  return Promise.all([load(a), load(b)]).then(([imgA, imgB]) => {
    const width = Math.max(imgA.width, imgB.width)
    const height = Math.max(imgA.height, imgB.height)
    const pixels = (img: HTMLImageElement): Uint8ClampedArray => {
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (ctx === null) throw new Error('no 2d context')
      ctx.drawImage(img, 0, 0)
      return ctx.getImageData(0, 0, width, height).data
    }
    const pa = pixels(imgA)
    const pb = pixels(imgB)
    const out = document.createElement('canvas')
    out.width = width
    out.height = height
    const ctx = out.getContext('2d')
    if (ctx === null) throw new Error('no 2d context')
    const diff = ctx.createImageData(width, height)
    let differing = 0
    for (let i = 0; i < pa.length; i += 4) {
      const delta = Math.max(
        Math.abs((pa[i] ?? 0) - (pb[i] ?? 0)),
        Math.abs((pa[i + 1] ?? 0) - (pb[i + 1] ?? 0)),
        Math.abs((pa[i + 2] ?? 0) - (pb[i + 2] ?? 0)),
        Math.abs((pa[i + 3] ?? 0) - (pb[i + 3] ?? 0)),
      )
      if (delta > tolerance) {
        differing++
        diff.data.set([255, 0, 64, 255], i)
      } else {
        const grey = 255 - ((255 - ((pa[i] ?? 0) + (pa[i + 1] ?? 0) + (pa[i + 2] ?? 0)) / 3) * 0.25)
        diff.data.set([grey, grey, grey, 255], i)
      }
    }
    ctx.putImageData(diff, 0, 0)
    return { png: out.toDataURL('image/png'), ratio: differing / (width * height) }
  })
}

export async function attachVisual(protoPage: Page, vuePage: Page, testInfo: TestInfo): Promise<void> {
  const [protoShot, vueShot] = await Promise.all([shoot(protoPage), shoot(vuePage)])
  await testInfo.attach('proto.png', { body: protoShot, contentType: 'image/png' })
  await testInfo.attach('vue.png', { body: vueShot, contentType: 'image/png' })
  const scratch = await vuePage.context().newPage()
  try {
    const { png, ratio } = await scratch.evaluate(heatmap, {
      a: `data:image/png;base64,${protoShot.toString('base64')}`,
      b: `data:image/png;base64,${vueShot.toString('base64')}`,
      tolerance: CHANNEL_TOLERANCE,
    })
    await testInfo.attach('diff.png', { body: Buffer.from(png.split(',')[1] ?? '', 'base64'), contentType: 'image/png' })
    testInfo.annotations.push({ type: 'pixels differing', description: `${(ratio * 100).toFixed(1)}%` })
  } finally {
    await scratch.close()
  }
}
