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
import { CircleX } from '@lucide/vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import type { PhaseView, RunError } from '@/composables/useRunState'
import type { MeasuringPhase, PhaseName } from '@/engine/messages'
import NoticeBox from '@/components/test/NoticeBox.vue'
import { formatDuration } from '@/lib/format'

// What failed and in which phase (ui/screens.md section 1, Error; ui/flows.md section 5), as a
// danger Notice at the head of the notices: the server and the cause, worded by the error's
// message key, then where the phase stopped and what finished before it. An engine defect says
// the test stopped because of an internal error, naming no phase.

const props = defineProps<{ error: RunError; phases: Readonly<Record<PhaseName, PhaseView>>; order: readonly MeasuringPhase[]; server: string }>()

const { t, locale } = useI18n()

const CAUSES: Record<Exclude<RunError['code'], 'internal' | 'rate-limited' | 'server-busy'>, () => string> = {
  'invalid-settings': () => t('errors.invalid-settings'),
  'requests-failed': () => t('errors.requests-failed'),
  'network-changed': () => t('errors.network-changed'),
  'server-restarted': () => t('errors.server-restarted'),
  'server-unreachable': () => t('errors.server-unreachable'),
}

function phaseName(phase: MeasuringPhase): string {
  return phase === 'idle' ? t('test.failure.phases.idle') : phase === 'download' ? t('test.failure.phases.download') : t('test.failure.phases.upload')
}

const capitalized = (text: string) => text.charAt(0).toLocaleUpperCase(locale.value) + text.slice(1)

const finished = computed(() => props.order.filter((phase) => props.phases[phase].state === 'finished'))

const title = computed(() => {
  const { code, phase } = props.error
  if (code === 'internal') {
    return t('test.failure.title')
  }
  // A rate limit names only the known cause of the last failure, in a sentence of its own.
  if ((code === 'rate-limited' || code === 'server-busy') && (phase === 'download' || phase === 'upload')) {
    const values = { server: props.server, phase: phaseName(phase) }
    return code === 'rate-limited' ? t('errors.rate-limited', values) : t('errors.server-busy', values)
  }
  if (code === 'rate-limited' || code === 'server-busy') {
    return t('test.failure.lost', { server: props.server, cause: t('errors.requests-failed') })
  }
  const cause = CAUSES[code]()
  if (code === 'invalid-settings') {
    return t('test.failure.failed', { cause })
  }
  // A phase stopped after another finished names it in the title; otherwise the body does.
  return phase !== null && phase !== 'info' && finished.value.length > 0
    ? t('test.failure.lostDuring', { server: props.server, cause, phase: phaseName(phase) })
    : t('test.failure.lost', { server: props.server, cause })
})

const body = computed(() => {
  const { code, phase } = props.error
  if (code === 'internal') {
    return t('test.failure.internal')
  }
  if (phase === null) {
    return ''
  }
  if (phase === 'info') {
    return t('test.failure.connecting')
  }
  const s = formatDuration(props.phases[phase].ranMs ?? 0, locale.value)
  if (finished.value.length === 0) {
    return `${t('test.failure.stoppedDuring', { s, phase: phaseName(phase) })} ${t('test.failure.noneFinished')}`
  }
  const phases = capitalized(new Intl.ListFormat(locale.value, { type: 'conjunction' }).format(finished.value.map(phaseName)))
  return `${t('test.failure.stopped', { phase: capitalized(phaseName(phase)), s })} ${t('test.failure.finished', { phases })}`
})
</script>

<template>
  <NoticeBox
    tone="danger"
    :icon="CircleX"
    :title="title"
    :body="body"
    data-testid="run-failure"
  />
</template>
