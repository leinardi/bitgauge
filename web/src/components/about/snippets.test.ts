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

// The About snippets (ui/screens.md section 5): compatibility.md sections 1.3, 2.3 and 3.5
// exactly, every URL from the base URL, and the HTTPS note on a page that is not https.

import { describe, expect, it } from 'vitest'

import { baseUrl, layerSnippets, needsHttpsNote, snippetText } from '@/components/about/snippets'

const texts = (layer: Parameters<typeof layerSnippets>[0], base: string, name = 'BitGauge home') => layerSnippets(layer, base, name).map((block) => snippetText(block.lines))

describe('the base URL', () => {
  it('is the origin and the base path without its trailing slash', () => {
    expect(baseUrl('https://speed.example.lan', '/')).toBe('https://speed.example.lan')
    expect(baseUrl('https://speed.example.lan', '/speed/')).toBe('https://speed.example.lan/speed')
  })
})

describe('the snippets', () => {
  it('give the OpenSpeedTest UI the base URL as its Host (compatibility.md section 1.3)', () => {
    expect(texts('openspeedtest', 'https://speed.example.lan')).toEqual(['https://ost.example.lan/?Host=https://speed.example.lan'])
    expect(texts('openspeedtest', 'https://speed.example.lan/speed')).toEqual(['https://ost.example.lan/?Host=https://speed.example.lan/speed'])
  })

  it('lay out the librespeed-cli server list and its two commands as compatibility.md section 2.3 does', () => {
    const [list, local, remote] = texts('librespeed', 'https://speed.example.lan')
    expect(list).toBe(
      ['[', '  {', '    "id": 1,', '    "name": "BitGauge home",', '    "server": "https://speed.example.lan/",', '    "dlURL": "garbage",', '    "ulURL": "empty",', '    "pingURL": "empty",', '    "getIpURL": "getIP"', '  }', ']'].join('\n'),
    )
    expect(local).toBe('librespeed-cli --local-json bitgauge.json --server 1 --no-icmp --chunks 8 --json')
    expect(remote).toBe('librespeed-cli --server-json https://speed.example.lan/.well-known/librespeed --server 1 --no-icmp')
    // A name with quotes stays valid JSON; a base path ends the server URL with one slash.
    const [quoted] = texts('librespeed', 'http://10.0.0.2:8080/speed', 'Rack "B"')
    expect(JSON.parse(quoted ?? '')).toEqual([{ id: 1, name: 'Rack "B"', server: 'http://10.0.0.2:8080/speed/', dlURL: 'garbage', ulURL: 'empty', pingURL: 'empty', getIpURL: 'getIP' }])
  })

  it('point networkQuality at the config, and its verbose form, as compatibility.md section 3.5 writes them', () => {
    expect(texts('networkquality', 'https://speed.example.lan')).toEqual(['networkQuality -C https://speed.example.lan/nq/config', 'networkQuality -C https://speed.example.lan/nq/config -v'])
    const [, verbose] = layerSnippets('networkquality', 'https://speed.example.lan', 'BitGauge home')
    // The command alone, so a shell without interactive comments (zsh) runs it as copied.
    expect(verbose?.lines).toEqual([[{ text: 'networkQuality -C https://speed.example.lan/nq/config -v', kind: 'command' }]])
  })

  it('note that networkQuality needs HTTPS on a page that is not https', () => {
    expect(needsHttpsNote('http:')).toBe(true)
    expect(needsHttpsNote('https:')).toBe(false)
  })
})
