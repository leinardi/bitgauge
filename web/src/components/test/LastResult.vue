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
import { History } from '@lucide/vue'
import { useIntervalFn, useNow } from '@vueuse/core'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'

import { type RowRate, rowView } from '@/components/history/rows'
import type { Result } from '@/engine/messages'
import { continuousDirection } from '@/lib/continuous'
import { formatAgo } from '@/lib/format'

// The last result line in the idle state (ui/screens.md section 1; design_system/components
// measurement LastResult): when the latest saved result ran, its headline numbers and its label,
// linking to its detail. Each rate carries its qualifiers in History's words (ui/screens.md section
// 6); one unit follows both rates when they share it and neither has a qualifier. A Continuous
// result shows the direction it ran.

const props = defineProps<{ result: Result; units: 'bits' | 'bytes' }>()

const SEPARATOR = ' · '

const { t, locale } = useI18n()
// Read again each minute, so the line stays true while the page sits idle.
const now = useNow({ scheduler: (tick) => useIntervalFn(tick, 60_000) })

const when = computed(() => formatAgo(Date.parse(props.result.startedAt), now.value.getTime(), locale.value))
/**
 * A direction's number with its unit (or the number alone where the line shares the unit), then
 * its qualifiers in History's words; without a number, its qualifiers alone, or a dash.
 */
function shown(rate: RowRate, unit: boolean): string {
  const words = rate.qualifiers.join(', ')
  if (rate.value === null) {
    return words === '' ? '—' : words
  }
  const number = unit ? `${rate.value.number} ${rate.value.unit}` : rate.value.number
  return words === '' ? number : `${number} ${words}`
}

const values = computed(() => {
  const row = rowView(props.result, props.units, { t, locale: locale.value })
  const latency = row.latency === null ? [] : [`${row.latency} ms`]
  // A Continuous result ran one direction: its run-wide average alone, named as Continuous.
  const ran = continuousDirection(props.result.settings)
  if (ran !== null) {
    return [`${ran === 'download' ? '↓' : '↑'} ${shown(row[ran], true)}`, t('test.lastResult.continuous'), ...latency].join(SEPARATOR)
  }
  const { download, upload } = row
  // One unit follows both rates only when they share it and no qualifier sits between them.
  const plain = download.qualifiers.length === 0 && upload.qualifiers.length === 0
  const shared = plain && download.value !== null && upload.value !== null && download.value.unit === upload.value.unit
  return [`↓ ${shown(download, !shared)}`, `↑ ${shown(upload, true)}`, ...latency].join(SEPARATOR)
})
const label = computed(() => (props.result.label === '' ? '' : `${SEPARATOR}${props.result.label}`))
</script>

<template>
  <RouterLink
    :to="`/result/${encodeURIComponent(result.id)}`"
    class="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 self-start text-(length:--text-caption) text-subtle-foreground no-underline hover:text-muted-foreground"
    data-testid="last-result"
  >
    <History
      :size="13"
      aria-hidden="true"
    />
    <!-- Each part is its own flex item, spaced by the gap and wrapping as a whole, as the kit's are. -->
    {{ t('test.lastResult.when', { when }) }}{{ SEPARATOR }}<span class="font-mono text-muted-foreground">{{ values }}</span>{{ label }} <span class="font-semibold text-primary-text">{{ t('test.lastResult.view') }}</span>
  </RouterLink>
</template>
