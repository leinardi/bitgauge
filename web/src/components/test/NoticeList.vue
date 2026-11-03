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
import { RefreshCw, Timer, X } from '@lucide/vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import AppButton from '@/components/actions/AppButton.vue'
import AppLink from '@/components/actions/AppLink.vue'
import NoticeBox from '@/components/test/NoticeBox.vue'
import { latencyStopView, noticeViews } from '@/components/test/notices'
import { useTheme } from '@/composables/useTheme'
import type { Direction, DirectionResult, IdleResult, Notice, Preset, Result, TestSettings } from '@/engine/messages'
import { controlIn, firstConnected, focusHandOff } from '@/lib/focus'

// The notices area (ui/screens.md section 7): each notice an icon and text, never color alone,
// in its tone, with up to two actions. Danger notices are alerts; the others are status messages.
// The notices sit in the page's column as siblings, as the export's TestScreen places them.

const props = withDefaults(
  defineProps<{
    notices: Notice[]
    result?: Result | null
    settings?: TestSettings | null
    /** Each direction that has ended. */
    directions?: Partial<Record<Direction, DirectionResult | undefined>>
    /** The run's last idle progress, for the stop notice of a stop during idle latency. */
    idle?: { pings: number; count: number } | null
    /** The finished idle latency, before the result carries it. */
    finishedIdle?: IdleResult | null
  }>(),
  { result: null, settings: null, directions: () => ({}), idle: null, finishedIdle: null },
)
const emit = defineEmits<{ retry: []; preset: [preset: Preset]; dismiss: [parameter: string] }>()

const { t, locale } = useI18n()
const { choice } = useTheme()

// An action takes its notice away. Dismiss hands the focus to the next notice's first control, else
// the previous one's; Retry and Try Extended start a run, so the focus moves to Stop
// (ui/i18n-a11y.md section 2.3).
const NOTICE = '[data-testid="notice"]'
const startButton = () => document.querySelector('#main [data-testid="start-button"]')
const control = (notice: Element | null | undefined) => (notice?.matches(NOTICE) === true ? controlIn(notice) : null)

async function act(event: Event, emitted: () => void): Promise<void> {
  const notice = (event.currentTarget as Element | null)?.closest(NOTICE)
  const [after, before] = [control(notice?.nextElementSibling), control(notice?.previousElementSibling)]
  const handOff = focusHandOff(notice)
  emitted()
  // Notices that say the same are keyed by their order, so the box can stay and show the next one.
  await handOff(() => firstConnected(notice, after, before) ?? startButton())
}

async function start(event: Event, emitted: () => void): Promise<void> {
  const handOff = focusHandOff((event.currentTarget as Element | null)?.closest(NOTICE))
  emitted()
  await handOff(startButton)
}

const views = computed(() => {
  const context = { t, locale: locale.value, result: props.result, settings: props.settings, theme: choice.value, directions: props.directions, finishedIdle: props.finishedIdle }
  const stop = latencyStopView(props.result, props.idle, context)
  // Keyed by what each notice says, never by its place: a notice that moves when the result's list
  // replaces the run's keeps its box, so its status region is not rewritten and announced again.
  const seen = new Map<string, number>()
  return [...(stop === null ? [] : [stop]), ...noticeViews(props.notices, context)].map((view) => {
    const text = `${view.tone}|${view.title}`
    const count = seen.get(text) ?? 0
    seen.set(text, count + 1)
    return { key: `${text}#${count}`, view }
  })
})
</script>

<template>
  <NoticeBox
    v-for="{ key, view } in views"
    :key="key"
    :tone="view.tone"
    :icon="view.icon"
    :title="view.title"
    :body="view.body"
    data-testid="notice"
  >
    <template
      v-if="view.actions.length > 0"
      #actions
    >
      <template
        v-for="action in view.actions.slice(0, 2)"
        :key="action.label"
      >
        <AppButton
          v-if="action.kind === 'retry'"
          size="sm"
          @click="start($event, () => emit('retry'))"
        >
          <RefreshCw
            :size="14"
            aria-hidden="true"
          />
          {{ action.label }}
        </AppButton>
        <AppButton
          v-else-if="action.kind === 'preset'"
          size="sm"
          @click="start($event, () => emit('preset', action.preset))"
        >
          <Timer
            :size="14"
            aria-hidden="true"
          />
          {{ action.label }}
        </AppButton>
        <AppButton
          v-else-if="action.kind === 'dismiss'"
          size="sm"
          variant="ghost"
          @click="act($event, () => emit('dismiss', action.parameter))"
        >
          <X
            :size="14"
            aria-hidden="true"
          />
          {{ action.label }}
        </AppButton>
        <AppLink
          v-else
          :href="action.href"
          external
        >
          {{ action.label }}
        </AppLink>
      </template>
    </template>
  </NoticeBox>
</template>
