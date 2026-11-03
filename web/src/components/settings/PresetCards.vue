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
import { Gauge, Infinity as InfinityIcon, Timer, Zap } from '@lucide/vue'
import { RadioGroupItem } from 'reka-ui'
import { type Component, computed } from 'vue'
import { useI18n } from 'vue-i18n'

import ChangedMark from '@/components/settings/ChangedMark.vue'
import { presetName } from '@/components/settings/changes'
import { useSettingsForm } from '@/components/settings/form'
import { RadioGroup } from '@/components/ui/radio-group'
import type { DurationBounds, Preset, TestSettings } from '@/engine/messages'
import { storedOver } from '@/lib/settingsStorage'

// The preset picker (ui/screens.md section 4, kit Settings.jsx and ChoiceCard in forms): one card
// per preset with the streams, durations and ping count it runs, the server's default marked;
// Continuous runs one direction until stopped, or for its run length. Each card reads what the
// preset runs on this server: the server's default preset with the server's own values, the fixed
// stream count within the server's maximum. In forced colors, where the tint is dropped, the selected
// card keeps an outline and its radio keeps its dot (ui/i18n-a11y.md section 2.5).

const { t } = useI18n()
const form = useSettingsForm()

function range({ minMs, maxMs }: DurationBounds): string {
  return t('settings.values.range', { min: minMs / 1000, max: maxMs / 1000 })
}

function streamsText(settings: TestSettings): string {
  return settings.streams.mode === 'fixed' ? t('settings.preset.streamsFixed', settings.streams.fixed) : t('settings.preset.streamsAuto')
}

function line(settings: TestSettings): string {
  const { download, upload } = settings
  if (download.minMs === null || upload.minMs === null) {
    return t('settings.preset.continuous', { streams: streamsText(settings), pings: t('settings.preset.pings', settings.pingCount) })
  }
  const durations =
    download.minMs === upload.minMs && download.maxMs === upload.maxMs
      ? t('settings.preset.same', { range: range(download) })
      : t('settings.preset.split', { download: range(download), upload: range(upload) })
  return t('settings.preset.line', { streams: streamsText(settings), durations, pings: t('settings.preset.pings', settings.pingCount) })
}

const ICONS: Record<Preset, Component> = { quick: Zap, standard: Gauge, extended: Timer, continuous: InfinityIcon }

const cards = computed(() =>
  (['quick', 'standard', 'extended', 'continuous'] as const).map((preset) => ({ value: preset, title: presetName(preset, t), text: line(storedOver(form.defaults.value, { preset })) })),
)

function choose(value: unknown): void {
  if (value === 'quick' || value === 'standard' || value === 'extended' || value === 'continuous') {
    form.set({ preset: value })
  }
}
</script>

<template>
  <RadioGroup
    :model-value="form.current.value.preset"
    aria-labelledby="settings-preset"
    class="grid grid-cols-1 gap-2.5 desktop:grid-cols-2"
    @update:model-value="choose"
  >
    <RadioGroupItem
      v-for="card in cards"
      :key="card.value"
      :value="card.value"
      class="group flex w-full min-h-(--control-h-touch) cursor-pointer flex-col gap-1.5 rounded-(--radius-md) border border-(--border-default) bg-(--surface-1) px-3.5 py-3 text-left text-foreground hover:border-(--border-strong) data-[state=checked]:border-(--primary-border) data-[state=checked]:bg-(--primary-bg) forced-colors:data-[state=checked]:outline-2 forced-colors:data-[state=checked]:-outline-offset-2 forced-colors:data-[state=checked]:outline-solid"
      :data-testid="`preset-${card.value}`"
    >
      <span class="flex w-full items-center gap-2">
        <component
          :is="ICONS[card.value]"
          :size="16"
          class="text-subtle-foreground group-data-[state=checked]:text-primary-text"
          aria-hidden="true"
        />
        <span class="text-(length:--text-sm) font-semibold">{{ card.title }}</span>
        <span
          v-if="card.value === form.defaults.value.preset"
          class="inline-flex h-(--pill-h-sm) items-center rounded-full border border-(--border-default) bg-(--surface-3) px-2 font-(family-name:--font-cond) text-(length:--text-nano) leading-none font-semibold tracking-(--tracking-caps-tight) whitespace-nowrap text-muted-foreground uppercase"
        >{{ t('settings.preset.default') }}</span>
        <ChangedMark v-if="card.value === form.current.value.preset && form.linked.value.has('preset')">{{ t('settings.fromLink') }}</ChangedMark>
        <span
          class="ml-auto flex size-(--check-size) items-center justify-center rounded-full border-(length:--border-width-strong) border-(--border-strong) group-data-[state=checked]:border-primary"
          aria-hidden="true"
        >
          <span class="size-(--dot-size) rounded-full group-data-[state=checked]:bg-primary forced-colors:forced-color-adjust-none" />
        </span>
      </span>
      <span class="font-mono text-(length:--text-caption) leading-(--lh-compact) text-muted-foreground">{{ card.text }}</span>
    </RadioGroupItem>
  </RadioGroup>
</template>
