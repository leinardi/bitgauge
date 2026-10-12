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

import { describe, expect, it } from 'vitest'

import { BucketSeries, coefficientOfVariation, mean, percentile } from '@/engine/stats/buckets'

describe('BucketSeries', () => {
  it('appends cells after the last one and reads them back by index', () => {
    const series = new BucketSeries(10)
    expect(series.end).toBe(10)

    series.append(3000, 6100)
    series.append(null, 0)

    expect(series.first).toBe(10)
    expect(series.end).toBe(14)
    expect(series.at(10)).toBe(3000)
    expect(series.at(11)).toBe(6100)
    expect(series.at(12)).toBeNull()
    expect(series.at(13)).toBe(0)
  })

  it('reports ranges with unknown cells as null, outside the series included', () => {
    const series = new BucketSeries(10)
    series.append(1, null, 3)

    expect(series.range(8, 15)).toEqual([null, null, 1, null, 3, null, null])
    expect(series.range(11, 11)).toEqual([])
    expect(series.known(8, 15)).toEqual([1, 3])
  })

  it('keeps a confirmed zero apart from an unknown cell', () => {
    const series = new BucketSeries()
    series.append(0, null)

    expect(series.range(0, 2)).toEqual([0, null])
    expect(series.known(0, 2)).toEqual([0])
  })

  it('rejects a cell that is not a byte count', () => {
    const series = new BucketSeries()
    expect(() => series.append(-1)).toThrow(RangeError)
    expect(() => series.append(Number.NaN)).toThrow(RangeError)
    expect(() => series.append(Number.POSITIVE_INFINITY)).toThrow(RangeError)
    expect(() => new BucketSeries(0.5)).toThrow(RangeError)
  })

  it('excludes unknown cells from the mean instead of counting them as zero', () => {
    const series = new BucketSeries()
    series.append(100, null, 300, null)

    // Two known cells: (100 + 300) / 2, not (100 + 300) / 4.
    expect(series.mean(0, 4)).toBe(200)
    expect(series.mean(1, 2)).toBeNull()
    expect(series.mean(5, 9)).toBeNull()
  })

  it('takes the p90 over the known cells only', () => {
    const series = new BucketSeries()
    series.append(10, 20, null, 30, 40, null, 50, 60, 70, 80, 90, 100)

    // Ten known cells, 10 to 100: rank 0.9 × 9 = 8.1, so 90 + 0.1 × 10.
    expect(series.p90(0, 12)).toBeCloseTo(91, 10)
    expect(series.p90(2, 3)).toBeNull()
  })

  it('takes the coefficient of variation over the known cells only', () => {
    const series = new BucketSeries()
    series.append(90, null, 110, null)

    // Mean 100, population standard deviation 10.
    expect(series.coefficientOfVariation(0, 4)).toBeCloseTo(0.1, 12)
    expect(series.coefficientOfVariation(1, 2)).toBeNull()
  })

  it('reads the last known cells, skipping unknown ones', () => {
    const series = new BucketSeries(5)
    series.append(1, 2, null, 3, null, 4)

    expect(series.lastKnown(3)).toEqual([2, 3, 4])
    expect(series.lastKnown(10)).toEqual([1, 2, 3, 4])
    expect(series.lastKnown(2, 9)).toEqual([2, 3])
    expect(series.lastKnown(2, 5)).toEqual([])
    expect(series.lastKnown(2, 20)).toEqual([3, 4])
  })
})

describe('mean', () => {
  it('averages the values and has no value without any', () => {
    expect(mean([1, 2, 3, 4])).toBe(2.5)
    expect(mean([])).toBeNull()
  })
})

describe('percentile', () => {
  it('interpolates linearly between the closest ranks', () => {
    const values = [40, 10, 30, 20]

    expect(percentile(values, 0)).toBe(10)
    expect(percentile(values, 100)).toBe(40)
    // Rank 0.5 × 3 = 1.5: halfway between 20 and 30.
    expect(percentile(values, 50)).toBe(25)
    // Rank 0.9 × 3 = 2.7: 30 + 0.7 × 10.
    expect(percentile(values, 90)).toBeCloseTo(37, 10)
  })

  it('gives one value as its own percentile and none without values', () => {
    expect(percentile([7], 90)).toBe(7)
    expect(percentile([], 90)).toBeNull()
  })

  it('does not reorder its input', () => {
    const values = [3, 1, 2]
    percentile(values, 50)
    expect(values).toEqual([3, 1, 2])
  })

  it('rejects a percentile outside [0, 100]', () => {
    expect(() => percentile([1], -1)).toThrow(RangeError)
    expect(() => percentile([1], 101)).toThrow(RangeError)
    expect(() => percentile([1], Number.NaN)).toThrow(RangeError)
  })
})

describe('coefficientOfVariation', () => {
  it('is the population standard deviation over the mean', () => {
    // Mean 5, population variance 4, standard deviation 2.
    expect(coefficientOfVariation([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(0.4, 12)
    expect(coefficientOfVariation([5, 5, 5])).toBe(0)
  })

  it('has no value without values or with a mean of zero', () => {
    expect(coefficientOfVariation([])).toBeNull()
    expect(coefficientOfVariation([0, 0, 0])).toBeNull()
  })
})
