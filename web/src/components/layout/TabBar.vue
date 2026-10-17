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
import { useRoute } from 'vue-router'

import { useNavigation } from '@/components/layout/navigation'

// The narrow-screen tab bar (ui/screens.md section 1, design_system kit Nav.jsx mobile-bottom):
// Test, History, Settings and About, the active one marked by a bar along its top edge.

const route = useRoute()
const { items } = useNavigation()
</script>

<template>
  <nav
    :aria-label="$t('app.nav.label')"
    class="sticky bottom-0 z-(--z-nav) grid h-16 grid-cols-4 border-t border-border bg-(--surface-1) pb-1 desktop:hidden"
  >
    <RouterLink
      v-for="item in items"
      :key="item.name"
      :to="item.to"
      :aria-current="route.name === item.name ? 'page' : undefined"
      class="relative flex flex-col items-center justify-center gap-1 text-(length:--text-micro) no-underline"
      :class="route.name === item.name ? 'font-semibold text-primary-text' : 'font-medium text-subtle-foreground'"
    >
      <span
        v-if="route.name === item.name"
        aria-hidden="true"
        class="absolute -top-px inset-x-(--tab-indicator-inset) h-0.5 rounded-xs bg-primary"
      />
      <component
        :is="item.icon"
        :size="20"
        aria-hidden="true"
      />
      {{ item.label }}
    </RouterLink>
  </nav>
</template>
