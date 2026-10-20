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

import type { Link } from '@/demo/link'
import type { BrowserIdentity, Clock, Info, InfoResult, ProbeTiming, ResourceTiming } from '@/engine/types'

// The demo transport's small requests (frontend.md section 9): the probes, answered one jittered
// round trip later and stamped with that simulated arrival, with the fetch start and connection
// setup path B reads (measurement.md section 12.3); GET /info with the fixture and the link's
// current epoch; and the Resource Timing entry every request reports.

export function abortError(): DOMException {
  return new DOMException('The request was aborted.', 'AbortError')
}

export function networkError(): TypeError {
  return new TypeError('network error')
}

/** What the probes need of the transport: its clock, its link and its connections. */
export interface ProbeHost {
  readonly clock: Clock
  readonly link: Link
  /** Sends a request on a connection, once one is free (demo/connections.ts). */
  connected<T>(signal: AbortSignal | undefined, send: (release: () => void) => Promise<T>): Promise<T>
  /** Whether a request sent at `at` fails: the server is gone, or the link lost it. */
  failed(at: number): boolean
  /** A simulated instant as the clock would read it. */
  stamp(at: number): number
}

/** A request's timing entry; none on a link that reports no protocol. */
export function timingEntry(link: Link, requestStart: number, responseStart: number, responseEnd: number): ResourceTiming | null {
  const protocol = link.profile.protocol
  return protocol === null ? null : { nextHopProtocol: protocol, requestStart, responseStart, responseEnd }
}

export function probe(host: ProbeHost, path: string, signal?: AbortSignal): Promise<ProbeTiming> {
  const { clock, link } = host
  const sentAt = clock.now()
  return host.connected(signal, (release) => {
    // A probe that waited for a connection starts when it has one, as Resource Timing's
    // connectStart does. It reuses that connection, connectStart equal to connectEnd, unless the
    // link sets up a new one first, which takes a round trip before its requestStart.
    const connectStart = clock.now()
    if (path.endsWith('/small') && link.profile.starveSmallDuringUpload === true && link.uploading()) {
      return starved(signal, release)
    }
    const requestStart = link.profile.newConnections === true ? host.stamp(connectStart + link.roundTrip(connectStart)) : connectStart
    const lost = host.failed(requestStart)
    const rtt = link.roundTrip(requestStart)
    return new Promise<ProbeTiming>((resolve, reject) => {
      const timer = clock.setTimer(requestStart - connectStart + rtt, () => {
        release()
        if (lost) {
          reject(networkError())
          return
        }
        // Stamped with the simulated answer, as the echo is.
        const doneAt = host.stamp(requestStart + rtt)
        const status = path.endsWith('/ping') ? 204 : path.endsWith('/small') ? 200 : 404
        const entry = timingEntry(link, requestStart, doneAt, doneAt)
        resolve({ status, sentAt, doneAt, timing: entry === null ? null : { ...entry, fetchStart: sentAt, connectStart, connectEnd: requestStart } })
      })
      signal?.addEventListener('abort', () => {
        clock.clearTimer(timer)
        release()
        reject(abortError())
      })
    })
  })
}

/** A probe the server never answers: it waits until it is aborted. */
function starved(signal: AbortSignal | undefined, release: () => void): Promise<ProbeTiming> {
  return new Promise<ProbeTiming>((_resolve, reject) => {
    signal?.addEventListener('abort', () => {
      release()
      reject(abortError())
    })
  })
}

export function info(host: ProbeHost, fixture: Info, browser: BrowserIdentity): Promise<InfoResult> {
  const { clock, link } = host
  return host.connected(
    undefined,
    (release) =>
      new Promise<InfoResult>((resolve, reject) => {
        clock.setTimer(link.roundTrip(clock.now()), () => {
          release()
          const now = clock.now()
          if (!link.reachable(now)) {
            reject(networkError())
            return
          }
          const server = { ...fixture.server, epoch: link.epochAt(now) }
          resolve({ info: { ...fixture, server }, browser })
        })
      }),
  )
}
