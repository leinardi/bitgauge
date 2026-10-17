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
import { Database } from '@lucide/vue'
import { computed, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { toast } from 'vue-sonner'

import { confidenceView } from '@/components/result/confidence'
import ConfidenceCard from '@/components/result/ConfidenceCard.vue'
import { gradeView, loadRows } from '@/components/result/load'
import LoadCard from '@/components/result/LoadCard.vue'
import { metricTiles } from '@/components/result/metrics'
import NoteField from '@/components/result/NoteField.vue'
import { parameterGroups } from '@/components/result/parameters'
import ParametersCard from '@/components/result/ParametersCard.vue'
import PhaseCharts from '@/components/result/PhaseCharts.vue'
import ResultHeader from '@/components/result/ResultHeader.vue'
import ResultMissing from '@/components/result/ResultMissing.vue'
import SharePanel from '@/components/share/SharePanel.vue'
import MetricTile from '@/components/test/MetricTile.vue'
import NoticeBox from '@/components/test/NoticeBox.vue'
import { useHistory } from '@/composables/useHistory'
import { useInfo } from '@/composables/useInfo'
import { lastRunResult } from '@/composables/useRun'
import { requestRunAgain } from '@/composables/useRunAgain'
import { useSettings } from '@/composables/useSettings'

// The Result detail (ui/screens.md section 2, kit ResultDetail.jsx): everything about one result,
// from history, or, when its id is not there, the result of the run just finished, which this page
// still holds in memory, shown as not saved, with editing and Delete disabled and the reason. Any
// other id is not found, as is a result just deleted, until its undo. The label and the note are
// saved with the result as they change; Delete removes it with an undo toast; Run again starts its
// settings on the Test screen. The share panel sits in the rail between the note and the parameters.

const UNDO_MS = 8000

const { t, locale } = useI18n()
const route = useRoute()
const router = useRouter()
const history = useHistory()
const { info } = useInfo()
const { stored } = useSettings()

const id = computed(() => String(route.params.id ?? ''))
const units = computed(() => stored.value.units ?? info.value?.defaults.units ?? 'bits')
const saved = computed(() => history.results.value.find((result) => result.id === id.value) ?? null)
const deleted = shallowRef(false)
watch(id, () => {
  deleted.value = false
})
// The run just finished, when it is the one asked for and history does not hold it.
const loading = computed(() => history.status.value === 'loading')
const unsaved = computed(() => (!loading.value && saved.value === null && !deleted.value && lastRunResult.value?.id === id.value ? lastRunResult.value : null))
const result = computed(() => saved.value ?? unsaved.value)
const unavailable = computed(() => history.status.value === 'unavailable')
const notSaved = computed(() => {
  const shown = unsaved.value
  if (shown === null) {
    return null
  }
  if (unavailable.value) {
    return t('result.notSaved.unavailable')
  }
  return shown.status === 'complete' ? t('result.notSaved.failed') : t('result.notSaved.partial')
})

const wording = computed(() => ({ t, locale: locale.value }))
const tiles = computed(() => (result.value === null ? [] : metricTiles(result.value, units.value, wording.value)))
const grade = computed(() => (result.value === null ? null : gradeView(result.value, wording.value)))
const rows = computed(() => (result.value === null ? [] : loadRows(result.value, wording.value)))
const confidence = computed(() => (result.value === null ? null : confidenceView(result.value, wording.value)))
const parameters = computed(() => (result.value === null ? [] : parameterGroups(result.value, units.value, wording.value)))

function rename(label: string): void {
  void history.edit(id.value, { label })
}

function saveNote(target: string, note: string): void {
  const stored = history.results.value.find((result) => result.id === target)
  if (stored !== undefined && (stored.note ?? '') !== note) {
    void history.edit(target, { note })
  }
}

async function remove(): Promise<void> {
  const removed = await history.remove([id.value])
  if (removed.length === 0) {
    return
  }
  deleted.value = true
  toast(t('history.deleted.title', { n: removed.length }, removed.length), {
    duration: UNDO_MS,
    action: {
      label: t('history.deleted.undo'),
      onClick: () => {
        void history.restore(removed).then(() => {
          deleted.value = false
        })
      },
    },
  })
}

function runAgain(): void {
  if (result.value !== null) {
    requestRunAgain(result.value)
    void router.push('/')
  }
}
</script>

<template>
  <main
    id="main"
    tabindex="-1"
    class="focus:outline-none mx-auto flex w-full max-w-(--layout-max) flex-1 flex-col gap-5 px-(--layout-gutter-compact) pt-3.5 pb-6 desktop:px-(--layout-gutter) desktop:pt-5 desktop:pb-12"
  >
    <div
      v-if="loading"
      role="status"
      aria-busy="true"
      class="h-40 animate-pulse rounded-(--radius-lg) bg-(--surface-3) motion-reduce:animate-none"
      :aria-label="t('result.loading')"
      data-testid="result-loading"
    />
    <ResultMissing
      v-else-if="result === null"
      :deleted="deleted"
    />
    <template v-else>
      <ResultHeader
        :result="result"
        :not-saved="notSaved"
        @rename="rename"
        @run-again="runAgain"
        @remove="remove"
      >
        <NoticeBox
          v-if="unavailable"
          tone="warn"
          :icon="Database"
          :title="t('result.unavailable.title')"
          :body="t('result.unavailable.body')"
          :live="false"
          data-testid="result-unavailable"
        />
      </ResultHeader>
      <div class="grid grid-cols-1 items-start gap-6 desktop:grid-cols-[minmax(0,1fr)_352px]">
        <div class="flex min-w-0 flex-col gap-4">
          <section
            :aria-label="t('test.results')"
            class="grid grid-cols-2 gap-2.5 desktop:grid-cols-4 desktop:gap-3"
          >
            <MetricTile
              v-for="tile in tiles"
              :key="tile.label"
              :tile="tile"
            />
          </section>
          <LoadCard
            v-if="grade"
            :grade="grade"
            :rows="rows"
          />
          <ConfidenceCard
            v-if="confidence"
            :view="confidence"
          />
          <PhaseCharts
            :result="result"
            :units="units"
          />
        </div>
        <aside class="flex min-w-0 flex-col gap-4">
          <NoteField
            :id="result.id"
            :note="result.note ?? ''"
            :disabled-reason="notSaved"
            @save="saveNote"
          />
          <SharePanel
            :result="result"
            :units="units"
          />
          <ParametersCard :groups="parameters" />
        </aside>
      </div>
    </template>
  </main>
</template>
