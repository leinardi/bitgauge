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
import 'vue-sonner/style.css'

import { defineAsyncComponent } from 'vue'
import { useRouter } from 'vue-router'

import BasePathError from '@/components/BasePathError.vue'
import AppHeader from '@/components/layout/AppHeader.vue'
import TabBar from '@/components/layout/TabBar.vue'
import { Toaster } from '@/components/ui/sonner'
import { useInfo } from '@/composables/useInfo'
import { useTheme } from '@/composables/useTheme'

// The application frame: the skip link to the page's main content (ui/i18n-a11y.md section 2.3), the
// header on every screen, the route's page, the tab bar on narrow screens (ui/README.md) and the
// toaster for the toasts an action confirms with (the kit's Toast inside vue-sonner, through the
// vendored primitive). A
// base-path mismatch replaces all of it with its error screen (edge-cases.md section 20). The
// page's own path, as it was before the router started, is checked before anything renders, so a
// page that fails it starts nothing. A demo build adds its panel over every screen (frontend.md
// section 9), loaded behind a flag that a production build drops, with the panel, as dead code.

const props = defineProps<{ pagePath: string }>()

// The toaster follows the applied theme, so vue-sonner's own theme rules match the page's.
const { applied } = useTheme()
const router = useRouter()
const { load, mismatch } = useInfo()
void load(props.pagePath, (path) => router.resolve(path).matched.length > 0)
// The kit's ToastRegion: bottom right, the page's own inset from its edges, above the tab bar where
// the layout has one (design_system/components/feedback feedback.css .toast-region).
const TOAST_OFFSET = { bottom: 'var(--toast-bottom)', right: 'var(--space-4)', left: 'var(--space-4)' }
const DemoPanel = import.meta.env.VITE_DEMO ? defineAsyncComponent(() => import('@/demo/DemoPanel.vue')) : null
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
    <Toaster
      :theme="applied"
      :container-aria-label="$t('a11y.notifications')"
      :style="{ '--width': 'var(--toast-w)' }"
      :offset="TOAST_OFFSET"
      :mobile-offset="TOAST_OFFSET"
      class="[--toast-bottom:calc(var(--tabbar-h)+var(--space-3))] desktop:[--toast-bottom:var(--space-4)]"
    />
  </div>
  <component
    :is="DemoPanel"
    v-if="DemoPanel !== null"
  />
</template>
