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
import { Copy, GitCompare, TriangleAlert, X } from '@lucide/vue'
import { DialogClose, DialogContent, DialogOverlay, DialogPortal } from 'reka-ui'
import { computed, nextTick, shallowRef, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import { toast } from 'vue-sonner'

import AppButton from '@/components/actions/AppButton.vue'
import CompareCards from '@/components/history/CompareCards.vue'
import CompareChange from '@/components/history/CompareChange.vue'
import { compare, type CompareRow, comparisonText } from '@/components/history/compare'
import { resultDate } from '@/components/history/rows'
import { Dialog, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import type { Result } from '@/engine/messages'

// Compare two results (ui/screens.md section 3, ui/flows.md section 6; kit History.jsx, Dialog in
// design_system/components/dialog): a focus-trapped dialog with both parameter sets and the
// results side by side, each change on B against A worded better or worse with an icon, the
// warning naming what keeps them from being directly comparable, a link to each side's detail and
// Copy comparison, or the text to copy by hand where the browser refuses. On narrow screens it
// fills the window and pages one result at a time.

const props = defineProps<{ results: readonly [Result, Result]; units: 'bits' | 'bytes' }>()
const open = defineModel<boolean>('open', { required: true })

const { t, locale } = useI18n()

const comparison = computed(() => compare(props.results[0], props.results[1], props.units, locale.value, t))
const sides = computed(() =>
  (['A', 'B'] as const).map((side) => {
    const result = side === 'A' ? comparison.value.a : comparison.value.b
    return { side, id: result.id, label: result.label === '' ? t('history.table.noLabel') : result.label, date: resultDate(result.startedAt, locale.value) }
  }),
)
const sections = computed(() => [
  { key: 'parameters', title: t('history.compare.parameters'), rows: comparison.value.parameters },
  { key: 'metrics', title: t('history.compare.results'), rows: comparison.value.metrics },
])

/** The comparison's text in a field to copy from, once the clipboard has refused it. */
const manual = shallowRef<string | null>(null)
const field = useTemplateRef<HTMLTextAreaElement>('field')

async function copy(): Promise<void> {
  const [a, b] = sides.value
  const text = comparisonText(comparison.value, { a: `${a?.label} · ${a?.date}`, b: `${b?.label} · ${b?.date}` }, t)
  try {
    // No clipboard on an insecure origin: writeText is then missing, and the call throws.
    await navigator.clipboard.writeText(text)
    manual.value = null
    toast.success(t('history.compare.copied'))
  } catch {
    manual.value = text
    await nextTick()
    field.value?.focus()
    field.value?.select()
  }
}

const judged = (row: CompareRow) => row.verdict !== undefined || row.differs !== undefined
const EYEBROW = 'pt-3.5 pb-1.5 font-(family-name:--font-cond) text-(length:--text-micro) font-semibold tracking-(--tracking-caps) text-subtle-foreground uppercase'
const HEAD = 'bg-(--surface-2) px-3.5 py-2.5 font-(family-name:--font-cond) text-(length:--text-micro) font-semibold tracking-(--tracking-caps-tight) text-subtle-foreground uppercase'
const CELL = 'border-b border-(--border-subtle) px-3.5 py-(--density-cell-padding-y) text-(length:--text-sm)'
</script>

<template>
  <Dialog v-model:open="open">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-(--z-overlay) bg-(--scrim) backdrop-blur-(--scrim-blur)" />
      <DialogContent
        class="fixed inset-0 z-(--z-overlay) flex flex-col overflow-hidden bg-background text-foreground tablet:inset-auto tablet:top-16 tablet:left-1/2 tablet:max-h-[calc(100vh-var(--space-20))] tablet:w-(--modal-w-xl) tablet:max-w-(--modal-max-w) tablet:-translate-x-1/2 tablet:rounded-(--radius-xl) tablet:border tablet:border-(--border-default) tablet:bg-(--surface-2) tablet:shadow-(--shadow-pop)"
        data-testid="compare-panel"
      >
        <div class="flex items-start gap-3.5 border-b border-(--border-subtle) py-1.5 pr-2 pl-4 tablet:border-b-0 tablet:px-5 tablet:pt-4.5 tablet:pb-3.5">
          <span class="hidden size-(--modal-icon) shrink-0 items-center justify-center rounded-(--radius-md) border border-(--primary-border) bg-(--primary-bg) text-primary tablet:flex">
            <GitCompare
              :size="18"
              aria-hidden="true"
            />
          </span>
          <div class="min-w-0 flex-1">
            <DialogTitle class="text-(length:--text-lg) leading-(--lh-snug) font-semibold">
              {{ t('history.compare.title') }}
            </DialogTitle>
            <DialogDescription class="mt-0.5 text-(length:--text-caption) leading-(--lh-prose) text-subtle-foreground tablet:mt-1 tablet:text-(length:--text-sm) tablet:text-muted-foreground">
              {{ t('history.compare.description') }}
            </DialogDescription>
          </div>
          <DialogClose as-child>
            <AppButton
              variant="ghost"
              size="sm"
              class="size-11 justify-center px-0 tablet:size-(--control-h-sm)"
              :aria-label="t('history.compare.close')"
            >
              <X
                :size="16"
                aria-hidden="true"
              />
            </AppButton>
          </DialogClose>
        </div>
        <div class="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto py-3 tablet:gap-0 tablet:border-t tablet:border-(--border-subtle) tablet:py-0">
          <div
            v-if="comparison.warning !== null"
            role="note"
            class="mx-4 flex items-start gap-2.5 rounded-(--radius-md) border border-(--warn-border) bg-(--warn-bg) px-3 py-2.5 text-(length:--text-sm) leading-(--lh-normal) tablet:mx-0 tablet:rounded-none tablet:border-x-0 tablet:border-t-0 tablet:px-5"
            data-testid="compare-warning"
          >
            <TriangleAlert
              :size="15"
              aria-hidden="true"
              class="mt-0.5 flex-none text-(--warn)"
            />
            <span><b class="font-semibold text-(--warn-fg)">{{ t('history.compare.apart') }}</b> {{ comparison.warning }}</span>
          </div>
          <table class="hidden w-full table-fixed border-collapse tablet:table">
            <thead>
              <tr>
                <th :class="[HEAD, 'w-[30%] text-left']">
                  {{ t('history.compare.metric') }}
                </th>
                <th
                  v-for="side in sides"
                  :key="side.side"
                  :class="[HEAD, 'text-right']"
                >
                  <span class="flex flex-col items-end gap-0.5 tracking-normal normal-case">
                    <RouterLink
                      :to="`/result/${encodeURIComponent(side.id)}`"
                      class="font-sans text-(length:--text-sm) font-semibold text-foreground no-underline hover:underline"
                    >{{ t('history.compare.column', { side: side.side, label: side.label }) }}</RouterLink>
                    <span class="font-mono font-normal text-subtle-foreground">{{ side.date }}</span>
                  </span>
                </th>
                <th :class="[HEAD, 'w-[24%] text-right']">
                  {{ t('history.compare.change') }}
                </th>
              </tr>
            </thead>
            <tbody>
              <template
                v-for="section in sections"
                :key="section.key"
              >
                <tr>
                  <th
                    colspan="4"
                    scope="colgroup"
                    :class="[EYEBROW, 'px-3.5 text-left']"
                  >
                    {{ section.title }}
                  </th>
                </tr>
                <tr
                  v-for="row in section.rows"
                  :key="row.key"
                  :data-testid="`compare-row-${row.key}`"
                >
                  <th
                    scope="row"
                    :class="[CELL, 'text-left font-normal text-muted-foreground']"
                  >
                    {{ row.name }}
                  </th>
                  <td :class="[CELL, 'text-right font-mono']">
                    {{ row.a }}
                  </td>
                  <td :class="[CELL, 'text-right font-mono']">
                    {{ row.b }}
                  </td>
                  <td :class="[CELL, 'text-right']">
                    <CompareChange
                      v-if="judged(row)"
                      :row="row"
                    />
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
          <CompareCards
            class="tablet:hidden"
            :comparison="comparison"
            :sides="sides"
          />
          <div
            v-if="manual !== null"
            class="flex flex-col gap-1.5 px-4 pb-1 tablet:px-5 tablet:pt-3.5"
          >
            <span
              role="status"
              class="text-(length:--text-caption) text-(--danger-fg)"
            >{{ t('history.compare.copyManual') }}</span>
            <textarea
              ref="field"
              readonly
              rows="6"
              :value="manual"
              :aria-label="t('history.compare.copyField')"
              class="w-full resize-y rounded-(--radius-md) border border-(--border-default) bg-(--surface-1) px-3 py-2 font-mono text-(length:--text-caption) text-foreground"
              data-testid="compare-text"
            />
          </div>
        </div>
        <div class="flex gap-2 border-t border-(--border-subtle) bg-(--surface-1) px-4 pt-2.5 pb-4 tablet:justify-end tablet:bg-transparent tablet:px-5 tablet:py-3.5">
          <AppButton
            class="h-11 flex-1 justify-center tablet:h-(--control-h-md) tablet:flex-none"
            data-testid="compare-copy"
            @click="copy"
          >
            <Copy
              :size="14"
              aria-hidden="true"
            />
            <span class="tablet:hidden">{{ t('history.compare.copyShort') }}</span>
            <span class="hidden tablet:inline">{{ t('history.compare.copy') }}</span>
          </AppButton>
          <DialogClose as-child>
            <AppButton
              variant="primary"
              class="h-11 flex-1 justify-center tablet:h-(--control-h-md) tablet:flex-none"
            >
              {{ t('history.compare.done') }}
            </AppButton>
          </DialogClose>
        </div>
      </DialogContent>
    </DialogPortal>
  </Dialog>
</template>
