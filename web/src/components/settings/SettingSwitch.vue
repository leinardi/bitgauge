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
import { Switch } from '@/components/ui/switch'

// The kit's Switch (design_system/components/forms Switch.jsx, forms.css `.switch`) on the
// shadcn-vue switch: an on/off setting, its knob moving to the right and filling when on. The
// knob's colors are stated as important, since the vendored knob's own follow the system theme.

defineProps<{ label: string }>()
const checked = defineModel<boolean>({ required: true })
</script>

<template>
  <Switch
    v-model="checked"
    :aria-label="label"
    class="h-(--switch-h) w-(--switch-w) border-(--border-default) px-0.5 shadow-none data-[state=checked]:border-primary data-[state=checked]:bg-primary! data-[state=unchecked]:bg-(--surface-4)! [&>span]:size-(--switch-knob) [&>span]:bg-(--fg-subtle)! data-[state=checked]:[&>span]:translate-x-[calc(var(--switch-w)-var(--switch-knob)-2*var(--space-0-5)-2*var(--border-width))] data-[state=checked]:[&>span]:bg-(--fg-on-solid)!"
  />
</template>
