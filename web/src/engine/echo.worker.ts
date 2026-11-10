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

import { type EchoCommand, type EchoEvent, EchoStamps, pong } from '@/engine/wiring'

// The WebSocket echo's own Worker, nested in the engine's (measurement.md section 11.1): it holds
// the socket and stamps each ping and pong on its own clock, so a pong is timed when it arrives,
// not when the engine's Worker, busy with the load, gets to it. The engine's send time only
// matches a pong to its ping.

const stamps = new EchoStamps()
let socket: WebSocket | null = null
let opened = false

const post = (event: EchoEvent) => self.postMessage(event)

function open(url: string): void {
  try {
    socket = new WebSocket(url)
  } catch {
    post({ type: 'closed', code: 1006, opened: false })
    return
  }
  socket.onopen = () => {
    opened = true
    post({ type: 'open' })
  }
  socket.onmessage = (message: MessageEvent) => {
    const at = performance.now()
    const frame = pong(message.data)
    const rttMs = frame === null ? null : stamps.arrived(frame.seq, frame.t, at)
    if (frame !== null && rttMs !== null) {
      post({ type: 'pong', seq: frame.seq, sentAt: frame.t, rttMs })
    }
  }
  socket.onclose = (close) => post({ type: 'closed', code: close.code, opened })
}

self.addEventListener('message', (event: MessageEvent<EchoCommand>) => {
  const command = event.data
  if (command.type === 'open') {
    open(command.url)
  } else if (command.type === 'ping') {
    stamps.sending(command.seq, command.sentAt, performance.now())
    socket?.send(JSON.stringify({ type: 'ping', seq: command.seq, t: command.sentAt }))
  } else {
    socket?.close(1000)
  }
})
