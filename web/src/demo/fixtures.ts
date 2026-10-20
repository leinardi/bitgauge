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

import type { LinkProfile, LoadedDelay } from '@/demo/link'
import { DEMO_SCENARIOS, type DemoCommand, type DemoScenario } from '@/demo/scenarios'
import type { Info } from '@/engine/types'

// The demo's servers and links, named as in the design export's UI kit (ui_kits/app/TestScreen.jsx):
// "Basement NAS" reached over the LAN at 612 Mbit/s down and 438 Mbit/s up with 3.1 ms of idle
// latency over HTTP/2, or the same LAN over HTTP/1.1 and its six connections for the
// upload-interrupted and ws-fallback states, or at the 921 Mbit/s of its Continuous states; over a
// VPN at 640 kbit/s and 210 kbit/s with 48 ms; and the 20 kbit/s link of its insufficient-data state. Under load the LAN's queue adds 15 ms on
// download and 39 ms on upload, the VPN's 114 ms and 262 ms, each within about a second: the kit's
// loaded-latency numbers. A VPN queue filling more slowly would leave a run stopped in its download
// or upload near grade B's bound, where the kit's grades C. The GET /info answers are what the
// server would send to that client with its default configuration (configuration.md section 1),
// with the compatibility layers the demo panel turns on.

export type DemoLinkName = 'lan' | 'lan-http1' | 'lan-921' | 'vpn' | 'insufficient'

const MIB = 1024 * 1024

/** The kit's loaded latency over its idle latency: grade B on the LAN, D on the VPN. */
const LAN_LOADED: LoadedDelay = { downloadMs: 15, uploadMs: 39, tauMs: 1000 }
const VPN_LOADED: LoadedDelay = { downloadMs: 114, uploadMs: 262, tauMs: 1000 }

/** The compatibility layers the demo server has on: all of them unless the panel turns one off, as the kit's are. */
const ALL_LAYERS: Info['compat'] = { openspeedtest: true, librespeed: true, networkquality: true }

function info(client: Info['client'], basePath: string, compat: Info['compat']): Info {
  return {
    server: { name: 'Basement NAS', version: '1.4.0', commit: 'a1b2c3d', buildDate: '2026-09-30', epoch: '2026-09-30T08:12:44.000Z', basePath },
    client,
    limits: { maxDownloadBytes: 256 * MIB, maxUploadBytes: 256 * MIB, maxStreamsPerClient: 8, uploadLifetimeMs: 120_000, bucketMs: 100 },
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
    compat: { ...compat },
  }
}

export const DEMO_LINKS: Readonly<Record<DemoLinkName, LinkProfile>> = {
  // Six streams fill the link: one connection carries at most about a sixth of it, so that each
  // trial of the ramp gains and it reaches its cap in both directions.
  lan: {
    downloadBitsPerSecond: 612e6,
    uploadBitsPerSecond: 438e6,
    perRequestBitsPerSecond: { download: 110e6, upload: 80e6 },
    rttMs: 3.1,
    jitterMs: 0.8,
    protocol: 'h2',
    loaded: LAN_LOADED,
  },
  // The same LAN behind a proxy that speaks HTTP/1.1, with the browser's six connections: the first
  // failed upload request ends the upload (measurement.md section 7.5), and the HTTP latency
  // fallback runs reserved (section 11.2).
  'lan-http1': {
    downloadBitsPerSecond: 612e6,
    uploadBitsPerSecond: 438e6,
    perRequestBitsPerSecond: { download: 110e6, upload: 80e6 },
    rttMs: 3.1,
    jitterMs: 0.8,
    protocol: 'http/1.1',
    loaded: LAN_LOADED,
    connections: 6,
  },
  // The kit's Continuous fixture (TestScreen.jsx): the LAN at 921 Mbit/s down over HTTP/2, and
  // its Continuous upload's 412 Mbit/s, with the LAN's loaded delays; six streams fill it, as on
  // the LAN.
  'lan-921': {
    downloadBitsPerSecond: 921e6,
    uploadBitsPerSecond: 412e6,
    perRequestBitsPerSecond: { download: 165e6, upload: 75e6 },
    rttMs: 3.1,
    jitterMs: 0.8,
    protocol: 'h2',
    loaded: LAN_LOADED,
  },
  vpn: {
    downloadBitsPerSecond: 640e3,
    uploadBitsPerSecond: 210e3,
    rttMs: 48,
    jitterMs: 9.4,
    protocol: 'h2',
    loaded: VPN_LOADED,
  },
  insufficient: {
    downloadBitsPerSecond: 20e3,
    uploadBitsPerSecond: 19e3,
    rttMs: 48,
    jitterMs: 9.4,
    protocol: 'h2',
  },
}

// The client the server sees: a private address, which it suggests as LAN, or behind the VPN a
// CGNAT one, which it suggests as VPN (wire-protocol.md section 5).
const LAN_CLIENT: Info['client'] = { ip: '192.168.1.42', ipVersion: 4, addressClass: 'private', suggestedLabel: 'LAN' }
const VPN_CLIENT: Info['client'] = { ip: '100.101.4.17', ipVersion: 4, addressClass: 'cgnat', suggestedLabel: 'VPN' }

/**
 * The GET /info answer the link's client sees: the kit's 100.101.4.17 behind the VPN, 192.168.1.42
 * otherwise, with the layers the panel left on.
 */
export function infoFor(link: DemoLinkName, basePath = '/', compat: Info['compat'] = ALL_LAYERS): Info {
  return info(link === 'vpn' ? VPN_CLIENT : LAN_CLIENT, basePath, compat)
}

/** GET /info as the scenario of `command` answers it, on the Worker's side and the page's alike. */
export function scenarioInfo(command: Pick<DemoCommand, 'scenario' | 'compat'>): Info {
  const scenario: DemoScenario = DEMO_SCENARIOS[command.scenario]
  return infoFor(scenario.link, scenario.basePath, command.compat)
}
