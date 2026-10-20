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
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import MetaList, { type MetaRow } from '@/components/layout/MetaList.vue'
import LoadCard from '@/components/result/LoadCard.vue'
import QualityList from '@/components/result/QualityList.vue'
import type { QualityView } from '@/components/result/qualityList'
import type { ContinuousView as ContinuousViewModel } from '@/components/test/continuous/continuous'
import ContinuousView from '@/components/test/continuous/ContinuousView.vue'
import MetricTile from '@/components/test/MetricTile.vue'
import NotMeasured from '@/components/test/NotMeasured.vue'
import NotMeasuredWhy from '@/components/test/NotMeasuredWhy.vue'
import ResultBar from '@/components/test/ResultBar.vue'
import SaveBar from '@/components/test/SaveBar.vue'
import type { LoadView } from '@/components/test/loadView'
import type { TileView } from '@/components/test/tiles'
import type { SaveState } from '@/composables/useResultSave'
import type { Result } from '@/engine/messages'
import { links } from '@/lib/links'

// The Test screen's results (ui/screens.md sections 1 and 6): once a run has ended with a result,
// the save bar for a complete one or the status bar with Keep in history for a partial or error
// one, then the metric tiles, the load card with the grade, the loaded latency and the HTTP loaded
// responsiveness, the quality list of a complete result (v0.3), and the facts beside them in one
// column. Siblings in the page's column, as the screen lays them out; without a load card the facts
// take the row in three columns, and without a quality list the half row beside the load card. A
// Continuous run shows its live view in their place.

const props = defineProps<{
  /** The ended run's result for the result bar; null while a run goes on or without one. */
  result: Result | null
  /** What became of the result's save to history. */
  save: SaveState | null
  tiles: { main: TileView[]; more: TileView[]; packetLoss: TileView }
  units: 'bits' | 'bytes'
  /** The load card; null for a run with neither direction. */
  load: LoadView | null
  /** A complete result's quality scores; null on any other state or without them. */
  quality: QualityView | null
  /** A Continuous run's live view, in place of the tiles; null for a bounded run. */
  continuous?: ContinuousViewModel | null
}>()
/** The partial or error result was kept in history; the page's gauge and tiles read it too. */
const kept = defineModel<boolean>('kept', { required: true })

const { t } = useI18n()

// Data used, duration and the packet-loss slot, whose reason stays in view (ui/screens.md section 6).
const facts = computed<MetaRow[]>(() => {
  const { more, packetLoss } = props.tiles
  return [
    ...more.map((tile) => ({ key: tile.label, icon: tile.icon, label: tile.label, sub: tile.lines[0]?.text, value: tile.number === null ? null : `${tile.number} ${tile.unit}` })),
    { key: 'packet-loss', icon: packetLoss.icon, label: packetLoss.label, sub: t('test.tiles.whyNot') },
  ]
})
</script>

<template>
  <SaveBar
    v-if="result?.status === 'complete'"
    :result="result"
    :save="save"
    :units="units"
  />
  <ResultBar
    v-else-if="result !== null"
    v-model:kept="kept"
    :result="result"
    :save="save"
  />
  <ContinuousView
    v-if="continuous"
    :view="continuous"
    :load="result?.status === 'complete' ? load : null"
    :quality="quality"
  />
  <section
    v-else
    :aria-label="$t('test.results')"
    class="grid grid-cols-2 gap-(--layout-tile-gap-compact) desktop:grid-cols-4 desktop:gap-(--layout-tile-gap)"
  >
    <MetricTile
      v-for="tile in tiles.main"
      :key="tile.label"
      :tile="tile"
    />
    <LoadCard
      v-if="load"
      :grade="load.grade"
      :rows="load.rows"
      :responsiveness="load.responsiveness"
      class="col-span-2"
    />
    <QualityList
      v-if="quality"
      :view="quality"
      class="col-span-2 desktop:col-span-1"
    />
    <MetaList
      :title="$t('test.tiles.meta')"
      :rows="facts"
      :columns="load ? 1 : 3"
      :class="load ? (quality ? 'col-span-2 desktop:col-span-1' : 'col-span-2') : 'col-span-full'"
    >
      <template #sub-packet-loss>
        <NotMeasuredWhy :href="links.packetLoss" />
      </template>
      <template #value-packet-loss>
        <NotMeasured />
      </template>
    </MetaList>
  </section>
</template>
