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

import type { components } from '@/api/types.gen'

// The engine's injected interfaces (frontend.md section 2). The engine reaches time and the
// network only through these: clock.ts and transport.ts wire the browser's, and the tests wire
// fakes that replay a synthetic timeline. Every instant is in milliseconds on the Clock.

export type TimerId = number

/** The monotonic clock and its timers, performance.now() and setTimeout in production. */
export interface Clock {
  now(): number
  setTimer(ms: number, fn: () => void): TimerId
  clearTimer(id: TimerId): void
  /** The time spent executing the Worker's own tasks so far (measurement.md section 16). */
  busyMs(): number
  /** The detected resolution of `now()` (edge-cases.md section 9). */
  readonly resolutionMs: number
  /** Whether the page is cross-origin isolated, which gives the finest timer. */
  readonly crossOriginIsolated: boolean
}

export type Info = components['schemas']['Info']

export type UploadTelemetry = components['schemas']['UploadTelemetry']

/** The fields of a request's Resource Timing entry the engine reads. */
export interface ResourceTiming {
  /** `h2`, `h3`, `http/1.1`, or empty when the browser does not report it. */
  nextHopProtocol: string
  requestStart: number
  responseStart: number
  responseEnd: number
}

/** A piece of a download body as it was read, with its arrival instant (measurement.md section 6). */
export interface DownloadChunk {
  bytes: number
  at: number
}

export interface DownloadResponse {
  status: number
  /** The response's Content-Encoding, or null without one (edge-cases.md section 13). */
  contentEncoding: string | null
  /** The body, read chunk by chunk; ends early with an error when the signal aborts. */
  chunks: AsyncIterable<DownloadChunk>
  /** The Resource Timing entry, known once the body has been read; null when there is none. */
  timing(): ResourceTiming | null
}

export interface UploadResponse {
  status: number
  /** The telemetry of a 200 answer (wire-protocol.md section 4); null for any other answer. */
  telemetry: UploadTelemetry | null
  timing: ResourceTiming | null
}

/** An HTTP probe with its timing entry (measurement.md sections 10 and 11.2, the HTTP fallback). */
export interface ProbeTiming {
  status: number
  sentAt: number
  doneAt: number
  timing: ResourceTiming | null
}

/** The idle-latency echo over /api/v1/ws (wire-protocol.md section 6). */
export interface WsEcho {
  /** Sends a ping whose `t` is its send instant. */
  ping(seq: number, sentAt: number): void
  /** Called with each echo and the instant it arrived. */
  onPong(listener: (seq: number, sentAt: number, receivedAt: number) => void): void
  /** Called once when the connection closes, with the close code. */
  onClose(listener: (code: number) => void): void
  close(): void
}

/** The browser's family, major version and operating system, parsed in the wiring. */
export interface BrowserIdentity {
  name: string
  major: number
  os: string
}

/**
 * GET /api/v1/info, with the browser identity the wiring parses from the user agent: the engine
 * never reads navigator (architecture.md section 4).
 */
export interface InfoResult {
  info: Info
  browser: BrowserIdentity
}

/** The network, fetch, XMLHttpRequest and WebSocket in production. */
export interface Transport {
  download(size: number, signal: AbortSignal): Promise<DownloadResponse>
  /** `onProgress` reports the bytes sent so far and the instant; it never feeds a number. */
  upload(
    size: number,
    onProgress: (sentBytes: number, at: number) => void,
    signal: AbortSignal,
  ): Promise<UploadResponse>
  /** Opens the echo; rejects when the WebSocket cannot open. */
  ws(): Promise<WsEcho>
  /** An HTTP probe with its timing entry; rejects when the signal aborts it. */
  probe(path: string, signal?: AbortSignal): Promise<ProbeTiming>
  info(): Promise<InfoResult>
}
