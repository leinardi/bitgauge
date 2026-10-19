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
import { type Component, computed, useId } from 'vue'
import { useI18n } from 'vue-i18n'

import { presetName } from '@/components/settings/changes'
import { useSettingsForm } from '@/components/settings/form'
import { RadioGroup } from '@/components/ui/radio-group'
import { type BoundedPreset, type DurationBounds, type Preset, PRESETS, type PresetDefinition } from '@/engine/messages'

// The preset picker (ui/screens.md section 4, kit Settings.jsx and ChoiceCard in forms): one card
// per preset with the streams, durations and ping count it runs, the server's default marked.
// Continuous arrives in v0.3: its card is shown, disabled, with a "v0.3" badge and the tooltip
// that says so, as the kit's ChoiceCard.

const { t } = useI18n()
const form = useSettingsForm()
const tipId = useId()

function range({ minMs, maxMs }: DurationBounds): string {
  return t('settings.values.range', { min: minMs / 1000, max: maxMs / 1000 })
}

function line(table: PresetDefinition<DurationBounds>): string {
  const streams = table.streams.mode === 'fixed' ? t('settings.preset.streamsFixed', table.streams.fixed) : t('settings.preset.streamsAuto')
  const durations =
    table.download.minMs === table.upload.minMs && table.download.maxMs === table.upload.maxMs
      ? t('settings.preset.same', { range: range(table.download) })
      : t('settings.preset.split', { download: range(table.download), upload: range(table.upload) })
  return t('settings.preset.line', { streams, durations, pings: t('settings.preset.pings', table.pingCount) })
}

/** The presets the app runs; Continuous stays a disabled card. */
const BOUNDED: readonly BoundedPreset[] = ['quick', 'standard', 'extended']

const ICONS: Record<Preset, Component> = { quick: Zap, standard: Gauge, extended: Timer, continuous: InfinityIcon }

const cards = computed(() => [
  ...BOUNDED.map((preset) => ({ value: preset, title: presetName(preset, t), text: line(PRESETS[preset]), disabled: false })),
  { value: 'continuous' as const, title: t('settings.preset.names.continuous'), text: t('settings.preset.continuous'), disabled: true },
])

function choose(value: unknown): void {
  if (value === 'quick' || value === 'standard' || value === 'extended') {
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
    <div
      v-for="card in cards"
      :key="card.value"
      class="group/tip relative flex"
    >
      <RadioGroupItem
        :value="card.value"
        :disabled="card.disabled"
        :aria-describedby="card.disabled ? tipId : undefined"
        class="group flex w-full min-h-(--control-h-touch) cursor-pointer flex-col gap-1.5 rounded-(--radius-md) border border-(--border-default) bg-(--surface-1) px-3.5 py-3 text-left text-foreground hover:border-(--border-strong) disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:border-(--border-default) data-[state=checked]:border-(--primary-border) data-[state=checked]:bg-(--primary-bg)"
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
            v-if="card.value === form.defaults.value.preset || card.disabled"
            class="inline-flex h-(--pill-h-sm) items-center rounded-full border border-(--border-default) bg-(--surface-3) px-2 font-(family-name:--font-cond) text-(length:--text-nano) leading-none font-semibold tracking-(--tracking-caps-tight) whitespace-nowrap text-muted-foreground uppercase"
          >{{ card.disabled ? t('settings.preset.v03') : t('settings.preset.default') }}</span>
          <span
            class="ml-auto flex size-(--check-size) items-center justify-center rounded-full border-(length:--border-width-strong) border-(--border-strong) group-data-[state=checked]:border-primary"
            aria-hidden="true"
          >
            <span class="size-(--dot-size) rounded-full group-data-[state=checked]:bg-primary" />
          </span>
        </span>
        <span class="font-mono text-(length:--text-caption) leading-(--lh-compact) text-muted-foreground">{{ card.text }}</span>
      </RadioGroupItem>
      <span
        v-if="card.disabled"
        :id="tipId"
        role="tooltip"
        class="pointer-events-none absolute bottom-[calc(100%+var(--tooltip-gap))] left-1/2 z-(--z-tooltip) flex -translate-x-1/2 items-center gap-1.5 rounded-(--radius-sm) border border-border bg-(--surface-4) px-2.5 py-1.5 text-(length:--text-caption) leading-(--lh-snug) whitespace-nowrap text-foreground opacity-0 shadow-(--shadow-md) transition-opacity duration-(--dur-fast) group-focus-within/tip:opacity-100 group-hover/tip:opacity-100 motion-reduce:transition-none"
      >{{ t('settings.preset.arrives') }}</span>
    </div>
  </RadioGroup>
</template>
