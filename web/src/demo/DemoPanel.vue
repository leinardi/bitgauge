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
import { ChevronDown, ChevronUp, SlidersHorizontal } from '@lucide/vue'
import { shallowRef, useId } from 'vue'

import AppButton from '@/components/actions/AppButton.vue'
import { chooseScenario, onScriptedStop } from '@/demo/control'
import { DEFAULT_SCENARIO, DEMO_SCENARIOS, type DemoCommand, type DemoErrorKind, type DemoScenarioName, isScenarioName } from '@/demo/scenarios'

// The demo panel (frontend.md section 9), the v0.1 part of the UI kit's Demo state panel: the
// scenario, the speed, a forced state, a CPU-bound Worker, the error kind and the timer resolution.
// It exists in demo builds only, so its words are the kit's, not translated. The choice is kept in
// localStorage and applied by loading the page again with the scenario's URL parameters, so every
// scenario starts from a fresh page; one that starts does so through the Start button, as a user
// would.

const props = withDefaults(defineProps<{ navigate?: (url: string) => void }>(), {
  navigate: (url: string) => window.location.assign(url),
})

const STORAGE_KEY = 'bitgauge-demo'
const SPEEDS = [1, 2, 4] as const
const ERROR_KINDS: readonly DemoErrorKind[] = ['requests', 'unreachable', 'restarted', 'network']
const RESOLUTIONS = [0.1, 1] as const
const NAMES = Object.keys(DEMO_SCENARIOS) as DemoScenarioName[]
/** How long the panel waits for the Start button of a scenario that starts. */
const START_TRIES = 100
const START_POLL_MS = 100

const TEXT = {
  panel: 'Demo state',
  title: 'Demo',
  reset: 'Reset',
  collapse: 'Collapse demo panel',
  expand: 'Expand demo panel',
  run: 'Run',
  scenario: 'Scenario',
  speed: 'Speed',
  startNote: 'Start with the button or Enter; Escape stops.',
  testScreen: 'Test screen',
  forceState: 'Force state',
  followRun: 'follow run',
  cpuBound: 'CPU-bound',
  errorKind: 'Error kind',
  timerResolution: 'Timer resolution',
}

interface Choice {
  open: boolean
  scenario: DemoScenarioName
  speed: (typeof SPEEDS)[number]
  /** A state to hold, or '' to follow the run. */
  forceState: DemoScenarioName | ''
  cpuBound: boolean
  errorKind: DemoErrorKind
  timerResolutionMs: (typeof RESOLUTIONS)[number]
}

const DEFAULTS: Choice = { open: false, scenario: DEFAULT_SCENARIO, speed: 1, forceState: '', cpuBound: false, errorKind: 'requests', timerResolutionMs: 0.1 }

/** The stored choice, each field checked; anything unknown falls back to its default. */
function restore(): Choice {
  let stored: Record<string, unknown> = {}
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
    stored = typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {}
  } catch {
    // Unreadable storage: the defaults.
  }
  const pick = <T,>(value: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(value as T) ? (value as T) : fallback)
  return {
    open: stored.open === true,
    scenario: typeof stored.scenario === 'string' && isScenarioName(stored.scenario) ? stored.scenario : DEFAULTS.scenario,
    speed: pick(stored.speed, SPEEDS, DEFAULTS.speed),
    forceState: typeof stored.forceState === 'string' && isScenarioName(stored.forceState) ? stored.forceState : '',
    cpuBound: stored.cpuBound === true,
    errorKind: pick(stored.errorKind, ERROR_KINDS, DEFAULTS.errorKind),
    timerResolutionMs: pick(stored.timerResolutionMs, RESOLUTIONS, DEFAULTS.timerResolutionMs),
  }
}

function save(choice: Choice): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(choice))
  } catch {
    // Storage refused: the choice lasts until the page loads again.
  }
}

/** The demo Worker's command for a choice: a forced state is that state's scenario, held. */
function commandOf(choice: Choice): DemoCommand {
  return {
    type: 'demo',
    scenario: choice.forceState === '' ? choice.scenario : choice.forceState,
    speed: choice.speed,
    cpuBound: choice.cpuBound,
    timerResolutionMs: choice.timerResolutionMs,
    errorKind: choice.errorKind,
    hold: choice.forceState !== '',
  }
}

const choice = shallowRef(restore())
const command = commandOf(choice.value)
const current = DEMO_SCENARIOS[command.scenario]
chooseScenario(command)
const ids = { scenario: useId(), forceState: useId(), errorKind: useId(), timer: useId() }

/**
 * Presses Start once the Test screen offers it, for a scenario that runs as soon as it is chosen:
 * the button is there and usable, which it marks with aria-disabled rather than disabled.
 */
