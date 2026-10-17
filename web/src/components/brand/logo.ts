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

// The BitGauge mark's geometry (design_system components/brand/Logo.jsx), on a 64 × 64 box: the
// track, the download and upload arcs and the dashed latency arc. BrandLogo.vue draws it as SVG and
// the share image on its canvas.

export const LOGO_BOX = 64

export const LOGO_PATHS = {
  track: 'M14.32 53.68 A25 25 0 1 1 49.68 53.68',
  download: 'M14.32 53.68 A25 25 0 1 1 53.65 23.5',
  upload: 'M19.98 48.02 A17 17 0 0 1 32 19',
  latency: 'M25.64 42.36 A9 9 0 0 1 27.5 28.21',
} as const

/** The track's opacity, the arcs' widths and the latency arc's dashes, in the box's units. */
export const LOGO_STROKE = { trackOpacity: 0.14, width: 5, latencyWidth: 4, latencyDash: [2.6, 3] } as const
