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

import { MS_SCALE, rateScale } from '@/components/gauge/scale'
import type { Wording } from '@/components/test/wording'
import { formatRate } from '@/lib/format'

// The caption under the dial that names the gauge's current window (design_system/components/
// gauge.md, Anatomy): the window is presentation only, so the caption says which one is shown.

/** The caption of window `k` in the display unit, or of the fixed ms scale when `k` is null. */
export function windowCaption(k: number | null, units: 'bits' | 'bytes', { t, locale }: Wording): string {
  if (k === null) {
    return t('test.gauge.fixed', { lo: MS_SCALE.lo, hi: MS_SCALE.hi })
  }
  // The decades are in the display unit; the formatter takes bit/s.
  const bits = (value: number) => (units === 'bytes' ? value * 8 : value)
  const { lo, hi } = rateScale(k)
  return t('test.gauge.window', { lo: formatRate(bits(lo), units, locale, true), hi: formatRate(bits(hi), units, locale, true) })
}
