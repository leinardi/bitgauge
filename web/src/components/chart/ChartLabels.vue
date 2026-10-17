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
import { computed, onMounted, onUpdated, shallowRef, useTemplateRef } from 'vue'

import type { ChartGeometry } from '@/components/chart/geometry'
import { DEFAULT_METRICS, type LabelMetrics, type LineLabel, metricKey, placeTopLabels } from '@/components/chart/placement'

// A chart's text over its plot (design_system/components/charts.css .chart-lb): the value labels
// left of their gridlines, the time labels under their ticks, a second scale's labels (the Result
// detail's loaded latency) right of the plot, each phase's name right of where it
// starts and each mark's label beside its line, placed on the top rows by placeTopLabels. Text in
// the page, not on the canvas, so it renders with the page's fonts; hidden from assistive
// technology, which reads the chart's summary instead.

const props = defineProps<{
  geometry: ChartGeometry
  /** Phase names, at the separator where each phase starts. */
  phases?: readonly LineLabel[]
  /** Mark labels, at their line, in the mark's color. */
  marks?: readonly (LineLabel & { color: string })[]
}>()

const root = useTemplateRef<HTMLDivElement>('root')
// The label tokens and each rendered label's box, read after each render, as the export measures
// them; the first render places by estimate.
const metrics = shallowRef<LabelMetrics>(DEFAULT_METRICS)

const placed = computed(() => placeTopLabels(props.phases ?? [], props.marks ?? [], props.geometry, metrics.value))

function sameRecord(a: Readonly<Record<string, number>>, b: Readonly<Record<string, number>>): boolean {
  const keys = Object.keys(a)
  return keys.length === Object.keys(b).length && keys.every((key) => a[key] === b[key])
}

function measure(): void {
  const element = root.value
  if (element === null) {
    return
  }
  const style = getComputedStyle(element)
  const token = (name: string, fallback: number) => {
    const value = Number.parseFloat(style.getPropertyValue(name))
    return Number.isFinite(value) ? value : fallback
  }
  const widths: Record<string, number> = {}
  const heights: Record<string, number> = {}
  element.querySelectorAll<HTMLElement>('[data-label-kind]').forEach((span) => {
    const key = metricKey(span.dataset.labelKind === 'phase' ? 'phase' : 'mark', span.textContent)
    widths[key] = span.offsetWidth
    heights[key] = span.offsetHeight
  })
  const next = { gap: token('--chart-label-gap', DEFAULT_METRICS.gap), row: token('--chart-label-row', DEFAULT_METRICS.row), widths, heights }
  const current = metrics.value
  if (next.gap !== current.gap || next.row !== current.row || !sameRecord(next.widths, current.widths) || !sameRecord(next.heights, current.heights)) {
    metrics.value = next
  }
}

onMounted(measure)
onUpdated(measure)

const at = (label: { x: number; y: number }) => ({ left: `${label.x}px`, top: `${label.y}px` })
</script>

<template>
  <div
    ref="root"
    aria-hidden="true"
    class="pointer-events-none absolute inset-0 font-mono text-(length:--text-nano) text-subtle-foreground"
  >
    <span
      v-for="(line, index) in geometry.grid"
      :key="`y${index}`"
      class="absolute -translate-x-full translate-y-(--chart-label-anchor) whitespace-nowrap"
      :style="at(line.label)"
    >{{ line.label.text }}</span>
    <span
      v-for="(tick, index) in geometry.ticks"
      :key="`x${index}`"
      class="absolute -translate-x-1/2 translate-y-(--chart-label-anchor) whitespace-nowrap"
      :style="at(tick)"
    >{{ tick.text }}</span>
    <span
      v-for="(label, index) in geometry.grid2"
      :key="`r${index}`"
      class="absolute translate-y-(--chart-label-anchor) whitespace-nowrap text-(--series-latency)"
      :style="at(label)"
    >{{ label.text }}</span>
    <span
      v-for="(phase, index) in placed.phases"
      :key="`p${index}`"
      data-label-kind="phase"
      class="absolute translate-y-(--chart-label-anchor) font-condensed font-semibold tracking-(--tracking-caps) whitespace-nowrap uppercase"
      :style="at(phase)"
    >{{ phase.text }}</span>
    <span
      v-for="(mark, index) in placed.marks"
      :key="`m${index}`"
      data-label-kind="mark"
      class="absolute translate-y-(--chart-label-anchor) font-sans text-(length:--text-micro) font-semibold whitespace-nowrap"
      :class="{ '-translate-x-full': mark.end }"
      :style="{ ...at(mark), color: marks?.[index]?.color }"
    >{{ mark.text }}</span>
  </div>
</template>
