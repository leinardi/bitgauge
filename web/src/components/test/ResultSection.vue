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
import MetricTile from '@/components/test/MetricTile.vue'
import NotMeasured from '@/components/test/NotMeasured.vue'
import NotMeasuredWhy from '@/components/test/NotMeasuredWhy.vue'
import ResultBar from '@/components/test/ResultBar.vue'
import SaveBar from '@/components/test/SaveBar.vue'
import type { TileView } from '@/components/test/tiles'
import type { SaveState } from '@/composables/useResultSave'
import type { Result } from '@/engine/messages'
import { links } from '@/lib/links'

// The Test screen's results (ui/screens.md sections 1 and 6): once a run has ended with a result,
// the save bar for a complete one or the status bar with Keep in history for a partial or error
// one, then the metric tiles and the facts beneath them. Siblings in the page's column, as the
// screen lays them out.

const props = defineProps<{
  /** The ended run's result for the result bar; null while a run goes on or without one. */
  result: Result | null
  /** What became of the result's save to history. */
  save: SaveState | null
  tiles: { main: TileView[]; more: TileView[]; packetLoss: TileView }
  units: 'bits' | 'bytes'
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
  <section
    :aria-label="$t('test.results')"
    class="grid grid-cols-2 gap-(--layout-tile-gap-compact) desktop:grid-cols-4 desktop:gap-(--layout-tile-gap)"
  >
    <MetricTile
      v-for="tile in tiles.main"
      :key="tile.label"
      :tile="tile"
    />
    <MetaList
      :title="$t('test.tiles.meta')"
      :rows="facts"
      :columns="3"
      class="col-span-full"
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
