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

import { buildChart, type ChartInput, type MarkCode, STEPPED } from '@/components/chart/series'
import { useTheme } from '@/composables/useTheme'
import { formatRate } from '@/lib/format'

// The live throughput chart (ui/screens.md section 1, design_system/components/charts.md): uPlot
// draws download, upload received and the faint sending line, with unknown buckets as gaps; its
// hooks draw the warm-up bands under the series and the phase separators, the "now" line and the
// result's event marks over them. The canvas is decoration for assistive technology: the
// container is an image whose label summarises the chart.

const props = withDefaults(defineProps<ChartInput & { running?: boolean }>(), { events: () => ({}), running: false })

const { t, locale } = useI18n()
const { applied } = useTheme()
const host = useTemplateRef<HTMLDivElement>('host')
const plot = shallowRef<uPlot | null>(null)
let observer: ResizeObserver | null = null

const model = computed(() => buildChart(props))

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

const MARK_LABELS: Record<MarkCode, () => string> = {
  extended: () => t('test.chart.marks.extended'),
  'data-cap': () => t('test.chart.marks.dataCap'),
  cancelled: () => t('test.chart.marks.cancelled'),
  error: () => t('test.chart.marks.error'),
}

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
  model.value.marks.forEach((mark) => rule(u, mark.at, colours.mark, MARK_LABELS[mark.code]()))
  if (props.running) {
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
  plot.value = new uPlot(options(width()), model.value.data, host.value)
  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(() => {
      const next = width()
      plot.value?.setSize({ width: next, height: next < 600 ? 150 : 300 })
    })
    observer.observe(host.value)
  }
})

watch(model, (next) => plot.value?.setData(next.data))
watch([applied, () => props.running], () => {
  colours = palette()
  plot.value?.redraw()
})

onBeforeUnmount(() => {
  observer?.disconnect()
  plot.value?.destroy()
  plot.value = null
})

// The text alternative: what the chart shows, direction by direction, with its latest bucket.
const summary = computed(() => {
  const [, download, received] = model.value.data
  const last = (series: (number | null)[]) => {
    for (let index = series.length - 1; index >= 0; index--) {
      const value = series[index]
      if (value !== null && value !== undefined) {
        return value
      }
    }
    return null
  }
  const parts = props.order.flatMap((direction) => {
    const value = last(direction === 'download' ? download : received)
    if (value === null) {
      return []
    }
    const rate = rateLabel(value)
    return [direction === 'download' ? t('test.chart.download', { rate }) : t('test.chart.upload', { rate })]
  })
  return parts.length === 0 ? t('test.chart.empty') : t('test.chart.summary', { parts: parts.join(', ') })
})

const legend = computed(() => {
  const present = new Set(props.order.filter((direction) => props.live[direction] !== null))
  return [
    present.has('download') ? { key: 'download', label: t('test.chart.legend.download'), colour: 'var(--series-download)', faint: false, band: false } : null,
    present.has('upload') ? { key: 'received', label: t('test.chart.legend.received'), colour: 'var(--series-upload)', faint: false, band: false } : null,
    present.has('upload') ? { key: 'sending', label: t('test.chart.legend.sending'), colour: 'var(--sending)', faint: true, band: false } : null,
    present.size > 0 ? { key: 'warmup', label: t('test.chart.legend.warmup'), colour: 'var(--chart-band)', faint: false, band: true } : null,
  ].filter((entry) => entry !== null)
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
  <figure class="flex flex-col gap-2">
    <div
      ref="host"
      role="img"
      :aria-label="summary"
      class="w-full transition-opacity duration-(--dur-slow) motion-reduce:transition-none"
      :class="fading ? 'opacity-40' : 'opacity-100'"
      data-testid="throughput-chart"
    />
    <figcaption class="flex flex-wrap gap-x-4 gap-y-1 text-(length:--text-caption) text-subtle-foreground">
      <span
        v-for="entry in legend"
        :key="entry.key"
        class="flex items-center gap-1.5"
      >
        <span
          aria-hidden="true"
          class="inline-block h-0.5 w-4"
          :class="{ 'opacity-50': entry.faint, 'h-2.5 border border-chart-hatch': entry.band }"
          :style="{ background: entry.colour }"
        />
        {{ entry.label }}
      </span>
    </figcaption>
  </figure>
</template>
