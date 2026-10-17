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

import ChartHeader from '@/components/chart/ChartHeader.vue'
import ChartLabels from '@/components/chart/ChartLabels.vue'
import { drawBand, drawEndDot, drawGrid, drawLatency, drawRule, holdLinear, lastPoint } from '@/components/chart/draw'
import { frameOptions } from '@/components/chart/frame'
import { chartGeometry, latencyScale, valueMax } from '@/components/chart/geometry'
import { chartHeight, chartPalette, faded } from '@/components/chart/palette'
import type { LineLabel } from '@/components/chart/placement'
import { buildChart, type ChartData, type ChartInput } from '@/components/chart/series'
import { chartLegend, chartMeta, type ChartState, chartSummary, type ChartTextInput, markLabel } from '@/components/chart/text'
import { useUplot } from '@/components/chart/useUplot'
import { useTheme } from '@/composables/useTheme'
import type { Direction, TestSettings } from '@/engine/messages'
import { rateAxisLabels } from '@/lib/format'

// The live throughput chart (ui/screens.md section 1, design_system/components/charts.md and
// charts/Chart.jsx): uPlot draws download, upload received and the faint sending line, straight
// between buckets, with unknown buckets as gaps; its hooks draw the warm-up bands, the gridlines and
// the phase separators under the series, and the result's event marks, the "now" line and the end
// dot over them. The labels sit over the canvas as text. Over the plot sit the title, the legend and
// where the run stands. The canvas is decoration for assistive technology: the plot is an image
// whose label summarizes what it shows, from the gauge's readout. A finished run draws what the
// server received, without the sending line. The loaded latency is drawn dashed on its own scale,
// labeled right of the plot, while its legend entry, the toggle, is pressed.

const props = withDefaults(
  defineProps<
    ChartInput & {
      state: ChartState
      durations?: Pick<TestSettings, 'download' | 'upload'> | null
      totalMs?: number | null
      readout?: string | null
      /** The empty chart's text in place of the default, as the offline state words it. */
      emptyText?: string | null
    }
  >(),
  { events: () => ({}), durations: null, totalMs: null, readout: null, emptyText: null },
)

/** The empty chart's frame: up to 1 Gbit/s, over the minimum durations of a Standard run. */
const EMPTY_TOP_BPS = 1e9
const EMPTY_SECONDS = 25

const { t, locale } = useI18n()
const { applied } = useTheme()
const host = useTemplateRef<HTMLDivElement>('host')
const compact = useMediaQuery('(max-width: 1139.98px)')

const model = computed(() => buildChart(props))
const latencyOn = shallowRef(true)
// The loaded latency's scale, while it is drawn.
const latency = computed(() => (latencyOn.value ? latencyScale(model.value.latency, locale.value) : null))
// A chart with nothing drawn yet is empty, whatever the run's state: while connecting, say.
const shownState = computed<ChartState>(() => (model.value.data[0].length === 0 ? 'empty' : props.state))
const empty = computed(() => shownState.value === 'empty')
const running = computed(() => props.state === 'running')
const data = computed<ChartData>(() => {
  const [x, download, received, sending] = model.value.data
  return props.state === 'done' ? [x, download, received, sending.map(() => null)] : [x, download, received, sending]
})
const wording = computed(() => ({ t, locale: locale.value }))
const textInput = computed<ChartTextInput>(() => ({ ...props, state: shownState.value, model: model.value, latencyShown: latency.value !== null }))
const legend = computed(() => chartLegend(textInput.value, wording.value))
const meta = computed(() => chartMeta(textInput.value, wording.value))
const summary = computed(() => chartSummary(textInput.value, wording.value))
const shown = computed(() => props.order.filter((direction) => props.live[direction] !== null))

const display = (bitsPerSecond: number) => (props.units === 'bits' ? bitsPerSecond : bitsPerSecond / 8)

// The time axis runs to the end of the phase under way at its minimum duration, or as far as the run
// has gone: a run that stopped keeps the axis it had, so its mark sits where the phase stopped, and
// a run that finished ends where it did. The value axis runs to a round number over the largest value.
const ends = computed(() => {
  const minimum = (direction: Direction) => (props.durations?.[direction].minMs ?? 0) / 1000
  if (empty.value) {
    const planned = props.durations === null ? EMPTY_SECONDS : props.order.reduce((sum, direction) => sum + minimum(direction), 0)
    return { xMax: planned, yMax: display(EMPTY_TOP_BPS) }
  }
  const current = shown.value.at(-1)
  const phaseEnd = props.state !== 'done' && current !== undefined ? (model.value.separators.at(-1) ?? 0) + minimum(current) : 0
  const [, download, received, sending] = data.value
  const largest = Math.max(0, ...[...download, ...received, ...sending].filter((value): value is number => value !== null))
  return { xMax: Math.max(model.value.end, phaseEnd), yMax: valueMax(largest) }
})

const height = computed(() => chartHeight(compact.value))
const seconds = (value: number) => t('test.chart.seconds', { n: new Intl.NumberFormat(locale.value, { maximumFractionDigits: 1 }).format(value) })
let colors = chartPalette(host.value)

