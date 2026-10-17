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

// The browser's connections to the demo's server (frontend.md section 9): unlimited, or at most
// `limit`, as the six per origin of HTTP/1.1, where a request beyond them waits, first come first
// served, until one is free.

export class Connections {
  private readonly limit: number | undefined
  /** The connections requests hold now. */
  private busy = 0
  /** The requests waiting for a free connection, in the order they came. */
  private readonly waiting: (() => void)[] = []

  constructor(limit: number | undefined) {
    this.limit = limit
  }

  /**
   * Sends a request on a connection: at once when one is free, or once one is; a request aborted
   * while it waits rejects with `aborted()` and gives up its place. `send` gets the connection's
   * release, which frees it once however often it runs.
   */
  connected<T>(signal: AbortSignal | undefined, aborted: () => Error, send: (release: () => void) => Promise<T>): Promise<T> {
    if (this.limit === undefined || this.busy < this.limit) {
      return send(this.take())
    }
    return new Promise((resolve, reject) => {
      const turn = (): void => {
        send(this.take()).then(resolve, reject)
      }
      this.waiting.push(turn)
      signal?.addEventListener('abort', () => {
        const index = this.waiting.indexOf(turn)
        if (index >= 0) {
          this.waiting.splice(index, 1)
          reject(aborted())
        }
      })
    })
  }

  private take(): () => void {
    this.busy++
    let held = true
    return () => {
      if (held) {
        held = false
        this.busy--
        this.waiting.shift()?.()
      }
    }
  }
}
