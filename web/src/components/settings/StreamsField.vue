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
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { useSettingsForm } from '@/components/settings/form'
import SegmentedControl from '@/components/settings/SegmentedControl.vue'
import SettingRow from '@/components/settings/SettingRow.vue'
import { NumberField, NumberFieldContent, NumberFieldDecrement, NumberFieldIncrement, NumberFieldInput } from '@/components/ui/number-field'
import type { TestSettings } from '@/engine/messages'

// The stream mode (ui/screens.md section 4, kit Settings.jsx): auto, fixed with its count from 1 to
// the server's maximum, or single.

type Mode = TestSettings['streams']['mode']

const { t } = useI18n()
const form = useSettingsForm()
const streams = computed(() => form.current.value.streams)

const mode = computed({
  get: () => streams.value.mode,
  set: (next: Mode) => form.set({ streams: { mode: next, fixed: streams.value.fixed } }),
})

function count(next: number | undefined): void {
  if (next !== undefined && Number.isInteger(next) && next >= 1 && next <= streams.value.max) {
    form.set({ streams: { mode: 'fixed', fixed: next } })
  }
}

const modes = computed(() => [
  { value: 'auto' as const, label: t('settings.streams.auto') },
  { value: 'fixed' as const, label: t('settings.streams.fixed') },
  { value: 'single' as const, label: t('settings.streams.single') },
])
</script>

<template>
  <SettingRow
    :title="t('settings.streams.title')"
    :caption="t('settings.streams.caption', { max: streams.max })"
    :changed="form.changed.value.has('streams')"
  >
    <div class="flex flex-wrap items-center gap-2">
      <SegmentedControl
        v-model="mode"
        :options="modes"
        :label="t('settings.streams.title')"
      />
      <NumberField
        v-if="mode === 'fixed'"
        :model-value="streams.fixed"
        :min="1"
        :max="streams.max"
        :step="1"
        :aria-label="t('settings.streams.count')"
        class="gap-0"
        @update:model-value="count"
      >
        <NumberFieldContent
          class="flex h-8.5 items-center overflow-hidden rounded-(--radius-md) border border-(--border-default) bg-(--surface-1)"
        >
          <NumberFieldDecrement
            :aria-label="t('settings.streams.fewer')"
            class="static flex size-8 translate-y-0 items-center justify-center p-0 text-(length:--text-caption) leading-(--lh-tight) text-muted-foreground hover:bg-(--surface-3) hover:text-foreground"
          />
          <NumberFieldInput
            :aria-label="t('settings.streams.countInput')"
            class="h-8 w-8.5 rounded-none border-none bg-transparent p-0! font-mono text-(length:--text-sm) shadow-none focus-visible:ring-0"
          />
          <NumberFieldIncrement
            :aria-label="t('settings.streams.more')"
            class="static flex size-8 translate-y-0 items-center justify-center p-0 text-(length:--text-caption) leading-(--lh-tight) text-muted-foreground hover:bg-(--surface-3) hover:text-foreground"
          />
        </NumberFieldContent>
      </NumberField>
    </div>
  </SettingRow>
</template>
