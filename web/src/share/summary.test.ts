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

// The share's words (ui/flows.md section 8): the summary's lines and the image's parts say the same
// things, each number with its qualifiers, in the page's language.

import { describe, expect, it } from 'vitest'

import type { Wording } from '@/components/test/wording'
import { createAppI18n } from '@/i18n'
import type { ShareContent } from '@/share/content'
import { shareView } from '@/share/summary'

const wording: Wording = { t: createAppI18n('', ['en']).global.t as unknown as Wording['t'], locale: 'en' }
const DATE = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date('2026-10-08T12:02:11.000Z'))

const content = (overrides: Partial<ShareContent> = {}): ShareContent => ({
  label: null,
  startedAt: '2026-10-08T12:02:11.000Z',
  server: 'Basement NAS',
  download: { status: 'measured', bitsPerSecond: 612_000_000, confidence: null },
  upload: { status: 'measured', bitsPerSecond: 438_000_000, confidence: null },
  overheadPercent: 0,
  idleMs: 3.1,
  jitterMs: 0.4,
  resolutionMs: 0.1,
  loaded: { increaseMs: 12, direction: 'download', source: 'websocket' },
  grade: 'A',
  ...overrides,
})

describe('shareView', () => {
  it('words a complete result as the summary the panel copies', () => {
    const view = shareView(content(), 'bits', wording)
    expect(view.lines).toEqual([
      'BitGauge',
      DATE,
      'Download 612 Mbit/s · Upload 438 Mbit/s',
      'Idle latency 3.1 ms · Jitter 0.4 ms',
      'Loaded latency +12 ms (download)',
      'Bufferbloat grade A · Low bufferbloat',
      'Server: Basement NAS',
    ])
    expect(view.head).toBe('')
    expect(view.blocks.map(({ label, value, unit, qualifier }) => [label, value, unit, qualifier])).toEqual([
      ['↓ Download', '612', 'Mbit/s', null],
      ['↑ Upload', '438', 'Mbit/s', null],
    ])
    expect(view.grade).toEqual({ letter: 'A', word: 'Low', name: 'Bufferbloat grade A · Low bufferbloat' })
    expect(view.foot).toEqual(['3.1 ms idle', '0.4 ms jitter', '+12 ms loaded (download)', DATE])
    expect(view.server).toBe('Basement NAS')
  })

  it('heads the summary and the image with the label when it is included', () => {
    const view = shareView(content({ label: 'Home Wi-Fi' }), 'bits', wording)
    expect(view.lines[0]).toBe('BitGauge · Home Wi-Fi')
    expect(view.head).toBe('Home Wi-Fi')
  })

  it('carries every qualifier: status, confidence, overhead compensation and a source other than the WebSocket', () => {
    const view = shareView(
      content({
        download: { status: 'partial', bitsPerSecond: 590_000_000, confidence: 'low' },
        upload: { status: 'insufficient-data', bitsPerSecond: null, confidence: null },
        overheadPercent: 2.5,
        loaded: { increaseMs: 31, direction: 'download', source: 'http-h2' },
        grade: 'C',
      }),
      'bytes',
      wording,
    )
    expect(view.lines.slice(2, 4)).toEqual(['Download 73.8 MB/s (partial, low confidence) · Upload insufficient data', '+2.5\u00a0% overhead compensation'])
    expect(view.lines).toContain('Loaded latency +31 ms (download, HTTP/2 probe)')
    expect(view.blocks.map(({ value, unit, qualifier }) => [value, unit, qualifier])).toEqual([
      ['73.8', 'MB/s', 'partial, low confidence'],
      ['—', '', 'insufficient data'],
    ])
    expect(view.foot).toContain('+2.5\u00a0% overhead compensation')
    expect(view.foot).toContain('+31 ms loaded (download, HTTP/2 probe)')
  })

  it('leaves out what the result does not have', () => {
    const view = shareView(content({ upload: null, idleMs: null, jitterMs: null, loaded: null, grade: null }), 'bits', wording)
    expect(view.lines).toEqual(['BitGauge', DATE, 'Download 612 Mbit/s', 'Server: Basement NAS'])
    expect(view.grade).toBeNull()
    expect(view.foot).toEqual([DATE])
  })
})
