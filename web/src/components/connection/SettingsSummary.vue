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
import { Database, Layers, SlidersHorizontal, Timer } from '@lucide/vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import AppLink from '@/components/actions/AppLink.vue'
import type { TestSettings } from '@/engine/messages'
import { formatBytes } from '@/lib/format'
import { baseParts, changedParts, type SummaryPart } from '@/lib/settingsSummary'

// The settings summary of the Test screen (ui/screens.md section 1, design_system kit
// TestScreen.jsx): one chip per setting that differs from the server defaults, or the preset with
// its stream mode and data cap, and the Edit link to the Settings screen.

const props = defineProps<{ settings: TestSettings; defaults: TestSettings }>()

const { t, locale } = useI18n()

function text(part: SummaryPart, line: boolean): string {
  switch (part.kind) {
    case 'preset': {
      const names = { quick: t('test.summary.quick'), standard: t('test.summary.standard'), extended: t('test.summary.extended'), continuous: t('test.summary.continuous') }
      const name = names[part.preset]
      return line ? t('test.summary.presetLine', { preset: name }) : name
    }
    case 'streams':
      return part.mode === 'auto' ? t('test.summary.streamsAuto') : part.mode === 'single' ? t('test.summary.streamsSingle') : t('test.summary.streamsFixed', part.count)
    case 'cap':
      return part.bytes === null ? t('test.summary.capNone') : t('test.summary.cap', { size: formatBytes(part.bytes, locale.value) })
    case 'units':
      return part.units === 'bytes' ? t('test.summary.unitsBytes') : t('test.summary.unitsBits')
  }
}

const icons = { preset: Timer, streams: Layers, cap: Database, units: SlidersHorizontal }

const changed = computed(() => changedParts(props.settings, props.defaults).map((part) => ({ kind: part.kind, text: text(part, false), icon: icons[part.kind] })))
const line = computed(() => baseParts(props.settings).map((part) => text(part, true)).join(' · '))
</script>

<template>
  <div
    class="flex flex-wrap items-center gap-1.5"
    data-testid="settings-summary"
  >
    <template v-if="changed.length > 0">
      <span class="mr-0.5 text-(length:--text-caption) leading-(--lh-snug) text-subtle-foreground">{{ t('test.summary.changed', { n: changed.length }) }}</span>
      <span
        v-for="chip in changed"
        :key="chip.kind"
        class="inline-flex h-6 items-center gap-1.25 rounded-full border border-(--primary-border) bg-(--primary-bg) px-2.25 text-(length:--text-caption) font-semibold text-primary-text"
      >
        <component
          :is="chip.icon"
          :size="12"
          aria-hidden="true"
        />
        {{ chip.text }}
      </span>
    </template>
    <span
      v-else
      class="text-(length:--text-caption) leading-(--lh-snug) text-subtle-foreground"
      data-testid="settings-line"
    >{{ line }}</span>
    <AppLink
      to="/settings"
      :aria-label="t('test.summary.editLabel')"
    >
      <SlidersHorizontal
        :size="13"
        aria-hidden="true"
      />
      {{ t('test.summary.edit') }}
    </AppLink>
  </div>
</template>
