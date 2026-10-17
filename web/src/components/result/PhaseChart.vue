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
import { computed, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import ChartLabels from '@/components/chart/ChartLabels.vue'
import { drawGrid, drawLatency, drawRule, holdLinear } from '@/components/chart/draw'
import { frameOptions } from '@/components/chart/frame'
import { chartGeometry, latencyScale, valueMax } from '@/components/chart/geometry'
import { chartPalette, faded } from '@/components/chart/palette'
import { markLabel } from '@/components/chart/text'
import { useUplot } from '@/components/chart/useUplot'
import type { PhaseModel } from '@/components/result/phase'
import { useTheme } from '@/composables/useTheme'
import { latencyAxisLabels, rateAxisLabels } from '@/lib/format'

// A Result detail chart (ui/screens.md section 2, design_system/components/charts PhaseChart.jsx):
// uPlot draws a direction's stored cells, straight between them with the area under them and gaps
// where a cell is unknown, or the idle round-trip times by ping; its hooks draw the gridlines, and
// over the series the event marks and the loaded latency, dashed on a second scale in ms whose
// labels sit right of the plot. The warm-up is a hatched, excluded interval and each gap is edged,
// both over the canvas. The canvas is decoration for assistive technology: the plot is an image
// labeled with its summary.

const props = defineProps<{
  model: PhaseModel
  kind: 'rate' | 'latency'
  units: 'bits' | 'bytes'
  color: 'download' | 'upload' | 'latency'
  summary: string
  /** The idle chart is shorter. */
  short?: boolean
}>()

const { t, locale } = useI18n()
const { applied } = useTheme()
const host = useTemplateRef<HTMLDivElement>('host')
const compact = useMediaQuery('(max-width: 1139.98px)')

const height = computed(() => (props.short ? (compact.value ? 100 : 120) : compact.value ? 150 : 170))
const ends = computed(() => {
  const largest = Math.max(0, ...props.model.y.filter((value): value is number => value !== null))
  return { xMax: props.model.xMax, yMax: valueMax(largest) }
})
// The loaded latency's scale tops out well above its largest sample, so it runs under the series' peaks.
const latency = computed(() => (props.model.latency === null ? null : latencyScale(props.model.latency, locale.value)))
const data = computed<uPlot.AlignedData>(() => [props.model.x, props.model.y])
let colors = chartPalette(host.value)
const seriesColor = () => colors[props.color]

function options(size: { width: number; height: number }): uPlot.Options {
  return {
    ...frameOptions(size, () => geometry.value, () => ends.value),
    series: [
      {},
      { stroke: () => seriesColor(), fill: () => faded(seriesColor(), 10), width: 1.5, spanGaps: false, points: { show: false }, paths: props.kind === 'rate' ? holdLinear : uPlot.paths.linear?.() },
    ],
    hooks: { drawClear: [drawUnder], draw: [drawOver] },
  }
}

const { plot, width } = useUplot(host, options, () => data.value, () => height.value)
const geometry = computed(() =>
  chartGeometry({
    width: width.value,
    height: height.value,
    ...ends.value,
    yLabels: props.kind === 'rate' ? rateAxisLabels(props.units === 'bits' ? ends.value.yMax : ends.value.yMax * 8, props.units, locale.value) : latencyAxisLabels(ends.value.yMax, locale.value),
    xLabel: (value) => (props.kind === 'rate' ? t('test.chart.seconds', { n: new Intl.NumberFormat(locale.value, { maximumFractionDigits: 1 }).format(value) }) : String(value)),
    compact: compact.value,
    y2Labels: latency.value?.labels ?? [],
  }),
)
const wording = computed(() => ({ t, locale: locale.value }))
const markLabels = computed(() => props.model.marks.map((mark) => ({ x: geometry.value.x(mark.at), text: markLabel(mark, wording.value), color: 'var(--fg-muted)' })))
const box = (from: number, to: number) => {
  const { top, bottom } = geometry.value
  const left = geometry.value.x(from)
  return { left: `${left}px`, top: `${top}px`, width: `${Math.max(2, geometry.value.x(to) - left)}px`, height: `${bottom - top}px` }
}

function drawUnder(u: uPlot): void {
  u.ctx.save()
  drawGrid(u, [0, 0.25, 0.5, 0.75, 1].map((fraction) => ends.value.yMax * fraction), colors)
  u.ctx.restore()
}

/** Over the series: the event marks, then the loaded latency on its own scale. */
function drawOver(u: uPlot): void {
  const { ctx } = u
  ctx.save()
  props.model.marks.forEach((mark) => drawRule(u, mark.at, colors.mark, colors.strokeMark, colors.dashMark))
  const samples = props.model.latency
  if (samples !== null && latency.value !== null) {
    drawLatency(u, samples, latency.value.top, colors)
  }
  ctx.restore()
}

watch([applied, geometry, () => props.model], () => {
  colors = chartPalette(host.value)
  plot.value?.redraw(true, true)
})
watch(ends, (next) =>
  plot.value?.batch(() => {
    plot.value?.setScale('x', { min: 0, max: next.xMax })
    plot.value?.setScale('y', { min: 0, max: next.yMax })
  }),
)
</script>

<template>
  <div class="relative">
    <div
      ref="host"
      role="img"
      :aria-label="summary"
      class="w-full"
      :data-testid="`phase-chart-${color}`"
    />
    <div
      aria-hidden="true"
      class="pointer-events-none absolute inset-0"
    >
      <span
        v-if="model.warmupEnd !== null"
        class="absolute border-r border-chart-hatch bg-[repeating-linear-gradient(var(--chart-hatch-angle),var(--chart-hatch)_0_var(--border-width),transparent_var(--border-width)_var(--chart-hatch-pitch))]"
        :style="box(0, model.warmupEnd)"
        data-testid="chart-warmup"
      />
      <span
        v-for="(gap, index) in model.gaps"
        :key="index"
        class="absolute border-x border-dashed border-chart-hatch"
        :style="box(gap.from, gap.to)"
        data-testid="chart-gap"
      />
    </div>
    <ChartLabels
      :geometry="geometry"
      :marks="markLabels"
    />
  </div>
</template>
