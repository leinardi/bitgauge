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
import SegmentedControl from '@/components/settings/SegmentedControl.vue'
import SettingRow from '@/components/settings/SettingRow.vue'
import type { TestSettings } from '@/engine/messages'

// The display units (ui/screens.md section 4, kit Settings.jsx): bits or bytes.

const { t } = useI18n()
const form = useSettingsForm()

const units = computed({
  get: () => form.current.value.units,
  set: (next: TestSettings['units']) => form.set({ units: next }),
})
const options = computed(() => [
  { value: 'bits' as const, label: t('settings.units.bits') },
  { value: 'bytes' as const, label: t('settings.units.bytes') },
])
</script>

<template>
  <SettingRow
    :title="t('settings.units.title')"
    :changed="form.changed.value.has('units')"
    :linked="form.linked.value.has('units')"
  >
    <SegmentedControl
      v-model="units"
      :options="options"
      :label="t('settings.units.title')"
    />
  </SettingRow>
</template>
