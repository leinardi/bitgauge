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
import { Activity, ArrowDown, ArrowUp, House, Shield, Tag } from '@lucide/vue'
import { useMediaQuery } from '@vueuse/core'
import { computed, shallowRef, useId } from 'vue'
import { useI18n } from 'vue-i18n'

import TimeText from '@/components/a11y/TimeText.vue'
import { DAY } from '@/components/history/rows'
import { timeTicks, timeWindow } from '@/components/history/trendAxes'
import TrendPlot, { type TrendPoint } from '@/components/history/TrendPlot.vue'
import SegmentedControl from '@/components/settings/SegmentedControl.vue'
import type { Result } from '@/engine/messages'
import type { DateRange } from '@/history/filters'
import { formatLatency, formatRate } from '@/lib/format'
import { fill, slot, timeOf, timeRange } from '@/lib/timeText'

// The trend over the filtered results (ui/screens.md section 3; kit History.jsx): small multiples
// of download and upload on a log scale and idle latency on a linear one, oldest to newest, a result
// whose status is not complete drawn as a hollow marker, with the legend; the context labels the
// filter selects, as chips beside the title, and the days the results span. The time axis is the
// date filter's window, ending today (trendAxes.ts); a single result says when trends appear. On
// narrow screens one metric shows at a time, with a selector.

const props = defineProps<{ results: readonly Result[]; units: 'bits' | 'bytes'; contexts: readonly string[]; range: DateRange; now: Date }>()

const contextIcon = (context: string) => (context === 'LAN' ? House : context === 'VPN' ? Shield : Tag)

type Metric = 'download' | 'upload' | 'latency'

const { t, locale } = useI18n()
const titleId = useId()
const narrow = useMediaQuery('(max-width: 767.98px)')
const metric = shallowRef<Metric>('download')

const oldestFirst = computed(() => [...props.results].sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt)))

function points(value: (result: Result) => number | undefined): TrendPoint[] {
  return oldestFirst.value.map((result) => ({ at: Date.parse(result.startedAt) / 1000, value: value(result) ?? null, complete: result.status === 'complete' }))
}

const frame = computed(() => timeWindow(props.range, oldestFirst.value[0]?.startedAt, props.now))
const ticks = computed(() => timeTicks(frame.value, props.now))

const rate = (value: number) => formatRate(value, props.units, locale.value, true)
const latency = (value: number) => formatLatency(value, locale.value)

const plots = computed(() => {
  const all = [
    { key: 'download' as const, title: t('history.trend.download'), icon: ArrowDown, iconClass: 'text-(--series-download)', color: '--series-download', log: true, format: rate, points: points((result) => result.download?.bitsPerSecond) },
    { key: 'upload' as const, title: t('history.trend.upload'), icon: ArrowUp, iconClass: 'text-(--series-upload)', color: '--series-upload', log: true, format: rate, points: points((result) => result.upload?.bitsPerSecond) },
    { key: 'latency' as const, title: t('history.trend.latency'), icon: Activity, iconClass: 'text-(--series-latency)', color: '--series-latency', log: false, format: latency, points: points((result) => result.idle?.medianMs) },
  ]
  return (narrow.value ? all.filter((plot) => plot.key === metric.value) : all).map((plot) => {
    const drawn = plot.points.filter((point) => point.value !== null)
    const hollow = drawn.filter((point) => !point.complete).length
    // One message takes one plural count: the results' count is its own message in the sentence.
    const results = t('history.trend.ariaResults', { n: drawn.length }, drawn.length)
    return { ...plot, aria: t('history.trend.aria', { title: plot.title, results, hollow }) }
  })
})

const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

const meta = computed(() => {
  const first = oldestFirst.value[0]
  const last = oldestFirst.value.at(-1)
  if (first === undefined || last === undefined) {
    return []
  }
  if (first === last) {
    const day = sameDay(new Date(first.startedAt), props.now) ? [{ text: t('history.trend.todayLower') }] : timeOf(first.startedAt, DAY, locale.value)
    return fill(t('history.trend.metaOne', { day: slot('day') }), { day })
  }
  return fill(t('history.trend.meta', { n: props.results.length, range: slot('range') }), { range: timeRange(first.startedAt, last.startedAt, DAY, locale.value) })
})

const metrics = computed(() => [
  { value: 'download' as const, label: t('history.trend.download') },
  { value: 'upload' as const, label: t('history.trend.upload') },
  { value: 'latency' as const, label: t('history.trend.latencyShort') },
])
</script>

<template>
  <section
    :aria-labelledby="titleId"
    class="flex flex-col gap-3 rounded-(--radius-lg) border border-(--border-subtle) bg-(--surface-2) p-3.5 shadow-card tablet:px-5 tablet:py-4"
    data-testid="history-trend"
  >
    <div class="flex flex-wrap items-center gap-x-3.5 gap-y-2">
      <h2
        :id="titleId"
        class="text-(length:--text-base) font-semibold"
      >
        {{ t('history.trend.title') }}
      </h2>
      <span
        v-for="context in contexts"
        :key="context"
        class="inline-flex h-(--chip-h-sm) items-center gap-1 rounded-full border border-(--border-default) bg-(--surface-2) px-2.5 text-(length:--text-caption) font-semibold whitespace-nowrap text-muted-foreground"
      >
        <component
          :is="contextIcon(context)"
          :size="12"
          :stroke-width="2"
          aria-hidden="true"
        />
        {{ context }}
      </span>
      <span class="text-(length:--text-caption) text-subtle-foreground"><TimeText :runs="meta" /></span>
      <div
        role="list"
        :aria-label="t('history.trend.legend')"
        class="flex flex-wrap gap-x-3.5 gap-y-1.5 text-(length:--text-caption) text-muted-foreground tablet:ml-auto"
      >
        <span
          role="listitem"
          class="flex items-center gap-1.5"
        >
          <span class="size-2 rounded-full bg-muted-foreground" />
          {{ t('history.trend.complete') }}
        </span>
        <span
          role="listitem"
          class="flex items-center gap-1.5"
        >
          <span class="size-2 rounded-full border-[1.5px] border-muted-foreground" />
          {{ t('history.trend.incomplete') }}
        </span>
      </div>
      <SegmentedControl
        v-if="narrow"
        v-model="metric"
        size="sm"
        :options="metrics"
        :label="t('history.trend.metric')"
      />
    </div>
    <div class="grid grid-cols-1 gap-5 tablet:grid-cols-3">
      <div
        v-for="plot in plots"
        :key="plot.key"
        class="flex min-w-0 flex-col gap-2"
      >
        <span class="flex items-center gap-1.5 text-(length:--text-caption) text-muted-foreground">
          <component
            :is="plot.icon"
            :size="13"
            aria-hidden="true"
            :class="plot.iconClass"
          />
          {{ plot.title }}
          <span class="ml-auto font-mono text-subtle-foreground">{{ plot.log ? t('history.trend.log') : t('history.trend.linear') }}</span>
        </span>
        <TrendPlot
          :points="plot.points"
          :frame="frame"
          :ticks="ticks"
          :color="plot.color"
          :log="plot.log"
          :label="plot.aria"
          :format="plot.format"
          :divisor="plot.log && units === 'bytes' ? 8 : 1"
        />
      </div>
    </div>
    <span
      v-if="results.length === 1"
      class="text-(length:--text-caption) text-subtle-foreground"
    >{{ t('history.trend.single') }}</span>
  </section>
</template>
