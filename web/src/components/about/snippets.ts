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

// The About screen's snippets (ui/screens.md section 5): the content of compatibility.md sections
// 1.3, 2.3 and 3.5 exactly, with every URL starting at the base URL, the page's origin followed
// by the base path without its trailing slash.

export type Layer = 'openspeedtest' | 'librespeed' | 'networkquality'

/** A run of a snippet line, in the terminal's command color or its plain text. */
export interface SnippetPart {
  text: string
  kind?: 'command'
}

export type SnippetLine = readonly SnippetPart[]

/** One copyable block of a layer, by the key of its caption and copy label. */
export interface SnippetBlock {
  key: 'ostUrl' | 'serverList' | 'localJson' | 'serverJson' | 'nqConfig' | 'nqVerbose'
  lines: readonly SnippetLine[]
}

/** The base URL: `https://speed.example.lan/speed` for the base path `/speed/`. */
export function baseUrl(origin: string, basePath: string): string {
  return origin + basePath.replace(/\/$/u, '')
}

const command = (text: string): SnippetLine => [{ text, kind: 'command' }]
const plain = (text: string): SnippetLine => [{ text }]

/** The `bitgauge.json` server list of compatibility.md section 2.3, this server as entry 1. */
function serverList(base: string, name: string): SnippetLine[] {
  return [
    '[',
    '  {',
    '    "id": 1,',
    `    "name": ${JSON.stringify(name)},`,
    `    "server": ${JSON.stringify(`${base}/`)},`,
    '    "dlURL": "garbage",',
    '    "ulURL": "empty",',
    '    "pingURL": "empty",',
    '    "getIpURL": "getIP"',
    '  }',
    ']',
  ].map(plain)
}

/** A layer's blocks, in the compatibility page's order; `name` is the server's display name. */
export function layerSnippets(layer: Layer, base: string, name: string): SnippetBlock[] {
  switch (layer) {
    case 'openspeedtest':
      return [{ key: 'ostUrl', lines: [command(`https://ost.example.lan/?Host=${base}`)] }]
    case 'librespeed':
      return [
        { key: 'serverList', lines: serverList(base, name) },
        { key: 'localJson', lines: [command('librespeed-cli --local-json bitgauge.json --server 1 --no-icmp --chunks 8 --json')] },
        { key: 'serverJson', lines: [command(`librespeed-cli --server-json ${base}/.well-known/librespeed --server 1 --no-icmp`)] },
      ]
    case 'networkquality':
      return [
        { key: 'nqConfig', lines: [command(`networkQuality -C ${base}/nq/config`)] },
        // The command alone: zsh, macOS's default shell, passes a comment's words on as arguments.
        // The block's caption says what -v adds.
        { key: 'nqVerbose', lines: [command(`networkQuality -C ${base}/nq/config -v`)] },
      ]
  }
}

/** A block's text as it is copied: its lines, one per line. */
export function snippetText(lines: readonly SnippetLine[]): string {
  return lines.map((line) => line.map((part) => part.text).join('')).join('\n')
}

/** Whether the networkQuality snippet notes that it needs HTTPS (compatibility.md section 3.3). */
export function needsHttpsNote(protocol: string): boolean {
  return protocol !== 'https:'
}
