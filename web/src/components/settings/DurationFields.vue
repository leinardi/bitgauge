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
import { ArrowDown, ArrowUp } from '@lucide/vue'
import { computed, reactive } from 'vue'
import { useI18n } from 'vue-i18n'

import ChangedMark from '@/components/settings/ChangedMark.vue'
import FieldError from '@/components/settings/FieldError.vue'
import { useSettingsForm } from '@/components/settings/form'
import SettingInput from '@/components/settings/SettingInput.vue'
import SettingRow from '@/components/settings/SettingRow.vue'
import type { Direction } from '@/engine/messages'
import { MAX_DURATION_S, MIN_DURATION_S, SECOND, wholeNumber } from '@/lib/urlValues'

// The duration of each direction (ui/screens.md section 4, kit Settings.jsx): a minimum and a
// maximum in whole seconds, 5–600 s, the minimum at most the maximum; "custom" once they differ
// from the preset's. A field's error shows under its direction's row, as the kit's does.

type Bound = 'minMs' | 'maxMs'

const BOUNDS = ['min', 'max'] as const
const errors = reactive<Record<string, string | null>>({})

const { t } = useI18n()
const form = useSettingsForm()

/** The bound in seconds; null for Continuous, which has none and shows no durations. */
function seconds(direction: Direction, bound: Bound): number | null {
  const ms = form.current.value[direction][bound]
  return ms === null ? null : ms / SECOND
}

function validate(direction: Direction, bound: Bound, text: string): string | null {
  const value = wholeNumber(text, MIN_DURATION_S, MAX_DURATION_S)
  if (value === undefined) {
    return t('settings.errors.duration')
  }
  const max = seconds(direction, 'maxMs')
  const min = seconds(direction, 'minMs')
  if (bound === 'minMs' && max !== null && value > max) {
    return t('settings.errors.minAboveMax', { max })
  }
  if (bound === 'maxMs' && min !== null && value < min) {
    return t('settings.errors.maxBelowMin', { min })
  }
  return null
}

function commit(direction: Direction, bound: Bound, text: string): void {
  form.set({ [direction]: { ...form.current.value[direction], [bound]: Number(text) * SECOND } })
}

const rows = computed(() => [
  { direction: 'download' as const, label: t('settings.phases.download'), icon: ArrowDown, color: 'var(--series-download)', min: t('settings.duration.downloadMin'), max: t('settings.duration.downloadMax') },
  { direction: 'upload' as const, label: t('settings.phases.upload'), icon: ArrowUp, color: 'var(--series-upload)', min: t('settings.duration.uploadMin'), max: t('settings.duration.uploadMax') },
])
</script>

<template>
  <SettingRow
    :title="t('settings.duration.title')"
    :caption="t('settings.duration.caption')"
    top
  >
    <div class="flex flex-col gap-2.5">
      <div
        v-for="row in rows"
        :key="row.direction"
        class="flex flex-col gap-1.5"
      >
        <div class="flex items-center gap-2">
          <span
            class="flex w-29.5 items-center gap-1.5 text-(length:--text-sm)"
            :data-testid="`duration-label-${row.direction}`"
          >
            <component
              :is="row.icon"
              :size="14"
              :stroke-width="2"
              :style="{ color: row.color }"
              class="shrink-0"
              aria-hidden="true"
            />
            {{ row.label }}
            <ChangedMark v-if="form.changed.value.has(row.direction)">{{ t('settings.custom') }}</ChangedMark>
            <ChangedMark v-if="form.linked.value.has(row.direction)">{{ t('settings.fromLink') }}</ChangedMark>
          </span>
          <SettingInput
            :id="`settings-${row.direction}-min`"
            :value="String(seconds(row.direction, 'minMs') ?? '')"
            :label="row.min"
            :suffix="t('settings.values.secondsUnit')"
            :validate="(text) => validate(row.direction, 'minMs', text)"
            mono
            detached-error
            class="w-19"
            @error="errors[`settings-${row.direction}-min`] = $event"
            @commit="commit(row.direction, 'minMs', $event)"
          />
          <span class="text-subtle-foreground">{{ t('settings.duration.to') }}</span>
          <SettingInput
            :id="`settings-${row.direction}-max`"
            :value="String(seconds(row.direction, 'maxMs') ?? '')"
            :label="row.max"
            :suffix="t('settings.values.secondsUnit')"
            :validate="(text) => validate(row.direction, 'maxMs', text)"
            mono
            detached-error
            class="w-19"
            @error="errors[`settings-${row.direction}-max`] = $event"
            @commit="commit(row.direction, 'maxMs', $event)"
          />
        </div>
        <template
          v-for="bound in BOUNDS"
          :key="bound"
        >
          <FieldError
            v-if="errors[`settings-${row.direction}-${bound}`]"
            :id="`settings-${row.direction}-${bound}-error`"
            class="max-w-80"
          >
            {{ errors[`settings-${row.direction}-${bound}`] }}
          </FieldError>
        </template>
      </div>
    </div>
  </SettingRow>
</template>
