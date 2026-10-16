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

import ChartHeader from '@/components/chart/ChartHeader.vue'
import ChartLabels from '@/components/chart/ChartLabels.vue'
import { drawEndDot, drawGrid, drawRule, lastPoint } from '@/components/chart/draw'
import { frameOptions } from '@/components/chart/frame'
import { chartGeometry, valueMax } from '@/components/chart/geometry'
import { buildLatency, type LatencyChartInput, latencyLegend, latencyMarkLabel, latencyMeta, latencySummary } from '@/components/chart/latency'
import { chartHeight, chartPalette, faded } from '@/components/chart/palette'
import { useUplot } from '@/components/chart/useUplot'
import { useTheme } from '@/composables/useTheme'
import { latencyAxisLabels } from '@/lib/format'

// The live chart during idle latency (ui/screens.md section 1, design_system/components/charts/
// Chart.jsx): uPlot draws each ping's round-trip time over the phase's time, straight between pings
// with the area under them, with gaps where a ping gave none; its hooks draw the gridlines under
// them, and over them the "now" line while live, the mark where a stopped run ended and the end
// dot. The labels sit over the canvas as text. The canvas is decoration for assistive technology:
// the plot is an image whose label summarizes it from the gauge's readout.

const props = defineProps<LatencyChartInput>()

const { t, locale } = useI18n()
const { applied } = useTheme()
const host = useTemplateRef<HTMLDivElement>('host')
const compact = useMediaQuery('(max-width: 1139.98px)')

const model = computed(() => buildLatency(props))
const wording = computed(() => ({ t, locale: locale.value }))
const legend = computed(() => latencyLegend(wording.value))
const meta = computed(() => latencyMeta(props, model.value, wording.value))
const summary = computed(() => latencySummary(props, model.value, wording.value))
const markText = computed(() => (props.mark === null ? null : latencyMarkLabel(props.mark, wording.value)))
const ends = computed(() => {
  const largest = Math.max(0, ...model.value.data[1].filter((value): value is number => value !== null))
  return { xMax: model.value.xMax, yMax: valueMax(largest) }
})
const height = computed(() => chartHeight(compact.value))
let colors = chartPalette(host.value)

function options(size: { width: number; height: number }): uPlot.Options {
  return {
    ...frameOptions(size, () => geometry.value, () => ends.value),
    series: [
      {},
      { stroke: () => colors.latency, fill: () => faded(colors.latency, 10), width: 1.75, spanGaps: false, points: { show: false }, paths: uPlot.paths.linear?.() },
    ],
    hooks: { drawClear: [drawUnder], draw: [drawOver] },
  }
}

const { plot, width } = useUplot(host, options, () => model.value.data, () => height.value)
const geometry = computed(() =>
  chartGeometry({
    width: width.value,
    height: height.value,
    ...ends.value,
    yLabels: latencyAxisLabels(ends.value.yMax, locale.value),
    xLabel: (value) => t('test.chart.seconds', { n: new Intl.NumberFormat(locale.value, { maximumFractionDigits: 1 }).format(value) }),
    compact: compact.value,
  }),
)
const markLabels = computed(() =>
  markText.value === null ? [] : [{ x: geometry.value.x(model.value.end) - 6, y: geometry.value.top + 12, text: markText.value, color: 'var(--fg-muted)' }],
)

function drawUnder(u: uPlot): void {
  u.ctx.save()
  drawGrid(u, [0, 0.25, 0.5, 0.75, 1].map((fraction) => ends.value.yMax * fraction), colors)
  u.ctx.restore()
}

/** Over the series: the mark where a stopped run ended, while live the "now" line, and the end dot. */
function drawOver(u: uPlot): void {
  u.ctx.save()
  if (markText.value !== null) {
    drawRule(u, model.value.end, colors.mark, colors.strokeMark, colors.dashMark)
  } else if (props.state === 'running') {
    u.ctx.globalAlpha = colors.nowOpacity
    drawRule(u, model.value.end, colors.now, colors.stroke)
    u.ctx.globalAlpha = 1
  }
  const end = lastPoint(model.value.data[0], model.value.data[1])
  if (end !== null) {
    drawEndDot(u, end[0], end[1], colors.latency, colors)
  }
  u.ctx.restore()
}

watch([applied, () => props.state, () => props.mark, geometry], () => {
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
  <div class="flex min-w-0 flex-col gap-3">
    <ChartHeader
      :title="t('test.chart.latencyTitle')"
      :legend="legend"
      :meta="meta"
    />
    <div class="relative">
      <div
        ref="host"
        role="img"
        :aria-label="summary"
        class="w-full"
        data-testid="latency-chart"
      />
      <ChartLabels
        :geometry="geometry"
        :marks="markLabels"
      />
    </div>
  </div>
</template>
