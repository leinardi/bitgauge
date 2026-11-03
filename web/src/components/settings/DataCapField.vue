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
import { computed, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'

import { useSettingsForm } from '@/components/settings/form'
import SettingInput from '@/components/settings/SettingInput.vue'
import SettingRow from '@/components/settings/SettingRow.vue'
import SettingSwitch from '@/components/settings/SettingSwitch.vue'
import { MAX_CAP_MB, MB, MIN_CAP_MB } from '@/lib/settingsStorage'
import { wholeNumber } from '@/lib/urlValues'

// The data cap per test (ui/screens.md section 4, kit Settings.jsx): none, or a whole number of
// decimal megabytes from 2 to 100000. A server default that is not a whole number of MB shows with
// up to three decimals until the user changes it; typed back as shown, it is kept. Switched off, the field keeps the last size, the
// kit's 500 MB at first, for when it is switched on again.

const FIRST_MB = 500

const { t } = useI18n()
const form = useSettingsForm()
const cap = computed(() => form.current.value.dataCapBytes)
const last = shallowRef(cap.value === null ? FIRST_MB * MB : cap.value)

const on = computed({
  get: () => cap.value !== null,
  set: (next: boolean) => form.set({ dataCapBytes: next ? last.value : null }),
})
const shown = computed(() => String(Number(((cap.value ?? last.value) / MB).toFixed(3))))

// A size that is not a whole number of MB, typed back as shown, is no change: it stays.
function unchanged(text: string): boolean {
  return cap.value !== null && cap.value % MB !== 0 && text === shown.value
}

function validate(text: string): string | null {
  if (unchanged(text)) {
    return null
  }
  return wholeNumber(text, MIN_CAP_MB, MAX_CAP_MB) === undefined ? t('settings.errors.range', { min: MIN_CAP_MB, max: MAX_CAP_MB }) : null
}

function commit(text: string): void {
  if (unchanged(text)) {
    return
  }
  last.value = Number(text) * MB
  form.set({ dataCapBytes: last.value })
}
</script>

<template>
  <SettingRow
    :title="t('settings.cap.title')"
    :caption="t('settings.cap.caption')"
    :changed="form.changed.value.has('dataCapBytes')"
    :linked="form.linked.value.has('dataCapBytes')"
  >
    <div class="flex items-start gap-2.5">
      <div class="flex h-(--input-h) items-center">
        <SettingSwitch
          v-model="on"
          :label="t('settings.cap.switch')"
        />
      </div>
      <SettingInput
        id="settings-cap"
        :value="shown"
        :label="t('settings.cap.input')"
        :suffix="t('settings.values.megabytesUnit')"
        :validate="validate"
        :disabled="!on"
        mono
        class="w-27.5"
        @commit="commit"
      />
    </div>
  </SettingRow>
</template>
