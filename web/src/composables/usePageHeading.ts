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

import { onMounted, shallowRef, watch, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import { isNavigationFailure, type NavigationFailure, type RouteLocationNormalized, START_LOCATION } from 'vue-router'

import { moveFocus } from '@/lib/focus'

// Each route's title and the focus after an in-app navigation (ui/i18n-a11y.md section 2.3, D-16):
// a navigation that lands and changes the route's path or name is counted; its page, once it has
// rendered what its heading names, focuses its h1 once. The first page load and a change of the
// query string alone (a filter, a sort, a Settings edit dropping a URL parameter) count nothing, so
// they move neither the focus nor the title. A newer navigation replaces the count, so a page still
// loading for an older one never takes the focus.

/** The navigations counted so far; 0 until the first one after the page load. */
const navigation = shallowRef(0)
/** The navigation whose page has focused its heading. */
let focused = 0

/** The router's afterEach: counts a navigation that landed on another path or route. */
export function countNavigation(to: RouteLocationNormalized, from: RouteLocationNormalized, failure?: NavigationFailure | void): void {
  if (isNavigationFailure(failure) || from === START_LOCATION || (to.path === from.path && to.name === from.name)) {
    return
  }
  navigation.value += 1
}

/**
 * The page's heading takes the focus once after the navigation that brought it, when `ready` says
 * the page shows what the heading names (the Result detail once its result has loaded).
 */
export function usePageHeading(heading: () => Element | null | undefined, ready: () => boolean = () => true): void {
  function focus(): void {
    const current = navigation.value
    if (current === 0 || current === focused || !ready()) {
      return
    }
    const element = heading()
    if (element !== null && element !== undefined) {
      focused = current
      moveFocus(element)
    }
  }
  // Once rendered, and again whenever the count, the readiness or the heading changes after a render.
  onMounted(focus)
  watch([navigation, ready, heading], focus, { flush: 'post' })
}

/** The document's title, "<page> · BitGauge", following the page's name as it changes. */
export function usePageTitle(page: () => string): void {
  const { t } = useI18n()
  watchEffect(() => {
    document.title = t('app.pageTitle', { page: page() })
  })
}
