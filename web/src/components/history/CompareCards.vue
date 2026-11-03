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
import { ChevronLeft, ChevronRight } from '@lucide/vue'
import { shallowRef, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'

import AppButton from '@/components/actions/AppButton.vue'
import type { Comparison, CompareRow } from '@/components/history/compare'
import CompareChange from '@/components/history/CompareChange.vue'
import { focusHandOff } from '@/lib/focus'

// The compare view on narrow screens (ui/screens.md section 3, responsive notes; kit History.jsx):
// one result per column, paged horizontally by swipe or by the previous and next buttons, each
// linking to its detail; B's column carries each change. A paging button disables itself on the
// last page it reaches, so the focus moves to the other, inside the dialog (ui/i18n-a11y.md
// section 2.3).

const props = defineProps<{ comparison: Comparison; sides: { side: 'A' | 'B'; id: string; label: string; date: string; startedAt: string }[] }>()

const { t } = useI18n()
const scroller = useTemplateRef<HTMLDivElement>('scroller')
const page = shallowRef(0)
const previous = useTemplateRef<InstanceType<typeof AppButton>>('previous')
const next = useTemplateRef<InstanceType<typeof AppButton>>('next')

async function turn(index: number): Promise<void> {
  const [pressed, other] = index === 0 ? [previous.value, next.value] : [next.value, previous.value]
  const handOff = focusHandOff(pressed?.$el as Element | undefined)
  go(index)
  await handOff(() => other?.$el as Element | undefined)
}

function go(index: number): void {
  const card = scroller.value?.children[index] as HTMLElement | undefined
  if (scroller.value && card) {
    scroller.value.scrollTo({ left: card.offsetLeft - scroller.value.offsetLeft, behavior: 'smooth' })
  }
  page.value = index
}

function scrolled(): void {
  const element = scroller.value
  const width = (element?.children[0] as HTMLElement | undefined)?.offsetWidth ?? 0
  if (element && width > 0) {
    page.value = Math.min(1, Math.round(element.scrollLeft / width))
  }
}

function rows(index: number, of: 'parameters' | 'metrics'): { row: CompareRow; value: string; change: boolean }[] {
  return props.comparison[of].map((row) => ({ row, value: index === 0 ? row.a : row.b, change: index === 1 }))
}

const EYEBROW = 'pt-3 pb-1 font-(family-name:--font-cond) text-(length:--text-micro) font-semibold tracking-(--tracking-caps) text-subtle-foreground uppercase'
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="flex items-center gap-1 px-2">
      <AppButton
        ref="previous"
        variant="ghost"
        class="size-11 justify-center px-0"
        :aria-label="t('history.compare.previous')"
        :disabled="page === 0"
        @click="turn(0)"
      >
        <ChevronLeft
          :size="15"
          aria-hidden="true"
        />
      </AppButton>
      <div class="flex flex-1 flex-col items-center gap-1.5">
        <span
          aria-live="polite"
          class="text-(length:--text-caption) text-muted-foreground"
        >{{ t('history.compare.page', { side: sides[page]?.side, n: page + 1 }) }}</span>
        <span
          aria-hidden="true"
          class="flex gap-1.5"
        >
          <span
            v-for="index in 2"
            :key="index"
            class="h-1 rounded-[2px]"
            :class="page === index - 1 ? 'w-4 bg-primary' : 'w-1.5 bg-(--border-strong)'"
          />
        </span>
      </div>
      <AppButton
        ref="next"
        variant="ghost"
        class="size-11 justify-center px-0"
        :aria-label="t('history.compare.next')"
        :disabled="page === 1"
        @click="turn(1)"
      >
        <ChevronRight
          :size="15"
          aria-hidden="true"
        />
      </AppButton>
    </div>
    <div
      ref="scroller"
      role="group"
      :aria-label="t('history.compare.cards')"
      class="flex snap-x snap-mandatory scroll-px-4 gap-2.5 overflow-x-auto px-4"
      @scroll="scrolled"
    >
      <section
        v-for="(side, index) in sides"
        :key="side.side"
        :aria-label="t('history.compare.result', { side: side.side })"
        class="flex min-w-0 flex-[0_0_calc(100%-28px)] snap-start flex-col rounded-(--radius-lg) border border-(--border-subtle) bg-(--surface-2) p-3.5"
        data-testid="compare-card"
      >
        <RouterLink
          :to="`/result/${encodeURIComponent(side.id)}`"
          class="group flex min-h-11 items-center gap-2.5 pb-2.5 text-foreground no-underline"
        >
          <span class="flex size-6.5 flex-none items-center justify-center rounded-(--radius-sm) border border-(--border-default) bg-(--surface-3) font-mono text-(length:--text-caption) font-semibold">{{ side.side }}</span>
          <span class="flex min-w-0 flex-1 flex-col">
            <span class="truncate text-(length:--text-sm) font-semibold group-hover:underline">{{ side.label }}</span>
            <time
              :datetime="side.startedAt"
              class="font-mono text-(length:--text-micro) text-subtle-foreground"
            >{{ side.date }}</time>
          </span>
          <ChevronRight
            :size="16"
            :stroke-width="2"
            aria-hidden="true"
            class="flex-none text-subtle-foreground"
          />
        </RouterLink>
        <template
          v-for="group in (['parameters', 'metrics'] as const)"
          :key="group"
        >
          <span :class="EYEBROW">{{ group === 'parameters' ? t('history.compare.parameters') : t('history.compare.results') }}</span>
          <div
            v-for="item in rows(index, group)"
            :key="item.row.key"
            class="flex items-start justify-between gap-3 border-t border-(--border-subtle) py-1.75 text-(length:--text-sm)"
          >
            <span class="text-muted-foreground">{{ item.row.name }}</span>
            <!-- A long unbroken value, as a 64-character label, wraps within the card. -->
            <span class="flex min-w-0 flex-col items-end gap-0.5 text-right">
              <span class="font-mono wrap-anywhere">{{ item.value }}</span>
              <CompareChange
                v-if="item.change && (group === 'metrics' || item.row.differs)"
                :row="item.row"
                small
              />
            </span>
          </div>
        </template>
      </section>
    </div>
  </div>
</template>
