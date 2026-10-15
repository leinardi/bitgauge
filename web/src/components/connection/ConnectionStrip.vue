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
import { Check, ChevronDown, CircleDashed, House, Pencil, Shield } from '@lucide/vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import type { Info } from '@/api/info'
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { type LabelChoice, useContextLabel } from '@/composables/useContextLabel'

// The connection info of the Test screen (ui/screens.md section 1, design_system kit TestScreen.jsx):
// the context label with the server's suggestion, the client IP with its version, the negotiated
// protocol and the stream count. Protocol and live streams come from a run; before one, the
// protocol reads "not reported" and the streams show the configured mode.

const props = withDefaults(defineProps<{ info: Info | null; protocol?: string | null; streams?: number | null }>(), {
  protocol: null,
  streams: null,
})

const { t } = useI18n()
const suggested = computed(() => props.info?.client.suggestedLabel)
const { choice, custom } = useContextLabel(suggested)

const options = computed(() => [
  { value: 'LAN' as LabelChoice, label: t('test.connection.lan'), icon: House },
  { value: 'VPN' as LabelChoice, label: t('test.connection.vpn'), icon: Shield },
  { value: 'none' as LabelChoice, label: t('test.connection.none'), icon: CircleDashed },
  { value: 'custom' as LabelChoice, label: t('test.connection.custom'), icon: Pencil },
])

// The suggestion is one of the fixed choices, or none for a public address.
const shown = computed<LabelChoice>(() => (choice.value === 'suggested' ? (suggested.value ?? 'none') : choice.value))
const current = computed(() => options.value.find((option) => option.value === shown.value) ?? options.value[2])
const chipText = computed(() => {
  if (props.info === null && choice.value === 'suggested') {
    return t('test.connection.unknown')
  }
  if (shown.value === 'custom') {
    return custom.value.trim() === '' ? t('test.connection.customEmpty') : custom.value.trim()
  }
  return current.value?.label ?? ''
})
const isSuggested = computed(() => choice.value === 'suggested' && suggested.value !== null && suggested.value !== undefined)
// The trigger's name carries the suggestion, as the kit's Menu does; the visible hint is hidden.
const chipName = computed(() =>
  isSuggested.value ? t('test.connection.contextFieldSuggested', { label: chipText.value }) : t('test.connection.contextField', { label: chipText.value }),
)

const facts = computed(() => {
  const info = props.info
  const unknown = t('test.connection.unknown')
  const streams = info?.defaults.streams
  let streamsValue = unknown
  let streamsNote = ''
  if (streams !== undefined) {
    if (streams.mode === 'auto') {
      streamsValue = props.streams === null ? unknown : String(props.streams)
      streamsNote = t('test.connection.streamsAuto', { max: streams.max })
    } else {
      streamsValue = String(props.streams ?? (streams.mode === 'single' ? 1 : streams.fixed))
      streamsNote = streams.mode === 'single' ? t('test.connection.streamsSingle') : t('test.connection.streamsFixed')
    }
  }
  return [
    {
      key: 'ip',
      label: t('test.connection.clientIp'),
      value: info?.client.ip ?? unknown,
      note: info === null ? '' : t('test.connection.ipVersion', { version: info.client.ipVersion }),
    },
    {
      key: 'protocol',
      label: t('test.connection.protocol'),
      value: props.protocol ?? unknown,
      note: props.protocol === null && info !== null ? t('test.connection.notReported') : '',
    },
    { key: 'streams', label: t('test.connection.streams'), value: streamsValue, note: streamsNote },
  ]
})

function pick(value: unknown): void {
  if (typeof value === 'string' && options.value.some((option) => option.value === value)) {
    choice.value = value as LabelChoice
  }
}
</script>

<template>
  <div class="flex flex-wrap items-end gap-x-6 gap-y-2.5">
    <div class="flex flex-col gap-[5px]">
      <span class="font-(family-name:--font-cond) text-[11px] font-semibold tracking-(--tracking-caps) text-subtle-foreground uppercase">
        {{ t('test.connection.context') }}
      </span>
      <span class="flex items-center gap-1.5">
        <DropdownMenu>
          <DropdownMenuTrigger
            class="inline-flex h-6 items-center gap-[5px] rounded-full border border-input bg-card pr-[7px] pl-[9px] text-(length:--text-caption) font-semibold text-foreground hover:bg-muted"
            :aria-label="chipName"
            data-testid="context-label"
          >
            <component
              :is="current?.icon"
              :size="12"
              aria-hidden="true"
            />
            {{ chipText }}
            <ChevronDown
              :size="12"
              aria-hidden="true"
              class="text-subtle-foreground"
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            class="w-[212px]"
          >
            <DropdownMenuRadioGroup
              :model-value="shown"
              @update:model-value="pick"
            >
              <DropdownMenuRadioItem
                v-for="option in options"
                :key="option.value"
                :value="option.value"
              >
                <component
                  :is="option.icon"
                  :size="14"
                  aria-hidden="true"
                  class="text-subtle-foreground"
                />
                {{ option.label }}
                <template #indicator-icon>
                  <Check
                    :size="14"
                    class="text-primary-text"
                  />
                </template>
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <span
          v-if="isSuggested"
          aria-hidden="true"
          class="text-(length:--text-caption) text-subtle-foreground"
        >{{ t('test.connection.suggested') }}</span>
        <Input
          v-if="choice === 'custom'"
          v-model="custom"
          :aria-label="t('test.connection.customField')"
          :placeholder="t('test.connection.customPlaceholder')"
          class="h-7 w-44"
        />
      </span>
    </div>
    <div
      v-for="fact in facts"
      :key="fact.key"
      class="flex flex-col gap-[5px]"
      :data-testid="`connection-${fact.key}`"
    >
      <span class="font-(family-name:--font-cond) text-[11px] font-semibold tracking-(--tracking-caps) text-subtle-foreground uppercase">
        {{ fact.label }}
      </span>
      <span class="font-mono text-(length:--text-base) leading-[22px] text-foreground">
        {{ fact.value }}
        <span class="text-(length:--text-caption) text-subtle-foreground">{{ fact.note }}</span>
      </span>
    </div>
  </div>
</template>
