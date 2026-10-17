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

// The share's actions (ui/flows.md section 8): the image named as the JSON export is, the clipboard
// with its refusal reported, and the share sheet only where the browser can share files.

import { describe, expect, it, vi } from 'vitest'

import { canShareFiles, copySummary, imageFilename, shareImage } from '@/share/actions'

const nav = (parts: Partial<Navigator>) => parts as Navigator

describe('the share actions', () => {
  it('names the image bitgauge-<date>-<time>.png from the run start', () => {
    expect(imageFilename(new Date(2026, 9, 8, 14, 2, 11).toISOString())).toBe('bitgauge-2026-10-08-1402.png')
  })

  it('copies the summary, and reports a missing or refused clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    expect(await copySummary('BitGauge', nav({ clipboard: { writeText } as unknown as Clipboard }))).toBe(true)
    expect(writeText).toHaveBeenCalledWith('BitGauge')
    expect(await copySummary('BitGauge', nav({ clipboard: { writeText: vi.fn().mockRejectedValue(new DOMException('denied', 'NotAllowedError')) } as unknown as Clipboard }))).toBe(false)
    expect(await copySummary('BitGauge', nav({}))).toBe(false)
  })

  it('offers the share sheet only where the browser can share a PNG file', () => {
    const share = vi.fn()
    expect(canShareFiles(nav({ share, canShare: () => true }))).toBe(true)
    expect(canShareFiles(nav({ share, canShare: () => false }))).toBe(false)
    expect(canShareFiles(nav({ share }))).toBe(false)
    expect(canShareFiles(nav({ canShare: () => true }))).toBe(false)
    expect(
      canShareFiles(
        nav({
          share,
          canShare: () => {
            throw new TypeError('files')
          },
        }),
      ),
    ).toBe(false)
  })

  it('passes the image as a PNG file to the share sheet, and reports a closed sheet', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    const image = new Blob(['png'], { type: 'image/png' })
    expect(await shareImage(image, new Date(2026, 9, 8, 14, 2).toISOString(), 'BitGauge result', nav({ share }))).toBe(true)
    const [{ files, title }] = share.mock.lastCall as [{ files: File[]; title: string }]
    expect(title).toBe('BitGauge result')
    expect(files.map((file) => [file.name, file.type])).toEqual([['bitgauge-2026-10-08-1402.png', 'image/png']])
    expect(await shareImage(image, '', 'BitGauge result', nav({ share: vi.fn().mockRejectedValue(new DOMException('cancelled', 'AbortError')) }))).toBe(false)
  })
})
