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

import type { BrowserClock } from '@/engine/clock'
import type { DownloadChunk, DownloadResponse, InfoResult, ProbeTiming, ResourceTiming, Transport, UploadResponse, UploadTelemetry, WsEcho } from '@/engine/types'
import {
  apiUrl,
  browserIdentity,
  checkedInfo,
  type EchoCommand,
  type EchoEvent,
  refusalOf,
  TIMING_PROBE_WAIT_MS,
  TIMING_WAIT_MS,
  type TimingEntry,
  timingFor,
  TimingWaiter,
  UploadBody,
  webSocketUrl,
} from '@/engine/wiring'

// The production Transport (frontend.md section 2): fetch for download and the probes, an
// XMLHttpRequest for upload, the WebSocket echo and GET /info, every path under the base path
// (wire-protocol.md section 2). Each network callback is counted as one of the Worker's tasks for
// the busy fraction.

/** The Resource Timing buffer holds this many entries; a full buffer is cleared. */
const TIMING_BUFFER = 2000

/** The request's entry among the Worker's Resource Timing entries, or null while there is none. */
function entryOf(url: string, sentAt: number): ResourceTiming | null {
  return timingFor(performance.getEntriesByType('resource') as PerformanceResourceTiming[] as TimingEntry[], url, sentAt)
}

/** Called whenever the browser adds a resource entry. */
const arrivals = new Set<() => void>()
let buffered = false

/** Makes room for the entries of a run, and observes them as they are added. */
function bufferTimings(): void {
  if (!buffered) {
    buffered = true
    performance.setResourceTimingBufferSize(TIMING_BUFFER)
    // A full buffer is cleared, losing at most a few timings.
    performance.addEventListener('resourcetimingbufferfull', () => performance.clearResourceTimings())
    new PerformanceObserver(() => arrivals.forEach((arrived) => arrived())).observe({ type: 'resource' })
  }
}

/** Resolves true when the browser adds a resource entry within `ms`, false when it does not. */
function added(ms: number): Promise<boolean> {
  return new Promise((resolve) => {
    const arrived = () => settle(true)
    const timer = self.setTimeout(() => settle(false), ms)
    function settle(value: boolean): void {
      self.clearTimeout(timer)
      arrivals.delete(arrived)
      resolve(value)
    }
    arrivals.add(arrived)
  })
}

const TOO_MANY_REQUESTS = 429

/** The chunks of a failed answer, which is not read. */
const NO_CHUNKS: AsyncIterable<DownloadChunk> = {
  [Symbol.asyncIterator]: () => ({ next: () => Promise.resolve({ done: true, value: undefined }) }),
}

/**
 * The body's chunks with the instant each read resolved; the time until the next read is the
 * engine's. `ended` runs once the body has been read, before the engine learns it has.
 */
async function* chunks(reader: ReadableStreamDefaultReader<Uint8Array>, clock: BrowserClock, ended: () => Promise<void>): AsyncGenerator<DownloadChunk> {
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) {
        await ended()
        return
      }
      const at = clock.now()
      yield { bytes: value.byteLength, at }
      clock.count(clock.now() - at)
    }
  } finally {
    reader.releaseLock()
  }
}

function telemetryOf(text: string): UploadTelemetry | null {
  try {
    // The engine checks every field before it confirms a request (measurement.md section 7.3).
    return JSON.parse(text) as UploadTelemetry
  } catch {
    return null
  }
}

export class BrowserTransport implements Transport {
  private readonly clock: BrowserClock
  private readonly basePath: string
  private readonly body: UploadBody
  // Downloads and uploads wait briefly and give up after a miss; probes have patience of their own,
  // so a late upload entry under load never stops path B finding its entries (measurement.md 11.6).
  private readonly waiter = new TimingWaiter(TIMING_WAIT_MS, 'once')
  private readonly probeWaiter = new TimingWaiter(TIMING_PROBE_WAIT_MS, 'sticky')

  constructor(clock: BrowserClock, basePath: string) {
    this.clock = clock
    this.basePath = basePath
    // Filled once per run, in 64 KiB calls (measurement.md section 7.2).
    this.body = new UploadBody((chunk) => crypto.getRandomValues(chunk))
    bufferTimings()
  }

  async download(size: number, signal: AbortSignal): Promise<DownloadResponse> {
    const url = this.url(`api/v1/download?bytes=${size}`)
    const sentAt = this.clock.now()
    const response = await fetch(url, { cache: 'no-store', signal })
    const reader = response.status === 200 ? response.body?.getReader() : undefined
    // A 429's small envelope says which limit refused it (measurement.md section 4).
    const refusal = response.status === TOO_MANY_REQUESTS ? refusalOf(await response.text().catch(() => ''), response.headers.get('Retry-After')) : undefined
    if (reader === undefined && refusal === undefined) {
      // A failed answer is not read: its body is cancelled so the connection is freed.
      void response.body?.cancel()
    }
    // Once the body has been read, the entry is waited for, so that timing() finds it.
    let found: ResourceTiming | null = null
    const ended = async () => {
      found = await this.timing(url, sentAt)
    }
    return {
      status: response.status,
      ...(refusal === undefined ? {} : { refusal }),
      contentEncoding: response.headers.get('Content-Encoding'),
      chunks: reader === undefined ? NO_CHUNKS : chunks(reader, this.clock, ended),
      timing: () => found ?? entryOf(url, sentAt),
    }
  }

