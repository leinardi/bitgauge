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

// A BitGauge of a spec's own, for the flows the shared server of make e2e cannot show: a base path,
// or a server that stops mid-run. It runs the binary make e2e built, dist/bitgauge, on a free port
// of the loopback interface, configured only through its environment like any deployment
// (configuration.md section 2).

import { type ChildProcess, spawn } from 'node:child_process'
import { once } from 'node:events'
import { createServer } from 'node:net'
import { fileURLToPath } from 'node:url'

const BINARY = fileURLToPath(new URL('../../../dist/bitgauge', import.meta.url))
const HOST = '127.0.0.1'
const READY_MS = 10_000
const POLL_MS = 100

export interface Server {
  /** The origin and base path, without a trailing slash: `http://127.0.0.1:41234/speed`. */
  url: string
  /** Starts the binary again on the same port, after `kill`. */
  restart(): Promise<void>
  /** Ends the process at once, as a crash or a power cut would: no graceful shutdown. */
  kill(): Promise<void>
}

/** A port nothing listens on now; the binary binds it right after. */
async function freePort(): Promise<number> {
  const probe = createServer()
  probe.listen(0, HOST)
  await once(probe, 'listening')
  const address = probe.address()
  probe.close()
  await once(probe, 'close')
  if (address === null || typeof address === 'string') {
    throw new Error('no free port')
  }
  return address.port
}

/** Waits until GET /api/v1/info answers, or fails after READY_MS or once the binary failed. */
async function ready(url: string, child: ChildProcess, failure: () => Error | null): Promise<void> {
  const deadline = Date.now() + READY_MS
  while (Date.now() < deadline) {
    const error = failure()
    if (error !== null) {
      throw new Error(`bitgauge did not start from ${BINARY}: ${error.message}`)
    }
    if (child.exitCode !== null) {
      throw new Error(`bitgauge exited with status ${child.exitCode}`)
    }
    try {
      const response = await fetch(`${url}/api/v1/info`)
      if (response.ok) {
        return
      }
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS))
  }
  throw new Error(`bitgauge did not answer at ${url} within ${READY_MS} ms`)
}

/**
 * Starts dist/bitgauge with `env` on top of a free loopback port; the base path, if any, comes
 * from `env` as `BITGAUGE_SERVER__BASE_PATH`. The caller stops it with `kill`.
 */
export async function startServer(env: Record<string, string> = {}): Promise<Server> {
  const port = await freePort()
  const basePath = (env.BITGAUGE_SERVER__BASE_PATH ?? '').replace(/\/$/, '')
  const url = `http://${HOST}:${port}${basePath}`
  let running: ChildProcess | null = null

  const launch = async () => {
    const child = spawn(BINARY, ['serve'], {
      env: { PATH: process.env.PATH ?? '', ...env, BITGAUGE_SERVER__LISTEN: `${HOST}:${port}` },
      stdio: 'ignore',
    })
    // A binary that cannot start, missing or not executable, fails here instead of crashing the
    // Playwright worker with an unhandled error event.
    let failure: Error | null = null
    child.once('error', (error) => {
      failure = error
    })
    running = child
    await ready(url, child, () => failure)
  }

  const kill = async () => {
    const child = running
    running = null
    if (child === null || child.exitCode !== null || child.signalCode !== null || child.pid === undefined) {
      return
    }
    const exited = once(child, 'exit')
    child.kill('SIGKILL')
    await exited
  }

  await launch()
  return { url, restart: launch, kill }
}
