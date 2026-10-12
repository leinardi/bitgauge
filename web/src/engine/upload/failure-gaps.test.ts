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

// Failure gaps and the HTTP/1.1 rule of measurement.md section 7.5. Two streams: stream A sends
// r1, then r2, which fails (a 429), then r3 and r4; stream B has one long request r5 whose bytes
// cross the failure gap.

import { describe, expect, it } from 'vitest'

import { steadyTelemetry } from '@/engine/test/telemetry'
import { allowsUpperBound, UploadLedger } from '@/engine/upload/watermark'
import { confirmedSeries, steadyWindow } from '@/engine/upload/window'

const r1Telemetry = steadyTelemetry(100, 1100, 50_000)
const r3Telemetry = steadyTelemetry(1400, 2400, 50_000)
const r5Telemetry = steadyTelemetry(1000, 2000, 40_000)

function scenario(protocol: string) {
  const ledger = new UploadLedger()
  ledger.protocol = protocol
  const r1 = ledger.send(0)
  const r5 = ledger.send(900)
  ledger.confirm(r1, 1200, r1Telemetry)
  const r2 = ledger.send(1200)
  ledger.end(r2, 1300)
  const r3 = ledger.send(1300)
  return { ledger, r2, r3, r5 }
}

function confirmRest({ ledger, r3, r5 }: ReturnType<typeof scenario>) {
  ledger.confirm(r5, 2100, r5Telemetry)
  ledger.confirm(r3, 2500, r3Telemetry)
  return ledger.send(2500)
}

describe('upper bounds by protocol', () => {
  it('exist on HTTP/2 and HTTP/3 only', () => {
    expect(allowsUpperBound('h2')).toBe(true)
    expect(allowsUpperBound('h3')).toBe(true)
    expect(allowsUpperBound('http/1.1')).toBe(false)
    expect(allowsUpperBound('')).toBe(false)
  })
})

describe('a failed request on HTTP/2', () => {
  it('stays open until a request sent after it confirms', () => {
    const { ledger, r2, r5 } = scenario('h2')

    expect(ledger.lowerBound(r2)).toBe(1100)
    expect(ledger.upperBound(r2)).toBeNull()
    expect(ledger.isOpen(r2)).toBe(true)
    // r5, in flight since before any confirmation, is bounded by P_start and holds C lower still.
    expect(ledger.isOpen(r5)).toBe(true)
    expect(ledger.lowerBound(r5)).toBe(100)
    expect(ledger.watermark()).toBe(100)
  })

  it('then closes to the failure gap [lb, ub)', () => {
    const state = scenario('h2')
    const r4 = confirmRest(state)
    const { ledger, r2 } = state

    expect(ledger.upperBound(r2)).toBe(1400)
    expect(ledger.isOpen(r2)).toBe(false)
    expect(ledger.failureGaps()).toEqual([{ startMs: 1100, endMs: 1400 }])
    // r4 is in flight; its lower bound is r3's end, the latest done by the time it was sent.
    expect(ledger.lowerBound(r4)).toBe(2400)
    expect(ledger.windowEnd()).toBe(2400)
  })

  it('excludes the gap cells from bytes and time, and the series continues after it', () => {
    const state = scenario('h2')
    confirmRest(state)
    const { ledger } = state

    const series = confirmedSeries(ledger)
    expect(series?.first).toBe(1)
    expect(series?.end).toBe(24)
    // Cells 11 to 13 overlap [1100, 1400); r5 counted bytes there, but they are unknown.
    expect(ledger.grid.bytes(12)).toBeGreaterThan(0)
    expect(series?.range(10, 15)).toEqual([ledger.grid.bytes(10), null, null, null, ledger.grid.bytes(14)])
    expect(series?.known(14, 24)).toHaveLength(10)

    const window = steadyWindow(ledger, 100, 2400)
    const gapBytes = ledger.grid.bytes(11) + ledger.grid.bytes(12) + ledger.grid.bytes(13)
    expect(window.cells).toHaveLength(20)
    expect(window.windowMs).toBe(2000)
    expect(window.bytes).toBe(140_000 - gapBytes)
    // r1 and r3 lie wholly inside; r5 crosses the gap, so it contributes bytes but is not counted.
    expect(window.confirmedInside).toBe(2)
  })
})

describe('a failed request on HTTP/1.1', () => {
  for (const protocol of ['http/1.1', '']) {
    it(`stays open and freezes the watermark at its lower bound (${protocol || 'unreported'})`, () => {
      const state = scenario(protocol)
      confirmRest(state)
      const { ledger, r2 } = state

      expect(ledger.upperBound(r2)).toBeNull()
      expect(ledger.isOpen(r2)).toBe(true)
      expect(ledger.failureGaps()).toEqual([])
      expect(ledger.watermark()).toBe(1100)
      expect(ledger.windowEnd()).toBe(1100)
      expect(confirmedSeries(ledger)?.end).toBe(11)
    })
  }
})

describe('the ledger', () => {
  it('accepts telemetry or an end only for a request in flight', () => {
    const ledger = new UploadLedger()
    const id = ledger.send(0)
    ledger.end(id, 10)

    expect(() => ledger.end(id, 20)).toThrow(Error)
    expect(() => ledger.confirm(id, 20, r1Telemetry)).toThrow(Error)
    expect(() => ledger.confirm(7, 20, r1Telemetry)).toThrow(Error)
  })

  it('has no window before the first confirmed request', () => {
    const ledger = new UploadLedger()
    const id = ledger.send(0)

    expect(ledger.phaseStart()).toBeNull()
    expect(ledger.lowerBound(id)).toBeNull()
    expect(ledger.watermark()).toBeNull()
    expect(ledger.windowEnd()).toBeNull()
    expect(confirmedSeries(ledger)).toBeNull()
  })

  it('bounds a request with no qualifying confirmed request by P_start', () => {
    const ledger = new UploadLedger()
    const early = ledger.send(0)
    const confirmed = ledger.send(10)
    ledger.confirm(confirmed, 1200, r1Telemetry)

    expect(ledger.lowerBound(early)).toBe(100)
    expect(ledger.windowEnd()).toBe(100)
  })
})