function startWhenReady(tries: number): void {
  const button = document.querySelector<HTMLButtonElement>('[data-testid="start-button"]')
  if (button !== null && button.getAttribute('aria-disabled') !== 'true') {
    button.click()
  } else if (tries > 0) {
    window.setTimeout(() => startWhenReady(tries - 1), START_POLL_MS)
  }
}

if (current.start) {
  window.setTimeout(() => startWhenReady(START_TRIES), START_POLL_MS)
}

// A scripted stop presses the same button, which a run shows as Stop, as the user would.
onScriptedStop(() => document.querySelector<HTMLButtonElement>('[data-testid="start-button"]')?.click())

/** Keeps a new choice and loads the page again with its scenario's URL parameters. */
function apply(patch: Partial<Choice>): void {
  const next = { ...choice.value, ...patch }
  choice.value = next
  save(next)
  const scenario = DEMO_SCENARIOS[commandOf(next).scenario]
  const query = 'query' in scenario ? `?${scenario.query}` : ''
  props.navigate(`${window.location.pathname}${query}`)
}

function toggle(): void {
  choice.value = { ...choice.value, open: !choice.value.open }
  save(choice.value)
}

function reset(): void {
  apply({ ...DEFAULTS, open: true })
}

function selected(event: Event): string {
  return (event.target as HTMLSelectElement).value
}

function onScenario(event: Event): void {
  const value = selected(event)
  if (isScenarioName(value)) {
    apply({ scenario: value, forceState: '' })
  }
}

function onForceState(event: Event): void {
  const value = selected(event)
  apply({ forceState: isScenarioName(value) ? value : '' })
}

function onErrorKind(event: Event): void {
  const value = selected(event)
  apply({ errorKind: ERROR_KINDS.find((kind) => kind === value) ?? DEFAULTS.errorKind })
}

function onTimer(event: Event): void {
  const value = Number(selected(event))
  apply({ timerResolutionMs: RESOLUTIONS.find((resolution) => resolution === value) ?? DEFAULTS.timerResolutionMs })
}

// The kit's panel (kit.css .demo): centered under the top edge; in the compact layout, open at the
// right edge and closed as a pill just left of the theme button.
const OPEN_CLASS =
  'w-(--demo-w) rounded-(--radius-lg) border border-input shadow-(--shadow-pop) max-desktop:right-3 max-desktop:max-h-[calc(100vh_-_2*var(--space-2))] max-desktop:w-[min(var(--demo-w-compact),calc(100vw_-_2*var(--space-3)))]'
const CLOSED_CLASS = 'w-auto rounded-full border border-(--primary-border) max-desktop:right-[calc(var(--layout-gutter-compact)_+_var(--control-h-touch)_+_var(--space-2))]'
const rowClass = 'flex items-center justify-between gap-2 text-(length:--text-caption) text-muted-foreground'
// A select as the kit's small input (forms.css .input.sm): the box is the span, the native select
// sits in it without its own frame, and the box shows the focus.
const inputClass =
  'flex h-(--control-h-sm) min-w-0 flex-[0_1_var(--demo-row-basis)] items-center gap-2 rounded-(--radius-md) border border-input bg-(--surface-1) px-2.5 text-(length:--text-caption) text-foreground focus-within:border-primary focus-within:outline-(length:--focus-width) focus-within:outline-offset-(--focus-offset) focus-within:outline-(--focus-ring)'
const selectClass = 'min-w-0 flex-1 border-none bg-transparent font-sans text-(length:--text-sm) text-foreground outline-none'
</script>

