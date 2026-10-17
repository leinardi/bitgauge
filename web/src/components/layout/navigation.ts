/*
 * This file is part of BitGauge.
 *
 * Copyright (c) 2026 Roberto Leinardi
 *
 * BitGauge is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * BitGauge is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with BitGauge.  If not, see <http://www.gnu.org/licenses/>.
 */

import { Gauge, History, Info, Monitor, Moon, SlidersHorizontal, Sun } from '@lucide/vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'

import type { ThemeChoice } from '@/composables/useTheme'

// The navigation and theme choices shared by the header and the tab bar (design_system kit
// Nav.jsx): Test, History, Settings and About (ui/screens.md section 1). The current item is the
// route's, and History on a Result detail, which the kit's Nav marks so.

export function useNavigation() {
  const { t } = useI18n()
  const items = computed(() => [
    { name: 'test', to: '/', label: t('app.nav.test'), icon: Gauge },
    { name: 'history', to: '/history', label: t('app.nav.history'), icon: History },
    { name: 'settings', to: '/settings', label: t('app.nav.settings'), icon: SlidersHorizontal },
    { name: 'about', to: '/about', label: t('app.nav.about'), icon: Info },
  ])
  const themes = computed(() => [
    { choice: 'light' as ThemeChoice, label: t('app.theme.light'), icon: Sun },
    { choice: 'dark' as ThemeChoice, label: t('app.theme.dark'), icon: Moon },
    { choice: 'system' as ThemeChoice, label: t('app.theme.system'), icon: Monitor },
  ])
  const route = useRoute()
  const current = computed(() => (route.name === 'result' ? 'history' : route.name))
  return { items, themes, current }
}
