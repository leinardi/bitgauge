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

import { computed, onScopeDispose, type ShallowRef, shallowReadonly, shallowRef, watch } from 'vue'

import { useInfo } from '@/composables/useInfo'
import { createRunState } from '@/composables/useRunState'
import { useWorker } from '@/composables/useWorker'
import type { ConfigureOverride, IgnoredParameter, Preset, Result, SettingsOverride, TestSettings } from '@/engine/messages'
import { settingsFromDefaults } from '@/lib/defaults'
import { readBasePath } from '@/router/base'

// The Test screen's bridge to the engine (architecture.md section 4, frontend.md section 4): it
// configures the Worker from the server defaults, with the stored settings over them, starts and
// stops runs, keeps their live view, and forwards the page's signals: visibility (edge-cases.md
// section 5), the two network events (section 6), and the screen wake lock held during a run
// (section 2).

/** The browser's connection information, where it exposes one (navigator.connection). */
interface Connection extends EventTarget {
  readonly type?: string
}

export interface RunOptions {
  /** The settings the Worker is configured with, from the server defaults; the defaults themselves without it. */
  base?: (defaults: TestSettings) => TestSettings
  /** The URL parameters' settings over the configured ones, which the engine resolves at configure. */
  override?: (base: TestSettings) => ConfigureOverride
}

/**
 * The result's label and the context label of a run, a preset a notice offers instead, the URL
 * parameters ignored, which the run carries as notices, and a result's settings to run again.
 */
export interface StartOptions {
  label?: string
  contextLabel?: string
  preset?: Preset
  ignoredParameters?: IgnoredParameter[]
  settings?: ConfigureOverride
}

const last = shallowRef<Result | null>(null)

/**
 * The result of the run that ended last, kept in memory for the page's life, saved or not: the
 * Result detail shows it when its id is not in history (ui/screens.md section 2, not saved).
 */
export const lastRunResult: Readonly<ShallowRef<Result | null>> = shallowReadonly(last)

function ignore(): void {
  // A wake lock release that fails leaves nothing to undo.
}

/** Runs tests in the engine's Worker; inside a component the Worker ends with the component. */
export function useRun(options: RunOptions = {}) {
  const { info } = useInfo()
  const bridge = useWorker()
  const state = createRunState()
  const connection = (navigator as Navigator & { connection?: Connection }).connection
  let connectionType = connection?.type
  let wakeLock: WakeLockSentinel | null = null
  let requesting = false

  /** The server's defaults as engine settings; null until known, or when v0.1 cannot run them. */
  const defaults = computed(() => (info.value === null ? null : settingsFromDefaults(info.value.defaults)))
  /** The settings the Worker is configured with: the stored settings over the defaults on the Test screen. */
  const base = computed(() => (defaults.value === null ? null : (options.base?.(defaults.value) ?? defaults.value)))
  const override = computed(() => (base.value === null || options.override === undefined ? null : options.override(base.value)))
  /** The settings the next run starts from: the engine's resolution of the last configure, or the configured ones until it answers. */
  const settings = computed(() => (base.value === null ? null : (state.configured.value ?? base.value)))

  bridge.onEvent(state.apply)
  bridge.onError(state.crash)
  watch(state.result, (result) => {
    if (result !== null) {
      last.value = result
    }
  })

  watch(
    [base, override],
    ([value, urlOverride]) => {
      if (value !== null) {
        state.configuring()
        const basePath = readBasePath(document)
        bridge.post(urlOverride === null || Object.keys(urlOverride).length === 0 ? { type: 'configure', settings: value, basePath } : { type: 'configure', settings: value, override: urlOverride, basePath })
      }
    },
    { immediate: true },
  )

  async function holdWakeLock(): Promise<void> {
    if (requesting || wakeLock !== null || !('wakeLock' in navigator)) {
      return
    }
    requesting = true
    try {
      const sentinel = await navigator.wakeLock.request('screen')
      if (state.status.value === 'running') {
        wakeLock = sentinel
        sentinel.addEventListener('release', () => {
          if (wakeLock === sentinel) {
            wakeLock = null
          }
        })
      } else {
        sentinel.release().catch(ignore)
      }
    } catch {
      // Refused (a hidden page, a policy): the run goes on without it.
    } finally {
      requesting = false
    }
  }

  function releaseWakeLock(): void {
    const sentinel = wakeLock
    wakeLock = null
    sentinel?.release().catch(ignore)
  }

  watch(state.status, (status) => {
    if (status !== 'running') {
      releaseWakeLock()
    }
  })

  function onVisibility(): void {
    const visible = document.visibilityState === 'visible'
    bridge.post({ type: 'visibility', visible })
    // The browser releases the wake lock while the page is hidden.
    if (visible && state.status.value === 'running') {
      void holdWakeLock()
    }
  }

  function onOffline(): void {
    bridge.post({ type: 'network', event: 'offline' })
  }

  // Only the connection type counts; its throughput estimates move with the test itself.
  function onConnectionChange(): void {
    const type = connection?.type
    if (type !== connectionType) {
      connectionType = type
      bridge.post({ type: 'network', event: 'type-changed' })
    }
  }

  document.addEventListener('visibilitychange', onVisibility)
  window.addEventListener('offline', onOffline)
  connection?.addEventListener('change', onConnectionChange)
  onScopeDispose(() => {
    document.removeEventListener('visibilitychange', onVisibility)
    window.removeEventListener('offline', onOffline)
    connection?.removeEventListener('change', onConnectionChange)
    releaseWakeLock()
  })

  return {
    ...state,
    defaults,
    settings,

    /**
     * Starts a run with the configured settings; ignored while one runs or before configure, and
     * ended at once when the Worker refused the configure or has failed.
     */
    start(start: StartOptions = {}): void {
      if (state.status.value === 'running' || defaults.value === null || !state.begin()) {
        return
      }
      const startOverride: SettingsOverride = { ...start.settings }
      if (start.label !== undefined) {
        startOverride.label = start.label
      }
      if (start.contextLabel !== undefined) {
        startOverride.contextLabel = start.contextLabel
      }
      if (start.preset !== undefined) {
        startOverride.preset = start.preset
      }
      if (start.ignoredParameters !== undefined && start.ignoredParameters.length > 0) {
        startOverride.ignoredParameters = start.ignoredParameters.map((ignored) => ({ ...ignored }))
      }
      const visible = document.visibilityState === 'visible'
      bridge.post(Object.keys(startOverride).length === 0 ? { type: 'start', visible } : { type: 'start', override: startOverride, visible })
      void holdWakeLock()
    },

    /** Stops the run as a user stop: the engine keeps what is complete. */
    stop(): void {
      if (state.status.value === 'running') {
        state.stopping()
        bridge.post({ type: 'stop' })
      }
    },
  }
}
