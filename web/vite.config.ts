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

import { readFileSync, writeFileSync } from 'node:fs'
import { availableParallelism } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import type { Plugin } from 'vite'
import { defineConfig } from 'vitest/config'

// Vitest defaults to one worker per CPU minus one, which leaves a 2-vCPU CI runner with a single
// worker. The floor only applies below three CPUs.
const testWorkers = Math.max(2, availableParallelism() - 1)

// The Claude Design export (docs/design_system), read in place: its tokens and fonts through the
// @design alias, its icons and manifest by the plugin below. It is never copied into web/.
const designDir = fileURLToPath(new URL('../docs/design_system/', import.meta.url))

// The export's root assets, served from the base path itself (architecture.md section 3).
const rootAssets = ['favicon.svg', 'favicon-16.png', 'favicon-32.png', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'icon-512-maskable.png', 'site.webmanifest']

const contentTypes: Record<string, string> = { svg: 'image/svg+xml', png: 'image/png', webmanifest: 'application/manifest+json' }

// Claude Design embeds a C2PA provenance manifest in every SVG and PNG (frontend.md section 8): a
// <metadata> element with its namespace, and a caBX chunk. The shipped files carry image data only.
function stripSvg(svg: string): string {
  return svg.replace(/<metadata>[\s\S]*?<\/metadata>/g, '').replace(/\s+xmlns:c2pa="[^"]*"/g, '')
}

function stripPng(png: Buffer): Buffer {
  const kept: Buffer[] = [png.subarray(0, 8)]
  for (let offset = 8; offset < png.length; ) {
    // A chunk is its length, its type, its data and a CRC.
    const end = offset + 12 + png.readUInt32BE(offset)
    if (png.toString('latin1', offset + 4, offset + 8) !== 'caBX') {
      kept.push(png.subarray(offset, end))
    }
    offset = end
  }
  return Buffer.concat(kept)
}

function rootAsset(name: string): Buffer {
  const bytes = readFileSync(join(designDir, 'assets', name))
  const shipped = name.endsWith('.svg') ? Buffer.from(stripSvg(bytes.toString('utf8'))) : name.endsWith('.png') ? stripPng(bytes) : bytes
  if (shipped.includes('c2pa') || shipped.includes('caBX')) {
    throw new Error(`design-assets: ${name} still carries its C2PA manifest`)
  }
  return shipped
}

// Serves the root assets in development and emits them into the build, stripped.
function designAssetsPlugin(): Plugin {
  return {
    name: 'design-assets',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const name = (request.url ?? '').split('?')[0]?.replace(/^\//, '') ?? ''
        if (!rootAssets.includes(name)) {
          next()
          return
        }
        response.setHeader('Content-Type', contentTypes[name.split('.').pop() ?? ''] ?? 'application/octet-stream')
        response.end(rootAsset(name))
      })
    },
    generateBundle() {
      for (const name of rootAssets) {
        this.emitFile({ type: 'asset', fileName: name, source: rootAsset(name) })
      }
    },
  }
}

// Recreates the tracked dist/.gitkeep that emptyOutDir wipes on every build: the Go embed of
// web/dist needs the directory to exist on a clean checkout, before any build has run.
function keepOutDirPlugin(): Plugin {
  let outDir = ''
  return {
    name: 'keep-out-dir',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir)
    },
    closeBundle() {
      writeFileSync(resolve(outDir, '.gitkeep'), '')
    },
  }
}

export default defineConfig({
  plugins: [vue(), tailwindcss(), designAssetsPlugin(), keepOutDirPlugin()],
  resolve: {
    alias: {
      '@design': designDir,
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  // The server substitutes the base path into index.html at startup (architecture.md section 3),
  // so asset URLs stay relative to it.
  base: './',
  server: {
    // The tokens and fonts are read from the export, outside web/.
    fs: { allow: [fileURLToPath(new URL('.', import.meta.url)), designDir] },
  },
  build: {
    outDir: 'dist',
    rolldownOptions: {
      // Licence notices of bundled dependencies stay (comments marked @license, @preserve or /*!);
      // every other comment goes.
      output: { comments: { legal: true, annotation: false, jsdoc: false } },
    },
  },
  worker: {
    format: 'es',
  },
  test: {
    include: ['src/**/*.test.ts'],
    maxWorkers: testWorkers,
  },
})
