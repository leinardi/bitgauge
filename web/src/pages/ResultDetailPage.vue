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
import { Database, Trash2 } from '@lucide/vue'
import { computed, provide, shallowRef, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

import { notify } from '@/components/feedback/notify'
import { confidenceView } from '@/components/result/confidence'
import ConfidenceCard from '@/components/result/ConfidenceCard.vue'
import { gradeView, loadRows, responsivenessView } from '@/components/result/load'
import LoadCard from '@/components/result/LoadCard.vue'
import { metricTiles } from '@/components/result/metrics'
import { createResultEdits, RESULT_EDITS } from '@/components/result/edits'
import NoteField from '@/components/result/NoteField.vue'
import { parameterGroups } from '@/components/result/parameters'
import ParametersCard from '@/components/result/ParametersCard.vue'
import PhaseCharts from '@/components/result/PhaseCharts.vue'
import QualityList from '@/components/result/QualityList.vue'
import { qualityView } from '@/components/result/qualityList'
import ResultHeader from '@/components/result/ResultHeader.vue'
import ResultMissing from '@/components/result/ResultMissing.vue'
import SharePanel from '@/components/share/SharePanel.vue'
import { canKeep } from '@/components/test/keep'
import KeepInHistory from '@/components/test/KeepInHistory.vue'
import MetricTile from '@/components/test/MetricTile.vue'
import NoticeBox from '@/components/test/NoticeBox.vue'
import { useHistory } from '@/composables/useHistory'
import { useInfo } from '@/composables/useInfo'
import { usePageHeading, usePageTitle } from '@/composables/usePageHeading'
import { lastRunResult } from '@/composables/useRun'
import { requestRunAgain } from '@/composables/useRunAgain'
import { useSettings } from '@/composables/useSettings'
import { focusHandOff } from '@/lib/focus'

// The Result detail (ui/screens.md section 2, kit ResultDetail.jsx): everything about one result,
// from history, or, when its id is not there, the result of the run just finished, which this page
// still holds in memory, shown as not saved, with editing and Delete disabled and the reason. Any
// other id is not found, as is a result just deleted, until its undo. The label and the note are
// saved with the result as they change; Delete removes it with an undo toast; Run again starts its
// settings on the Test screen. The share panel sits in the rail between the note and the parameters.
// The run just finished, when it is partial or error and has something to keep, offers Keep in
// history with its undo, as the Test screen does (ui/flows.md section 4): kept, it shows as saved,
// and the toast's Undo brings the not-saved view back with Keep.


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
const reasonId = useId()
watch(id, () => {
  deleted.value = false
})
// The run just finished, when it is the one asked for and history does not hold it.
const loading = computed(() => history.status.value === 'loading')
const unsaved = computed(() => (!loading.value && saved.value === null && !deleted.value && lastRunResult.value?.id === id.value ? lastRunResult.value : null))
const result = computed(() => saved.value ?? unsaved.value)
const unavailable = computed(() => history.status.value === 'unavailable')
// Its title is the result's label, after a rename too, "Result" while it loads, without a label or
// when not found; its heading takes the focus after an in-app navigation once the result has
// loaded (ui/i18n-a11y.md section 2.3).
usePageTitle(() => result.value?.label || t('result.pageTitle'))
usePageHeading(() => document.querySelector('#main h1'), () => !loading.value)
const notSaved = computed(() => {
  const shown = unsaved.value
  if (shown === null) {
    return null
  }
  if (unavailable.value) {
    return t('result.notSaved.unavailable')
  }
  if (shown.status === 'complete') {
    return t('result.notSaved.failed')
  }
  return shown.status === 'error' ? t('result.notSaved.error') : t('result.notSaved.partial')
})

// Keep in history's eligibility does not depend on the saved state, so the component stays mounted
// while the result is kept and its toast's Undo still reaches it.
const keepable = computed(() => {
  const last = lastRunResult.value
  return last !== null && last.id === id.value && last.status !== 'complete' && canKeep(last) && !unavailable.value ? last : null
})
// Whether this id is kept: read from history once it has loaded for each id, then changed only by
// Keep and its Undo, so a later reload of the same id does not overwrite it.
const kept = shallowRef(false)
let keptFor: string | null = null
watch(
  [id, loading],
  ([current, waiting]) => {
    if (waiting || keptFor === current) {
      return
    }
    keptFor = current
    kept.value = saved.value !== null
  },
  { immediate: true },
)
// The result can also leave or come back to history from elsewhere, as by the Test screen's Undo
// toast after its Details link, or by Delete and its undo here: kept follows each such change, so
// the not-saved view offers Keep again and the saved view never does.
watch(saved, (now, before) => {
  if ((before === null) !== (now === null)) {
    kept.value = now !== null
  }
})

const wording = computed(() => ({ t, locale: locale.value }))
const tiles = computed(() => (result.value === null ? [] : metricTiles(result.value, units.value, wording.value)))
const grade = computed(() => (result.value === null ? null : gradeView(result.value, wording.value)))
const rows = computed(() => (result.value === null ? [] : loadRows(result.value, wording.value)))
const responsiveness = computed(() => (result.value === null ? null : responsivenessView(result.value, wording.value, true)))
const quality = computed(() => (result.value === null ? null : qualityView(result.value, wording.value)))
const confidence = computed(() => (result.value === null ? null : confidenceView(result.value, wording.value)))
const parameters = computed(() => (result.value === null ? [] : parameterGroups(result.value, units.value, wording.value)))

// The label and note edits, which Download JSON saves and waits for before it exports (QA-110).
const edits = createResultEdits(() => saved.value)
provide(RESULT_EDITS, edits)

function rename(label: string): Promise<unknown> {
  const write = history.edit(id.value, { label })
  edits.track(write)
  return write
}

function saveNote(target: string, note: string): Promise<unknown> {
  const stored = history.results.value.find((result) => result.id === target)
  if (stored === undefined || (stored.note ?? '') === note) {
    return Promise.resolve()
  }
  const write = history.edit(target, { note })
  edits.track(write)
  return write
}

// Delete takes its control away: the focus moves to the deleted state's link to History, and after
// the toast's Undo to Delete again (ui/i18n-a11y.md section 2.3).
async function remove(): Promise<void> {
  const handOff = focusHandOff(document.activeElement)
  const removed = await history.remove([id.value])
  if (removed.length === 0) {
    return
  }
  deleted.value = true
  notify({
    tone: 'info',
    icon: Trash2,
    title: t('history.deleted.title', { n: removed.length }, removed.length),
    undo: {
      label: t('history.deleted.undo'),
      countdown: true,
      onClick: () => {
        const undone = focusHandOff(document.activeElement)
        void history.restore(removed).then(() => {
          deleted.value = false
          notify({ tone: 'ok', title: t('history.deleted.restored') })
          return undone(() => document.querySelector('#main [data-testid="delete-result"]'))
        })
      },
    },
  })
  await handOff(() => document.querySelector('[data-testid="result-missing"] a'))
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
        :reason-id="reasonId"
        @rename="rename"
        @run-again="runAgain"
        @remove="remove"
      >
        <template #actions>
          <KeepInHistory
            v-if="keepable"
            v-model:kept="kept"
            :result="keepable"
            size="md"
          />
        </template>
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
          <div
            class="grid grid-cols-1 gap-3"
            :class="{ 'desktop:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]': quality }"
          >
            <LoadCard
              v-if="grade"
              :grade="grade"
              :rows="rows"
              :responsiveness="responsiveness"
            />
            <QualityList
              v-if="quality"
              :view="quality"
            />
          </div>
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
            :reason-id="notSaved === null ? null : reasonId"
            :save="saveNote"
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
