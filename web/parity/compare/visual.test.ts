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
// @vitest-environment node

import type { Page, TestInfo } from '@playwright/test'
import { describe, expect, it } from 'vitest'

import { attachVisual } from './visual.ts'

describe('attachVisual', () => {
  it('attaches both pages and their heatmap, notes the share of differing pixels, and closes its scratch page', async () => {
    const shots: unknown[] = []
    const side = (name: string, scratch?: unknown): Page =>
      ({
        screenshot: (options: unknown) => {
          shots.push(options)
          return Promise.resolve(Buffer.from(name))
        },
        context: () => ({ newPage: () => Promise.resolve(scratch) }),
      }) as unknown as Page
    let compared: { a: string; b: string; tolerance: number } | undefined
    let closed = false
    const scratch = {
      evaluate: (_fn: unknown, arg: { a: string; b: string; tolerance: number }) => {
        compared = arg
        return Promise.resolve({ png: `data:image/png;base64,${Buffer.from('heat').toString('base64')}`, ratio: 0.125 })
      },
      close: () => {
        closed = true
        return Promise.resolve()
      },
    }
    const attached: { name: string; body: string; contentType: string }[] = []
    const testInfo = {
      attach: (name: string, options: { body: Buffer; contentType: string }) => {
        attached.push({ name, body: options.body.toString(), contentType: options.contentType })
        return Promise.resolve()
      },
      annotations: [] as { type: string; description?: string }[],
    }
    await attachVisual(side('proto'), side('vue', scratch), testInfo as unknown as TestInfo)
    expect(shots).toEqual([
      { fullPage: true, animations: 'disabled', caret: 'hide' },
      { fullPage: true, animations: 'disabled', caret: 'hide' },
    ])
    expect(compared?.a).toBe(`data:image/png;base64,${Buffer.from('proto').toString('base64')}`)
    expect(compared?.b).toBe(`data:image/png;base64,${Buffer.from('vue').toString('base64')}`)
    expect(attached).toEqual([
      { name: 'proto.png', body: 'proto', contentType: 'image/png' },
      { name: 'vue.png', body: 'vue', contentType: 'image/png' },
      { name: 'diff.png', body: 'heat', contentType: 'image/png' },
    ])
    expect(testInfo.annotations).toEqual([{ type: 'pixels differing', description: '12.5%' }])
    expect(closed).toBe(true)
  })
})
