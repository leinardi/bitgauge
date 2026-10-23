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

// @vitest-environment jsdom

// The Test screen before GET /api/v1/info answers: the server is not known to be unreachable,
// Start waits for its default settings, and the gauge says so instead of Ready.

import { flushPromises } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { getInfo, type Info } from '@/api/info'
import { useInfo } from '@/composables/useInfo'
import TestPage from '@/pages/TestPage.vue'
import { infoFixture } from '@/test/fixtures'
import { mountApp } from '@/test/mount'

vi.mock('@/api/info', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/info')>()),
  getInfo: vi.fn(),
}))

class StubWorker extends EventTarget {
  postMessage(): void {}
  terminate(): void {}
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('the Test screen before the server answers', () => {
  it('reads Waiting for the server, then Ready once the defaults arrive', async () => {
    vi.stubGlobal('Worker', StubWorker)
    let answer: (info: Info) => void = () => undefined
    vi.mocked(getInfo).mockReturnValueOnce(new Promise<Info>((resolve) => (answer = resolve)))
    const page = await mountApp(TestPage)
    const checked = useInfo().refresh()
    await flushPromises()
    expect(getInfo).toHaveBeenCalledOnce()
    expect(page.get('[data-testid="gauge-text"]').text()).toContain('Waiting for the server')
    expect(page.get('[data-testid="gauge-text"]').text()).not.toContain('Ready')
    answer(infoFixture())
    await checked
    await flushPromises()
    expect(page.get('[data-testid="gauge-text"]').text()).toContain('Ready')
    page.unmount()
  })
})
