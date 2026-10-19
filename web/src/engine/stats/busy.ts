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

// The Worker's busy fraction (measurement.md section 16, edge-cases.md section 10): the time it
// spends executing its own tasks, as the Clock measures it, divided by the elapsed time. Above 90 %
// over a direction's steady window, the browser rather than the link limits the number.

const CPU_BOUND_FRACTION = 0.9

/** The pinned span: the raw samples within 30 s either side of the pin instant. */
const PIN_SPAN_MS = 30_000
/** After the pin, the most recent samples kept: 10 min of 100 ms ticks. */
const RING_SAMPLES = 6000

/** A tick's busy time, numbered in record order so a gap left by a dropped sample shows. */
interface BusySample {
  at: number
  busyMs: number
  seq: number
}

/**
 * The busy time sampled on the housekeeping tick. Unpinned it keeps every sample, which a bounded
 * run's length bounds. Pinned at an instant, as a Continuous run is at its steady start
 * (measurement.md section 15), it keeps the samples within 30 s of that instant and, in a ring
 * allocated at its full length, the most recent 6000, so it answers a span from near the pin to
 * near the latest tick exactly, from real samples, and any other span not at all.
 */
export class BusyTrack {
  /** Every sample while unpinned; the pinned span's once pinned. */
  private samples: BusySample[] = []
  private ring: (BusySample | undefined)[] | null = null
  /** The ring's next slot, which holds its oldest sample once it is full. */
  private head = 0
  private pinnedAt: number | null = null
  private first: BusySample | undefined
  private last: BusySample | undefined
  private recorded = 0

  record(at: number, busyMs: number): void {
    if (this.last !== undefined && at <= this.last.at) {
      return
    }
    const sample = { at, busyMs, seq: this.recorded++ }
    this.first ??= sample
    this.last = sample
    if (this.ring === null || this.pinnedAt === null) {
      this.samples.push(sample)
      return
    }
    if (at <= this.pinnedAt + PIN_SPAN_MS) {
      this.samples.push(sample)
    }
    this.store(sample)
  }

  /** Freezes the samples within 30 s of `at` and keeps only the most recent ones beyond them; once. */
  pin(at: number): void {
    if (this.pinnedAt !== null) {
      return
    }
    this.pinnedAt = at
    this.ring = Array.from({ length: RING_SAMPLES }, (): BusySample | undefined => undefined)
    for (const sample of this.samples.slice(-RING_SAMPLES)) {
      this.store(sample)
    }
    this.samples = this.samples.filter((sample) => Math.abs(sample.at - at) <= PIN_SPAN_MS)
  }

  /**
   * The busy fraction over [from, to], clamped to the sampled span; null without a span. Pinned,
   * also null unless `from` falls in the pinned span and `to` among the ring's samples: an instant
   * is read only between its two real neighboring samples, never guessed across a dropped one.
   */
  fraction(from: number, to: number): number | null {
    const { first, last } = this
    if (first === undefined || last === undefined) {
      return null
    }
    const start = Math.max(from, first.at)
    const end = Math.min(to, last.at)
    if (end <= start) {
      return null
    }
    if (this.ring !== null && !(this.inPinnedSpan(start) && this.inRing(end))) {
      return null
    }
    const kept = this.kept()
    const busyStart = busyAt(kept, start)
    const busyEnd = busyAt(kept, end)
    return busyStart === null || busyEnd === null ? null : (busyEnd - busyStart) / (end - start)
  }

  /** The samples kept: unpinned every one, pinned the span's and the ring's, in record order. */
  footprint(): number {
    return this.samples.length + (this.ring?.length ?? 0)
  }

  private store(sample: BusySample): void {
    if (this.ring !== null) {
      this.ring[this.head] = sample
      this.head = (this.head + 1) % this.ring.length
    }
  }

  /** The ring's samples, oldest first. */
  private ringed(): BusySample[] {
    const ring = this.ring ?? []
    return [...ring.slice(this.head), ...ring.slice(0, this.head)].filter((sample) => sample !== undefined)
  }

  private inPinnedSpan(at: number): boolean {
    const first = this.samples[0]
    const last = this.samples.at(-1)
    return first !== undefined && last !== undefined && at >= first.at && at <= last.at
  }

  private inRing(at: number): boolean {
    const ringed = this.ringed()
    const oldest = ringed[0]
    const newest = ringed.at(-1)
    return oldest !== undefined && newest !== undefined && at >= oldest.at && at <= newest.at
  }

  /** Every sample still kept, each once, in record order. */
  private kept(): BusySample[] {
    if (this.ring === null) {
      return this.samples
    }
    const bySeq = new Map<number, BusySample>()
    for (const sample of [...this.samples, ...this.ringed()]) {
      bySeq.set(sample.seq, sample)
    }
    return [...bySeq.values()].sort((left, right) => left.seq - right.seq)
  }
}

/**
 * The busy time at `at`, linear between the first kept sample at or after it and the sample just
 * before that one; when that one was dropped, the sample's own value at its own instant, and null
 * anywhere else, so no instant is read across a gap.
 */
function busyAt(kept: readonly BusySample[], at: number): number | null {
  const index = kept.findIndex((sample) => sample.at >= at)
  const sample = index === -1 ? kept.at(-1) : kept[index]
  if (sample === undefined) {
    return null
  }
  if (index === -1) {
    return sample.busyMs
  }
  // The very first sample is its own predecessor, as the unpinned track has always read it.
  const before = index === 0 ? (sample.seq === 0 ? sample : undefined) : kept[index - 1]
  if (before === undefined || (before !== sample && before.seq !== sample.seq - 1)) {
    // Without its real predecessor only the sample's own instant is known.
    return sample.at === at ? sample.busyMs : null
  }
  const span = sample.at - before.at
  return span === 0 ? sample.busyMs : before.busyMs + ((sample.busyMs - before.busyMs) * (at - before.at)) / span
}

/** Whether a busy fraction makes the direction `cpu-bound`. */
export function cpuBound(fraction: number | null): boolean {
  return fraction !== null && fraction > CPU_BOUND_FRACTION
}
