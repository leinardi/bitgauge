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

import { useSettingsForm } from '@/components/settings/form'
import SettingInput from '@/components/settings/SettingInput.vue'
import SettingRow from '@/components/settings/SettingRow.vue'
import SettingSwitch from '@/components/settings/SettingSwitch.vue'
import { DEFAULT_AUTO_START, MAX_COUNTDOWN_S, MIN_COUNTDOWN_S } from '@/lib/settingsStorage'
import { wholeNumber } from '@/lib/urlValues'

// Auto-start (ui/screens.md section 4, kit Settings.jsx): off or on, with the countdown's length
// of 1–30 s. On, every load of the Test screen counts down to a run, as `run=1` does.

const { t } = useI18n()
const form = useSettingsForm()
const auto = computed(() => form.stored.value.autoStart ?? DEFAULT_AUTO_START)

const enabled = computed({
  get: () => auto.value.enabled,
  set: (next: boolean) => form.set({ autoStart: { ...auto.value, enabled: next } }),
})

function validate(text: string): string | null {
  return wholeNumber(text, MIN_COUNTDOWN_S, MAX_COUNTDOWN_S) === undefined ? t('settings.errors.range', { min: MIN_COUNTDOWN_S, max: MAX_COUNTDOWN_S }) : null
}
</script>

<template>
  <SettingRow
    :title="t('settings.autoStart.title')"
    :changed="form.changed.value.has('autoStart')"
  >
    <template #caption>
      <i18n-t
        keypath="settings.autoStart.caption"
        scope="global"
      >
        <template #param>
          <code class="font-mono">run=1</code>
        </template>
      </i18n-t>
    </template>
    <div class="flex items-start gap-2.5">
      <div class="flex h-(--input-h) items-center">
        <SettingSwitch
          v-model="enabled"
          :label="t('settings.autoStart.switch')"
        />
      </div>
      <SettingInput
        id="settings-countdown"
        :value="String(auto.countdownS)"
        :label="t('settings.autoStart.countdown')"
        :suffix="t('settings.values.secondsUnit')"
        :validate="validate"
        :disabled="!enabled"
        mono
        class="w-24"
        @commit="form.set({ autoStart: { ...auto, countdownS: Number($event) } })"
      />
    </div>
  </SettingRow>
</template>
