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
import { HardDrive, History as HistoryIcon, Play, Search, Upload, X } from '@lucide/vue'
import { computed, shallowRef, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink, useRouter } from 'vue-router'
import { toast } from 'vue-sonner'

import AppButton from '@/components/actions/AppButton.vue'
import EmptyState from '@/components/feedback/EmptyState.vue'
import ClearAllDialog from '@/components/history/ClearAllDialog.vue'
import ComparePanel from '@/components/history/ComparePanel.vue'
import ExportMenu from '@/components/history/ExportMenu.vue'
import { saveJson } from '@/components/history/exporting'
import FilterBar from '@/components/history/FilterBar.vue'
import HistoryLoading from '@/components/history/HistoryLoading.vue'
import ImportDialog from '@/components/history/ImportDialog.vue'
import { noMatchBody } from '@/components/history/noMatch'
import OriginNotice from '@/components/history/OriginNotice.vue'
import ResultCardList from '@/components/history/ResultCardList.vue'
import ResultsTable from '@/components/history/ResultsTable.vue'
import { resultDay } from '@/components/history/rows'
import SafariNotice from '@/components/history/SafariNotice.vue'
import SelectionBar from '@/components/history/SelectionBar.vue'
import TrendChart from '@/components/history/TrendChart.vue'
import { useHistory } from '@/composables/useHistory'
import { storageUsage, useHistoryList } from '@/composables/useHistoryList'
import { useInfo } from '@/composables/useInfo'
import { useSettings } from '@/composables/useSettings'
import { NO_FILTER } from '@/history/filters'
import { formatBytes } from '@/lib/format'
import { isSafari } from '@/lib/safari'

// The History screen (ui/screens.md section 3, ui/flows.md section 6; kit History.jsx): the results
// stored in this browser, for this origin, with their count and the storage they use; the filters,
// the trend and the list, as a table on wider screens and as cards on narrow ones; the selection;
// Export, Import and Clear all. Its states: loading, empty, populated, filtered with no match,
// history unavailable, and the import's. Two selected results open the compare view.

const { t, locale } = useI18n()
const router = useRouter()
const history = useHistory()
const { info } = useInfo()
const { stored } = useSettings()
const list = useHistoryList(history)
const importer = useTemplateRef<InstanceType<typeof ImportDialog>>('importer')
const origin = window.location.origin
// What the selection holds (kit History.jsx): two results by their days, after their label when
// they share one; more by the days they span.
const selectionSummary = computed(() => {
  const picked = list.sorted.value.filter((result) => list.selected.value.has(result.id)).sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt))
  const first = picked[0]
  const last = picked.at(-1)
  if (first === undefined || last === undefined || picked.length < 2) {
    return ''
  }
  const days = { a: resultDay(first.startedAt, locale.value), b: resultDay(last.startedAt, locale.value) }
  if (picked.length > 2) {
    return t('history.selection.span', days)
  }
  return first.label !== '' && first.label === last.label ? t('history.selection.pair', { ...days, label: first.label }) : t('history.selection.pairDays', days)
})
const safari = isSafari()
const safariDismissed = shallowRef(false)

const status = history.status
const all = history.results
const units = computed(() => stored.value.units ?? info.value?.defaults.units ?? 'bits')
const hasData = computed(() => status.value === 'available' && all.value.length > 0)
const empty = computed(() => status.value === 'available' && all.value.length === 0)

const usage = shallowRef<number | null>(null)
watch(
  all,
  async () => {
    usage.value = await storageUsage()
  },
  { immediate: true },
)

const count = computed(() => {
  if (status.value === 'loading') {
    return t('history.count.loading')
  }
  if (status.value === 'unavailable') {
    return t('history.count.unavailable')
  }
  const shown = all.value.length === 0 ? t('history.count.none') : t('history.count.shown', { shown: list.filtered.value.length, total: all.value.length })
  return usage.value === null ? shown : `${shown} · ${t('history.count.usage', { size: formatBytes(usage.value, locale.value) })}`
})

function open(id: string): void {
  void router.push(`/result/${encodeURIComponent(id)}`)
}

function exportAll(): void {
  if (!saveJson(all.value)) {
    invalidExport()
  }
}

function invalidExport(): void {
  toast.error(t('history.export.invalid'))
}

async function clearAll(): Promise<void> {
  await history.clear()
  list.clearSelection()
}

const selectedIds = computed(() => [...list.selected.value])

// The compare view, for exactly two selected results; closing it keeps the selection, so another
// pair is one deselection away.
const comparing = shallowRef(false)
const comparedPair = computed(() => {
  const chosen = all.value.filter((result) => list.selected.value.has(result.id))
  const [first, second] = chosen
  return chosen.length === 2 && first !== undefined && second !== undefined ? ([first, second] as const) : null
})
watch(comparedPair, (chosen) => {
  if (chosen === null) {
    comparing.value = false
  }
})
</script>

