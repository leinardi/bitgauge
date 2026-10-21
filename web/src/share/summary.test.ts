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
import { type ShareView, shareView } from '@/share/summary'

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
  loaded: { increaseMs: 12, direction: 'download', source: 'websocket', idleSource: null },
  grade: 'A',
  basis: null,
  ...overrides,
})

const qualifiers = (view: ShareView) => view.blocks.map((block) => block.qualifiers.map(({ text, tone }) => `${tone}: ${text}`))

describe('shareView', () => {
  it('words a complete result as the summary the panel copies', () => {
    const view = shareView(content(), 'bits', wording)
    expect(view.lines).toEqual([
      'BitGauge',
      DATE,
      'Download 612 Mbit/s',
      'Upload 438 Mbit/s',
      'Idle latency 3.1 ms · Jitter 0.4 ms',
      'Loaded latency +12 ms (download)',
      'Bufferbloat grade A · Low bufferbloat',
      'Server: Basement NAS',
    ])
    expect(view.head).toBe('')
    expect(view.blocks.map(({ label, value, unit }) => [label, value, unit])).toEqual([
      ['↓ Download', '612', 'Mbit/s'],
      ['↑ Upload', '438', 'Mbit/s'],
    ])
    expect(qualifiers(view)).toEqual([[], []])
    expect(view.grade).toEqual({ letter: 'A', word: 'Low', basis: null, name: 'Bufferbloat grade A · Low bufferbloat' })
    expect(view.foot).toEqual(['3.1 ms idle', '0.4 ms jitter', '+12 ms under load (download)'])
    expect([view.server, view.date]).toEqual(['Basement NAS', DATE])
  })

  it('heads the summary and the image with the label when it is included', () => {
    const view = shareView(content({ label: 'Home Wi-Fi' }), 'bits', wording)
    expect(view.lines[0]).toBe('BitGauge · Home Wi-Fi')
    expect(view.head).toBe('Home Wi-Fi')
  })

  it('puts each qualifier with its number: status, confidence with its reasons and overhead compensation, in that order', () => {
    const view = shareView(
      content({
        download: { status: 'partial', bitsPerSecond: 590_000_000, confidence: { level: 'low', reasons: ['ramp-unsettled', 'insufficient-samples'] } },
        upload: { status: 'insufficient-data', bitsPerSecond: null, confidence: null },
        overheadPercent: 2.5,
      }),
      'bytes',
      wording,
    )
    expect(view.blocks.map(({ value, unit }) => [value, unit])).toEqual([
      ['73.8', 'MB/s'],
      ['—', ''],
    ])
    // Confidence and overhead compensation qualify a number: the block without one has its status alone.
    expect(qualifiers(view)).toEqual([
      ['muted: partial', 'warn: low confidence: ramp unsettled, insufficient samples', 'muted: +2.5\u00a0% overhead compensation'],
      ['warn: insufficient data'],
    ])
    expect(view.lines.slice(2, 4)).toEqual([
      'Download 73.8 MB/s (partial; low confidence: ramp unsettled, insufficient samples; +2.5\u00a0% overhead compensation)',
      'Upload — (insufficient data)',
    ])
  })

  it('words a CPU-bound rate, an error and a skipped direction in their tones', () => {
    const cpu = shareView(content({ download: { status: 'measured', bitsPerSecond: 612_000_000, confidence: { level: 'cpu-bound', reasons: [] } }, upload: { status: 'error', bitsPerSecond: null, confidence: null } }), 'bits', wording)
    expect(qualifiers(cpu)).toEqual([["warn: limited by this device's CPU"], ['danger: error']])
    const skipped = shareView(content({ upload: { status: 'skipped', bitsPerSecond: null, confidence: null } }), 'bits', wording)
    expect(qualifiers(skipped)).toEqual([[], ['muted: skipped']])
  })

  it('words a partial direction without a number as insufficient data', () => {
    const stopped = shareView(content({ upload: { status: 'partial', bitsPerSecond: null, confidence: null } }), 'bits', wording)
    expect(qualifiers(stopped)).toEqual([[], ['warn: insufficient data']])
  })

  it('follows the increase with its direction, a source other than the WebSocket and the other idle path, and the grade with its basis', () => {
    const view = shareView(content({ loaded: { increaseMs: 31, direction: 'upload', source: 'http-h2', idleSource: 'websocket' }, grade: 'C', basis: 'upload' }), 'bits', wording)
    expect(view.foot).toContain('+31 ms under load (upload, HTTP/2 probe, vs idle over WebSocket)')
    expect(view.lines).toContain('Loaded latency +31 ms (upload, HTTP/2 probe, vs idle over WebSocket)')
    expect(view.grade).toEqual({ letter: 'C', word: 'Moderate', basis: 'upload only', name: 'Bufferbloat grade C · Moderate bufferbloat (upload only)' })
    expect(view.lines).toContain('Bufferbloat grade C · Moderate bufferbloat (upload only)')
  })

  it('leaves out what the result does not have', () => {
    const view = shareView(content({ upload: null, idleMs: null, jitterMs: null, loaded: null, grade: null }), 'bits', wording)
    expect(view.lines).toEqual(['BitGauge', DATE, 'Download 612 Mbit/s', 'Server: Basement NAS'])
    expect(view.grade).toBeNull()
    expect(view.foot).toEqual([])
  })
})
