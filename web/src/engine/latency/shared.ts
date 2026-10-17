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

import type { WsEcho } from '@/engine/types'

// One WebSocket echo shared by idle latency and each direction's loaded latency (measurement.md
// section 11.6): every pong reaches every listener, and each listener matches its own pings on
// sequence number and send time together, so the sequence spaces never meet.

type PongListener = (seq: number, sentAt: number, receivedAt: number) => void

export class SharedEcho implements WsEcho {
  private readonly echo: WsEcho
  private readonly listeners = new Set<PongListener>()

  constructor(echo: WsEcho) {
    this.echo = echo
    echo.onPong((seq, sentAt, receivedAt) => {
      for (const listener of [...this.listeners]) {
        listener(seq, sentAt, receivedAt)
      }
    })
  }

  ping(seq: number, sentAt: number): void {
    this.echo.ping(seq, sentAt)
  }

  /** Adds a listener; the others keep theirs. */
  onPong(listener: PongListener): void {
    this.listeners.add(listener)
  }

  /** Removes a listener added with onPong. */
  offPong(listener: PongListener): void {
    this.listeners.delete(listener)
  }

  onClose(listener: (code: number) => void): void {
    this.echo.onClose(listener)
  }

  close(): void {
    this.echo.close()
  }
}
