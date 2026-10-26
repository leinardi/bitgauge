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

import { gradeView, loadRows, responsivenessView } from '@/components/result/load'
import type { LoadedLatency, Responsiveness, Result } from '@/engine/messages'
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

  it('says the one reason there is no grade, as the Test screen does', () => {
    expect(gradeView(result(undefined, undefined), wording)).toEqual({ grade: null, words: 'Not graded', basis: 'No loaded latency' })
    const unavailable: LoadedLatency = { status: 'unavailable', reason: 'no-steady-window', source: 'websocket', samples: 0, skippedTicks: 0, lost: 0 }
    // An error after idle latency was measured, with the download's loaded latency not gradable.
    const failed = { ...result(unavailable, undefined), status: 'error' as const }
    expect(gradeView(failed, wording).basis).toBe('No gradable direction')
    expect(gradeView({ ...result(undefined, undefined), status: 'error' }, wording).basis).toBe('Test incomplete')
    const { idle: _idle, ...withoutIdle } = result(measured({ increaseMs: undefined }), undefined)
    expect(gradeView(withoutIdle, wording).basis).toBe('No idle latency')
  })
})

describe('responsivenessView', () => {
  const block = (patch: Partial<Responsiveness> = {}): Responsiveness => ({ state: 'measured', protocol: 'h2', samples: 13, rpm: 1420, tm95Ms: 42.25, trimmed: 0, totalMedianMs: 45.6, ...patch }) as Responsiveness
  function withRpm(download: Responsiveness | undefined, upload: Responsiveness | undefined): Result {
    const base = resultFixture()
    return { ...base, download: base.download && { ...base.download, responsiveness: download }, upload: base.upload && { ...base.upload, responsiveness: upload } }
  }
  const LABEL = 'HTTP loaded responsiveness — connection sharing not verifiable'

  it('reads a whole RPM per direction under the protocol, and on the Result detail its TM95 and samples', () => {
    const result = withRpm(block(), block({ rpm: 980.4, tm95Ms: 61.2, samples: 23, trimmed: 1 }))
    expect(t('result.load.rpm.label')).toBe(LABEL)
    expect(responsivenessView(result, wording)).toEqual({
      protocol: 'HTTP/2',
      note: 'round trips per minute, one per direction',
      tag: null,
      rows: [
        { direction: 'download', value: '1,420', uncertain: false },
        { direction: 'upload', value: '980', uncertain: false },
      ],
    })
    expect(responsivenessView(result, wording, true)?.rows.map((row) => row.detail)).toEqual(['TM95 42\u00a0ms · 13 samples · TM95 equals the plain mean', 'TM95 61\u00a0ms · 23 samples · 1 trimmed'])
  })

  it('tags an uncertain direction, its RPM kept', () => {
    const view = responsivenessView(withRpm(block({ state: 'uncertain' }), block()), wording)
    expect(view?.tag).toBe('Uncertain')
    expect(view?.note).toBe('round trips per minute · uncertain')
    expect(view?.rows.map((row) => [row.value, row.uncertain])).toEqual([
      ['1,420', true],
      ['1,420', false],
    ])
  })

  it('says why HTTP/1.1 has no number, and that an empty protocol is treated as HTTP/1.1', () => {
    const h1 = (protocol: string) => block({ state: 'unavailable_h1', protocol, samples: 0 })
    const needs = responsivenessView(withRpm(h1('http/1.1'), h1('http/1.1')), wording, true)
    expect([needs?.protocol, needs?.note]).toEqual(['HTTP/1.1', 'needs HTTP/2 or HTTP/3 at the reverse proxy'])
    expect(needs?.rows).toEqual([
      { direction: 'download', value: null, uncertain: false, text: 'unavailable' },
      { direction: 'upload', value: null, uncertain: false, text: 'unavailable' },
    ])
    const unreported = responsivenessView(withRpm(h1(''), h1('')), wording)
    expect([unreported?.protocol, unreported?.note]).toEqual(['not reported', 'protocol not reported — treated as HTTP/1.1'])
    expect(unreported?.rows.map((row) => row.text)).toEqual([undefined, undefined])
  })

  it('reads not enough samples, and names the one direction that ran', () => {
    const view = responsivenessView(withRpm(undefined, block({ state: 'unavailable_insufficient', samples: 3 })), wording, true)
    expect(view?.note).toBe('round trips per minute, upload only')
    expect(view?.rows).toEqual([{ direction: 'upload', value: null, uncertain: false, text: 'not enough samples' }])
    expect(responsivenessView(withRpm(block(), undefined), wording)?.note).toBe('round trips per minute, download only')
  })

  it('is absent from a result without it, a record that predates it', () => {
    expect(responsivenessView(withRpm(undefined, undefined), wording)).toBeNull()
  })
})
