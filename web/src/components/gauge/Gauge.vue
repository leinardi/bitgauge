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
import { Activity, ArrowDown, ArrowUp, CircleMinus, ServerOff, WifiOff } from '@lucide/vue'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { useDial } from '@/components/gauge/dial'
import GaugeDial from '@/components/gauge/GaugeDial.vue'
import { angle, arcPath, fraction, MS_SCALE, point, rateScale, type Scale, START_ANGLE, SWEEP } from '@/components/gauge/scale'
import { useWindowTween } from '@/components/gauge/useWindowTween'
import { windowCaption } from '@/components/gauge/caption'
import { stepWindow, windowAt, type WindowState } from '@/components/gauge/window'
import type { GaugeText } from '@/components/test/screen'
import type { Direction } from '@/engine/messages'
import { latencyNumber, rateParts } from '@/lib/format'

// The live gauge (measurement.md section 14, design_system/components/gauge.md): a 270° log arc,
// in rate mode over the four-decade window it picks itself from the values, in ms mode over the
// fixed 1–1000 ms scale. The needle shows the gauge value, the band the last 10 values, the tick
// the download's steady p90 so far, the inner arc the upload headline at completion. The arc is
// decoration (aria-hidden); the readout under it is the accessible value, and it is not live. A
// textual state (Ready, Connecting…, Cancelled, Connection lost) replaces the reading with its
// title and message, and the dial shows no needle.

defineOptions({ name: 'LiveGauge' })

const props = withDefaults(
  defineProps<{
    mode: 'rate' | 'ms'
    units: 'bits' | 'bytes'
    /** The direction a rate belongs to; it picks the color, and only download shows the tick. */
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
    /** The line under the reading. */
    note?: string | null
    /** The inner arc's value in words. */
    innerLabel?: string | null
    /** A textual state in place of the reading. */
    text?: GaugeText | null
  }>(),
  { direction: null, peak: null, inner: null, at: null, note: null, innerLabel: null, text: null },
)

// A textual state's icon: cancelled in the subtle color, a lost run and an unreachable server in danger.
const STATE_ICONS = { cancelled: CircleMinus, error: WifiOff, offline: ServerOff } as const

/** The window's lowest decade, in the display unit; the parent starts it and carries it between directions. */
const windowK = defineModel<number>('window', { required: true })

const { locale, t } = useI18n()

const { center, radius, track } = useDial()
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

const color = computed(() => (props.mode === 'ms' ? 'var(--series-latency)' : props.direction === 'upload' ? 'var(--series-upload)' : 'var(--series-download)'))
const labelIcon = computed(() => (props.mode === 'ms' ? Activity : props.direction === 'upload' ? ArrowUp : ArrowDown))
const place = (value: number) => fraction(value, scale.value)

const needle = computed(() => (props.value === null ? 0 : place(display(props.value))))
const reading = computed(() => props.text === null)
const band = computed(() => {
  if (!reading.value || props.value === null || recent.value.length < 2) {
    return ''
  }
  return arcPath(center.value, center.value, radius.value, place(Math.min(...recent.value)), place(Math.max(...recent.value)))
})
const peakTick = computed(() => {
  if (!reading.value || props.mode !== 'rate' || props.direction !== 'download' || props.peak === null) {
    return null
  }
  const degrees = angle(place(display(props.peak)))
  return { from: point(center.value, center.value, radius.value + 8, degrees), to: point(center.value, center.value, radius.value - 8, degrees) }
})
const innerArc = computed(() => (props.mode === 'rate' && props.inner !== null ? arcPath(center.value, center.value, radius.value - 10, 0, place(display(props.inner))) : ''))
const dot = computed(() => point(center.value, center.value, radius.value, START_ANGLE))

const readout = computed(() => {
  if (props.value === null) {
    return { number: t('test.gauge.noValue'), unit: '' }
  }
  if (props.mode === 'ms') {
    return { number: latencyNumber(props.value, locale.value), unit: t('test.gauge.ms') }
  }
  return rateParts(props.value, props.units, locale.value)
})

const caption = computed(() => windowCaption(props.mode === 'ms' ? null : windowK.value, props.units, { t, locale: locale.value }))
</script>

