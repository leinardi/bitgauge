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

import { writeFileSync } from 'node:fs'
import { availableParallelism } from 'node:os'
import { resolve } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import vue from '@vitejs/plugin-vue'
import type { Plugin } from 'vite'
import { defineConfig } from 'vitest/config'

// Vitest defaults to one worker per CPU minus one, which leaves a 2-vCPU CI runner with a single
// worker. The floor only applies below three CPUs.
const testWorkers = Math.max(2, availableParallelism() - 1)

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
  plugins: [vue(), keepOutDirPlugin()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  // The server substitutes the base path into index.html at startup (architecture.md section 3),
  // so asset URLs stay relative to it.
  base: './',
  build: {
    outDir: 'dist',
  },
  worker: {
    format: 'es',
  },
  test: {
    include: ['src/**/*.test.ts'],
    maxWorkers: testWorkers,
  },
})
