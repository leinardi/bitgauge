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

// A slower link in front of a spec's own BitGauge, for the flows that must act inside a short
// window of a run. Over loopback a download runs at several Gbit/s, and a browser on a small CI
// runner spends its main thread on it: the page then updates, and takes a click, only every few
// seconds. A TCP proxy on the loopback interface paces everything the server sends to `rate` bit/s,
// shared by every connection, as one link would; what the browser sends passes unpaced. It works
// below HTTP, so requests, responses and WebSockets reach the server unchanged.

import { once } from 'node:events'
import { connect, createServer, type Socket } from 'node:net'
import { Transform, type TransformCallback } from 'node:stream'

const HOST = '127.0.0.1'

export interface Throttle {
  /** The proxy's origin and the target's base path, without a trailing slash. */
  url: string
  /** Closes the proxy and every connection through it. */
  close(): Promise<void>
}

/** Proxies `target` (an `http://127.0.0.1:port[/base]` URL) with its downstream paced to `rate` bit/s. */
export async function throttle(target: string, rate: number): Promise<Throttle> {
  const { port, pathname } = new URL(target)
  const bytesPerMs = rate / 8 / 1000
  // The instant the shared link is free again: each chunk is sent when the ones before it have
  // had their time on the link.
  let free = 0
  const sockets = new Set<Socket>()

  const paced = () =>
    new Transform({
      transform(chunk: Buffer, _encoding, done: TransformCallback) {
        const now = performance.now()
        const start = Math.max(now, free)
        free = start + chunk.length / bytesPerMs
        setTimeout(() => done(null, chunk), free - now)
      },
    })

  const proxy = createServer((client) => {
    const server = connect(Number(port), HOST)
    sockets.add(client).add(server)
    const drop = () => {
      client.destroy()
      server.destroy()
      sockets.delete(client)
      sockets.delete(server)
    }
    client.on('error', drop).on('close', drop)
    server.on('error', drop).on('close', drop)
    client.pipe(server)
    server.pipe(paced()).pipe(client)
  })
  proxy.listen(0, HOST)
  await once(proxy, 'listening')
  const address = proxy.address()
  if (address === null || typeof address === 'string') {
    throw new Error('the throttle has no port')
  }

  const close = async () => {
    for (const socket of sockets) {
      socket.destroy()
    }
    proxy.close()
    await once(proxy, 'close')
  }

  return { url: `http://${HOST}:${address.port}${pathname.replace(/\/$/, '')}`, close }
}
