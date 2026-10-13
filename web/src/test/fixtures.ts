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

// A GET /api/v1/info answer (wire-protocol.md section 5), typed against the generated schema so a
// contract change breaks the tests that use it at compile time.

export function infoFixture(overrides: { client?: Partial<Info['client']>; server?: Partial<Info['server']> } = {}): Info {
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
    compat: { openspeedtest: false, librespeed: false, networkquality: false },
  }
}
