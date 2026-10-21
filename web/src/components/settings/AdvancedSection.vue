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
import { ChevronDown, ChevronUp, SlidersHorizontal } from '@lucide/vue'
import { computed, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'

import { useSettingsForm } from '@/components/settings/form'
import SegmentedControl from '@/components/settings/SegmentedControl.vue'
import SettingInput from '@/components/settings/SettingInput.vue'
import SettingRow from '@/components/settings/SettingRow.vue'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { MAX_PINGS, MAX_WARMUP_S, MIN_PINGS, MIN_WARMUP_S } from '@/lib/settingsStorage'
import { SECOND, wholeNumber } from '@/lib/urlValues'

// The advanced settings (ui/screens.md section 4, kit Settings.jsx), collapsed by default: the
// warm-up, auto or a fixed 1–60 s; the ping count, 6–200; and the overhead compensation, 0–20 %
// with the LibreSpeed presets offered (measurement.md section 9.3). A fixed warm-up starts from the
// kit's 2 s.

const FIRST_WARMUP_S = 2

const { t } = useI18n()
const form = useSettingsForm()
const open = shallowRef(false)
const current = computed(() => form.current.value)
const lastWarmup = shallowRef(typeof current.value.warmup === 'number' ? current.value.warmup : FIRST_WARMUP_S * SECOND)

const warmupMode = computed({
  get: () => (current.value.warmup === 'auto' ? 'auto' : 'fixed'),
  set: (next: 'auto' | 'fixed') => form.set({ warmup: next === 'auto' ? 'auto' : lastWarmup.value }),
})
const warmupModes = computed(() => [
  { value: 'auto' as const, label: t('settings.warmup.auto') },
  { value: 'fixed' as const, label: t('settings.warmup.fixed') },
])

function range(least: number, most: number): (text: string) => string | null {
  return (text) => (wholeNumber(text, least, most) === undefined ? t('settings.errors.range', { min: least, max: most }) : null)
}

function warmup(text: string): void {
  lastWarmup.value = Number(text) * SECOND
  form.set({ warmup: lastWarmup.value })
}

const OVERHEADS = [0, 6, 5.13, 3.69, 8.1]
const overheads = computed(() => {
  const named = [t('settings.overhead.none'), t('settings.overhead.libreSpeed'), t('settings.overhead.ipv6'), t('settings.overhead.alternative'), t('settings.overhead.alternative2')]
  const options = OVERHEADS.map((percent, index) => ({ value: String(percent), label: named[index] ?? '' }))
  // A server default outside the presets is offered too.
  const percent = current.value.overheadCompensationPercent
  return OVERHEADS.includes(percent) ? options : [...options, { value: String(percent), label: t('settings.overhead.other', { percent }) }]
})

function overhead(value: unknown): void {
  const percent = Number(value)
  if (typeof value === 'string' && Number.isFinite(percent)) {
    form.set({ overheadCompensationPercent: percent })
  }
}
</script>

<template>
  <Collapsible
    v-model:open="open"
    as="section"
    aria-labelledby="settings-advanced"
    class="overflow-hidden rounded-(--radius-lg) border border-(--border-subtle) bg-(--surface-2) shadow-card"
  >
    <h2>
      <CollapsibleTrigger class="flex min-h-(--control-h-touch) w-full cursor-pointer items-center gap-2.5 px-4 py-3 text-left focus-visible:-outline-offset-(--focus-offset)">
        <SlidersHorizontal
          :size="15"
          class="flex-none text-subtle-foreground"
          aria-hidden="true"
        />
        <span
          id="settings-advanced"
          class="text-(length:--text-base) font-semibold"
        >{{ t('settings.advanced.title') }}</span>
        <span class="min-w-0 truncate text-(length:--text-caption) text-subtle-foreground">{{ t('settings.advanced.summary') }}</span>
        <component
          :is="open ? ChevronUp : ChevronDown"
          :size="16"
          class="ml-auto flex-none text-subtle-foreground"
          aria-hidden="true"
        />
      </CollapsibleTrigger>
    </h2>
    <CollapsibleContent class="border-t border-(--border-subtle)">
      <SettingRow
        dense
        :title="t('settings.warmup.title')"
        :caption="t('settings.warmup.caption')"
        :changed="form.changed.value.has('warmup')"
      >
        <div class="flex items-start gap-2">
          <SegmentedControl
            v-model="warmupMode"
            :options="warmupModes"
            :label="t('settings.warmup.title')"
          />
          <SettingInput
            v-if="warmupMode === 'fixed'"
            id="settings-warmup"
            :value="String((typeof current.warmup === 'number' ? current.warmup : lastWarmup) / SECOND)"
            :label="t('settings.warmup.input')"
            :suffix="t('settings.values.secondsUnit')"
            :validate="range(MIN_WARMUP_S, MAX_WARMUP_S)"
            mono
            class="w-21"
            @commit="warmup"
          />
        </div>
      </SettingRow>
      <SettingRow
        dense
        :title="t('settings.pings.title')"
        :caption="t('settings.pings.caption', { n: String(form.defaultOf('pingCount')) })"
        :changed="form.changed.value.has('pingCount')"
      >
        <SettingInput
          id="settings-pings"
          :value="String(current.pingCount)"
          :label="t('settings.pings.input')"
          :suffix="t('settings.pings.suffix')"
          :validate="range(MIN_PINGS, MAX_PINGS)"
          mono
          class="w-27.5"
          @commit="form.set({ pingCount: Number($event) })"
        />
      </SettingRow>
      <SettingRow
        dense
        :title="t('settings.overhead.title')"
        :caption="t('settings.overhead.caption')"
        :changed="form.changed.value.has('overheadCompensationPercent')"
      >
        <Select
          :model-value="String(current.overheadCompensationPercent)"
          @update:model-value="overhead"
        >
          <SelectTrigger
            :aria-label="t('settings.overhead.title')"
            class="h-(--input-h)! w-60 rounded-(--radius-md) border-(--border-default) bg-(--surface-1)! px-3 py-0 text-(length:--text-sm) text-foreground shadow-none [&_svg]:size-3.5"
          >
            <SelectValue class="flex-1 text-left" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem
              v-for="option in overheads"
              :key="option.value"
              :value="option.value"
            >
              {{ option.label }}
            </SelectItem>
          </SelectContent>
        </Select>
      </SettingRow>
    </CollapsibleContent>
  </Collapsible>
</template>
