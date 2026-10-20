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

// What a share carries (ui/flows.md section 8): each number with its qualifiers, the label only when
// included, and never the client IP, the note, the browser or a URL.

import { describe, expect, it } from 'vitest'

import type { Wording } from '@/components/test/wording'
import type { Result } from '@/engine/messages'
import { createAppI18n } from '@/i18n'
import { shareContent } from '@/share/content'
import { shareView } from '@/share/summary'
import { continuousResult } from '@/test/continuous'
import { resultFixture } from '@/test/fixtures'

const loaded = (increaseMs: number, source: 'websocket' | 'http-h2' = 'websocket', idleSource?: 'websocket') => ({
  source,
  ...(idleSource === undefined ? {} : { idleSource }),
  samples: 40,
  skippedTicks: 0,
  lost: 0,
  medianMs: 3 + increaseMs,
  p90Ms: 4 + increaseMs,
  increaseMs,
  series: [],
})

function graded(): Result {
  const base = resultFixture({ label: 'Home Wi-Fi', note: 'Router at http://192.168.1.1/admin, neighbor streaming' })
  return {
    ...base,
    download: { ...base.download!, loadedLatency: loaded(12) },
    upload: { ...base.upload!, loadedLatency: loaded(31, 'http-h2', 'websocket'), confidence: { level: 'low', reasons: ['unstable'] } },
    bufferbloat: { grade: 'B', basis: 'download+upload', increaseMs: 31 },
  }
}

describe('shareContent', () => {
  it('carries no client IP, note, browser or URL, whatever the result holds', () => {
    const result = graded()
    for (const includeLabel of [false, true]) {
      const text = JSON.stringify(shareContent(result, includeLabel))
      for (const secret of [result.client.ip, result.note ?? '', '://', result.client.browser.name, result.client.browser.os, result.client.contextLabel, result.server.epoch, result.id]) {
        expect(text).not.toContain(secret)
      }
      expect(Object.keys(shareContent(result, includeLabel)).sort()).toEqual(['basis', 'download', 'grade', 'idleMs', 'jitterMs', 'label', 'loaded', 'overheadPercent', 'resolutionMs', 'server', 'startedAt', 'upload'])
    }
  })

  it('carries the label only when the user includes it and the result has one', () => {
    expect(shareContent(graded(), false).label).toBeNull()
    expect(shareContent(graded(), true).label).toBe('Home Wi-Fi')
    expect(shareContent(resultFixture(), true).label).toBeNull()
  })

  it('carries the numbers with their qualifiers, and the increase the grade reads with its direction, source and idle path', () => {
    expect(shareContent(graded(), false)).toEqual({
      label: null,
      startedAt: '2026-10-08T12:02:11.000Z',
      server: 'Basement NAS',
      download: { status: 'measured', bitsPerSecond: 612_000_000, confidence: null },
      upload: { status: 'measured', bitsPerSecond: 438_000_000, confidence: { level: 'low', reasons: ['unstable'] } },
      overheadPercent: 0,
      idleMs: 3.1,
      jitterMs: 0.4,
      resolutionMs: 0.1,
      loaded: { increaseMs: 31, direction: 'upload', source: 'http-h2', idleSource: 'websocket' },
      grade: 'B',
      basis: null,
    })
  })

  it('leaves out a direction the run did not include, and says a direction without a number by its status', () => {
    const base = resultFixture()
    const content = shareContent({ ...base, settings: { ...base.settings, phases: ['idle', 'download'] }, download: { status: 'insufficient-data', streams: 1, bytes: 0, events: [] } }, false)
    expect(content.upload).toBeNull()
    expect(content.download).toEqual({ status: 'insufficient-data', bitsPerSecond: null, confidence: null })
    expect(content.loaded).toBeNull()
    expect(content.grade).toBeNull()
  })

  it('names the basis of the grade only when it reads one direction', () => {
    const result = graded()
    expect(shareContent({ ...result, bufferbloat: { grade: 'A', basis: 'download', increaseMs: 12 } }, false)).toMatchObject({
      basis: 'download',
      loaded: { increaseMs: 12, direction: 'download', source: 'websocket', idleSource: null },
    })
  })

  it('carries neither the HTTP loaded responsiveness nor the quality scores, into the content or the copied summary', () => {
    const base = graded()
    const result: Result = {
      ...base,
      download: { ...base.download!, responsiveness: { state: 'measured', protocol: 'h2', samples: 40, rpm: 1420, tm95Ms: 42.3, trimmed: 2, totalMedianMs: 44 } },
      upload: { ...base.upload!, responsiveness: { state: 'uncertain', protocol: 'h2', samples: 22, rpm: 980, tm95Ms: 61.2, trimmed: 1, totalMedianMs: 63 } },
      scores: { basis: 'download+upload', packetLoss: 'not-measured', streaming: { points: 90, band: 'great' }, gaming: { points: 60, band: 'average' }, rtc: { points: 75, band: 'good' } },
    }
    const wording: Wording = { t: createAppI18n('', ['en']).global.t as unknown as Wording['t'], locale: 'en' }
    for (const includeLabel of [false, true]) {
      const content = shareContent(result, includeLabel)
      expect(content).toEqual(shareContent(base, includeLabel))
      const words = JSON.stringify(shareView(content, 'bits', wording))
      for (const absent of ['RPM', 'responsiveness', '1,420', '1420', 'TM95', 'Streaming', 'Gaming', 'Video calls', 'Great', 'Average', 'quality']) {
        expect(words).not.toContain(absent)
      }
    }
  })
})

describe('a Continuous result', () => {
  it('is one block, the direction it ran, its headline with no peak', () => {
    const content = shareContent(continuousResult({ direction: 'upload', endMs: 7_200_000, bucketMs: 60_000 }), false)
    expect(content.download).toBeNull()
    expect(content.upload).toEqual({ status: 'measured', bitsPerSecond: 921e6, confidence: null })
    const wording: Wording = { t: createAppI18n('', ['en']).global.t as unknown as Wording['t'], locale: 'en' }
    const view = shareView(content, 'bits', wording)
    expect(view.blocks.map((block) => [block.label, block.value, block.unit])).toEqual([['↑ Upload', '921', 'Mbit/s']])
    expect(view.lines.join('\n')).not.toMatch(/Download|peak/i)
  })
})
