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
import { RotateCcw, SlidersHorizontal } from '@lucide/vue'
import { computed, nextTick, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'

import AppButton from '@/components/actions/AppButton.vue'
import { settingName, settingValue, SHOWN_ORDER } from '@/components/settings/changes'
import { useSettingsForm } from '@/components/settings/form'
import ResetAllDialog from '@/components/settings/ResetAllDialog.vue'
import SettingsCard from '@/components/settings/SettingsCard.vue'
import { moveFocus } from '@/lib/focus'

// The changed settings (ui/screens.md section 4, kit Settings.jsx): each setting that differs from
// its default, with the default, the value and a reset, and Reset all to defaults after
// confirmation.

const { t, locale } = useI18n()
const form = useSettingsForm()

const entries = computed(() =>
  SHOWN_ORDER.filter((key) => form.changed.value.has(key)).map((key) => ({
    key,
    name: settingName(key, t),
    value: settingValue(key, form.valueOf(key), t),
    byDefault: settingValue(key, form.defaultOf(key), t),
  })),
)

// A reset removes its row, so focus moves to the next row's reset, else the previous one's, else
// the card's heading; Reset all, confirmed, to the screen's (ui/i18n-a11y.md section 2.3).
const list = useTemplateRef<HTMLUListElement>('list')
async function reset(index: number, key: (typeof entries.value)[number]['key']): Promise<void> {
  form.reset([key])
  await nextTick()
  const resets = list.value?.querySelectorAll('[data-reset]') ?? []
  moveFocus(resets[index] ?? resets[index - 1] ?? document.getElementById('settings-changed'))
}
const screenHeading = () => document.querySelector('#main h1')
</script>

<template>
  <SettingsCard
    id="settings-changed"
    :title="t('settings.changed.title')"
    :icon="SlidersHorizontal"
  >
    <template #actions>
      <span class="font-mono text-(length:--text-caption) text-subtle-foreground">{{ entries.length }}</span>
    </template>
    <ul
      v-if="entries.length > 0"
      ref="list"
      class="px-4 py-1"
    >
      <li
        v-for="(entry, index) in entries"
        :key="entry.key"
        class="flex items-center gap-2.5 border-b border-(--border-subtle) py-2"
        :data-testid="`changed-${entry.key}`"
      >
        <!-- The name keeps its words' width and the value wraps beside it, as the About facts do. -->
        <span class="flex flex-1 flex-col">
          <span class="text-(length:--text-sm)">{{ entry.name }}</span>
          <span class="font-mono text-(length:--text-micro) text-subtle-foreground">{{ t('settings.changed.default', { value: entry.byDefault }) }}</span>
        </span>
        <span class="min-w-0 text-right font-mono text-(length:--text-caption) break-all text-primary-text">{{ entry.value }}</span>
        <AppButton
          variant="ghost"
          size="sm"
          class="w-7 justify-center px-0"
          :aria-label="t('settings.changed.reset', { name: entry.name.toLocaleLowerCase(locale) })"
          :title="t('settings.changed.reset', { name: entry.name.toLocaleLowerCase(locale) })"
          data-reset
          @click="reset(index, entry.key)"
        >
          <RotateCcw
            :size="14"
            aria-hidden="true"
          />
        </AppButton>
      </li>
    </ul>
    <p
      v-else
      class="px-4 pt-3.5 pb-0.5 text-(length:--text-sm) text-muted-foreground"
    >
      {{ t('settings.changed.none') }}
    </p>
    <div class="px-4 py-3">
      <ResetAllDialog
        :names="entries.map((entry) => entry.name)"
        :focus-after="screenHeading"
        @confirm="form.resetAll()"
      />
    </div>
  </SettingsCard>
</template>