<template>
  <main
    id="main"
    tabindex="-1"
    class="focus:outline-none mx-auto flex w-full max-w-(--layout-max) flex-1 flex-col gap-3.5 px-(--layout-gutter-compact) pt-4 pb-6 desktop:gap-4.5 desktop:px-(--layout-gutter) desktop:pt-6 desktop:pb-12"
  >
    <header class="flex flex-wrap items-center gap-x-4 gap-y-3">
      <div class="flex items-baseline gap-2.5">
        <h1 class="text-(length:--text-3xl) leading-(--lh-normal) font-semibold tracking-(--tracking-tight) desktop:text-(length:--text-4xl)">
          {{ t('history.title') }}
        </h1>
        <span
          class="font-mono text-(length:--text-sm) text-subtle-foreground"
          data-testid="history-count"
        >{{ count }}</span>
      </div>
      <div class="ml-auto flex flex-wrap gap-2">
        <AppButton
          size="sm"
          :disabled="status !== 'available' || importer?.busy"
          data-testid="import-json"
          @click="importer?.open()"
        >
          <Upload
            :size="14"
            aria-hidden="true"
          />
          {{ importer?.busy ? t('history.import.busy') : t('history.import.action') }}
        </AppButton>
        <template v-if="hasData">
          <ExportMenu
            :all="all"
            :filtered="list.sorted.value"
            @invalid="invalidExport"
          />
          <ClearAllDialog
            :count="all.length"
            @confirm="clearAll"
            @export-first="exportAll"
          />
        </template>
      </div>
    </header>
    <OriginNotice
      v-if="status !== 'unavailable'"
      :origin="origin"
    />
    <SafariNotice
      v-if="safari && hasData && !safariDismissed"
      @export="exportAll"
      @dismiss="safariDismissed = true"
    />
    <ImportDialog
      ref="importer"
      :history="history"
    />
    <HistoryLoading v-if="status === 'loading'" />
    <EmptyState
      v-else-if="status === 'unavailable'"
      :icon="HardDrive"
      :title="t('history.unavailable.title')"
      :body="t('history.unavailable.body')"
      data-testid="history-unavailable"
    >
      <AppButton
        as-child
        variant="primary"
      >
        <RouterLink to="/">
          <Play
            :size="15"
            aria-hidden="true"
          />
          {{ t('history.empty.start') }}
        </RouterLink>
      </AppButton>
    </EmptyState>
    <EmptyState
      v-else-if="empty"
      :icon="HistoryIcon"
      :title="t('history.empty.title')"
      :body="t('history.empty.body')"
      data-testid="history-empty"
    >
      <AppButton
        as-child
        variant="primary"
      >
        <RouterLink to="/">
          <Play
            :size="15"
            aria-hidden="true"
          />
          {{ t('history.empty.start') }}
        </RouterLink>
      </AppButton>
      <AppButton @click="importer?.open()">
        <Upload
          :size="15"
          aria-hidden="true"
        />
        {{ t('history.import.action') }}
      </AppButton>
    </EmptyState>
    <template v-else>
      <FilterBar
        :filter="list.filter.value"
        :results="all"
        :now="list.now.value"
        @update:filter="list.setFilter"
      />
      <EmptyState
        v-if="list.filtered.value.length === 0"
        :icon="Search"
        :title="t('history.noMatch.title')"
        :body="noMatchBody(list.filter.value, all.length, { t, locale })"
        data-testid="history-no-match"
      >
        <AppButton @click="list.setFilter(NO_FILTER)">
          <X
            :size="15"
            aria-hidden="true"
          />
          {{ t('history.noMatch.clear') }}
        </AppButton>
      </EmptyState>
      <template v-else>
        <TrendChart
          :results="list.filtered.value"
          :units="units"
          :contexts="list.filter.value.contexts"
        />
        <ResultsTable
          class="hidden tablet:block"
          :results="list.sorted.value"
          :units="units"
          :sort-key="list.sort.value.key"
          :sort-direction="list.sort.value.direction"
          :selected="list.selected.value"
          @sort="list.sortBy"
          @toggle="list.toggle"
          @open="open"
          @remove="(id) => list.remove([id])"
        >
          <template #footer>
            <SelectionBar
              v-if="list.selected.value.size > 0"
              :count="list.selected.value.size"
              :summary="selectionSummary"
              @clear="list.clearSelection"
              @remove="list.remove(selectedIds)"
              @compare="comparing = true"
            />
          </template>
        </ResultsTable>
        <ResultCardList
          class="tablet:hidden"
          :results="list.sorted.value"
          :units="units"
          :sort-key="list.sort.value.key"
          :sort-direction="list.sort.value.direction"
          :selected="list.selected.value"
          @sort="(next) => (list.sort.value = next)"
          @toggle="list.toggle"
          @open="open"
          @remove="(id) => list.remove([id])"
          @clear="list.clearSelection"
          @remove-selected="list.remove(selectedIds)"
          @compare="comparing = true"
        />
        <ComparePanel
          v-if="comparedPair !== null"
          v-model:open="comparing"
          :results="comparedPair"
          :units="units"
        />
      </template>
    </template>
  </main>
</template>
