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
import 'uplot/dist/uPlot.min.css'

import { useMediaQuery } from '@vueuse/core'
import uPlot from 'uplot'
import { computed, shallowRef, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { useUplot } from '@/components/chart/useUplot'
import { decadeLabel, latencyTop, rateDecades, type TimeTick, type TimeWindow } from '@/components/history/trendAxes'
import { useTheme } from '@/composables/useTheme'

// One small multiple of the History trend (ui/screens.md section 3; kit History.jsx): a metric over
// the results' start times on uPlot, a line through the results that have the number and a marker
// on each, filled for a complete result and hollow for a partial or error one. Rates use a log
// scale of whole decades, latency a linear one from 0, the time axis the window and ticks the
// trend gives (trendAxes.ts); a single result's marker carries its value. The colors are the
// theme's tokens, read again when it changes.

export interface TrendPoint {
  /** The result's start, in seconds. */
  at: number
  value: number | null
  complete: boolean
}

const props = withDefaults(
  defineProps<{
    points: TrendPoint[]
    frame: TimeWindow
    ticks: readonly TimeTick[]
    color: string
    log: boolean
    label: string
    format: (value: number) => string
    /** What a rate is divided by in the units shown, 8 for bytes, so the decades are the units'. */
    divisor?: number
  }>(),
  { divisor: 1 },
)

// The kit's plot size: 130 px high, 120 px on a narrow screen (History.jsx th), and at most 340 px
// wide (tw), the host's max-w-85.
const narrow = useMediaQuery('(max-width: 767.98px)')
const height = computed(() => (narrow.value ? 120 : 130))

const { t, locale } = useI18n()
const { applied } = useTheme()
const host = useTemplateRef<HTMLDivElement>('host')
const palette = shallowRef({ line: 'currentColor', grid: 'currentColor', axis: 'currentColor', surface: 'transparent', font: '10px monospace' })

function readPalette(): void {
  const style = getComputedStyle(host.value ?? document.documentElement)
  const token = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback
  palette.value = {
    line: token(props.color, 'currentColor'),
    grid: token('--chart-grid', 'currentColor'),
    axis: token('--fg-subtle', 'currentColor'),
    surface: token('--surface-2', 'transparent'),
    font: `10px ${token('--font-mono', 'monospace')}`,
  }
}

const day = computed(() => new Intl.DateTimeFormat(locale.value, { day: 'numeric', month: 'short' }))
const month = computed(() => new Intl.DateTimeFormat(locale.value, { month: 'short', year: 'numeric' }))

const values = computed(() => props.points.flatMap((point) => (point.value === null ? [] : [point.value])))
// The value axis: the decades around the rates in the units shown, or 0 to the latency's top
// with its middle.
const yTicks = computed(() => {
  if (props.log) {
    const [lo, hi] = rateDecades(values.value.map((value) => value / props.divisor))
    return Array.from({ length: hi - lo + 1 }, (_, index) => 10 ** (lo + index) * props.divisor)
  }
  const top = latencyTop(values.value)
  return [0, top / 2, top]
})

const whole = computed(() => new Intl.NumberFormat(locale.value, { maximumFractionDigits: 0 }))

// The kit's value labels: 10M, 100M, 1G on a rate axis; 0, 40, 80 ms on the latency one.
function valueText(value: number): string {
  if (props.log) {
    return decadeLabel(value / props.divisor)
  }
  return value === yTicks.value.at(-1) ? props.format(value) : whole.value.format(value)
}

function tickText(at: number): string {
  const tick = props.ticks.find((candidate) => candidate.at === at)
  return tick?.today === true ? t('history.trend.today') : (tick?.year === true ? month : day).value.format(at * 1000)
}

// The single result's value, left of its marker, where the plot drew it (History.jsx mkTrend lbl).
const single = shallowRef<{ left: string; top: string; text: string } | null>(null)
function placeSingle(chart: uPlot): void {
  const drawn = props.points.flatMap((point) => (point.value === null ? [] : [{ at: point.at, value: point.value }]))
  const [only] = drawn
  single.value =
    drawn.length === 1 && only !== undefined && only.at >= props.frame.from && only.at <= props.frame.to
      ? { left: `${chart.over.offsetLeft + chart.valToPos(only.at, 'x')}px`, top: `${chart.over.offsetTop + chart.valToPos(only.value, 'y')}px`, text: props.format(only.value) }
      : null
}

function options(size: { width: number; height: number }): uPlot.Options {
  readPalette()
  const axis = { stroke: () => palette.value.axis, font: palette.value.font, ticks: { show: false } }
  const first = (): number => yTicks.value[0] ?? 0
  const last = (): number => yTicks.value.at(-1) ?? 1
  return {
    width: size.width,
    height: size.height,
    cursor: { show: false },
    legend: { show: false },
    // The kit's plot inset above, 6 px (History.jsx pt); the axes set the others.
    padding: [6, null, 0, null],
    scales: { x: { time: true, range: () => [props.frame.from, props.frame.to] }, y: props.log ? { distr: 3, range: () => [first(), last()] } : { range: () => [first(), last()] } },
    axes: [
      { ...axis, grid: { show: false }, size: 20, splits: () => props.ticks.map((tick) => tick.at), values: (_plot, splits) => splits.map(tickText) },
      { ...axis, grid: { stroke: () => palette.value.grid, width: 1 }, size: 40, splits: () => [...yTicks.value], filter: (_plot, splits) => splits, values: (_plot, splits) => splits.map(valueText) },
    ],
    hooks: { draw: [placeSingle] },
    series: [
      {},
      { stroke: () => palette.value.line, width: 1.5, points: { show: false } },
      { stroke: () => palette.value.line, paths: () => null, points: { show: true, size: 6, width: 1.5, stroke: () => palette.value.line, fill: () => palette.value.line } },
      { stroke: () => palette.value.line, paths: () => null, points: { show: true, size: 7, width: 1.5, stroke: () => palette.value.line, fill: () => palette.value.surface } },
    ],
  }
}

function data(): uPlot.AlignedData {
  return [
    props.points.map((point) => point.at),
    props.points.map((point) => point.value),
    props.points.map((point) => (point.complete ? point.value : null)),
    props.points.map((point) => (point.complete ? null : point.value)),
  ]
}

const { plot } = useUplot(host, options, data, () => height.value)

// The axes follow the filter's window too, which the data alone does not carry.
watch([() => props.frame, () => props.ticks], () => plot.value?.setData(data()))

watch(applied, () => {
  readPalette()
  plot.value?.redraw(false, true)
})
</script>

<template>
  <div class="relative max-w-85 min-w-0 overflow-hidden">
    <div
      ref="host"
      role="img"
      :aria-label="label"
    />
    <span
      v-if="single !== null"
      aria-hidden="true"
      class="pointer-events-none absolute -translate-x-[calc(100%+var(--space-2))] -translate-y-1/2 font-mono text-(length:--text-caption) whitespace-nowrap text-foreground"
      :style="{ left: single.left, top: single.top }"
    >{{ single.text }}</span>
  </div>
</template>
