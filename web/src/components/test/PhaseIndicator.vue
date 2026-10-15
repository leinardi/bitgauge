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
import { Activity, ArrowDown, ArrowUp, CircleCheck, CircleDashed, CircleMinus, CircleX, TriangleAlert } from '@lucide/vue'
import { type Component, computed } from 'vue'
import { useI18n } from 'vue-i18n'

import type { PhaseStep, StepState } from '@/components/test/steps'
import type { MeasuringPhase } from '@/engine/messages'
import { formatDuration } from '@/lib/format'

// The phase indicator (ui/screens.md section 1, design_system/components/phase-indicator.md): the
// measuring phases in the configured order, each with its state carried by an icon and text, never
// colour alone; the info phase is no step of its own and shows as "Connecting…" on the first one.

const props = withDefaults(defineProps<{ steps: PhaseStep[]; connecting?: boolean }>(), { connecting: false })

const { t, locale } = useI18n()

const SERIES: Record<MeasuringPhase, string> = {
  idle: 'var(--series-latency)',
  download: 'var(--series-download)',
  upload: 'var(--series-upload)',
}
const DIRECTION_ICON: Record<MeasuringPhase, Component> = { idle: Activity, download: ArrowDown, upload: ArrowUp }

const STATE_ICON: Record<Exclude<StepState, 'active'>, { icon: Component; colour: string }> = {
  pending: { icon: CircleDashed, colour: 'var(--fg-subtle)' },
  done: { icon: CircleCheck, colour: 'var(--ok)' },
  failed: { icon: CircleX, colour: 'var(--danger)' },
  cancelled: { icon: CircleMinus, colour: 'var(--fg-subtle)' },
  skipped: { icon: CircleMinus, colour: 'var(--fg-subtle)' },
  capped: { icon: TriangleAlert, colour: 'var(--fg-subtle)' },
}

function name(phase: MeasuringPhase): string {
  return phase === 'idle' ? t('test.phases.idle') : phase === 'download' ? t('test.phases.download') : t('test.phases.upload')
}

const seconds = (ms: number) => formatDuration(ms, locale.value)
const whole = (ms: number) => new Intl.NumberFormat(locale.value, { maximumFractionDigits: 0 }).format(ms / 1000)

function pending(estimate: PhaseStep['estimate']): string {
  if (estimate === undefined) {
    return t('test.phases.pending')
  }
  return 'aboutMs' in estimate ? t('test.phases.pendingAbout', { about: whole(Math.max(estimate.aboutMs, 1000)) }) : t('test.phases.pendingFor', { min: whole(estimate.minMs), max: whole(estimate.maxMs) })
}

function meta(step: PhaseStep): string {
  switch (step.state) {
    case 'pending':
      return pending(step.estimate)
    case 'active':
      if (step.pings !== undefined) {
        return t('test.phases.activePings', step.pings)
      }
      return step.leftMs === undefined ? t('test.phases.active') : t('test.phases.activeLeft', { left: seconds(step.leftMs) })
    case 'done':
      if (step.insufficient === true) {
        return t('test.phases.doneInsufficient')
      }
      return step.value === undefined ? t('test.phases.done') : t('test.phases.doneWith', { value: step.value })
    case 'failed':
      return step.interruptedMs === undefined ? t('test.phases.failed') : t('test.phases.failedAt', { at: seconds(step.interruptedMs) })
    case 'cancelled':
      if (step.pings !== undefined) {
        return t('test.phases.cancelledPings', step.pings)
      }
      return step.coveredMs === undefined ? t('test.phases.cancelled') : t('test.phases.cancelledAfter', { covered: seconds(step.coveredMs) })
    case 'skipped':
      return t('test.phases.skipped')
    case 'capped':
      return t('test.phases.capped')
  }
}

/** How full a step's bar is, and its colour. */
function bar(step: PhaseStep): { width: number; colour: string } {
  const progress = Math.min(Math.max(step.progress ?? 0, 0), 1)
  switch (step.state) {
    case 'pending':
    case 'skipped':
      return { width: 0, colour: 'transparent' }
    case 'done':
      return { width: 1, colour: SERIES[step.phase] }
    case 'active':
      return { width: progress, colour: SERIES[step.phase] }
    case 'failed':
      return { width: progress, colour: 'var(--danger)' }
    case 'cancelled':
    case 'capped':
      return { width: progress, colour: 'var(--fg-subtle)' }
  }
}

// While connecting, the first step stands for the info phase: active, named Connecting….
const rows = computed(() =>
  props.steps.map((step, index) => {
    const connecting = index === 0 && props.connecting
    const active = step.state === 'active' || connecting
    const marker = step.state === 'active' || connecting ? { icon: DIRECTION_ICON[step.phase], colour: SERIES[step.phase] } : STATE_ICON[step.state]
    const label = connecting ? t('test.phases.connecting') : name(step.phase)
    return { key: step.phase, step, name: label, meta: connecting ? t('test.phases.connectingMeta') : meta(step), marker, bar: bar(step), active }
  }),
)
</script>

<template>
  <ol
    :aria-label="$t('test.phases.label')"
    class="grid grid-cols-1 gap-3 sm:grid-cols-3"
    data-testid="phase-indicator"
  >
    <li
      v-for="row in rows"
      :key="row.key"
      :aria-current="row.active ? 'step' : undefined"
      :data-state="row.step.state"
      class="flex flex-col gap-1.5"
    >
      <div class="flex items-center gap-1.5">
        <component
          :is="row.marker.icon"
          :size="14"
          aria-hidden="true"
          :style="{ color: row.marker.colour }"
        />
        <span
          class="text-(length:--text-sm) font-semibold"
          :class="row.step.state === 'skipped' || row.step.state === 'pending' ? 'text-muted-foreground' : 'text-foreground'"
        >{{ row.name }}</span>
      </div>
      <div
        class="h-1 overflow-hidden rounded-full bg-muted"
        aria-hidden="true"
      >
        <div
          class="h-full rounded-full transition-[width] duration-(--dur-slow) ease-(--ease-out) motion-reduce:transition-none"
          :style="{ width: `${row.bar.width * 100}%`, background: row.bar.colour }"
          data-testid="phase-bar"
        />
      </div>
      <span
        class="font-mono text-(length:--text-caption)"
        :class="row.step.state === 'failed' ? 'text-(--danger-fg)' : 'text-subtle-foreground'"
        data-testid="phase-meta"
      >{{ row.meta }}</span>
    </li>
  </ol>
</template>
