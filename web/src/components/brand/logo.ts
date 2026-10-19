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

// The BitGauge mark's geometry (design_system components/brand/Logo.jsx), on a 64 × 64 box: the full
// one with the track, the download and upload arcs and the dashed latency arc, and the small one the
// kit draws at 20 px and below, with thicker strokes and no latency arc. BrandLogo.vue draws it as
// SVG and the share image on its canvas.

export const LOGO_BOX = 64

export interface LogoGeometry {
  paths: { track: string; download: string; upload: string }
  /** The track's opacity and the arcs' width, in the box's units. */
  trackOpacity: number
  width: number
  /** The dashed latency arc, absent from the small geometry. */
  latency: { path: string; width: number; dash: readonly number[] } | null
}

const FULL: LogoGeometry = {
  paths: {
    track: 'M14.32 53.68 A25 25 0 1 1 49.68 53.68',
    download: 'M14.32 53.68 A25 25 0 1 1 53.65 23.5',
    upload: 'M19.98 48.02 A17 17 0 0 1 32 19',
  },
  trackOpacity: 0.14,
  width: 5,
  latency: { path: 'M25.64 42.36 A9 9 0 0 1 27.5 28.21', width: 4, dash: [2.6, 3] },
}

const SMALL: LogoGeometry = {
  paths: {
    track: 'M15.03 48.97 A24 24 0 1 1 48.97 48.97',
    download: 'M15.03 48.97 A24 24 0 1 1 54.35 23.24',
    upload: 'M23.51 40.49 A12 12 0 0 1 32 20',
  },
  trackOpacity: 0.2,
  width: 7,
  latency: null,
}

/** The geometry Logo.jsx draws at `size` px: the small one at 20 px and below. */
export function logoGeometry(size: number): LogoGeometry {
  return size <= 20 ? SMALL : FULL
}
