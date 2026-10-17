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

import { exportFilename } from '@/export/serialize'
import { saveFile } from '@/lib/saveFile'

// The share's actions (ui/flows.md section 8): download the image, copy the summary, or pass the
// image to the system share sheet where the browser can share files. Everything is made in the
// browser; nothing is sent to the server or any third party.

const PNG = 'image/png'

/** `bitgauge-<YYYY-MM-DD>-<HHMM>.png`, named as the result's JSON export is. */
export function imageFilename(startedAt: string): string {
  const started = new Date(startedAt)
  return exportFilename(Number.isNaN(started.getTime()) ? new Date(0) : started).replace(/\.json$/, '.png')
}

export function downloadImage(image: Blob, startedAt: string): void {
  saveFile(imageFilename(startedAt), image, PNG)
}

/** Writes the summary to the clipboard; false when the browser has no clipboard or refuses it. */
export async function copySummary(text: string, nav: Navigator = navigator): Promise<boolean> {
  try {
    if (typeof nav.clipboard?.writeText !== 'function') {
      return false
    }
    await nav.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

/** Whether the browser can pass a PNG file to the system share sheet. */
export function canShareFiles(nav: Navigator = navigator): boolean {
  try {
    return typeof nav.canShare === 'function' && typeof nav.share === 'function' && nav.canShare({ files: [new File([], 'bitgauge.png', { type: PNG })] })
  } catch {
    return false
  }
}

/** Passes the image to the share sheet; false when the user closed it or the browser refused. */
export async function shareImage(image: Blob, startedAt: string, title: string, nav: Navigator = navigator): Promise<boolean> {
  try {
    await nav.share({ files: [new File([image], imageFilename(startedAt), { type: PNG })], title })
    return true
  } catch {
    return false
  }
}
