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
import { Calendar, Check, ChevronDown } from '@lucide/vue'
import { computed, shallowRef, useId, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import AppButton from '@/components/actions/AppButton.vue'
import { Input } from '@/components/ui/input'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import type { Result } from '@/engine/messages'
import { type DateRange, filterResults, NO_FILTER } from '@/history/filters'

// The date-range filter (ui/screens.md section 3; kit History.jsx, Popover and OptionRows in
// design_system/components/actions): the last 7, 30 or 90 days or all time, applied at once with
// each preset's count, or a custom range of two date fields applied with Apply. Both days are
// inclusive local dates. The button is the popover's anchor rather than its trigger, so the dialog
// keeps its own name, Date range, as the kit's does, instead of taking the button's.

const props = defineProps<{ range: DateRange; results: readonly Result[]; now: Date }>()
const emit = defineEmits<{ 'update:range': [DateRange] }>()

const { t, locale } = useI18n()
const open = shallowRef(false)
const from = shallowRef('')
const to = shallowRef('')
const ids = { custom: useId() }
const button = useTemplateRef<InstanceType<typeof AppButton>>('button')

// The button toggles the popover itself; a press on it is not an outside press that closes it first.
function outside(event: Event): void {
  const target = event.target
  if (target instanceof Node && (button.value?.$el as HTMLElement | undefined)?.contains(target) === true) {
    event.preventDefault()
  }
}

// Closing gives the focus back to the button, as a trigger would get it.
function refocus(event: Event): void {
  event.preventDefault()
  ;(button.value?.$el as HTMLElement | undefined)?.focus()
}

const DASH = '–'

type Preset = 'all' | 7 | 30 | 90
const PRESETS: readonly Preset[] = [7, 30, 90, 'all']

const rangeOf = (preset: Preset): DateRange => (preset === 'all' ? { kind: 'all' } : { kind: 'days', days: preset })
const selected = computed<Preset | null>(() => (props.range.kind === 'all' ? 'all' : props.range.kind === 'days' ? props.range.days : null))
const counts = computed(() => new Map(PRESETS.map((preset) => [preset, filterResults(props.results, { ...NO_FILTER, range: rangeOf(preset) }, props.now).length])))

function presetName(preset: Preset): string {
  switch (preset) {
    case 7:
      return t('history.filters.range.days7')
    case 30:
      return t('history.filters.range.days30')
    case 90:
      return t('history.filters.range.days90')
    case 'all':
      return t('history.filters.range.all')
  }
}

function localDate(text: string): string {
  const [year, month, day] = text.split('-').map(Number)
  return new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium' }).format(new Date(year ?? 0, (month ?? 1) - 1, day ?? 1))
}

const label = computed(() =>
  props.range.kind === 'custom' ? t('history.filters.range.customValue', { from: localDate(props.range.from), to: localDate(props.range.to) }) : presetName(selected.value ?? 'all'),
)

/** A local date as the date fields hold it, `YYYY-MM-DD`. */
function isoDay(date: Date): string {
  return `${String(date.getFullYear())}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

// Opening starts the custom fields from the range in force, as the kit's do: the custom range, or
// the days a preset covers up to today; empty for all time.
watch(open, (opened) => {
  if (!opened) {
    return
  }
  if (props.range.kind === 'custom') {
    from.value = props.range.from
    to.value = props.range.to
  } else if (props.range.kind === 'days') {
    const start = new Date(props.now)
    start.setDate(start.getDate() - props.range.days)
    from.value = isoDay(start)
    to.value = isoDay(props.now)
  } else {
    from.value = ''
    to.value = ''
  }
})

const customValid = computed(() => /^\d{4}-\d{2}-\d{2}$/.test(from.value) && /^\d{4}-\d{2}-\d{2}$/.test(to.value) && from.value <= to.value)

function choose(preset: Preset): void {
  emit('update:range', rangeOf(preset))
  open.value = false
}

function apply(): void {
  if (customValid.value) {
    emit('update:range', { kind: 'custom', from: from.value, to: to.value })
    open.value = false
  }
}
</script>

<template>
  <Popover v-model:open="open">
    <PopoverAnchor as-child>
      <AppButton
        ref="button"
        size="sm"
        aria-haspopup="dialog"
        :aria-expanded="open"
        data-testid="date-range"
        @click="open = !open"
      >
        <Calendar
          :size="14"
          aria-hidden="true"
        />
        {{ label }}
        <ChevronDown
          :size="14"
          aria-hidden="true"
        />
      </AppButton>
    </PopoverAnchor>
    <PopoverContent
      align="end"
      :side-offset="6"
      :aria-label="t('history.filters.range.label')"
      class="flex w-75 flex-col gap-0.5 rounded-(--radius-lg) border-(--border-default) bg-(--surface-2) p-1.5 text-left shadow-(--shadow-pop)"
      @interact-outside="outside"
      @close-auto-focus="refocus"
    >
      <div
        role="radiogroup"
        :aria-label="t('history.filters.range.presets')"
        class="flex flex-col"
      >
        <button
          v-for="preset in PRESETS"
          :key="preset"
          type="button"
          role="radio"
          :aria-checked="selected === preset"
          class="flex h-(--control-h-md) cursor-pointer items-center gap-2 rounded-(--radius-sm) px-2 text-left text-(length:--text-sm) hover:bg-(--surface-3) aria-checked:bg-(--primary-bg) aria-checked:text-primary-text"
          @click="choose(preset)"
        >
          <span class="flex-1">{{ presetName(preset) }}</span>
          <span class="font-mono text-(length:--text-micro) text-subtle-foreground">{{ counts.get(preset) }}</span>
          <span class="flex w-3.5 text-primary-text">
            <Check
              v-if="selected === preset"
              :size="14"
              aria-hidden="true"
            />
          </span>
        </button>
      </div>
      <div class="mx-0.5 my-1 h-px bg-(--border-subtle)" />
      <span
        :id="ids.custom"
        class="px-2.5 pt-1 pb-0.5 font-(family-name:--font-cond) text-(length:--text-micro) leading-(--lh-snug) font-semibold tracking-(--tracking-caps) text-subtle-foreground uppercase"
      >{{ t('history.filters.range.custom') }}</span>
      <div
        role="group"
        :aria-labelledby="ids.custom"
        class="flex items-center gap-1.5 px-2.5 pt-1 pb-2"
      >
        <Input
          v-model="from"
          type="date"
          :aria-label="t('history.filters.range.from')"
          class="h-(--control-h-sm) min-w-0 flex-1 font-mono text-(length:--text-caption)"
          data-testid="range-from"
        />
        <span
          aria-hidden="true"
          class="text-subtle-foreground"
        >{{ DASH }}</span>
        <Input
          v-model="to"
          type="date"
          :aria-label="t('history.filters.range.to')"
          class="h-(--control-h-sm) min-w-0 flex-1 font-mono text-(length:--text-caption)"
          data-testid="range-to"
        />
      </div>
      <div class="flex justify-end gap-1.5 border-t border-(--border-subtle) px-1.5 pt-1.5 pb-0.5">
        <AppButton
          variant="ghost"
          size="sm"
          @click="open = false"
        >
          {{ t('history.filters.range.cancel') }}
        </AppButton>
        <AppButton
          variant="primary"
          size="sm"
          :aria-disabled="!customValid"
          data-testid="range-apply"
          @click="apply"
        >
          {{ t('history.filters.range.apply') }}
        </AppButton>
      </div>
    </PopoverContent>
  </Popover>
</template>
