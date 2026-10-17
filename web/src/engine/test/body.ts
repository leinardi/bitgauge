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

import type { DownloadChunk } from '@/engine/types'

// A download body of the fake transport: chunks queued by the link and read by the engine, and
// the error an aborted request rejects with.

export function abortError(): DOMException {
  return new DOMException('The request was aborted.', 'AbortError')
}

/** A download body: chunks queued by the link and read by the engine. */
export class Body implements AsyncIterable<DownloadChunk> {
  private readonly queue: DownloadChunk[] = []
  private ended = false
  private failure: unknown = null
  private wake: (() => void) | null = null

  push(chunk: DownloadChunk): void {
    this.queue.push(chunk)
    this.notify()
  }

  end(): void {
    this.ended = true
    this.notify()
  }

  fail(reason: unknown): void {
    this.failure = reason
    this.notify()
  }

  async *[Symbol.asyncIterator](): AsyncIterator<DownloadChunk> {
    for (;;) {
      const chunk = this.queue.shift()
      if (chunk !== undefined) {
        yield chunk
      } else if (this.failure !== null) {
        throw this.failure
      } else if (this.ended) {
        return
      } else {
        await new Promise<void>((resolve) => {
          this.wake = resolve
        })
      }
    }
  }

  private notify(): void {
    const wake = this.wake
    this.wake = null
    wake?.()
  }
}
