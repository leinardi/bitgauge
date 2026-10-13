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
import { useRouter } from 'vue-router'

import BasePathError from '@/components/BasePathError.vue'
import AppHeader from '@/components/layout/AppHeader.vue'
import TabBar from '@/components/layout/TabBar.vue'
import { useInfo } from '@/composables/useInfo'
import { useTheme } from '@/composables/useTheme'

// The application frame: the skip link to the page's main content (ui/i18n-a11y.md section 2.3), the
// header on every screen, the route's page, and the tab bar on narrow screens (ui/README.md). A
// base-path mismatch replaces all of it with its error screen (edge-cases.md section 20). The
// page's own path, as it was before the router started, is checked before anything renders, so a
// page that fails it starts nothing.

const props = defineProps<{ pagePath: string }>()

useTheme()
const router = useRouter()
const { load, mismatch } = useInfo()
void load(props.pagePath, (path) => router.resolve(path).matched.length > 0)
</script>

<template>
  <BasePathError
    v-if="mismatch !== null"
    :mismatch="mismatch"
  />
  <div
    v-else
    class="flex min-h-dvh flex-col bg-background font-sans text-foreground"
  >
    <a
      href="#main"
      class="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-(--radius-sm) focus:bg-background focus:px-3 focus:py-2 focus:text-(length:--text-base) focus:ring-3 focus:ring-ring/50"
      data-testid="skip-link"
    >{{ $t('a11y.skip') }}</a>
    <AppHeader />
    <RouterView />
    <TabBar />
  </div>
</template>
