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

// A structural check of the result object (measurement.md section 17, v0.2 field set): every
// required field present with its type, nothing unknown, so a field of a later version fails. The
// v0.2 additions are optional, so a v0.1 result stays valid.
// The tests run it on every emitted result; the application runs it before Download JSON.

/** Appends a problem, `path: what is wrong`, for each way the value differs. */
type Check = (value: unknown, path: string, problems: string[]) => void

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const string: Check = (value, path, problems) => {
  if (typeof value !== 'string') {
    problems.push(`${path}: not a string`)
  }
}

/** An ISO 8601 instant in UTC, as Date.toISOString writes it. */
const instant: Check = (value, path, problems) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    problems.push(`${path}: not an ISO 8601 instant`)
  }
}

const boolean: Check = (value, path, problems) => {
  if (typeof value !== 'boolean') {
    problems.push(`${path}: not a boolean`)
  }
}

/** A finite number at least `least`; whole when `integer`. */
function number(least = 0, integer = false): Check {
  return (value, path, problems) => {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < least || (integer && !Number.isInteger(value))) {
      problems.push(`${path}: not ${integer ? 'an integer' : 'a number'} of at least ${least}`)
    }
  }
}

const count = number(0, true)
const amount = number()

function literal(...allowed: readonly (string | number | null)[]): Check {
  return (value, path, problems) => {
    if (!allowed.includes(value as string | number | null)) {
      problems.push(`${path}: not one of ${allowed.map(String).join(', ')}`)
    }
  }
}

function nullable(check: Check): Check {
  return (value, path, problems) => (value === null ? undefined : check(value, path, problems))
}

function either(first: Check, second: Check): Check {
  return (value, path, problems) => {
    const tried: string[] = []
    first(value, path, tried)
    if (tried.length > 0) {
      second(value, path, problems)
    }
  }
}

function list(item: Check, most = Number.POSITIVE_INFINITY): Check {
  return (value, path, problems) => {
    if (!Array.isArray(value)) {
      problems.push(`${path}: not an array`)
      return
    }
    if (value.length > most) {
      problems.push(`${path}: more than ${most} entries`)
    }
    value.forEach((entry, index) => item(entry, `${path}[${index}]`, problems))
  }
}

/** An object with exactly these fields, the optional ones absent or valid. */
function object(required: Record<string, Check>, optional: Record<string, Check> = {}): Check {
  return (value, path, problems) => {
    if (!isObject(value)) {
      problems.push(`${path}: not an object`)
      return
    }
    for (const [key, check] of Object.entries(required)) {
      if (key in value) {
        check(value[key], `${path}.${key}`, problems)
      } else {
        problems.push(`${path}.${key}: missing`)
      }
    }
    for (const [key, check] of Object.entries(optional)) {
      if (key in value) {
        check(value[key], `${path}.${key}`, problems)
      }
    }
    for (const key of Object.keys(value)) {
      if (!(key in required) && !(key in optional)) {
        problems.push(`${path}.${key}: not a field of this schema version`)
      }
    }
  }
}

/** One of several object shapes, chosen by the value of its `code`. */
function byCode(shapes: Record<string, Check>): Check {
  return (value, path, problems) => {
    const code = isObject(value) ? value['code'] : undefined
    const shape = typeof code === 'string' ? shapes[code] : undefined
    if (shape === undefined) {
      problems.push(`${path}.code: unknown`)
      return
    }
    shape(value, path, problems)
  }
}

const direction = literal('download', 'upload')
const reasons = list(literal('ramp-unsettled', 'insufficient-samples', 'unstable'))
const bare = (code: string) => object({ code: literal(code) })
const directed = (code: string, more: Record<string, Check> = {}) => object({ code: literal(code), direction, ...more })