function options(size: { width: number; height: number }): uPlot.Options {
  const area = (color: () => string): uPlot.Series => ({ stroke: () => color(), fill: () => faded(color(), 10), width: 1.75, spanGaps: false, points: { show: false }, paths: holdLinear })
  return {
    ...frameOptions(size, () => geometry.value, () => ends.value),
    series: [
      {},
      area(() => colors.download),
      area(() => colors.upload),
      // The sending line is faint and joins its points: it is progress, never a measured bucket.
      { stroke: () => faded(colors.sending, 40), width: 1.75, spanGaps: true, points: { show: false }, paths: uPlot.paths.linear?.() },
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
    yLabels: rateAxisLabels(props.units === 'bits' ? ends.value.yMax : ends.value.yMax * 8, props.units, locale.value),
    xLabel: seconds,
    compact: compact.value,
    y2Labels: latency.value?.labels ?? [],
  }),
)

// Each phase's name from where it starts, once a second phase has begun (charts.md, separators).
const phaseStarts = computed(() => (model.value.separators.length === 0 ? [] : [0, ...model.value.separators]))
const phaseName = (direction: Direction | undefined) => (direction === 'upload' ? t('test.chart.legend.upload') : t('test.chart.legend.download'))
const phaseLabels = computed<LineLabel[]>(() => phaseStarts.value.map((at, index) => ({ x: geometry.value.x(at), text: phaseName(shown.value[index]) })))
const markLabels = computed(() =>
  model.value.marks.map((mark) => ({ x: geometry.value.x(mark.at), text: markLabel(mark, wording.value), color: 'var(--fg-muted)' })),
)
const plotBox = computed(() => {
  const { top, left, right, bottom } = geometry.value
  return { top: `${top}px`, left: `${left}px`, width: `${right - left}px`, height: `${bottom - top}px` }
})

/** Under the series: the warm-up bands, the gridlines and the phase separators. */
function drawUnder(u: uPlot): void {
  u.ctx.save()
  model.value.warmup.forEach((span) => drawBand(u, span.from, span.to, colors))
  drawGrid(u, [0, 0.25, 0.5, 0.75, 1].map((fraction) => ends.value.yMax * fraction), colors)
  phaseStarts.value.forEach((at) => drawRule(u, at, colors.separator, colors.stroke, colors.dashSeparator))
  u.ctx.restore()
}

/** Over the series: the result's event marks, the loaded latency, while live the "now" line, and the end dot. */
function drawOver(u: uPlot): void {
  u.ctx.save()
  model.value.marks.forEach((mark) => drawRule(u, mark.at, colors.mark, colors.strokeMark, colors.dashMark))
  if (latency.value !== null) {
    drawLatency(u, model.value.latency, latency.value.top, colors)
    u.ctx.setLineDash([])
  }
  if (running.value) {
    u.ctx.globalAlpha = colors.nowOpacity
    drawRule(u, model.value.end, colors.now, colors.stroke)
    u.ctx.globalAlpha = 1
  }
  const [x, download, received] = data.value
  const upload = lastPoint(x, received)
  const end = upload ?? lastPoint(x, download)
  if (end !== null) {
    drawEndDot(u, end[0], end[1], upload === null ? colors.download : colors.upload, colors)
  }
  u.ctx.restore()
}

watch([applied, running, geometry, latency], () => {
  colors = chartPalette(host.value)
  plot.value?.redraw(true, true)
})
watch(ends, (next) =>
  plot.value?.batch(() => {
    plot.value?.setScale('x', { min: 0, max: next.xMax })
    plot.value?.setScale('y', { min: 0, max: next.yMax })
  }),
)

// A new phase cross-fades in, unless motion is reduced.
const fading = shallowRef(false)
watch(
  () => shown.value.length,
  () => {
    fading.value = true
    // Two frames: the faded state must be painted once for the transition to run from it.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        fading.value = false
      }),
    )
  },
)
</script>

<template>
  <div class="flex min-w-0 flex-col gap-3">
    <ChartHeader
      :title="t('test.chart.title')"
      :legend="legend"
      :meta="meta"
      :latency-shown="latencyOn"
      @toggle-latency="latencyOn = !latencyOn"
    />
    <div class="relative">
      <div
        ref="host"
        role="img"
        :aria-label="summary"
        class="w-full transition-opacity duration-(--dur-slow) motion-reduce:transition-none"
        :class="fading ? 'opacity-40' : 'opacity-100'"
        data-testid="throughput-chart"
      />
      <ChartLabels
        :geometry="geometry"
        :phases="phaseLabels"
        :marks="markLabels"
      />
      <div
        v-if="empty"
        class="absolute flex items-center justify-center px-4 text-center"
        :style="plotBox"
      >
        <span class="max-w-measure-sm rounded-(--radius-md) border border-(--border-subtle) bg-(--surface-2) px-3.5 py-2 text-(length:--text-sm) leading-(--lh-compact) text-pretty text-subtle-foreground">{{ emptyText ?? t('test.chart.emptyText') }}</span>
      </div>
    </div>
  </div>
</template>
