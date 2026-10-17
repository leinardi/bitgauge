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
import { useTheme } from '@/composables/useTheme'

// One small multiple of the History trend (ui/screens.md section 3; kit History.jsx): a metric over
// the results' start times on uPlot, a line through the results that have the number and a marker
// on each, filled for a complete result and hollow for a partial or error one. Rates use a log
// scale, latency a linear one from 0. The colors are the theme's tokens, read again when it changes.

export interface TrendPoint {
  /** The result's start, in seconds. */
  at: number
  value: number | null
  complete: boolean
}

const props = defineProps<{ points: TrendPoint[]; color: string; log: boolean; label: string; format: (value: number) => string }>()

// The kit's plot size: 130 px high, 120 px on a narrow screen (History.jsx th), and at most 340 px
// wide (tw), the host's max-w-85.
const narrow = useMediaQuery('(max-width: 767.98px)')
const height = computed(() => (narrow.value ? 120 : 130))

const { locale } = useI18n()
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

function options(size: { width: number; height: number }): uPlot.Options {
  readPalette()
  const axis = { stroke: () => palette.value.axis, font: palette.value.font, ticks: { show: false } }
  return {
    width: size.width,
    height: size.height,
    cursor: { show: false },
    legend: { show: false },
    scales: { x: { time: true }, y: props.log ? { distr: 3 } : { range: (_plot, _min, max) => [0, max > 0 ? max * 1.1 : 1] } },
    axes: [
      { ...axis, grid: { show: false }, size: 20, values: (_plot, splits) => splits.map((at) => day.value.format(at * 1000)) },
      { ...axis, grid: { stroke: () => palette.value.grid, width: 1 }, size: 44, values: (_plot, splits) => splits.map((value) => props.format(value)) },
    ],
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

watch(applied, () => {
  readPalette()
  plot.value?.redraw(false, true)
})
</script>

<template>
  <div
    ref="host"
    role="img"
    :aria-label="label"
    class="max-w-85 min-w-0"
  />
</template>
