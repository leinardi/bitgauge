/*
 * This file is part of BitGauge.
 *
 * Copyright (c) 2026 Roberto Leinardi
 *
 * BitGauge is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * BitGauge is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with BitGauge.  If not, see <http://www.gnu.org/licenses/>.
 */

import { type ComputedRef, computed, type Ref, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'

import { screenNotices } from '@/components/test/ignored'
import { type RunView, screenState } from '@/components/test/screen/states'
import type { useInfo } from '@/composables/useInfo'
import type { useRun } from '@/composables/useRun'
import type { IgnoredParameter, Notice } from '@/engine/messages'

// The Test screen's view of the run (ui/screens.md section 1): the run's live state gathered for
// the screen's states, the notices it lists, and why Start is disabled (ui/flows.md section 1).

export interface TestScreenInput {
  run: ReturnType<typeof useRun>
  info: Pick<ReturnType<typeof useInfo>, 'info' | 'reachability'>
  /** Whether the auto-start countdown runs. */
  counting: Readonly<Ref<boolean>>
  /** The URL parameters ignored, which show as notices before the first run. */
  ignored: ComputedRef<readonly IgnoredParameter[]>
}

// A dismissed ignored-parameter notice stays hidden for the page load (ui/url-params.md section 1),
// so the set outlives the Test screen: leaving for Settings and coming back keeps it dismissed.
const dismissed = shallowRef<ReadonlySet<string>>(new Set())

export function useTestScreen({ run, info: { info, reachability }, counting, ignored }: TestScreenInput) {
  const { t } = useI18n()

  const view = computed<RunView>(() => ({
    status: run.status.value,
    phase: run.phase.value,
    phases: run.phases.value,
    live: run.live.value,
    idle: run.idle.value,
    dataUsedBytes: run.dataUsedBytes.value,
    result: run.result.value,
    error: run.error.value,
    loaded: run.loaded.value,
    continuous: run.continuous.value,
  }))
  const state = computed(() => screenState(view.value))
  const running = computed(() => state.value === 'running')

  // The result still carries a dismissed notice.
  function dismiss(parameter: string): void {
    dismissed.value = new Set([...dismissed.value, parameter])
  }
  const notices = computed<Notice[]>(() =>
    screenNotices({ idle: state.value === 'idle', settled: info.value !== null, ignored: ignored.value, run: run.notices.value }).filter(
      (notice) => notice.code !== 'url-parameter-ignored' || !dismissed.value.has(notice.parameter),
    ),
  )

  // Start is disabled until GET /info answers (flows.md section 1).
  const disabledReason = computed(() => {
    if (running.value || counting.value) {
      return null
    }
    if (reachability.value === 'unreachable') {
      return t('test.start.unreachable')
    }
    return info.value === null ? t('test.start.waiting') : null
  })

  return { view, state, running, notices, dismiss, disabledReason }
}
