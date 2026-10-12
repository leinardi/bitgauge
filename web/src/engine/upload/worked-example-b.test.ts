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

// Worked example B of measurement.md section 7.8: cancellation mid-request. Client instants are
// in milliseconds on the engine's clock, server instants on the grid's timeline.

import { describe, expect, it } from 'vitest'

import { steadyTelemetry } from '@/engine/test/telemetry'
import { UploadLedger } from '@/engine/upload/watermark'
import { confirmedSeries, steadyWindow } from '@/engine/upload/window'

const r7Telemetry = steadyTelemetry(6000, 7000, 120_000)
const r8Telemetry = steadyTelemetry(6400, 7400, 120_000)

function exampleB(protocol: string) {
  const ledger = new UploadLedger()
  ledger.protocol = protocol
  const r7 = ledger.send(5000)
  const r8 = ledger.send(5400)
  ledger.confirm(r7, 7150, r7Telemetry)
  const r9 = ledger.send(7150)
  ledger.confirm(r8, 7550, r8Telemetry)
  const r10 = ledger.send(7550)
  return { ledger, r9, r10 }
}

describe('worked example B', () => {
  for (const protocol of ['h2', 'http/1.1']) {
    it(`bounds the window by the open requests after a stop at 7.8 s (${protocol})`, () => {
      const { ledger, r9, r10 } = exampleB(protocol)
      // The user stops at 7.8 s: r9 and r10 are aborted and have no telemetry.
      ledger.end(r9, 7800)
      ledger.end(r10, 7800)

      expect(ledger.lowerBound(r9)).toBe(7000)
      expect(ledger.lowerBound(r10)).toBe(7400)
      // No confirmed request was sent after they ended, so both stay open.
      expect(ledger.isOpen(r9)).toBe(true)
      expect(ledger.isOpen(r10)).toBe(true)
      expect(ledger.failureGaps()).toEqual([])
      expect(ledger.watermark()).toBe(7000)
      expect(ledger.measurementEnd()).toBe(7400)
      expect(ledger.windowEnd()).toBe(7000)
    })
  }

  it("keeps r8's known cells after the window end out of every number", () => {
    const { ledger, r9, r10 } = exampleB('h2')
    ledger.end(r9, 7800)
    ledger.end(r10, 7800)

    // r8 counted bytes in cells 70 to 73, after W_end: they are unknown, never zero.
    expect(ledger.grid.bytes(72)).toBeGreaterThan(0)
    const series = confirmedSeries(ledger)
    expect(series?.first).toBe(60)
    expect(series?.end).toBe(70)
    expect(series?.range(70, 74)).toEqual([null, null, null, null])

    // With warm-up ending at 6000, the window is the full cells inside [6000, 7000), even when a
    // caller asks for more: r8's last 400 ms (cells 70 to 73) are never counted.
    for (const window of [steadyWindow(ledger, 6000), steadyWindow(ledger, 6000, 7400)]) {
      expect(window.cells).toEqual([60, 61, 62, 63, 64, 65, 66, 67, 68, 69])
      // All of r7, and r8's first 600 ms of its steady 120 000 bytes per second.
      expect(window.bytes).toBe(120_000 + 72_000)
      expect(window.windowMs).toBe(1000)
    }
  })

  it('extends the window to every full cell up to 8600 when the phase ends cleanly', () => {
    const { ledger, r9, r10 } = exampleB('h2')
    ledger.confirm(r9, 8350, steadyTelemetry(7200, 8200, 120_000))
    ledger.confirm(r10, 8750, steadyTelemetry(7600, 8600, 120_000))

    expect(ledger.watermark()).toBe(8600)
    expect(ledger.measurementEnd()).toBe(8600)
    expect(ledger.windowEnd()).toBe(8600)
    expect(confirmedSeries(ledger)?.end).toBe(86)
    expect(steadyWindow(ledger, 6000).cells.at(-1)).toBe(85)
  })
})
