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

import type { DirectionResult, Experience, Result } from '@/engine/messages'

// The CSV export (frontend.md section 5): one row per result under a header row, UTF-8 without a
// byte order mark, every line ended by CRLF, fields quoted as RFC 4180 does. An absent value is an
// empty field; a text field starting with `=`, `+`, `-`, `@`, a tab or CR gets a leading `'`, so a
// spreadsheet does not read it as a formula. Series, samples and events are left out. The RPM and
// its state are per direction, as `responsiveness` is; the minimum and maximum are a Continuous
// direction's, empty otherwise.

export const CSV_COLUMNS = [
  'id',
  'startedAt',
  'label',
  'contextLabel',
  'note',
  'status',
  'preset',
  'protocol',
  'clientIp',
  'browser',
  'serverName',
  'serverVersion',
  'downloadBitsPerSecond',
  'downloadPeakBitsPerSecond',
  'downloadStatus',
  'downloadConfidence',
  'uploadBitsPerSecond',
  'uploadPeakBitsPerSecond',
  'uploadStatus',
  'uploadConfidence',
  'idleMedianMs',
  'idleP90Ms',
  'jitterMs',
  'idleLossPercent',
  'downloadLoadedMedianMs',
  'uploadLoadedMedianMs',
  'bufferbloatGrade',
  'downloadRpm',
  'downloadRpmState',
  'uploadRpm',
  'uploadRpmState',
  'downloadMinBitsPerSecond',
  'downloadMaxBitsPerSecond',
  'uploadMinBitsPerSecond',
  'uploadMaxBitsPerSecond',
  'streamingBand',
  'gamingBand',
  'rtcBand',
  'overheadCompensationPercent',
  'dataUsedBytes',
  'durationMs',
] as const

type Column = (typeof CSV_COLUMNS)[number]
type Value = string | number | undefined

const FORMULA = /^[=+\-@\t\r]/
const QUOTED = /[",\r\n]/

/** One field: a text field guarded against formulas, then quoted when it must be. */
function field(value: Value): string {
  if (value === undefined) {
    return ''
  }
  const text = typeof value === 'number' ? String(value) : FORMULA.test(value) ? `'${value}` : value
  return QUOTED.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

function loadedMedian(direction: DirectionResult | undefined): number | undefined {
  const loaded = direction?.loadedLatency
  return loaded === undefined || 'status' in loaded ? undefined : loaded.medianMs
}

function rpm(direction: DirectionResult | undefined): number | undefined {
  const responsiveness = direction?.responsiveness
  return responsiveness === undefined || !('rpm' in responsiveness) ? undefined : responsiveness.rpm
}

function band(experience: Experience | undefined): string | undefined {
  return experience === undefined || !('band' in experience) ? undefined : experience.band
}

function row(result: Result): Record<Column, Value> {
  const { client, download, upload, idle } = result
  return {
    id: result.id,
    startedAt: result.startedAt,
    label: result.label,
    contextLabel: client.contextLabel,
    note: result.note,
    status: result.status,
    preset: result.settings.preset,
    protocol: client.protocol,
    clientIp: client.ip,
    browser: `${client.browser.name} ${client.browser.major} (${client.browser.os})`,
    serverName: result.server.name,
    serverVersion: result.server.version,
    downloadBitsPerSecond: download?.bitsPerSecond,
    downloadPeakBitsPerSecond: download?.peakBitsPerSecond,
    downloadStatus: download?.status,
    downloadConfidence: download?.confidence?.level,
    uploadBitsPerSecond: upload?.bitsPerSecond,
    uploadPeakBitsPerSecond: upload?.peakBitsPerSecond,
    uploadStatus: upload?.status,
    uploadConfidence: upload?.confidence?.level,
    idleMedianMs: idle?.medianMs,
    idleP90Ms: idle?.p90Ms,
    jitterMs: idle?.jitterMs,
    idleLossPercent: idle?.lossPercent,
    downloadLoadedMedianMs: loadedMedian(download),
    uploadLoadedMedianMs: loadedMedian(upload),
    bufferbloatGrade: result.bufferbloat?.grade,
    downloadRpm: rpm(download),
    downloadRpmState: download?.responsiveness?.state,
    uploadRpm: rpm(upload),
    uploadRpmState: upload?.responsiveness?.state,
    downloadMinBitsPerSecond: download?.minBitsPerSecond,
    downloadMaxBitsPerSecond: download?.maxBitsPerSecond,
    uploadMinBitsPerSecond: upload?.minBitsPerSecond,
    uploadMaxBitsPerSecond: upload?.maxBitsPerSecond,
    streamingBand: band(result.scores?.streaming),
    gamingBand: band(result.scores?.gaming),
    rtcBand: band(result.scores?.rtc),
    overheadCompensationPercent: result.settings.overheadCompensationPercent,
    dataUsedBytes: result.dataUsedBytes,
    durationMs: result.durationMs,
  }
}

/** The CSV of `results`, header row first. */
export function toCsv(results: readonly Result[]): string {
  const lines = [CSV_COLUMNS.join(','), ...results.map((result) => {
    const values = row(result)
    return CSV_COLUMNS.map((column) => field(values[column])).join(',')
  })]
  return lines.map((line) => `${line}\r\n`).join('')
}