<template>
  <div class="flex flex-col items-center gap-1">
    <GaugeDial
      :scale="scale"
      :mode="mode"
      :data-window="shownK"
      data-testid="gauge-arc"
    >
      <template #arcs>
        <path
          v-if="band"
          :d="band"
          fill="none"
          :stroke="color"
          stroke-opacity="0.2"
          stroke-width="22"
          data-testid="gauge-band"
        />
        <path
          v-if="value !== null"
          :d="track"
          fill="none"
          :stroke="color"
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
          v-if="reading && value !== null"
          :style="{ transform: `rotate(${SWEEP * needle}deg)`, transformOrigin: `${center}px ${center}px` }"
          :class="shifting ? 'transition-none' : 'transition-transform duration-(--dur-base) ease-(--ease-out) motion-reduce:transition-none'"
          data-testid="gauge-needle"
        >
          <circle
            :cx="dot.x"
            :cy="dot.y"
            r="7"
            fill="var(--surface-2)"
            :stroke="color"
            stroke-width="3"
          />
        </g>
      </template>
      <div
        v-if="text"
        class="absolute inset-0 flex flex-col items-center justify-center gap-0.75 pt-2 text-center"
        data-testid="gauge-text"
      >
        <span
          v-if="text.icon"
          class="mb-1 flex"
          :class="text.icon === 'cancelled' ? 'text-subtle-foreground' : 'text-danger'"
          aria-hidden="true"
        >
          <component
            :is="STATE_ICONS[text.icon]"
            :size="22"
          />
        </span>
        <span class="text-(length:--type-state-title-compact) leading-(--lh-tight) font-semibold tracking-(--tracking-tight) text-foreground desktop:text-(length:--type-state-title)">{{ text.title }}</span>
        <span
          v-if="text.message"
          class="max-w-measure-xs text-(length:--text-sm) leading-(--lh-compact) text-subtle-foreground"
          :class="{ 'hidden desktop:inline': text.touchMessage }"
        >{{ text.message }}</span>
        <span
          v-if="text.touchMessage"
          class="max-w-measure-xs text-(length:--text-sm) leading-(--lh-compact) text-subtle-foreground desktop:hidden"
        >{{ text.touchMessage }}</span>
        <span
          v-if="text.detail"
          class="mt-1 font-mono text-(length:--text-caption) text-subtle-foreground"
        >{{ text.detail }}</span>
        <span
          v-if="$slots.action"
          class="mt-2.5 flex"
        ><slot name="action" /></span>
      </div>
      <div
        v-else
        class="absolute inset-0 flex flex-col items-center justify-center gap-0.75 pt-2 text-center"
      >
        <span
          class="flex items-center gap-1.25 font-(family-name:--font-cond) text-(length:--text-caption) font-semibold tracking-(--tracking-caps) uppercase"
          :style="{ color }"
          data-testid="gauge-label"
        >
          <component
            :is="labelIcon"
            :size="13"
            :stroke-width="2.25"
            aria-hidden="true"
          />
          {{ label }}
        </span>
        <span
          class="font-mono text-(length:--type-gauge-readout-compact) leading-display font-medium tracking-(--tracking-readout) tabular-nums desktop:text-(length:--type-gauge-readout)"
          data-testid="gauge-number"
        >{{ readout.number }}</span>
        <span
          v-if="readout.unit"
          class="text-(length:--text-md) font-medium text-muted-foreground"
          data-testid="gauge-unit"
        >{{ readout.unit }}</span>
        <span
          v-if="note"
          class="font-mono text-(length:--text-micro) text-subtle-foreground"
          data-testid="gauge-note"
        >{{ note }}</span>
        <span
          v-if="innerLabel"
          class="flex items-center gap-1.25 font-mono text-(length:--text-caption) text-muted-foreground"
          data-testid="gauge-inner-label"
        >
          <ArrowUp
            :size="12"
            :stroke-width="2.25"
            class="text-(--series-upload)"
            aria-hidden="true"
          />
          {{ innerLabel }}
        </span>
      </div>
    </GaugeDial>
    <span
      class="font-mono text-(length:--text-caption) whitespace-nowrap text-subtle-foreground"
      data-testid="gauge-caption"
    >{{ caption }}</span>
  </div>
</template>
