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

import { httpPinger, type Pinger, webSocketPinger } from '@/engine/latency/idle'
import type { EngineErrorCode, Notice } from '@/engine/messages'
import type { Clock, InfoResult, Transport, WsEcho } from '@/engine/types'

// The run's WebSocket echo (edge-cases.md sections 6 and 15): opened in the info phase, or replaced
// by the HTTP fallback; and the sequence that decides what an unexpected close meant. v0.1 has no
// loaded latency, so the echo serves idle latency only and the fallback needs no reservation.

const MAX_TIMEOUT_MS = 10_000
const MIN_TIMEOUT_MS = 2000
const TIMEOUT_MEDIANS = 4

/** What the close sequence concluded, for the run to act on. */
export type CloseVerdict = { kind: 'error'; code: Extract<EngineErrorCode, 'network-changed' | 'server-restarted'> } | { kind: 'continued' }

export interface ConnectionOptions {
  clock: Clock
  transport: Pick<Transport, 'ws' | 'info' | 'probe'>
  /** The epoch GET /info reported at the start of the run. */
  epoch: string
  /** The idle-latency median so far, for the timeout policy; null without one. */
  medianMs: () => number | null
  /** Called once the close sequence has decided. */
  decided: (verdict: CloseVerdict) => void
}

/** Settles with `promise`, or rejects after `ms` on the clock. */
function within<T>(clock: Clock, promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = clock.setTimer(ms, () => reject(new Error('timed out')))
    promise.then(
      (value) => {
        clock.clearTimer(timer)
        resolve(value)
      },
      (reason: unknown) => {
        clock.clearTimer(timer)
        reject(reason instanceof Error ? reason : new Error('failed'))
      },
    )
  })
}

export class Connection {
  /** The notices the connection raised: websocket-unavailable, websocket-reopened. */
  readonly notices: Notice[] = []
  private readonly options: ConnectionOptions
  private echo: WsEcho | null = null
  private current: Pinger
  private closing = false
  private disposed = false

  constructor(options: ConnectionOptions) {
    this.options = options
    this.current = httpPinger(options.transport)
  }

  /** The ping path idle latency uses now. */
  get pinger(): Pinger {
    return this.current
  }

  /**
   * Opens the echo within the 10 s ceiling of the idle-latency timeout; when it cannot be opened,
   * idle latency uses GET /api/v1/ping, and an echo that opens later is closed.
   */
  async open(): Promise<void> {
    const opening = this.options.transport.ws()
    try {
      this.attach(await within(this.options.clock, opening, MAX_TIMEOUT_MS))
    } catch {
      void opening.then((late) => late.close(), () => undefined)
      this.fallBack()
    }
  }

  /** Closes the echo at the end of the run; a close from here on is expected. */
  dispose(): void {
    this.disposed = true
    this.echo?.close()
    this.echo = null
  }

  private attach(echo: WsEcho): void {
    if (this.disposed) {
      echo.close()
      return
    }
    this.echo = echo
    this.current = webSocketPinger(echo)
    echo.onClose(() => {
      if (this.echo === echo) {
        void this.closed()
      }
    })
  }

  private fallBack(): void {
    this.echo = null
    this.current = httpPinger(this.options.transport)
    this.notices.push({ code: 'websocket-unavailable' })
  }

  /**
   * Steps 1 to 5 of edge-cases.md section 6: reopen once and ask GET /info, both within the
   * idle-latency timeout. A new epoch is a restart; no answer is a network change; otherwise the
   * reopened echo, or the HTTP fallback, carries on.
   */
  private async closed(): Promise<void> {
    if (this.closing || this.disposed) {
      return
    }
    this.closing = true
    this.echo = null
    this.current = httpPinger(this.options.transport)
    const { clock, transport, epoch } = this.options
    const median = this.options.medianMs()
    const timeout = median === null ? MAX_TIMEOUT_MS : Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, TIMEOUT_MEDIANS * median))
    const reopening = transport.ws()
    const [reopen, info] = await Promise.allSettled([within(clock, reopening, timeout), within<InfoResult>(clock, transport.info(), timeout)])
    this.closing = false
    const sameServer = !this.disposed && info.status === 'fulfilled' && info.value.info.server.epoch === epoch
    if (sameServer && reopen.status === 'fulfilled') {
      this.attach(reopen.value)
      this.notices.push({ code: 'websocket-reopened' })
    } else {
      // An echo that is not used, now or after its timeout, is closed.
      void reopening.then((late) => late.close(), () => undefined)
    }
    if (this.disposed) {
      return
    }
    if (info.status === 'rejected') {
      this.options.decided({ kind: 'error', code: 'network-changed' })
    } else if (!sameServer) {
      this.options.decided({ kind: 'error', code: 'server-restarted' })
    } else {
      if (reopen.status === 'rejected') {
        this.fallBack()
      }
      this.options.decided({ kind: 'continued' })
    }
  }
}
