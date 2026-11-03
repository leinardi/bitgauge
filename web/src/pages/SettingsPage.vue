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
import { CircleAlert, CircleCheck, Gauge, Layers, Monitor } from '@lucide/vue'
import { computed, provide, shallowRef, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'

import OfflineNotice from '@/components/OfflineNotice.vue'
import AdvancedSection from '@/components/settings/AdvancedSection.vue'
import AutoStartField from '@/components/settings/AutoStartField.vue'
import ChangedList from '@/components/settings/ChangedList.vue'
import DataCapField from '@/components/settings/DataCapField.vue'
import DurationFields from '@/components/settings/DurationFields.vue'
import { SETTINGS_FORM, type SettingsForm } from '@/components/settings/form'
import LabelField from '@/components/settings/LabelField.vue'
import PhasesField from '@/components/settings/PhasesField.vue'
import PresetCards from '@/components/settings/PresetCards.vue'
import SettingsCard from '@/components/settings/SettingsCard.vue'
import ShareUrlField from '@/components/settings/ShareUrlField.vue'
import StreamsField from '@/components/settings/StreamsField.vue'
import ThemeLanguageField from '@/components/settings/ThemeLanguageField.vue'
import UnitsField from '@/components/settings/UnitsField.vue'
import { useInfo } from '@/composables/useInfo'
import { usePageHeading, usePageTitle } from '@/composables/usePageHeading'
import { useSettings } from '@/composables/useSettings'
import type { TestSettings } from '@/engine/messages'
import { settingsFromDefaults } from '@/lib/defaults'
import { changedKeys, defaultOf, storedOver, valueOf } from '@/lib/settingsStorage'

// The Settings screen (ui/screens.md section 4, design_system kit Settings.jsx): every change is
// saved in this browser as it is made and applies to the next test; a value that is not valid
// stays in its field, is not saved, and is counted in the header. The fields need the server's
// defaults, so they show once GET /info has answered.

const { t } = useI18n()
// Its title, and its heading's focus after an in-app navigation (ui/i18n-a11y.md section 2.3).
const heading = useTemplateRef<HTMLElement>('heading')
usePageHeading(() => heading.value)
usePageTitle(() => t('app.nav.settings'))
const { info, reachability, refresh } = useInfo()
const settings = useSettings()
const host = window.location.host

const serverDefaults = computed(() => (info.value === null ? null : settingsFromDefaults(info.value.defaults)))
const invalid = shallowRef<ReadonlySet<string>>(new Set())
// Continuous has no durations: its run length shows with the preset in their place.
const continuous = computed(() => serverDefaults.value !== null && storedOver(serverDefaults.value, settings.stored.value).preset === 'continuous')

function form(defaults: () => TestSettings): SettingsForm {
  return {
    defaults: computed(defaults),
    current: computed(() => storedOver(defaults(), settings.stored.value)),
    stored: settings.stored,
    changed: computed(() => new Set(changedKeys(defaults(), settings.stored.value))),
    valueOf: (key) => valueOf(key, defaults(), settings.stored.value),
    defaultOf: (key) => defaultOf(key, defaults(), settings.stored.value),
    set: (fields) => settings.set(fields, defaults()),
    reset: (keys) => settings.reset(keys, defaults()),
    resetAll: () => settings.resetAll(),
    invalid(id, value) {
      const next = new Set(invalid.value)
      if (value) {
        next.add(id)
      } else {
        next.delete(id)
      }
      invalid.value = next
    },
  }
}

// The fields render only with the defaults, so they always read a known value here.
provide(
  SETTINGS_FORM,
  form(() => serverDefaults.value as TestSettings),
)
</script>

<template>
  <main
    id="main"
    tabindex="-1"
    class="focus:outline-none mx-auto grid w-full max-w-(--layout-max) flex-1 grid-cols-1 content-start items-start gap-6 px-(--layout-gutter-compact) pt-4 pb-6 desktop:grid-cols-[minmax(0,1fr)_var(--layout-rail)] desktop:px-(--layout-gutter) desktop:pt-6 desktop:pb-12"
  >
    <div class="flex min-w-0 flex-col gap-4">
      <header class="flex flex-col gap-1.5">
        <h1
          ref="heading"
          class="text-(length:--text-3xl) leading-(--lh-normal) font-semibold tracking-(--tracking-tight) desktop:text-(length:--text-4xl)"
        >
          {{ t('settings.title') }}
        </h1>
        <div class="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-(length:--text-sm) text-subtle-foreground">
          <span
            v-if="invalid.size > 0"
            role="status"
            class="inline-flex items-center gap-1.25 text-(--danger-fg)"
          >
            <CircleAlert
              :size="14"
              aria-hidden="true"
            />
            {{ t('settings.notSaved', invalid.size) }}
          </span>
          <span
            v-else-if="settings.saved.value"
            role="status"
            class="inline-flex items-center gap-1.25 text-(--ok-fg)"
          >
            <CircleCheck
              :size="14"
              aria-hidden="true"
            />
            {{ t('settings.saved') }}
          </span>
          <span
            v-else
            role="status"
            class="inline-flex items-center gap-1.25 text-(--warn-fg)"
          >
            <CircleAlert
              :size="14"
              aria-hidden="true"
            />
            {{ t('settings.storageRefused') }}
          </span>
          <span>{{ t('settings.intro') }}</span>
        </div>
      </header>
      <OfflineNotice
        v-if="reachability === 'unreachable'"
        :host="host"
        @retry="refresh"
      />
      <p
        v-if="serverDefaults === null"
        class="text-(length:--text-sm) text-muted-foreground"
      >
        {{ t('settings.loading') }}
      </p>
      <template v-else>
        <SettingsCard
          id="settings-preset"
          :title="t('settings.preset.title')"
          :icon="Gauge"
          padded
        >
          <div class="flex flex-col gap-4">
            <PresetCards />
            <PhasesField />
          </div>
        </SettingsCard>
        <SettingsCard
          id="settings-connections"
          :title="t('settings.connections.title')"
          :icon="Layers"
        >
          <StreamsField />
          <DurationFields v-if="!continuous" />
          <DataCapField />
        </SettingsCard>
        <SettingsCard
          id="settings-display"
          :title="t('settings.display.title')"
          :icon="Monitor"
        >
          <LabelField />
          <UnitsField />
          <ThemeLanguageField />
          <AutoStartField />
        </SettingsCard>
        <AdvancedSection />
      </template>
    </div>
    <aside
      v-if="serverDefaults !== null"
      class="flex min-w-0 flex-col gap-4"
    >
      <ShareUrlField />
      <ChangedList />
    </aside>
  </main>
</template>
