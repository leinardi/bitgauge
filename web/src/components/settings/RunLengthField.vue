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
import { ChevronDown } from '@lucide/vue'
import { computed, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'

import ChangedMark from '@/components/settings/ChangedMark.vue'
import { useSettingsForm } from '@/components/settings/form'
import SettingInput from '@/components/settings/SettingInput.vue'
import SettingSwitch from '@/components/settings/SettingSwitch.vue'
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { type RunLengthUnit, runLengthSeconds, runLengthShown, UNIT_S } from '@/lib/runLength'
import { MAX_RUN_LENGTH_S, MIN_RUN_LENGTH_S } from '@/lib/urlValues'

// A Continuous run's optional run length (ui/screens.md section 4, kit Settings.jsx): a switch,
// then a number and a minutes, hours or days select. Off means none; switched on, the number
// starts empty, which still means none, and the select at hours. A value is a whole number of its
// unit from 1 minute to 7 days, stored as `runLengthS`; switching off clears it. A stored value
// shows in the unit chosen for it, else in the largest it is a whole number of.

const { t } = useI18n()
const units = computed(() => [
  { value: 'minutes' as const, label: t('settings.continuous.units.minutes') },
  { value: 'hours' as const, label: t('settings.continuous.units.hours') },
  { value: 'days' as const, label: t('settings.continuous.units.days') },
])
const form = useSettingsForm()
const stored = computed(() => form.valueOf('runLengthS') as number | null)
/** Switched on with no value yet. */
const armed = shallowRef(false)
const chosen = shallowRef<RunLengthUnit>(stored.value === null ? 'hours' : runLengthShown(stored.value).unit)

const on = computed({
  get: () => armed.value || stored.value !== null,
  set: (next: boolean) => {
    armed.value = next
    if (!next) {
      form.set({ runLengthS: undefined })
    }
  },
})
// A value is shown in the unit chosen for it; one that is not a whole number of it, in its own.
const shown = computed(() => {
  const seconds = stored.value
  if (seconds === null) {
    return { value: '', unit: chosen.value }
  }
  const { value, unit } = seconds % UNIT_S[chosen.value] === 0 ? { value: seconds / UNIT_S[chosen.value], unit: chosen.value } : runLengthShown(seconds)
  return { value: String(value), unit }
})

function validate(text: string): string | null {
  return text === '' || runLengthSeconds(text, shown.value.unit) !== undefined ? null : t('settings.errors.runLength')
}

function commit(text: string): void {
  chosen.value = shown.value.unit
  if (text === '') {
    form.set({ runLengthS: undefined })
  } else {
    form.set({ runLengthS: runLengthSeconds(text, chosen.value) })
  }
}

// What Escape restores, in the unit the field shows it in: "8 h", or no run length.
const restoreText = computed(() => {
  if (stored.value === null) {
    return t('settings.continuous.noRunLength')
  }
  const n = shown.value.value
  return shown.value.unit === 'days' ? t('settings.values.runLength.days', { n }) : shown.value.unit === 'hours' ? t('settings.values.runLength.hours', { n }) : t('settings.values.runLength.minutes', { n })
})

const unitLabel = computed(() => units.value.find((option) => option.value === shown.value.unit)?.label ?? '')

// Another unit keeps the number, within the unit's range, as the kit's select does.
function unit(next: unknown): void {
  if (next !== 'minutes' && next !== 'hours' && next !== 'days') {
    return
  }
  const number = stored.value === null ? null : Math.round(Number(shown.value.value))
  chosen.value = next
  if (number !== null) {
    form.set({ runLengthS: Math.min(MAX_RUN_LENGTH_S, Math.max(MIN_RUN_LENGTH_S, number * UNIT_S[next])) })
  }
}
</script>

<template>
  <div class="flex flex-wrap items-center gap-x-5 gap-y-2.5 px-3.5 py-3">
    <div class="flex flex-[1_1_200px] flex-col gap-0.75">
      <span class="flex items-center gap-2 text-(length:--text-sm) font-semibold">
        {{ t('settings.continuous.runLength') }}
        <ChangedMark v-if="form.changed.value.has('runLengthS')" />
        <ChangedMark v-if="form.linked.value.has('runLengthS')">{{ t('settings.fromLink') }}</ChangedMark>
      </span>
      <span class="text-(length:--text-caption) leading-(--lh-compact) text-subtle-foreground">{{ t('settings.continuous.runLengthCaption') }}</span>
    </div>
    <div class="flex items-center gap-2">
      <SettingSwitch
        v-model="on"
        :label="t('settings.continuous.switch')"
      />
      <template v-if="on">
        <SettingInput
          id="settings-run-length"
          :value="shown.value"
          :label="t('settings.continuous.runLength')"
          :placeholder="t('settings.continuous.none')"
          :validate="validate"
          :restore-text="restoreText"
          mono
          fit
          class="min-w-18"
          @commit="commit"
        />
        <!-- The kit's Select in the Input shell, as a menu: a native select styles itself inline. -->
        <DropdownMenu>
          <DropdownMenuTrigger
            :aria-label="t('settings.continuous.unit', { unit: unitLabel })"
            class="flex h-(--input-h) w-28 cursor-pointer items-center gap-2 rounded-(--radius-md) border border-(--border-default) bg-(--surface-1) px-3 text-left text-(length:--text-sm) text-foreground outline-none focus-visible:border-primary focus-visible:outline-(length:--focus-width) focus-visible:outline-offset-(--focus-offset) focus-visible:outline-(--focus-ring)"
            data-testid="run-length-unit"
            :data-unit="shown.unit"
          >
            <span class="flex-1">{{ unitLabel }}</span>
            <ChevronDown
              :size="14"
              class="shrink-0 text-subtle-foreground"
              aria-hidden="true"
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            :side-offset="4"
            class="min-w-28 rounded-(--radius-md) border-(--border-default) bg-(--surface-2) p-1 shadow-(--shadow-pop)"
          >
            <DropdownMenuRadioGroup
              :model-value="shown.unit"
              @update:model-value="unit"
            >
              <DropdownMenuRadioItem
                v-for="option in units"
                :key="option.value"
                :value="option.value"
                :data-testid="`run-length-unit-${option.value}`"
                class="text-(length:--text-sm)"
              >
                {{ option.label }}
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </template>
      <span
        v-else
        class="text-(length:--text-sm) text-muted-foreground"
      >{{ t('settings.continuous.noLimit') }}</span>
    </div>
  </div>
</template>
