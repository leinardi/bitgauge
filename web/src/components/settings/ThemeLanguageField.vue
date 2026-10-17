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
import { Languages, Monitor, Moon, Sun } from '@lucide/vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { useSettingsForm } from '@/components/settings/form'
import SegmentedControl from '@/components/settings/SegmentedControl.vue'
import SettingRow from '@/components/settings/SettingRow.vue'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SUPPORTED_LOCALES } from '@/i18n'
import type { ThemeChoice } from '@/lib/settingsStorage'

// The theme and the language (ui/screens.md section 4, kit Settings.jsx): the theme as the header
// switches it, and the shipped locales only, each named in its own language. A language chosen
// here applies at once and is the second step of locale detection on the next load
// (ui/i18n-a11y.md section 1.2).

const { t, locale } = useI18n({ useScope: 'global' })
const form = useSettingsForm()

const theme = computed({
  get: () => form.stored.value.theme ?? 'system',
  set: (next: ThemeChoice) => form.set({ theme: next }),
})
const themes = computed(() => [
  { value: 'light' as const, label: t('settings.values.light'), icon: Sun },
  { value: 'dark' as const, label: t('settings.values.dark'), icon: Moon },
  { value: 'system' as const, label: t('settings.values.system'), icon: Monitor },
])

const languages = computed(() => SUPPORTED_LOCALES.map((tag) => ({ tag, name: new Intl.DisplayNames([tag], { type: 'language' }).of(tag) ?? tag })))

function choose(tag: unknown): void {
  const shipped = SUPPORTED_LOCALES.find((supported) => supported === tag)
  if (shipped !== undefined) {
    form.set({ lang: shipped })
    locale.value = shipped
    document.documentElement.lang = shipped
  }
}
</script>

<template>
  <SettingRow
    :title="t('settings.theme.title')"
    :changed="form.changed.value.has('theme')"
  >
    <SegmentedControl
      v-model="theme"
      :options="themes"
      :label="t('settings.theme.title')"
    />
  </SettingRow>
  <SettingRow
    :title="t('settings.language.title')"
    :caption="t('settings.language.caption')"
    :changed="form.changed.value.has('lang')"
  >
    <Select
      :model-value="locale"
      @update:model-value="choose"
    >
      <SelectTrigger
        :aria-label="t('settings.language.title')"
        class="h-(--input-h)! w-50 gap-2 rounded-(--radius-md) border-(--border-default) bg-(--surface-1)! px-3 text-(length:--text-sm) text-foreground shadow-none"
      >
        <Languages
          :size="14"
          class="text-(--fg-faint)"
          aria-hidden="true"
        />
        <SelectValue class="flex-1 text-left" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem
          v-for="language in languages"
          :key="language.tag"
          :value="language.tag"
        >
          {{ language.name }}
        </SelectItem>
      </SelectContent>
    </Select>
  </SettingRow>
</template>
