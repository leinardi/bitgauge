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
import MetaList from '@/components/layout/MetaList.vue'
import LoadCard from '@/components/result/LoadCard.vue'
import QualityList from '@/components/result/QualityList.vue'
import type { QualityView } from '@/components/result/qualityList'
import type { ContinuousView } from '@/components/test/continuous/continuous'
import type { LoadView } from '@/components/test/loadView'
import MetricTile from '@/components/test/MetricTile.vue'
import NotMeasured from '@/components/test/NotMeasured.vue'
import NotMeasuredWhy from '@/components/test/NotMeasuredWhy.vue'
import { links } from '@/lib/links'

// The Continuous live view (ui/screens.md section 1, kit TestScreen.jsx continuous and cont-done):
// five tiles in a row, current or minimum, average, "p90, last hour", loaded latency and data used,
// then, once the run is done, its load card and quality list, and the session's facts in one row:
// elapsed or duration, minimum and maximum, idle latency and the packet-loss slot.

defineProps<{
  view: ContinuousView
  /** The finished result's load card; null while the run goes on. */
  load: LoadView | null
  quality: QualityView | null
}>()
</script>

<template>
  <section
    :aria-label="$t('test.results')"
    class="grid grid-cols-2 gap-(--layout-tile-gap-compact) desktop:grid-cols-5 desktop:gap-(--layout-tile-gap)"
    data-testid="continuous-view"
  >
    <MetricTile
      v-for="(tile, index) in view.tiles"
      :key="tile.label"
      :tile="tile"
      :class="{ 'col-span-2 desktop:col-span-1': index === view.tiles.length - 1 }"
    />
    <LoadCard
      v-if="load"
      :grade="load.grade"
      :rows="load.rows"
      :responsiveness="load.responsiveness"
      class="col-span-2 desktop:col-span-3"
    />
    <QualityList
      v-if="quality"
      :view="quality"
      class="col-span-2"
    />
    <MetaList
      :title="$t('test.continuous.session')"
      :rows="view.session"
      :columns="4"
      class="col-span-2 desktop:col-span-5"
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
