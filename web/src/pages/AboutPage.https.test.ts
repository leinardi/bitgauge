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
// @vitest-environment-options { "url": "https://speed.example.lan/speed/about" }

// The About screen (ui/screens.md section 5) on an https page under the base path /speed: every
// snippet starts at https://speed.example.lan/speed, and networkQuality has no HTTPS note.

import { flushPromises } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { getInfo } from '@/api/info'
import { useInfo } from '@/composables/useInfo'
import AboutPage from '@/pages/AboutPage.vue'
import { infoFixture } from '@/test/fixtures'
import { mountApp } from '@/test/mount'

vi.mock('@/api/info', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/info')>()),
  getInfo: vi.fn(),
}))

const BASE = 'https://speed.example.lan/speed'

afterEach(() => {
  document.head.querySelector('meta[name="bitgauge-base-path"]')?.remove()
})

describe('the About screen on https under a base path', () => {
  it('builds every snippet from the base URL, without the HTTPS note', async () => {
    const meta = document.createElement('meta')
    meta.name = 'bitgauge-base-path'
    meta.content = '/speed/'
    document.head.append(meta)
    vi.mocked(getInfo).mockResolvedValueOnce(infoFixture({ server: { basePath: '/speed/' }, compat: { openspeedtest: true, librespeed: true, networkquality: true } }))
    const page = await mountApp(AboutPage, '/about')
    await useInfo().refresh()
    await flushPromises()
    expect(page.findAll('pre').map((pre) => pre.text())).toEqual([
      `https://ost.example.lan/?Host=${BASE}`,
      ['[', '  {', '    "id": 1,', '    "name": "Basement NAS",', `    "server": "${BASE}/",`, '    "dlURL": "garbage",', '    "ulURL": "empty",', '    "pingURL": "empty",', '    "getIpURL": "getIP"', '  }', ']'].join('\n'),
      'librespeed-cli --local-json bitgauge.json --server 1 --no-icmp --chunks 8 --json',
      `librespeed-cli --server-json ${BASE}/.well-known/librespeed --server 1 --no-icmp`,
      `networkQuality -C ${BASE}/nq/config`,
      `networkQuality -C ${BASE}/nq/config -v`,
    ])
    expect(page.find('[data-testid="about-https-note"]').exists()).toBe(false)
    expect(page.text()).toContain('networkQuality needs TLS 1.3 and HTTP/2 at the reverse proxy.')
    page.unmount()
  })
})
