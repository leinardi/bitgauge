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
import { CircleAlert } from '@lucide/vue'

// The kit's FieldError (design_system/components/forms Input.jsx, forms.css `.fmsg`): an inline
// field error its input names with aria-describedby; the input keeps focus.

defineProps<{ id: string }>()
</script>

<template>
  <span
    :id="id"
    class="flex max-w-80 items-start gap-1.5 text-(length:--text-caption) leading-(--lh-compact) text-(--danger-fg)"
  >
    <CircleAlert
      :size="12"
      class="mt-0.5 shrink-0"
      aria-hidden="true"
    />
    <slot />
  </span>
</template>
