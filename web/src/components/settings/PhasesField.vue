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
import { Activity, ArrowDown, ArrowUp } from '@lucide/vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import ChangedMark from '@/components/settings/ChangedMark.vue'
import { useSettingsForm } from '@/components/settings/form'
import LabeledCheckbox from '@/components/settings/LabeledCheckbox.vue'
import RunLengthField from '@/components/settings/RunLengthField.vue'
import SegmentedControl from '@/components/settings/SegmentedControl.vue'
import type { Direction, MeasuringPhase } from '@/engine/messages'

// The phases of a run (ui/screens.md section 4, kit Settings.jsx): idle latency, download and
// upload as toggles, at least one staying on, and the order of the two directions when both run.
// Idle latency always runs first (measurement.md section 3). Continuous runs one direction: its
// direction and run length show above the phases, as the kit's do, and of the phases only the
// idle-latency toggle applies; the directions and their order keep their values for the bounded
// presets.

type Order = 'download' | 'upload'

const { t } = useI18n()
const form = useSettingsForm()

const phases = computed(() => form.current.value.phases)
const continuous = computed(() => form.current.value.preset === 'continuous')
/** Which direction runs first: the current order, else the defaults', else download. */
const first = computed<Order>(() => {
  for (const list of [phases.value, form.defaults.value.phases]) {
    const directions = list.filter((phase): phase is Order => phase !== 'idle')
    if (directions.length === 2 && directions[0] !== undefined) {
      return directions[0]
    }
  }
  return 'download'
})

function build(on: ReadonlySet<MeasuringPhase>, lead: Order): MeasuringPhase[] {
  const directions: Order[] = lead === 'upload' ? ['upload', 'download'] : ['download', 'upload']
  return [...(on.has('idle') ? (['idle'] as const) : []), ...directions.filter((direction) => on.has(direction))]
}

function toggle(phase: MeasuringPhase, checked: boolean): void {
  const on = new Set(phases.value)
  if (checked === true) {
    on.add(phase)
  } else {
    on.delete(phase)
  }
  if (on.size > 0) {
    form.set({ phases: build(on, first.value) })
  } else if (continuous.value) {
    // Idle latency off with no direction listed: Continuous runs its direction alone.
    form.set({ phases: [form.current.value.continuousDirection ?? 'download'] })
  }
}

const direction = computed({
  get: () => form.current.value.continuousDirection ?? 'download',
  set: (next: Direction) => form.set({ continuousDirection: next }),
})
const directions = computed(() => [
  { value: 'download' as const, label: t('settings.phases.download'), icon: ArrowDown, color: 'var(--series-download)' },
  { value: 'upload' as const, label: t('settings.phases.upload'), icon: ArrowUp, color: 'var(--series-upload)' },
])
/** A toggle that cannot change: the last phase on, or a direction under Continuous. */
function fixed(phase: MeasuringPhase): boolean {
  return continuous.value ? phase !== 'idle' : phases.value.length === 1 && phases.value.includes(phase)
}

const order = computed({
  get: () => first.value,
  set: (lead: Order) => form.set({ phases: build(new Set(phases.value), lead) }),
})
const bothDirections = computed(() => phases.value.includes('download') && phases.value.includes('upload'))

const toggles = computed(() => [
  { phase: 'idle' as const, label: t('settings.phases.idle'), icon: Activity, color: 'var(--series-latency)' },
  { phase: 'download' as const, label: t('settings.phases.download'), icon: ArrowDown, color: 'var(--series-download)' },
  { phase: 'upload' as const, label: t('settings.phases.upload'), icon: ArrowUp, color: 'var(--series-upload)' },
])
const orders = computed(() => [
  { value: 'download' as const, label: t('settings.phases.downloadFirst') },
  { value: 'upload' as const, label: t('settings.phases.uploadFirst') },
])
</script>

<template>
  <div
    v-if="continuous"
    class="flex flex-col rounded-(--radius-md) border border-(--border-subtle) bg-(--surface-1)"
    data-testid="continuous-fields"
  >
    <div class="flex flex-wrap items-center gap-x-5 gap-y-2.5 border-b border-(--border-subtle) px-3.5 py-3">
      <div class="flex flex-[1_1_200px] flex-col gap-0.75">
        <span class="flex items-center gap-2 text-(length:--text-sm) font-semibold">
          {{ t('settings.continuous.direction') }}
          <ChangedMark v-if="form.changed.value.has('continuousDirection')" />
        </span>
        <span class="text-(length:--text-caption) leading-(--lh-compact) text-subtle-foreground">{{ t('settings.continuous.directionCaption') }}</span>
      </div>
      <SegmentedControl
        v-model="direction"
        :options="directions"
        :label="t('settings.continuous.directionLabel')"
      />
    </div>
    <RunLengthField />
  </div>
  <div class="flex flex-wrap items-center gap-x-4 gap-y-2.5">
    <span
      id="settings-phases"
      class="flex items-center gap-2 text-(length:--text-sm) text-muted-foreground"
    >
      {{ t('settings.phases.title') }}
      <ChangedMark v-if="form.changed.value.has('phases')" />
    </span>
    <!-- A group for assistive technology only: the checkboxes lay out in the row itself. -->
    <div
      role="group"
      aria-labelledby="settings-phases"
      class="contents"
    >
      <LabeledCheckbox
        v-for="item in toggles"
        :key="item.phase"
        :model-value="phases.includes(item.phase)"
        :disabled="fixed(item.phase)"
        :icon="item.icon"
        :icon-color="item.color"
        class="text-(length:--text-sm) text-foreground"
        @update:model-value="toggle(item.phase, $event)"
      >
        {{ item.label }}
      </LabeledCheckbox>
    </div>
    <!-- Continuous runs one direction, so it has no order. -->
    <div
      v-if="!continuous"
      class="flex items-center gap-2 desktop:ml-auto"
      :class="bothDirections ? '' : 'opacity-45'"
    >
      <span class="text-(length:--text-sm) text-muted-foreground">{{ t('settings.phases.order') }}</span>
      <SegmentedControl
        v-model="order"
        :options="orders"
        :label="t('settings.phases.orderLabel')"
        :disabled="!bothDirections"
      />
    </div>
    <span class="basis-full text-(length:--text-micro) text-subtle-foreground">{{ continuous ? t('settings.phases.helpContinuous') : t('settings.phases.help') }}</span>
  </div>
</template>
