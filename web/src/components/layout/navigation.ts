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

import { Gauge, Info, Monitor, Moon, Sun } from '@lucide/vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import type { ThemeChoice } from '@/composables/useTheme'

// The navigation and theme choices shared by the header and the tab bar (design_system kit
// Nav.jsx). v0.1 navigates to Test and About only (ui/screens.md section 1).

export function useNavigation() {
  const { t } = useI18n()
  const items = computed(() => [
    { name: 'test', to: '/', label: t('app.nav.test'), icon: Gauge },
    { name: 'about', to: '/about', label: t('app.nav.about'), icon: Info },
  ])
  const themes = computed(() => [
    { choice: 'light' as ThemeChoice, label: t('app.theme.light'), icon: Sun },
    { choice: 'dark' as ThemeChoice, label: t('app.theme.dark'), icon: Moon },
    { choice: 'system' as ThemeChoice, label: t('app.theme.system'), icon: Monitor },
  ])
  return { items, themes }
}
