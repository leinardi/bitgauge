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

import uPlot from 'uplot'
import { computed, onBeforeUnmount, onMounted, shallowRef, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { buildChart, type ChartData, type ChartInput, STEPPED } from '@/components/chart/series'
import { chartLegend, chartMeta, type ChartState, chartSummary, type ChartTextInput, markLabel } from '@/components/chart/text'
import { useTheme } from '@/composables/useTheme'
import type { TestSettings } from '@/engine/messages'
import { formatRate } from '@/lib/format'

// The live throughput chart (ui/screens.md section 1, design_system/components/charts.md): uPlot
// draws download, upload received and the faint sending line, with unknown buckets as gaps; its
// hooks draw the warm-up bands under the series and the phase separators, the "now" line and the
// result's event marks over them. Over the plot sit the title, the legend and where the run
// stands. The canvas is decoration for assistive technology: the plot is an image whose label
// summarises what it shows, from the gauge's readout. A finished run draws what the server
// received, without the sending line.

const props = withDefaults(
  defineProps<
    ChartInput & {
      state: ChartState
      durations?: Pick<TestSettings, 'download' | 'upload'> | null
      totalMs?: number | null
      readout?: string | null
    }
  >(),
  { events: () => ({}), durations: null, totalMs: null, readout: null },
)

const { t, locale } = useI18n()
const { applied } = useTheme()
const host = useTemplateRef<HTMLDivElement>('host')
const plot = shallowRef<uPlot | null>(null)
let observer: ResizeObserver | null = null

const model = computed(() => buildChart(props))
// A chart with nothing drawn yet is empty, whatever the run's state: while connecting, say.
const shownState = computed<ChartState>(() => (model.value.data[0].length === 0 ? 'empty' : props.state))
const running = computed(() => props.state === 'running')
const data = computed<ChartData>(() => {
  const [x, download, received, sending] = model.value.data
  return props.state === 'done' ? [x, download, received, sending.map(() => null)] : [x, download, received, sending]
})
const wording = computed(() => ({ t, locale: locale.value }))
const textInput = computed<ChartTextInput>(() => ({ ...props, state: shownState.value, model: model.value }))
const legend = computed(() => chartLegend(textInput.value, wording.value))
const meta = computed(() => chartMeta(textInput.value, wording.value))
const summary = computed(() => chartSummary(textInput.value, wording.value))

/** The design tokens the canvas paints with, read from the page since a canvas knows no CSS. */
function palette() {
  const style = getComputedStyle(host.value ?? document.documentElement)
  const token = (name: string) => style.getPropertyValue(name).trim() || 'currentColor'
  return {
    download: token('--series-download'),
    upload: token('--series-upload'),
    sending: token('--sending'),
    band: token('--chart-band'),
    hatch: token('--chart-hatch'),
    grid: token('--chart-grid'),
    text: token('--fg-subtle'),
    mark: token('--fg-muted'),
    font: `${token('--text-micro')} ${token('--font-mono')}`,
  }
}
let colours = palette()

/** The bands under the series: each direction's warm-up, with hatch-coloured edges. */
function drawBands(u: uPlot): void {
  const { ctx, bbox } = u
  ctx.save()
  for (const span of model.value.warmup) {
    const from = u.valToPos(span.from, 'x', true)
    const to = u.valToPos(span.to, 'x', true)
    if (to > from) {
      ctx.fillStyle = colours.band
      ctx.fillRect(from, bbox.top, to - from, bbox.height)
      ctx.strokeStyle = colours.hatch
      ctx.lineWidth = 1
      ctx.strokeRect(from, bbox.top, to - from, bbox.height)
    }
  }
  ctx.restore()
}

/** A vertical line across the plot, with an optional label at its top. */
function rule(u: uPlot, at: number, colour: string, label?: string): void {
  const { ctx, bbox } = u
  const x = Math.round(u.valToPos(at, 'x', true)) + 0.5
  ctx.strokeStyle = colour
  ctx.beginPath()
  ctx.moveTo(x, bbox.top)
  ctx.lineTo(x, bbox.top + bbox.height)
  ctx.stroke()
  if (label !== undefined) {
    ctx.fillStyle = colours.text
    ctx.fillText(label, x + 4, bbox.top + 12)
  }
}

/** The separators, the result's event marks and, while live, the "now" line. */
function drawMarks(u: uPlot): void {
  const { ctx } = u
  ctx.save()
  ctx.lineWidth = 1
  ctx.font = colours.font
  model.value.separators.forEach((at) => rule(u, at, colours.hatch))
  model.value.marks.forEach((mark) => rule(u, mark.at, colours.mark, markLabel(mark, wording.value)))
  if (running.value) {
    rule(u, model.value.end, colours.mark, t('test.chart.now'))
  }
  ctx.restore()
}

const rateLabel = (value: number) => formatRate(props.units === 'bits' ? value : value * 8, props.units, locale.value, true)

function options(width: number): uPlot.Options {
  const stepped = uPlot.paths.stepped?.(STEPPED)
  const line = (colour: () => string, width: number, extra: Partial<uPlot.Series> = {}): uPlot.Series => ({
    stroke: () => colour(),
    width,
    spanGaps: false,
    points: { show: false },
    ...(stepped === undefined ? {} : { paths: stepped }),
    ...extra,
  })
  return {
    width,
    height: width < 600 ? 150 : 300,
    cursor: { show: false },
    legend: { show: false },
    scales: { x: { time: false } },
    axes: [
      { stroke: () => colours.text, grid: { stroke: () => colours.grid, width: 1 }, font: colours.font, values: (_u, values) => values.map((value) => t('test.chart.seconds', { n: value })) },
      { stroke: () => colours.text, grid: { stroke: () => colours.grid, width: 1 }, font: colours.font, size: 72, values: (_u, values) => values.map((value) => (value === 0 ? '0' : rateLabel(value))) },
    ],
    series: [
      {},
      line(() => colours.download, 2),
      line(() => colours.upload, 2),
      // The sending line is faint and joins its points: it is progress, never a measured bucket.
      line(() => colours.sending, 1.5, { spanGaps: true, paths: uPlot.paths.linear?.() }),
    ],
    hooks: { drawClear: [drawBands], draw: [drawMarks] },
  }
}

function width(): number {
  return host.value?.clientWidth || 600
}

onMounted(() => {
  if (host.value === null) {
    return
  }
  plot.value = new uPlot(options(width()), data.value, host.value)
  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(() => {
      const next = width()
      plot.value?.setSize({ width: next, height: next < 600 ? 150 : 300 })
    })
    observer.observe(host.value)
  }
})

