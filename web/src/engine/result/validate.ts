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

// A structural check of the result object (measurement.md section 17): every required field
// present with its type, nothing unknown, so a field the schema does not define fails. The
// optional fields may be absent, so a result without them stays valid.
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

/**
 * An ISO 8601 instant in UTC, as Date.toISOString writes it: milliseconds and a Z required. Another
 * ISO 8601 form is still refused, and the problem names the one form accepted.
 */
const instant: Check = (value, path, problems) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    problems.push(`${path}: not an instant in UTC with milliseconds, as YYYY-MM-DDTHH:MM:SS.sssZ`)
  }
}

/** A random version 4 UUID (measurement.md section 17), in either case. */
const uuid: Check = (value, path, problems) => {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)) {
    problems.push(`${path}: not a version 4 UUID`)
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
  'data-used': object({ code: literal('data-used'), bytes: count }),
  'stream-limit': directed('stream-limit', { streams: count }),
  'rate-limited': directed('rate-limited', { reason: literal('rate', 'table-full'), retried: boolean }),
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
  error: object({ code: literal('error'), atMs: amount, notice: literal('requests-failed', 'server-busy', ...Object.keys(notices)) }),
  'failure-gap': object({ code: literal('failure-gap'), startMs: amount, endMs: amount }),
})

/** A direction's saved series; `knownMs` only in Continuous (section 15). */
const series = object(
  {
    bucketMs: number(100, true),
    firstCellMs: amount,
    warmupEndMs: amount,
    endMs: amount,
    values: list(nullable(amount), 2000),
  },
  { knownMs: list(amount, 2000) },
)

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

/** A direction's HTTP loaded responsiveness (section 12.6): its numbers only when measured or uncertain. */
const pathB = { protocol: string, samples: count }
const responsiveness = either(
  object({ state: literal('measured', 'uncertain'), ...pathB, rpm: count, tm95Ms: amount, trimmed: count, totalMedianMs: amount }),
  object({ state: literal('unavailable_h1', 'unavailable_insufficient'), ...pathB }),
)

/** One quality-score experience (section 13.5): its points and band, or what it misses. */
const experience = either(
  object({ points: count, band: literal('bad', 'poor', 'average', 'good', 'great') }),
  object({ missing: list(literal('idle-latency', 'jitter', 'loaded-latency', 'download')) }),
)
const scores = object({
  basis: literal('download+upload', 'download', 'upload', 'none'),
  packetLoss: literal('not-measured'),
  streaming: experience,
  gaming: experience,
  rtc: experience,
})

/** A direction's resolved duration bounds, both null in Continuous. */
const numericBounds = object({ minMs: count, maxMs: count })
const noBounds = object({ minMs: literal(null), maxMs: literal(null) })
const bounds: Check = (value, path, problems) => (isObject(value) && value['minMs'] === null ? noBounds : numericBounds)(value, path, problems)

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
    minBitsPerSecond: amount,
    maxBitsPerSecond: amount,
    windowMs: amount,
    plateau: literal('no-gain', 'cap', 'floor-limited'),
    confidence: object({ level: literal('normal', 'low', 'cpu-bound'), reasons }),
    series,
    loadedLatency,
    responsiveness,
  },
}

/** A direction, whose `partial` status always carries a number (measurement.md section 17). */
function directionBlock(shape: Check): Check {
  return (value, path, problems) => {
    shape(value, path, problems)
    if (isObject(value) && value['status'] === 'partial' && value['bitsPerSecond'] === undefined) {
      problems.push(`${path}.bitsPerSecond: missing, as a partial direction always has a number`)
    }
  }
}

const result = object(
  {
    schema: literal('bitgauge.result'),
    schemaVersion: literal(1),
    id: uuid,
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
    settings: object(
      {
        preset: literal('quick', 'standard', 'extended', 'continuous'),
        phases: list(literal('idle', 'download', 'upload')),
        streams: object({ mode: literal('auto', 'fixed', 'single'), max: count }),
        dataCapBytes: nullable(count),
        overheadCompensationPercent: amount,
        warmup: either(literal('auto'), count),
        pingCount: count,
      },
      { download: bounds, upload: bounds, continuousDirection: direction, runLengthMs: count },
    ),
    dataUsedBytes: count,
    notices: list(notice),
  },
  {
    note: string,
    idle: object(
      { path: literal('websocket', 'http'), lossPercent: amount, samples: list(amount) },
      { minMs: amount, medianMs: amount, p90Ms: amount, jitterMs: amount },
    ),
    download: directionBlock(object(directionFields.required, directionFields.optional)),
    upload: directionBlock(object({ ...directionFields.required, confirmedRequests: count }, directionFields.optional)),
    bufferbloat: object({ grade: literal('A+', 'A', 'B', 'C', 'D', 'F'), basis: literal('download+upload', 'download', 'upload'), increaseMs: amount }),
    scores,
  },
)

/** The problems of `value` as a result object, each naming its path; none when it is one. */
export function validateResult(value: unknown): string[] {
  const problems: string[] = []
  result(value, 'result', problems)
  return problems
}
