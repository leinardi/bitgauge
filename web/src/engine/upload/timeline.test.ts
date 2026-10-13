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

// The validation of upload telemetry (measurement.md section 7.3) and the placing of the phase's
// events on the server timeline.

import { describe, expect, it } from 'vitest'

import { steadyTelemetry } from '@/engine/test/telemetry'
import type { UploadTelemetry } from '@/engine/types'
import { serverEvents, validTelemetry } from '@/engine/upload/timeline'
import { UploadLedger } from '@/engine/upload/watermark'

/** 1000 bytes read from 1050 to 1250 ms: cells 10, 11 and 12. */
const VALID: UploadTelemetry = { epoch: 'e', bucketMs: 100, firstBucket: 10, buckets: [250, 500, 250], bytes: 1000, startMs: 1050, durationMs: 200 }

describe('validTelemetry', () => {
  it('accepts counts that add up to the bytes sent from the cell of the first byte', () => {
    expect(validTelemetry(VALID, 1000)).toBe(true)
    expect(validTelemetry({ ...VALID, buckets: [], bytes: 0, durationMs: 0 }, 0)).toBe(true)
  })

  const rejected: [string, Partial<UploadTelemetry>, number?][] = [
    ['a byte count other than the bytes sent', {}, 999],
    ['counts that do not add up to the bytes', { buckets: [250, 500, 249] }],
    ['a negative count', { buckets: [250, 1000, -250] }],
    ['a fractional count', { buckets: [250.5, 500, 249.5] }],
    ['a first cell other than the cell of the first byte', { firstBucket: 11 }],
    ['a first cell that is not a safe integer', { firstBucket: Number.POSITIVE_INFINITY, startMs: Number.POSITIVE_INFINITY }],
    ['a first byte that is not finite', { startMs: Number.NaN }],
    ['a negative read time', { durationMs: -1 }],
    ['a read time that is not finite', { durationMs: Number.POSITIVE_INFINITY }],
  ]
  for (const [what, change, size] of rejected) {
    it(`rejects ${what}`, () => {
      expect(validTelemetry({ ...VALID, ...change }, size ?? 1000)).toBe(false)
    })
  }
})

describe('serverEvents', () => {
  it('moves client instants by the display offset and gaps by P_start', () => {
    const ledger = new UploadLedger()
    ledger.protocol = 'h2'
    const first = ledger.send(0)
    ledger.confirm(first, 1400, steadyTelemetry(5150, 6250, 1100))
    const failed = ledger.send(1400)
    ledger.end(failed, 1500)
    const later = ledger.send(1500)
    ledger.confirm(later, 2900, steadyTelemetry(6800, 7750, 950))
    const events = serverEvents([{ code: 'extended', at: 2000 }, { code: 'error', at: 2100 }], 0, ledger, -4850)
    expect(events).toEqual([
      { code: 'extended', atMs: 2000 + 4850 - 5150 },
      { code: 'error', atMs: 2100 + 4850 - 5150, notice: 'requests-failed' },
      { code: 'failure-gap', startMs: 6250 - 5150, endMs: 6800 - 5150 },
    ])
  })

  it('keeps client instants relative to the client start without a confirmed request', () => {
    expect(serverEvents([{ code: 'cancelled', at: 1800 }], 300, new UploadLedger(), null)).toEqual([{ code: 'cancelled', atMs: 1500 }])
  })
})
