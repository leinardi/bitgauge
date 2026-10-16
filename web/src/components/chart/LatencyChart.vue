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

import type uPlot from 'uplot'
import { computed, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import ChartHeader from '@/components/chart/ChartHeader.vue'
import { buildLatency, type LatencyChartInput, latencyLegend, latencyMarkLabel, latencyMeta, latencySummary } from '@/components/chart/latency'
import { chartHeight, chartPalette } from '@/components/chart/palette'
import { useUplot } from '@/components/chart/useUplot'
import { useTheme } from '@/composables/useTheme'
import { formatLatency } from '@/lib/format'

// The live chart during idle latency (ui/screens.md section 1): uPlot draws each ping's round-trip
// time over the phase's time, with gaps where a ping gave none; its hook draws the "now" line while
// live and the mark where a stopped run ended. The canvas is decoration for assistive technology:
// the plot is an image whose label summarises it from the gauge's readout.

const props = defineProps<LatencyChartInput>()

const { t, locale } = useI18n()
const { applied } = useTheme()
const host = useTemplateRef<HTMLDivElement>('host')

const model = computed(() => buildLatency(props))
const wording = computed(() => ({ t, locale: locale.value }))
const legend = computed(() => latencyLegend(wording.value))
const meta = computed(() => latencyMeta(props, model.value, wording.value))
const summary = computed(() => latencySummary(props, model.value, wording.value))
let colours = chartPalette(host.value)

/** A vertical line across the plot at the chart's end, with an optional label at its top. */
function drawEnd(u: uPlot): void {
  const label = props.mark === null ? undefined : latencyMarkLabel(props.mark, wording.value)
  if (props.state !== 'running' && label === undefined) {
    return
  }
  const { ctx, bbox } = u
  const x = Math.round(u.valToPos(model.value.end, 'x', true)) + 0.5
  ctx.save()
  ctx.lineWidth = 1
  ctx.font = colours.font
  ctx.strokeStyle = colours.mark
  ctx.beginPath()
  ctx.moveTo(x, bbox.top)
  ctx.lineTo(x, bbox.top + bbox.height)
  ctx.stroke()
  ctx.fillStyle = colours.text
  ctx.fillText(label ?? t('test.chart.now'), x + 4, bbox.top + 12)
  ctx.restore()
}

function options(width: number): uPlot.Options {
  const axis = { stroke: () => colours.text, grid: { stroke: () => colours.grid, width: 1 }, font: colours.font }
  return {
    width,
    height: chartHeight(width),
    cursor: { show: false },
    legend: { show: false },
    scales: { x: { time: false, range: () => [0, model.value.xMax] }, y: { range: (_u, _min, max) => [0, Math.max(1, max) * 1.08] } },
    axes: [
      { ...axis, values: (_u, values) => values.map((value) => t('test.chart.seconds', { n: value })) },
      { ...axis, size: 72, values: (_u, values) => values.map((value) => (value === 0 ? '0' : formatLatency(value, locale.value))) },
    ],
    series: [{}, { stroke: () => colours.latency, width: 2, spanGaps: false, points: { show: false } }],
    hooks: { draw: [drawEnd] },
  }
}

const plot = useUplot(host, options, () => model.value.data)
watch([applied, () => props.state, () => props.mark], () => {
  colours = chartPalette(host.value)
  plot.value?.redraw()
})
</script>

<template>
  <div class="flex min-w-0 flex-col gap-3">
    <ChartHeader
      :title="t('test.chart.latencyTitle')"
      :legend="legend"
      :meta="meta"
    />
    <div
      ref="host"
      role="img"
      :aria-label="summary"
      class="w-full"
      data-testid="latency-chart"
    />
  </div>
</template>