watch(data, (next) => plot.value?.setData(next))
watch([applied, running], () => {
  colours = palette()
  plot.value?.redraw()
})

onBeforeUnmount(() => {
  observer?.disconnect()
  plot.value?.destroy()
  plot.value = null
})

// A new phase cross-fades in, unless motion is reduced.
const fading = shallowRef(false)
watch(
  () => props.order.filter((direction) => props.live[direction] !== null).length,
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
    <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
      <span class="text-(length:--text-base) font-semibold">{{ t('test.chart.title') }}</span>
      <div class="flex flex-wrap gap-x-3.5 gap-y-1.5">
        <span
          v-for="entry in legend"
          :key="entry.key"
          class="flex items-center gap-1.5 text-(length:--text-caption) text-muted-foreground"
        >
          <span
            v-if="entry.band"
            aria-hidden="true"
            class="h-(--legend-swatch-h) w-(--legend-band-w) border-x border-chart-hatch bg-(--chart-band)"
          />
          <span
            v-else
            aria-hidden="true"
            class="h-0 w-(--legend-swatch-w) border-t-2"
            :class="{ 'opacity-40': entry.faint }"
            :style="{ borderTopColor: entry.colour }"
          />
          {{ entry.label }}
        </span>
      </div>
      <span
        v-if="meta"
        class="ml-auto font-mono text-(length:--text-caption) text-subtle-foreground"
        data-testid="chart-meta"
      >{{ meta }}</span>
    </div>
    <div class="relative">
      <div
        ref="host"
        role="img"
        :aria-label="summary"
        class="w-full transition-opacity duration-(--dur-slow) motion-reduce:transition-none"
        :class="fading ? 'opacity-40' : 'opacity-100'"
        data-testid="throughput-chart"
      />
      <div
        v-if="shownState === 'empty'"
        class="absolute inset-0 flex items-center justify-center px-4 text-center"
      >
        <span class="max-w-measure-sm rounded-(--radius-md) border border-(--border-subtle) bg-(--surface-2) px-3.5 py-2 text-(length:--text-sm) leading-(--lh-compact) text-pretty text-subtle-foreground">{{ t('test.chart.emptyText') }}</span>
      </div>
    </div>
  </div>
</template>
