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

import type { Info } from '@/api/info'
import type { Result } from '@/engine/messages'

// A GET /api/v1/info answer (wire-protocol.md section 5), typed against the generated schema so a
// contract change breaks the tests that use it at compile time.

export function infoFixture(overrides: { client?: Partial<Info['client']>; server?: Partial<Info['server']>; compat?: Partial<Info['compat']> } = {}): Info {
  return {
    server: { name: 'Basement NAS', version: '0.1.0', commit: 'a1b2c3d', buildDate: '2026-09-30T12:00:00Z', epoch: 'k3V9qW2rT0aY', basePath: '/', ...overrides.server },
    client: { ip: '192.168.1.42', ipVersion: 4, addressClass: 'private', suggestedLabel: 'LAN', ...overrides.client },
    limits: { maxDownloadBytes: 268_435_456, maxUploadBytes: 268_435_456, maxStreamsPerClient: 8, uploadLifetimeMs: 120_000, bucketMs: 100 },
    defaults: {
      preset: 'standard',
      phases: ['idle', 'download', 'upload'],
      streams: { mode: 'auto', fixed: 3, max: 6 },
      download: { minMs: 10_000, maxMs: 20_000 },
      upload: { minMs: 15_000, maxMs: 25_000 },
      dataCapBytes: null,
      units: 'bits',
      warmup: 'auto',
      pingCount: 20,
      overheadCompensationPercent: 0,
    },
    compat: { openspeedtest: false, librespeed: false, networkquality: false, ...overrides.compat },
  }
}

/** A complete v0.1 result (measurement.md section 17) that passes validateResult; `overrides` replaces top-level fields. */
export function resultFixture(overrides: Partial<Result> = {}): Result {
  return {
    schema: 'bitgauge.result',
    schemaVersion: 1,
    id: '0b6f2c1e-8a4d-4f3b-9c2a-1d2e3f4a5b6c',
    startedAt: '2026-10-08T12:02:11.000Z',
    durationMs: 28_600,
    status: 'complete',
    label: '',
    server: { name: 'Basement NAS', version: '0.1.0', epoch: 'k3V9qW2rT0aY' },
    client: {
      ip: '192.168.1.42',
      contextLabel: 'LAN',
      protocol: 'HTTP/2',
      browser: { name: 'Firefox', major: 131, os: 'Linux' },
      timerResolutionMs: 0.1,
      crossOriginIsolated: false,
    },
    settings: { preset: 'standard', phases: ['idle', 'download', 'upload'], streams: { mode: 'auto', max: 6 }, dataCapBytes: null, overheadCompensationPercent: 0, warmup: 'auto', pingCount: 20 },
    idle: { path: 'websocket', lossPercent: 0, minMs: 2.8, medianMs: 3.1, p90Ms: 3.9, jitterMs: 0.4, samples: [3.1, 2.8, 3.9] },
    download: {
      status: 'measured',
      bitsPerSecond: 612_000_000,
      peakBitsPerSecond: 641_000_000,
      uncompensatedBitsPerSecond: 612_000_000,
      windowMs: 3500,
      streams: 6,
      plateau: 'cap',
      confidence: { level: 'normal', reasons: [] },
      bytes: 600_000_000,
      series: { bucketMs: 100, firstCellMs: 6500, warmupEndMs: 6500, endMs: 10_000, values: [7_650_000, null] },
      events: [],
    },
    upload: {
      status: 'measured',
      bitsPerSecond: 438_000_000,
      peakBitsPerSecond: 455_000_000,
      uncompensatedBitsPerSecond: 438_000_000,
      windowMs: 6100,
      streams: 4,
      plateau: 'no-gain',
      confidence: { level: 'normal', reasons: [] },
      bytes: 700_000_000,
      series: { bucketMs: 100, firstCellMs: 9500, warmupEndMs: 9500, endMs: 15_600, values: [5_475_000] },
      events: [],
      confirmedRequests: 38,
    },
    dataUsedBytes: 1_300_000_000,
    notices: [],
    ...overrides,
  }
}
