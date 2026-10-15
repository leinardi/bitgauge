<!--
  This file is part of BitGauge.

  Copyright (c) 2026 Roberto Leinardi

  BitGauge is free software: you can redistribute it and/or modify
  it under the terms of the GNU General Public License as published by
  the Free Software Foundation, either version 3 of the License, or
  (at your option) any later version.

  BitGauge is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  GNU General Public License for more details.

  You should have received a copy of the GNU General Public License
  along with BitGauge.  If not, see <http://www.gnu.org/licenses/>.
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { angle, arcPath, fraction, MS_SCALE, point, rateScale, type Scale, START_ANGLE, SWEEP, ticks } from '@/components/gauge/scale'
import { useWindowTween } from '@/components/gauge/useWindowTween'
import { stepWindow, windowAt, type WindowState } from '@/components/gauge/window'
import type { Direction } from '@/engine/messages'
import { formatRate, latencyNumber, rateParts } from '@/lib/format'

// The live gauge (measurement.md section 14, design_system/components/gauge.md): a 270° log arc,
// in rate mode over the four-decade window it picks itself from the values, in ms mode over the
// fixed 1–1000 ms scale. The needle shows the gauge value, the band the last 10 values, the tick
// the download's steady p90 so far, the inner arc the upload headline at completion. The arc is
// decoration (aria-hidden); the readout under it is the accessible value, and it is not live.

defineOptions({ name: 'LiveGauge' })

const props = withDefaults(
  defineProps<{
    mode: 'rate' | 'ms'
    units: 'bits' | 'bytes'
    /** The direction a rate belongs to; it picks the colour, and only download shows the tick. */
    direction?: Direction | null
    /** The gauge value: bit/s, or ms in ms mode; null before the first one. */
    value: number | null
    /** The download's steady-window p90 so far, in bit/s; null while warming up. */
    peak?: number | null
    /** The upload headline at completion, in bit/s. */
    inner?: number | null
    /** The eyebrow over the number, such as "Upload · sending". */
    label: string
    /**
     * When the value was sampled, in milliseconds; the window's dwell is measured on it, and a new
     * time with an unchanged value still counts. Without it, the time the value arrives.
     */
    at?: number | null
  }>(),
  { direction: null, peak: null, inner: null, at: null },
)

/** The window's lowest decade, in the display unit; the parent starts it and carries it between directions. */
const windowK = defineModel<number>('window', { required: true })

const { locale, t } = useI18n()

const SIZE = 316
const CENTER = SIZE / 2
const RADIUS = SIZE / 2 - 10
const BAND_VALUES = 10

const rateUnit = computed(() => (props.mode === 'ms' ? 'ms' : props.units))
/** A value in the gauge's own unit: B/s in bytes mode. */
const display = (value: number) => (rateUnit.value === 'bytes' ? value / 8 : value)
// The scale is drawn at the tweened decade, so ticks, labels and needle shift together.
const { shown: shownK, shifting } = useWindowTween(windowK)
const scale = computed<Scale>(() => (props.mode === 'ms' ? MS_SCALE : rateScale(shownK.value)))

let held: WindowState = windowAt(windowK.value)
const recent = ref<number[]>([])

/** A new band and a new hold, in the window as it stands. */
function restart(): void {
  recent.value = []
  held = windowAt(windowK.value)
}

// A new direction or mode starts its own band and hold; the window itself carries over.
watch(() => [props.mode, props.direction] as const, restart)

watch(windowK, (k) => {
  if (k !== held.k) {
    held = windowAt(k)
  }
})

watch(
  () => [props.value, props.at] as const,
  ([value, sampledAt]) => {
    // No value: between runs, or before a direction's first sample. Nothing carries over.
    if (value === null) {
      restart()
      return
    }
    const shown = display(value)
    recent.value = [...recent.value, shown].slice(-BAND_VALUES)
    held = stepWindow(held, shown, sampledAt ?? performance.now(), rateUnit.value)
    if (held.k !== windowK.value) {
      windowK.value = held.k
    }
  },
  { immediate: true },
)

const colour = computed(() => (props.mode === 'ms' ? 'var(--series-latency)' : props.direction === 'upload' ? 'var(--series-upload)' : 'var(--series-download)'))
const place = (value: number) => fraction(value, scale.value)

const track = arcPath(CENTER, CENTER, RADIUS, 0, 1)
const needle = computed(() => (props.value === null ? 0 : place(display(props.value))))
const band = computed(() => {
  if (props.value === null || recent.value.length < 2) {
    return ''
  }
  return arcPath(CENTER, CENTER, RADIUS, place(Math.min(...recent.value)), place(Math.max(...recent.value)))
})
const peakTick = computed(() => {
  if (props.mode !== 'rate' || props.direction !== 'download' || props.peak === null) {
    return null
  }
  const degrees = angle(place(display(props.peak)))
  return { from: point(CENTER, CENTER, RADIUS + 8, degrees), to: point(CENTER, CENTER, RADIUS - 8, degrees) }
})
const innerArc = computed(() => (props.mode === 'rate' && props.inner !== null ? arcPath(CENTER, CENTER, RADIUS - 10, 0, place(display(props.inner))) : ''))
const dot = point(CENTER, CENTER, RADIUS, START_ANGLE)

function compact(value: number): string {
  if (props.mode === 'ms') {
    return String(value)
  }
  for (const [size, prefix] of [
    [1e9, 'G'],
    [1e6, 'M'],
    [1e3, 'k'],
  ] as const) {
    if (value >= size) {
      return `${value / size}${prefix}`
    }
  }
  return String(value)
}