  upload(size: number, onProgress: (sentBytes: number, at: number) => void, signal: AbortSignal): Promise<UploadResponse> {
    const url = this.url('api/v1/upload')
    const { clock } = this
    return new Promise((resolve, reject) => {
      if (signal.aborted) {
        reject(new DOMException('the upload was aborted', 'AbortError'))
        return
      }
      const request = new XMLHttpRequest()
      const sentAt = clock.now()
      request.open('POST', url)
      // The Blob's size sets Content-Length; it is never chunked (wire-protocol.md section 3.2).
      request.setRequestHeader('Content-Type', 'application/octet-stream')
      request.responseType = 'text'
      request.upload.onprogress = (event) => clock.task(() => onProgress(event.loaded, clock.now()))
      request.onload = () =>
        clock.task(() => {
          const { status } = request
          const telemetry = status === 200 ? telemetryOf(request.responseText) : null
          const refusal = status === TOO_MANY_REQUESTS ? { refusal: refusalOf(request.responseText, request.getResponseHeader('Retry-After')) } : {}
          void this.timing(url, sentAt).then((entry) => clock.task(() => resolve({ status, ...refusal, telemetry, timing: entry })))
        })
      request.onerror = () => clock.task(() => reject(new TypeError('the upload failed')))
      request.onabort = () => clock.task(() => reject(new DOMException('the upload was aborted', 'AbortError')))
      signal.addEventListener('abort', () => request.abort(), { once: true })
      request.send(this.body.slice(size))
    })
  }

  ws(): Promise<WsEcho> {
    const { clock } = this
    // The socket lives in its own Worker (echo.worker.ts), which times each round trip; a pong's
    // arrival is its send time plus that round trip, on this Worker's clock.
    return new Promise((resolve, reject) => {
      const worker = new Worker(new URL('./echo.worker.ts', import.meta.url), { type: 'module' })
      const send = (command: EchoCommand) => worker.postMessage(command)
      let open = false
      let ended = false
      let closedHere = false
      let onPong: ((seq: number, sentAt: number, receivedAt: number) => void) | null = null
      let onClose: ((code: number) => void) | null = null
      const end = (code: number) => {
        if (ended) {
          return
        }
        ended = true
        worker.terminate()
        if (!open) {
          reject(new Error('the WebSocket did not open'))
        } else if (!closedHere) {
          onClose?.(code)
        }
      }
      // A Worker that fails to load or throws ends the echo like an abnormal close.
      worker.onerror = () => clock.task(() => end(1006))
      worker.onmessage = (message: MessageEvent<EchoEvent>) =>
        clock.task(() => {
          const event = message.data
          if (event.type === 'pong') {
            onPong?.(event.seq, event.sentAt, event.sentAt + event.rttMs)
          } else if (event.type === 'closed') {
            end(event.code)
          } else {
            open = true
            resolve({
              ping: (seq, sentAt) => send({ type: 'ping', seq, sentAt }),
              onPong: (listener) => {
                onPong = listener
              },
              onClose: (listener) => {
                onClose = listener
              },
              close: () => {
                closedHere = true
                send({ type: 'close' })
              },
            })
          }
        })
      send({ type: 'open', url: webSocketUrl(this.url('api/v1/ws')) })
    })
  }

  /** The probe's timing entry carries the fetch and connect fields path B reads (timingFor). */
  async probe(path: string, signal?: AbortSignal): Promise<ProbeTiming> {
    const url = this.url(path.replace(/^\/+/, ''))
    const sentAt = this.clock.now()
    const response = await fetch(url, { cache: 'no-store', ...(signal === undefined ? {} : { signal }) })
    await response.arrayBuffer()
    const doneAt = this.clock.now()
    return { status: response.status, sentAt, doneAt, timing: await this.timing(url, sentAt, this.probeWaiter) }
  }

  async info(): Promise<InfoResult> {
    const response = await fetch(this.url('api/v1/info'), { cache: 'no-store', headers: { Accept: 'application/json' } })
    if (!response.ok) {
      throw new Error(`GET /api/v1/info answered ${response.status}`)
    }
    // Only the family, major version and operating system leave the user agent (measurement.md section 17).
    return { info: checkedInfo(await response.json()), browser: browserIdentity(navigator.userAgent) }
  }

  /** The request's timing entry, waited for a bounded time after the request ended. */
  private timing(url: string, sentAt: number, waiter = this.waiter): Promise<ResourceTiming | null> {
    return waiter.find(() => entryOf(url, sentAt), added, () => this.clock.now())
  }

  private url(path: string): string {
    return apiUrl(location.origin, this.basePath, path)
  }
}