const notices: Record<string, Check> = {
  'slow-link-extended': directed('slow-link-extended'),
  'low-confidence': directed('low-confidence', { reasons }),
  'data-cap-reached': directed('data-cap-reached'),
  'stream-limit': directed('stream-limit', { streams: count }),
  'insufficient-data': directed('insufficient-data', { offer: nullable(literal('quick', 'standard', 'extended')) }),
  'url-parameter-ignored': object({ code: literal('url-parameter-ignored'), parameter: string, value: string }),
  'stopped-early': directed('stopped-early', { coveredMs: amount }),
  'overhead-compensation': object({ code: literal('overhead-compensation'), percent: amount }),
  'browser-upload-limit': object({ code: literal('browser-upload-limit'), browser: string }),
  'probe-reservation': object({ code: literal('probe-reservation'), streams: count }),
  ...Object.fromEntries(
    [
      'server-restarted',
      'server-unreachable',
      'proxy-buffering-suspected',
      'upload-interrupted',
      'response-compression-detected',
      'timer-throttling-detected',
      'page-hidden',
      'network-changed',
      'websocket-reopened',
      'websocket-unavailable',
      'base-path-mismatch',
    ].map((code) => [code, bare(code)]),
  ),
}

const notice = byCode(notices)

const event = byCode({
  extended: object({ code: literal('extended'), atMs: amount }),
  'data-cap': object({ code: literal('data-cap'), atMs: amount }),
  cancelled: object({ code: literal('cancelled'), atMs: amount }),
  error: object({ code: literal('error'), atMs: amount, notice: literal('requests-failed', ...Object.keys(notices)) }),
  'failure-gap': object({ code: literal('failure-gap'), startMs: amount, endMs: amount }),
})

const series = object({
  bucketMs: number(100, true),
  firstCellMs: amount,
  warmupEndMs: amount,
  endMs: amount,
  values: list(nullable(amount), 2000),
})

const source = literal('websocket', 'http-h1-reserved', 'http-h2', 'http-h3')
const probes = { samples: count, skippedTicks: count, lost: count }

/** A direction's loaded latency: measured, with no status, or unavailable with its reason (section 11.4). */
const loadedLatency = either(
  object(
    { source, ...probes, medianMs: amount, p90Ms: amount, series: list(object({ atMs: amount, rttMs: amount }), 2000) },
    { idleSource: literal('websocket', 'http'), increaseMs: amount },
  ),
  object({ status: literal('unavailable'), reason: literal('no-steady-window', 'insufficient-samples', 'reservation-broken', 'no-probe-path'), ...probes }, { source }),
)

const directionFields = {
  required: {
    status: literal('measured', 'insufficient-data', 'partial', 'skipped', 'error'),
    streams: count,
    bytes: count,
    events: list(event),
  },
  optional: {
    bitsPerSecond: amount,
    peakBitsPerSecond: amount,
    uncompensatedBitsPerSecond: amount,
    windowMs: amount,
    plateau: literal('no-gain', 'cap', 'floor-limited'),
    confidence: object({ level: literal('normal', 'low', 'cpu-bound'), reasons }),
    series,
    loadedLatency,
  },
}

const result = object(
  {
    schema: literal('bitgauge.result'),
    schemaVersion: literal(1),
    id: string,
    startedAt: instant,
    durationMs: amount,
    status: literal('complete', 'partial', 'error'),
    label: string,
    server: object({ name: string, version: string, epoch: string }),
    client: object({
      ip: string,
      contextLabel: string,
      protocol: string,
      browser: object({ name: string, major: count, os: string }),
      timerResolutionMs: amount,
      crossOriginIsolated: boolean,
    }),
    settings: object({
      preset: literal('quick', 'standard', 'extended'),
      phases: list(literal('idle', 'download', 'upload')),
      streams: object({ mode: literal('auto', 'fixed', 'single'), max: count }),
      dataCapBytes: nullable(count),
      overheadCompensationPercent: amount,
      warmup: either(literal('auto'), count),
      pingCount: count,
    }),
    dataUsedBytes: count,
    notices: list(notice),
  },
  {
    idle: object(
      { path: literal('websocket', 'http'), lossPercent: amount, samples: list(amount) },
      { minMs: amount, medianMs: amount, p90Ms: amount, jitterMs: amount },
    ),
    download: object(directionFields.required, directionFields.optional),
    upload: object({ ...directionFields.required, confirmedRequests: count }, directionFields.optional),
    bufferbloat: object({ grade: literal('A+', 'A', 'B', 'C', 'D', 'F'), basis: literal('download+upload', 'download', 'upload'), increaseMs: amount }),
  },
)

/** The problems of `value` as a result object, each naming its path; none when it is one. */
export function validateResult(value: unknown): string[] {
  const problems: string[] = []
  result(value, 'result', problems)
  return problems
}