<template>
  <aside
    :aria-label="TEXT.panel"
    data-testid="demo-panel"
    class="fixed top-2.5 left-1/2 z-(--z-skip-link) flex max-h-(--demo-max-h) -translate-x-1/2 flex-col bg-card font-sans text-foreground max-desktop:top-2 max-desktop:left-auto max-desktop:translate-x-0"
    :class="choice.open ? OPEN_CLASS : CLOSED_CLASS"
  >
    <div
      class="flex items-center gap-2"
      :class="choice.open ? 'border-b border-border py-2 pr-2 pl-3' : 'py-0.5 pr-0.5 pl-3'"
    >
      <SlidersHorizontal
        :size="14"
        aria-hidden="true"
        class="text-primary-text"
      />
      <span
        class="mr-auto font-(family-name:--font-cond) text-(length:--text-micro) font-semibold tracking-(--tracking-caps) whitespace-nowrap uppercase"
        :class="choice.open ? 'text-subtle-foreground' : 'text-muted-foreground'"
      >{{ TEXT.title }}</span>
      <AppButton
        v-if="choice.open"
        variant="ghost"
        size="sm"
        data-testid="demo-reset"
        @click="reset"
      >
        {{ TEXT.reset }}
      </AppButton>
      <AppButton
        variant="ghost"
        size="sm"
        class="justify-center px-0"
        :class="choice.open ? 'w-(--control-h-sm)' : 'size-(--chip-h) rounded-full'"
        :aria-label="choice.open ? TEXT.collapse : TEXT.expand"
        :aria-expanded="choice.open"
        data-testid="demo-toggle"
        @click="toggle"
      >
        <component
          :is="choice.open ? ChevronDown : ChevronUp"
          :size="14"
          aria-hidden="true"
        />
      </AppButton>
    </div>
    <div
      v-if="choice.open"
      class="flex flex-col gap-3 overflow-y-auto p-3"
    >
      <section class="flex flex-col gap-2">
        <span class="text-(length:--text-caption) font-semibold text-muted-foreground">{{ TEXT.run }}</span>
        <div :class="rowClass">
          <label :for="ids.scenario">{{ TEXT.scenario }}</label>
          <span :class="inputClass">
            <select
              :id="ids.scenario"
              :class="selectClass"
              :value="choice.scenario"
              data-testid="demo-scenario"
              @change="onScenario"
            >
              <option
                v-for="name in NAMES"
                :key="name"
                :value="name"
              >
                {{ name }}
              </option>
            </select>
          </span>
        </div>
        <div :class="rowClass">
          <span>{{ TEXT.speed }}</span>
          <div
            role="group"
            :aria-label="TEXT.speed"
            class="inline-flex max-w-full flex-wrap overflow-hidden rounded-(--radius-md) border border-input bg-card"
          >
            <button
              v-for="speed in SPEEDS"
              :key="speed"
              type="button"
              :aria-pressed="choice.speed === speed"
              class="inline-flex h-(--control-h-sm) flex-none items-center gap-1.5 border-r border-border px-2 text-(length:--text-caption) font-semibold whitespace-nowrap last:border-r-0"
              :class="choice.speed === speed ? 'bg-(--primary-bg) text-primary-text' : 'text-muted-foreground'"
              :data-testid="`demo-speed-${speed}`"
              @click="apply({ speed })"
            >
              {{ `${speed}×` }}
            </button>
          </div>
        </div>
        <span class="text-(length:--text-caption) leading-(--lh-compact) text-subtle-foreground">{{ TEXT.startNote }}</span>
      </section>
      <section class="flex flex-col gap-2 border-t border-border pt-3">
        <span class="text-(length:--text-caption) font-semibold text-muted-foreground">{{ TEXT.testScreen }}</span>
        <div :class="rowClass">
          <label :for="ids.forceState">{{ TEXT.forceState }}</label>
          <span :class="inputClass">
            <select
              :id="ids.forceState"
              :class="selectClass"
              :value="choice.forceState"
              data-testid="demo-force-state"
              @change="onForceState"
            >
              <option value="">
                {{ TEXT.followRun }}
              </option>
              <option
                v-for="name in NAMES"
                :key="name"
                :value="name"
              >
                {{ name }}
              </option>
            </select>
          </span>
        </div>
        <label class="flex cursor-pointer items-center gap-2 text-(length:--text-caption) text-muted-foreground">
          <input
            type="checkbox"
            class="size-3.5 flex-none accent-(--primary)"
            :checked="choice.cpuBound"
            data-testid="demo-cpu"
            @change="apply({ cpuBound: !choice.cpuBound })"
          >{{ TEXT.cpuBound }}</label>
        <div :class="rowClass">
          <label :for="ids.errorKind">{{ TEXT.errorKind }}</label>
          <span :class="inputClass">
            <select
              :id="ids.errorKind"
              :class="selectClass"
              :value="choice.errorKind"
              data-testid="demo-error-kind"
              @change="onErrorKind"
            >
              <option
                v-for="kind in ERROR_KINDS"
                :key="kind"
                :value="kind"
              >
                {{ kind }}
              </option>
            </select>
          </span>
        </div>
        <div :class="rowClass">
          <label :for="ids.timer">{{ TEXT.timerResolution }}</label>
          <span :class="inputClass">
            <select
              :id="ids.timer"
              :class="selectClass"
              :value="String(choice.timerResolutionMs)"
              data-testid="demo-timer"
              @change="onTimer"
            >
              <option
                v-for="resolution in RESOLUTIONS"
                :key="resolution"
                :value="String(resolution)"
              >
                {{ `${resolution} ms` }}
              </option>
            </select>
          </span>
        </div>
      </section>
    </div>
  </aside>
</template>
