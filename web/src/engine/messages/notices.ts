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

import type { Direction, Preset } from '@/engine/messages/settings'

// The notices, confidence and error codes of the message contract (measurement.md section 16,
// architecture.md section 4). Re-exported by engine/messages.ts.

/** The confidence reasons of measurement.md section 8.3. */
export type ConfidenceReason = 'ramp-unsettled' | 'insufficient-samples' | 'unstable'

/** A direction's confidence (measurement.md section 16). */
export interface Confidence {
  level: 'normal' | 'low' | 'cpu-bound'
  reasons: ConfidenceReason[]
}

/** The notices of measurement.md section 16, each with the raw values it names. */
export type Notice =
  | { code: 'slow-link-extended'; direction: Direction }
  | { code: 'low-confidence'; direction: Direction; reasons: ConfidenceReason[] }
  | { code: 'data-cap-reached'; direction: Direction }
  /** A Continuous run's data used crossed `bytes`, 10⁹ × 10ᵏ (measurement.md section 15). */
  | { code: 'data-used'; bytes: number }
  /** A `429` lowered the effective cap; `streams` is the lowered cap (measurement.md section 4). */
  | { code: 'stream-limit'; direction: Direction; streams: number }
  | { code: 'insufficient-data'; direction: Direction; offer: Preset | null }
  | { code: 'url-parameter-ignored'; parameter: string; value: string }
  | { code: 'stopped-early'; direction: Direction; coveredMs: number }
  | { code: 'server-restarted' }
  | { code: 'server-unreachable' }
  | { code: 'proxy-buffering-suspected' }
  /** The browser's own upload path may bound the headline (measurement.md section 16); `browser` is its family. */
  | { code: 'browser-upload-limit'; browser: string }
  | { code: 'upload-interrupted' }
  | { code: 'response-compression-detected' }
  /** The HTTP/1.1 probe reservation (measurement.md section 11.2); `streams` is the reserved cap. */
  | { code: 'probe-reservation'; streams: number }
  | { code: 'overhead-compensation'; percent: number }
  | { code: 'timer-throttling-detected' }
  | { code: 'page-hidden' }
  | { code: 'network-changed' }
  | { code: 'websocket-reopened' }
  | { code: 'websocket-unavailable' }
  | { code: 'base-path-mismatch' }

export type NoticeCode = Notice['code']

/** The `error` event's codes (architecture.md section 4); the message key is `errors.<code>`. */
export type EngineErrorCode =
  | 'invalid-settings'
  | 'requests-failed'
  | 'network-changed'
  | 'server-restarted'
  | 'server-unreachable'
