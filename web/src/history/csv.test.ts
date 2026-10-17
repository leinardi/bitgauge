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

// The CSV export (frontend.md section 5): the columns verbatim, RFC 4180 quoting with CRLF lines,
// no byte order mark, the formula guard, and empty fields for what a result does not hold.

import { describe, expect, it } from 'vitest'

import { CSV_COLUMNS, toCsv } from '@/history/csv'
import { resultFixture } from '@/test/fixtures'

const HEADER =
  'id,startedAt,label,contextLabel,note,status,preset,protocol,clientIp,browser,serverName,serverVersion,downloadBitsPerSecond,downloadPeakBitsPerSecond,downloadStatus,downloadConfidence,uploadBitsPerSecond,uploadPeakBitsPerSecond,uploadStatus,uploadConfidence,idleMedianMs,idleP90Ms,jitterMs,idleLossPercent,downloadLoadedMedianMs,uploadLoadedMedianMs,bufferbloatGrade,rpm,rpmState,streamingBand,gamingBand,rtcBand,overheadCompensationPercent,dataUsedBytes,durationMs'

function rows(csv: string): string[] {
  expect(csv.endsWith('\r\n')).toBe(true)
  return csv.slice(0, -2).split('\r\n')
}

describe('the CSV export', () => {
  it('has the columns of the spec, verbatim and in order, and no byte order mark', () => {
    const csv = toCsv([])
    expect(CSV_COLUMNS.join(',')).toBe(HEADER)
    expect(csv).toBe(`${HEADER}\r\n`)
    expect(csv.charCodeAt(0)).not.toBe(0xfeff)
  })

  it('writes one row per result, its absent values empty', () => {
    const loaded = { source: 'websocket' as const, samples: 30, skippedTicks: 0, lost: 0, medianMs: 41.5, p90Ms: 50, series: [] }
    const result = resultFixture({ label: 'VPN', bufferbloat: { grade: 'B', basis: 'download+upload', increaseMs: 38 } })
    result.download = { ...result.download!, loadedLatency: loaded }
    const [, line] = rows(toCsv([result]))
    expect(line).toBe(
      '0b6f2c1e-8a4d-4f3b-9c2a-1d2e3f4a5b6c,2026-10-08T12:02:11.000Z,VPN,LAN,,complete,standard,HTTP/2,192.168.1.42,Firefox 131 (Linux),Basement NAS,0.1.0,612000000,641000000,measured,normal,438000000,455000000,measured,normal,3.1,3.9,0.4,0,41.5,,B,,,,,,0,1300000000,28600',
    )
  })

  it('leaves a direction or idle latency that did not run empty', () => {
    const result = resultFixture({ upload: { status: 'skipped', streams: 0, bytes: 0, events: [], confirmedRequests: 0 } })
    Reflect.deleteProperty(result, 'idle')
    const fields = rows(toCsv([result]))[1]?.split(',') ?? []
    const at = (column: (typeof CSV_COLUMNS)[number]) => fields[CSV_COLUMNS.indexOf(column)]
    expect([at('uploadBitsPerSecond'), at('uploadStatus'), at('uploadConfidence'), at('idleMedianMs'), at('idleLossPercent')]).toEqual(['', 'skipped', '', '', ''])
  })

  it('quotes a comma, a quote, CR and LF, doubling the quotes', () => {
    const [, line] = rows(toCsv([resultFixture({ label: 'Office, 2nd "floor"', note: 'line one\nline two\r' })]))
    expect(line).toContain(',"Office, 2nd ""floor""",LAN,"line one\nline two\r",complete,')
  })

  it('guards a text field that would read as a formula', () => {
    for (const [label, written] of [
      ['=1+1', "'=1+1"],
      ['+31 VPN', "'+31 VPN"],
      ['-x', "'-x"],
      ['@home', "'@home"],
      ['\tTab', "'\tTab"],
      ['\rCR', '"\'\rCR"'],
      ['VPN', 'VPN'],
    ]) {
      expect(rows(toCsv([resultFixture({ label })]))[1]?.split(',')[2]).toBe(written)
    }
  })
})
