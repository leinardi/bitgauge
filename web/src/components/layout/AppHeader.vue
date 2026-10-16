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
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'

import BrandLogo from '@/components/brand/BrandLogo.vue'
import { useNavigation } from '@/components/layout/navigation'
import { useInfo } from '@/composables/useInfo'
import { useTheme } from '@/composables/useTheme'

// The persistent header (ui/screens.md section 1, design_system kit Nav.jsx): the server's name,
// the page's host and the reachability dot with its text; the navigation and the theme control on
// wide screens, a theme button on narrow ones, where the tab bar navigates.

const { t } = useI18n()
const route = useRoute()
const { info, reachability } = useInfo()
const theme = useTheme()
const { items, themes } = useNavigation()

const host = window.location.host
const down = computed(() => reachability.value === 'unreachable')
const known = computed(() => reachability.value !== 'unknown')
const serverName = computed(() => info.value?.server.name ?? '')
const dotTitle = computed(() => (down.value ? t('app.server.unreachable') : t('app.server.connected')))
const stateText = computed(() => (down.value ? t('app.server.stateUnreachable') : t('app.server.stateConnected')))
const current = computed(() => themes.value.find((option) => option.choice === theme.choice.value) ?? themes.value[2])

// The live region announces changes only: the first answer after loading is silent.
const announcement = ref('')
watch(reachability, (_now, before) => {
  if (before !== 'unknown') {
    announcement.value = dotTitle.value
  }
})

function cycleTheme(): void {
  const index = themes.value.findIndex((option) => option.choice === theme.choice.value)
  const next = themes.value[(index + 1) % themes.value.length]
  if (next !== undefined) {
    theme.setTheme(next.choice)
  }
}
</script>

<template>
  <header class="flex h-14 items-center border-b border-border bg-background text-foreground max-desktop:hidden">
    <div class="mx-auto flex max-w-(--layout-max) flex-1 items-center gap-5 px-10">
      <RouterLink
        to="/"
        :aria-label="t('app.brand.home')"
        class="flex items-center gap-2 text-(length:--text-lg) leading-(--lh-tight) font-semibold tracking-(--tracking-tight) text-foreground no-underline"
      >
        <BrandLogo :size="28" />
        <span>{{ t('app.brand.bit') }}<span class="text-primary-text">{{ t('app.brand.gauge') }}</span></span>
      </RouterLink>
      <span
        class="h-5 w-px bg-input"
        aria-hidden="true"
      />
      <div
        v-if="known"
        :title="dotTitle"
        class="flex min-w-0 items-center gap-2"
        data-testid="server"
      >
        <span
          aria-hidden="true"
          class="size-1.75 flex-none rounded-full"
          :class="down ? 'border-(length:--border-width-strong) border-(--warn) bg-transparent' : 'bg-(--ok)'"
        />
        <span class="text-(length:--text-sm) font-medium">{{ serverName }}</span>
        <span class="sr-only">{{ stateText }}</span>
        <span
          v-if="down"
          aria-hidden="true"
          class="text-(length:--text-caption) font-medium text-(--warn-fg)"
        >{{ t('app.server.unreachableTag') }}</span>
        <span class="font-mono text-(length:--text-caption) text-subtle-foreground">{{ host }}</span>
      </div>
      <span
        class="sr-only"
        role="status"
        aria-live="polite"
      >{{ announcement }}</span>
      <nav
        :aria-label="t('app.nav.label')"
        class="ml-auto flex gap-0.5"
      >
        <RouterLink
          v-for="item in items"
          :key="item.name"
          :to="item.to"
          :aria-current="route.name === item.name ? 'page' : undefined"
          class="flex h-8 items-center gap-1.75 rounded-(--radius-md) px-3 text-(length:--text-sm) no-underline"
          :class="route.name === item.name ? 'bg-muted font-semibold text-foreground' : 'font-medium text-muted-foreground hover:bg-muted hover:text-foreground'"
        >
          <component
            :is="item.icon"
            :size="15"
            aria-hidden="true"
          />
          {{ item.label }}
        </RouterLink>
      </nav>
      <div
        role="radiogroup"
        :aria-label="t('app.theme.label')"
        class="inline-flex h-7.5 overflow-hidden rounded-(--radius-md) border border-input bg-(--surface-1)"
      >
        <button
          v-for="option in themes"
          :key="option.choice"
          type="button"
          role="radio"
          :aria-checked="theme.choice.value === option.choice"
          :aria-label="option.label"
          class="inline-flex h-7 items-center gap-1.5 border-r border-border px-2 text-(length:--text-caption) font-semibold last:border-r-0"
          :class="theme.choice.value === option.choice ? 'bg-(--primary-bg) text-primary-text' : 'text-muted-foreground'"
          @click="theme.setTheme(option.choice)"
        >
          <component
            :is="option.icon"
            :size="14"
            aria-hidden="true"
          />
        </button>
      </div>
    </div>
  </header>
  <header class="flex h-13 items-center gap-2.5 border-b border-border bg-background px-4 text-foreground desktop:hidden">
    <BrandLogo :size="26" />
    <div class="flex min-w-0 flex-col leading-(--lh-tight)">
      <span class="text-(length:--text-md) font-semibold tracking-(--tracking-tight)">{{ t('app.brand.bit') }}<span class="text-primary-text">{{ t('app.brand.gauge') }}</span></span>
      <span
        v-if="known"
        :title="dotTitle"
        class="flex items-center gap-1.25 text-(length:--text-micro) text-subtle-foreground"
      >
        <span
          aria-hidden="true"
          class="size-1.5 flex-none rounded-full"
          :class="down ? 'border-(length:--border-width-strong) border-(--warn) bg-transparent' : 'bg-(--ok)'"
        />
        {{ serverName }}
        <span class="sr-only">{{ stateText }}</span>
        <span class="min-w-0 truncate font-mono">{{ host }}</span>
        <span
          v-if="down"
          aria-hidden="true"
          class="font-medium text-(--warn-fg)"
        >{{ t('app.server.unreachableTagShort') }}</span>
      </span>
      <span
        class="sr-only"
        role="status"
        aria-live="polite"
      >{{ announcement }}</span>
    </div>
    <button
      type="button"
      :aria-label="t('app.theme.current', { theme: current?.label ?? '' })"
      class="ml-auto inline-flex size-11 items-center justify-center rounded-(--radius-md) text-(length:--text-sm) leading-(--lh-tight) text-muted-foreground hover:bg-muted hover:text-foreground"
      @click="cycleTheme"
    >
      <component
        :is="current?.icon"
        :size="18"
        aria-hidden="true"
      />
    </button>
  </header>
</template>
