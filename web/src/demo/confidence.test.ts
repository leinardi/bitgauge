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

// The Result detail's confidence choice (frontend.md section 9): it replaces a direction's
// confidence and its low-confidence notice on the finished result, and nothing else.

import { describe, expect, it } from 'vitest'

import { withConfidence } from '@/demo/confidence'
import { demoHistoryResults } from '@/demo/history'
import { type Result, validateResult } from '@/engine/messages'

/** A complete result of the kit's history, normal in both directions. */
function complete(): Result {
  const result = demoHistoryResults('populated').find((candidate) => candidate.status === 'complete' && candidate.download?.confidence?.level === 'normal')
  if (result === undefined) {
    throw new Error('the kit history has no complete result of normal confidence')
  }
  return result
}

function lowUpload(): Result {
  const base = complete()
  return {
    ...base,
    upload: { ...base.upload!, confidence: { level: 'low', reasons: ['insufficient-samples'] } },
    notices: [{ code: 'timer-throttling-detected' }, { code: 'low-confidence', direction: 'upload', reasons: ['insufficient-samples'] }, { code: 'page-hidden' }],
  }
}

describe('withConfidence', () => {
  it('leaves the result as the engine made it for normal', () => {
    const result = lowUpload()
    expect(withConfidence(result, { download: 'normal', upload: 'normal' })).toBe(result)
  })

  it('replaces the confidence and puts the notice where the engine had one, or last', () => {
    const result = withConfidence(lowUpload(), { download: 'low:ramp-unsettled', upload: 'low:insufficient-samples,unstable' })
    expect(validateResult(result)).toEqual([])
    expect(result.download?.confidence).toEqual({ level: 'low', reasons: ['ramp-unsettled'] })
    expect(result.upload?.confidence).toEqual({ level: 'low', reasons: ['insufficient-samples', 'unstable'] })
    expect(result.notices).toEqual([
      { code: 'timer-throttling-detected' },
      { code: 'low-confidence', direction: 'upload', reasons: ['insufficient-samples', 'unstable'] },
      { code: 'page-hidden' },
      { code: 'low-confidence', direction: 'download', reasons: ['ramp-unsettled'] },
    ])
  })

  it('drops the notice of the engine for CPU-bound, which has none', () => {
    const result = withConfidence(lowUpload(), { download: 'normal', upload: 'cpu-bound' })
    expect(result.upload?.confidence).toEqual({ level: 'cpu-bound', reasons: [] })
    expect(result.notices.map((notice) => notice.code)).toEqual(['timer-throttling-detected', 'page-hidden'])
  })

  it('leaves a direction without a number as it is', () => {
    const base = complete()
    const { bitsPerSecond: _number, ...upload } = base.upload!
    const result = { ...base, upload: { ...upload, status: 'insufficient-data' as const } }
    expect(withConfidence(result, { download: 'normal', upload: 'low:unstable' })).toEqual(result)
  })
})
