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
import { useI18n } from 'vue-i18n'

import { useSettingsForm } from '@/components/settings/form'
import SettingInput from '@/components/settings/SettingInput.vue'
import SettingRow from '@/components/settings/SettingRow.vue'
import { labelValue, MAX_LABEL } from '@/lib/urlValues'

// The result label (ui/screens.md section 4): at most 64 characters, empty by default, pre-filling
// the label of every result in this browser as the `label` URL parameter does for one page load.

const { t } = useI18n()
const form = useSettingsForm()

function validate(text: string): string | null {
  return labelValue(text) === undefined ? t('settings.errors.label', { max: MAX_LABEL }) : null
}
</script>

<template>
  <SettingRow
    :title="t('settings.label.title')"
    :caption="t('settings.label.caption', { max: MAX_LABEL })"
    :changed="form.changed.value.has('label')"
  >
    <SettingInput
      id="settings-label"
      :value="form.stored.value.label ?? ''"
      :label="t('settings.label.input')"
      :placeholder="t('settings.label.placeholder')"
      :validate="validate"
      inputmode="text"
      class="w-50"
      @commit="form.set({ label: $event })"
    />
  </SettingRow>
</template>
