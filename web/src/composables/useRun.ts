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

import { computed, onScopeDispose, watch } from 'vue'

import { useInfo } from '@/composables/useInfo'
import { createRunState } from '@/composables/useRunState'
import { useWorker } from '@/composables/useWorker'
import type { SettingsOverride, TestSettings } from '@/engine/messages'
import { settingsFromDefaults } from '@/lib/defaults'
import { readBasePath } from '@/router/base'

// The Test screen's bridge to the engine (architecture.md section 4, frontend.md section 4): it
// configures the Worker from the server defaults, starts and stops runs, keeps their live view, and
// forwards the page's signals: visibility (edge-cases.md section 5), the two network events
// (section 6), and the screen wake lock held during a run (section 2).

/** The browser's connection information, where it exposes one (navigator.connection). */
interface Connection extends EventTarget {
  readonly type?: string
}

export interface RunOptions {
  /** Resolves the settings to configure from the server defaults; the URL parameters plug in here. */
  resolve?: (defaults: TestSettings) => TestSettings
}

/** The result's label and the context label of a run. */
export interface StartOptions {
  label?: string
  contextLabel?: string
}

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
  const settings = computed(() => {
    const base = defaults.value
    return base === null || options.resolve === undefined ? base : options.resolve(base)
  })

  bridge.onEvent(state.apply)
  bridge.onError(state.crash)

  watch(
    settings,
    (value) => {
      if (value !== null) {
        state.configuring()
        bridge.post({ type: 'configure', settings: value, basePath: readBasePath(document) })
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
      if (state.status.value === 'running' || settings.value === null || !state.begin()) {
        return
      }
      const override: SettingsOverride = {}
      if (start.label !== undefined) {
        override.label = start.label
      }
      if (start.contextLabel !== undefined) {
        override.contextLabel = start.contextLabel
      }
      const visible = document.visibilityState === 'visible'
      bridge.post(Object.keys(override).length === 0 ? { type: 'start', visible } : { type: 'start', override, visible })
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