const tickMarks = computed(() =>
  ticks(scale.value).map((tick) => {
    const degrees = angle(tick.at)
    const label = point(CENTER, CENTER, RADIUS - 36, degrees)
    return {
      key: tick.value,
      from: point(CENTER, CENTER, RADIUS - 14, degrees),
      to: point(CENTER, CENTER, RADIUS - (tick.major ? 22 : 18), degrees),
      major: tick.major,
      label: tick.major ? { x: label.x, y: label.y + 4, text: compact(tick.value) } : null,
    }
  }),
)

const readout = computed(() => {
  if (props.value === null) {
    return { number: t('test.gauge.noValue'), unit: '' }
  }
  if (props.mode === 'ms') {
    return { number: latencyNumber(props.value, locale.value), unit: t('test.gauge.ms') }
  }
  return rateParts(props.value, props.units, locale.value)
})

const caption = computed(() => {
  if (props.mode === 'ms') {
    return t('test.gauge.fixed', { lo: MS_SCALE.lo, hi: MS_SCALE.hi })
  }
  // The decades are in the display unit; the formatter takes bit/s.
  const bits = (value: number) => (props.units === 'bytes' ? value * 8 : value)
  const { lo, hi } = rateScale(windowK.value)
  return t('test.gauge.window', { lo: formatRate(bits(lo), props.units, locale.value, true), hi: formatRate(bits(hi), props.units, locale.value, true) })
})
</script>

<template>
  <div class="flex flex-col items-center gap-3.5">
    <div class="relative aspect-square w-68 sm:w-79">
      <svg
        :viewBox="`0 0 ${SIZE} ${SIZE}`"
        class="block size-full overflow-visible"
        aria-hidden="true"
        :data-window="shownK"
        data-testid="gauge-arc"
      >
        <path
          :d="track"
          fill="none"
          stroke="var(--surface-3)"
          stroke-width="10"
          stroke-linecap="round"
        />
        <g
          v-for="tick in tickMarks"
          :key="tick.key"
        >
          <line
            :x1="tick.from.x"
            :y1="tick.from.y"
            :x2="tick.to.x"
            :y2="tick.to.y"
            stroke="var(--fg-faint)"
            :stroke-width="tick.major ? 1.5 : 1"
            :opacity="tick.major ? 1 : 0.6"
          />
          <text
            v-if="tick.label"
            :x="tick.label.x"
            :y="tick.label.y"
            text-anchor="middle"
            class="fill-subtle-foreground font-mono text-(length:--text-micro)"
          >{{ tick.label.text }}</text>
        </g>
        <path
          v-if="band"
          :d="band"
          fill="none"
          :stroke="colour"
          stroke-opacity="0.2"
          stroke-width="22"
          data-testid="gauge-band"
        />
        <path
          v-if="value !== null"
          :d="track"
          fill="none"
          :stroke="colour"
          stroke-width="10"
          stroke-linecap="round"
          pathLength="1"
          :stroke-dasharray="`${needle} 1`"
          :class="shifting ? 'transition-none' : 'transition-[stroke-dasharray] duration-(--dur-base) ease-(--ease-out) motion-reduce:transition-none'"
          data-testid="gauge-fill"
        />
        <path
          v-if="innerArc"
          :d="innerArc"
          fill="none"
          stroke="var(--series-upload)"
          stroke-width="4"
          stroke-linecap="round"
          data-testid="gauge-inner"
        />
        <line
          v-if="peakTick"
          :x1="peakTick.from.x"
          :y1="peakTick.from.y"
          :x2="peakTick.to.x"
          :y2="peakTick.to.y"
          stroke="var(--fg-muted)"
          stroke-width="2"
          stroke-linecap="round"
          data-testid="gauge-peak"
        />
        <g
          v-if="value !== null"
          :style="{ transform: `rotate(${SWEEP * needle}deg)`, transformOrigin: `${CENTER}px ${CENTER}px` }"
          :class="shifting ? 'transition-none' : 'transition-transform duration-(--dur-base) ease-(--ease-out) motion-reduce:transition-none'"
          data-testid="gauge-needle"
        >
          <circle
            :cx="dot.x"
            :cy="dot.y"
            r="7"
            fill="var(--surface-2)"
            :stroke="colour"
            stroke-width="3"
          />
        </g>
      </svg>
      <div class="absolute inset-0 flex flex-col items-center justify-center gap-0.5 pt-2 text-center">
        <span
          class="font-(family-name:--font-cond) text-xs font-semibold tracking-(--tracking-caps) text-subtle-foreground uppercase"
          data-testid="gauge-label"
        >{{ label }}</span>
        <span
          class="font-mono text-(length:--type-gauge-readout-compact) leading-[1.05] font-medium tracking-(--tracking-readout) tabular-nums sm:text-(length:--type-gauge-readout)"
          data-testid="gauge-number"
        >{{ readout.number }}</span>
        <span
          v-if="readout.unit"
          class="text-(length:--text-md) font-medium text-muted-foreground"
          data-testid="gauge-unit"
        >{{ readout.unit }}</span>
      </div>
    </div>
    <p
      class="font-mono text-(length:--text-caption) text-subtle-foreground"
      data-testid="gauge-caption"
    >
      {{ caption }}
    </p>
  </div>
</template>
