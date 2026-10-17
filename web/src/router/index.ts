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

import { createRouter, createWebHistory, type Router, type RouterHistory } from 'vue-router'

import TestPage from '@/pages/TestPage.vue'
import { readBasePath } from '@/router/base'

// The SPA's fixed routes (ui/README.md, compatibility.md section 1.5), in HTML5 history mode under
// the base path. The server answers index.html for these paths only. History and Result detail
// render the not-available page until their screens land (ui/screens.md section 1).

const NotAvailablePage = () => import('@/pages/NotAvailablePage.vue')

/** The router over a history; the application passes HTML5 history under the base path. */
export function createAppRouter(history: RouterHistory): Router {
  return createRouter({
    history,
    routes: [
      { path: '/', name: 'test', component: TestPage },
      { path: '/about', name: 'about', component: () => import('@/pages/AboutPage.vue') },
      { path: '/history', name: 'history', component: NotAvailablePage },
      { path: '/settings', name: 'settings', component: () => import('@/pages/SettingsPage.vue') },
      { path: '/result/:id', name: 'result', component: NotAvailablePage },
    ],
  })
}

/** HTML5 history under the base path of the page's meta element. */
export function appHistory(doc: Document): RouterHistory {
  return createWebHistory(readBasePath(doc))
}
