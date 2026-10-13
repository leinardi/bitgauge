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

import '@/styles/index.css'

import { createApp } from 'vue'

import App from '@/App.vue'
import { createAppI18n } from '@/i18n'
import { appHistory, createAppRouter } from '@/router'

// The page's own path, for the base-path check: read before the router's history, which rewrites
// the address under the base path as it starts (edge-cases.md section 20).
const pagePath = window.location.pathname

createApp(App, { pagePath })
  .use(createAppRouter(appHistory(document)))
  .use(createAppI18n(window.location.search, navigator.languages))
  .mount('#app')
