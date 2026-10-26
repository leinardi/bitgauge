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
import { useNavigation } from '@/components/layout/navigation'

// The narrow-screen tab bar (ui/screens.md section 1, design_system kit Nav.jsx mobile-bottom):
// Test, History, Settings and About, the active one marked by a bar along its top edge. The bar is
// fixed, not sticky: Firefox for Android moves fixed elements with its dynamic toolbar but leaves a
// sticky one at the toolbar's old edge, so the bar floated above a gap or hid below the screen. The
// wrapper keeps its height in the page flow, so the last content still scrolls clear of it. It sits
// at --z-sticky, under the overlays, popovers and toasts, so a modal dialog covers it rather than
// the bar covering the dialog's actions (the export's --z-nav does; design-system-upstream.md).

const { items, current } = useNavigation()
</script>

<template>
  <div class="h-16 shrink-0 desktop:hidden">
    <nav
      :aria-label="$t('app.nav.label')"
      class="fixed inset-x-0 bottom-0 z-(--z-sticky) grid h-16 grid-cols-4 border-t border-border bg-(--surface-1) pb-1"
    >
      <RouterLink
        v-for="item in items"
        :key="item.name"
        :to="item.to"
        :aria-current="current === item.name ? 'page' : undefined"
        class="relative flex flex-col items-center justify-center gap-1 text-(length:--text-micro) no-underline"
        :class="current === item.name ? 'font-semibold text-primary-text' : 'font-medium text-subtle-foreground'"
      >
        <span
          v-if="current === item.name"
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
  </div>
</template>
