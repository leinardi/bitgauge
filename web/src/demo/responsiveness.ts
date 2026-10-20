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

import type { LinkProfile } from '@/demo/link'

// The demo panel's Responsiveness (frontend.md section 9, the kit's RESP_OPTS in App.jsx): five
// cases of path B, each made by the link rather than set on the result. `ok` leaves the link as
// it is, which on the LAN reports h2 and probes that reuse their connection; `uncertain` makes the
// probes open a new connection; `needs-h2` reports http/1.1; `not-reported` an empty protocol; and
// `few-samples` leaves /small unanswered while an upload is in flight, so the upload's path B has
// too few samples (measurement.md section 12.4).

export type DemoResponsiveness = 'ok' | 'uncertain' | 'needs-h2' | 'not-reported' | 'few-samples'

/** The options in the kit's order, with its words. */
export const DEMO_RESPONSIVENESS: readonly (readonly [DemoResponsiveness, string])[] = [
  ['ok', 'measured'],
  ['uncertain', 'uncertain'],
  ['needs-h2', 'unavailable_h1 · HTTP/1.1 at the proxy'],
  ['not-reported', 'unavailable_h1 · protocol not reported'],
  ['few-samples', 'unavailable_insufficient · upload'],
]

export function isDemoResponsiveness(value: unknown): value is DemoResponsiveness {
  return DEMO_RESPONSIVENESS.some(([option]) => option === value)
}

/** The link that plays `option`. */
export function withResponsiveness(profile: LinkProfile, option: DemoResponsiveness): LinkProfile {
  switch (option) {
    case 'ok':
      return profile
    case 'uncertain':
      return { ...profile, newConnections: true }
    case 'needs-h2':
      return { ...profile, protocol: 'http/1.1' }
    case 'not-reported':
      return { ...profile, protocol: '' }
    case 'few-samples':
      return { ...profile, starveSmallDuringUpload: true }
  }
}
