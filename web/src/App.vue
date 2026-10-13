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
import { onMounted } from 'vue'

import AppHeader from '@/components/layout/AppHeader.vue'
import TabBar from '@/components/layout/TabBar.vue'
import { useInfo } from '@/composables/useInfo'
import { useTheme } from '@/composables/useTheme'

// The application frame: the header on every screen, the route's page, and the tab bar on narrow
// screens (ui/README.md).

useTheme()
const { refresh } = useInfo()
onMounted(() => {
  void refresh()
})
</script>

<template>
  <div class="flex min-h-dvh flex-col bg-background font-sans text-foreground">
    <AppHeader />
    <RouterView />
    <TabBar />
  </div>
</template>
