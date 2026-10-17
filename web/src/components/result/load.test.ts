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

// The load card's wording (ui/screens.md section 6): each direction's source, its median, p90 and
// increase over idle, "vs idle over" the idle path when it differs, "no idle latency" without an
// increase, the reason of an unavailable one; and the grade's words and basis.

import { describe, expect, it } from 'vitest'

import { gradeView, loadRows } from '@/components/result/load'
import type { LoadedLatency, Result } from '@/engine/messages'
import { createAppI18n } from '@/i18n'
import { resultFixture } from '@/test/fixtures'

const t = createAppI18n('', ['en']).global.t as unknown as Parameters<typeof loadRows>[1]['t']
const wording = { t, locale: 'en' }

const measured = (patch: Partial<Extract<LoadedLatency, { series: unknown }>> = {}): LoadedLatency => ({ source: 'websocket', samples: 40, skippedTicks: 0, lost: 0, medianMs: 18, p90Ms: 24, increaseMs: 15, series: [], ...patch })

function result(download: LoadedLatency | undefined, upload: LoadedLatency | undefined, bufferbloat?: Result['bufferbloat']): Result {
  const base = resultFixture()
  return { ...base, download: base.download && { ...base.download, loadedLatency: download }, upload: base.upload && { ...base.upload, loadedLatency: upload }, ...(bufferbloat === undefined ? {} : { bufferbloat }) }
}

describe('loadRows', () => {
  it('words a measured direction with its source, median, p90 and increase over idle', () => {
    const rows = loadRows(result(measured(), measured({ source: 'http-h2', medianMs: 42, p90Ms: 55, increaseMs: 39, idleSource: 'websocket' })), wording)
    expect(rows).toEqual([
      { direction: 'download', label: 'During download · WebSocket', sub: 'p90 24 · +15 ms vs idle', value: '18' },
      { direction: 'upload', label: 'During upload · HTTP/2 probe', sub: 'p90 55 · +39 ms vs idle over WebSocket', value: '42' },
    ])
  })

  it('says "no idle latency" where idle latency has no median', () => {
    const [row] = loadRows(result(measured({ increaseMs: undefined }), undefined), wording)
    expect(row?.sub).toBe('p90 24 · no idle latency')
  })

  it('gives an unavailable direction no number and its reason, without a source when there was no probe', () => {
    const rows = loadRows(
      result(
        { status: 'unavailable', reason: 'reservation-broken', source: 'http-h1-reserved', samples: 24, skippedTicks: 0, lost: 0 },
        { status: 'unavailable', reason: 'no-probe-path', samples: 0, skippedTicks: 0, lost: 0 },
      ),
      wording,
    )
    expect(rows).toEqual([
      { direction: 'download', label: 'During download · HTTP/1.1 reserved', sub: 'HTTP/1.1 reservation not held', value: null },
      { direction: 'upload', label: 'During upload', sub: 'no latency probe', value: null },
    ])
    expect(loadRows(result({ status: 'unavailable', reason: 'insufficient-samples', source: 'http-h3', samples: 7, skippedTicks: 0, lost: 0 }, undefined), wording)[0]?.sub).toBe('fewer than 10 samples')
  })

  it('has no row for a direction that measured no loaded latency', () => {
    expect(loadRows(result(undefined, undefined), wording)).toEqual([])
  })
})

describe('gradeView', () => {
  it('names the worse direction of both, with the other', () => {
    const view = gradeView(result(measured(), measured({ increaseMs: 39 }), { grade: 'B', basis: 'download+upload', increaseMs: 39 }), wording)
    expect(view).toEqual({ grade: 'B', words: 'Mild bufferbloat', basis: 'Basis: worse of download and upload — upload +39 ms (download +15 ms)' })
  })

  it('names a one-direction basis', () => {
    expect(gradeView(result(measured(), undefined, { grade: 'A', basis: 'download', increaseMs: 15 }), wording).basis).toBe('Basis: download only — +15 ms vs idle')
    expect(gradeView(result(undefined, measured(), { grade: 'A', basis: 'upload', increaseMs: 15 }), wording).basis).toBe('Basis: upload only — +15 ms vs idle')
  })

  it('says what a grade needs when there is none', () => {
    expect(gradeView(result(undefined, undefined), wording)).toEqual({ grade: null, words: 'Not graded', basis: 'Needs idle latency and the latency under load of a direction' })
  })
})
