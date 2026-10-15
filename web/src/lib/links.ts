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

// The project's own pages, the only external URLs the SPA holds (build-packaging.md section 4):
// links the user clicks, never fetched by BitGauge.

const REPOSITORY = 'https://github.com/leinardi/bitgauge'
const DOCS = `${REPOSITORY}/blob/main/docs/features`
const RESEARCH = `${REPOSITORY}/blob/main/docs/research`

export const links = {
  source: REPOSITORY,
  license: `${REPOSITORY}/blob/main/LICENSE`,
  methodology: `${DOCS}/measurement.md`,
  packetLoss: `${DOCS}/measurement.md#18-future-packet-loss-via-webrtcturn`,
  deployment: `${DOCS}/deployment-example.md`,
  subPathGuide: `${DOCS}/deployment-example.md#6-sub-path-deployment`,
  browserUploadLimits: `${RESEARCH}/browser-upload-limits.md`,
} as const
