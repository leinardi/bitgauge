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

import { mount } from '@vue/test-utils'
import { vi } from 'vitest'
import type { Component } from 'vue'
import { createMemoryHistory } from 'vue-router'

import { createAppI18n } from '@/i18n'
import { createAppRouter } from '@/router'

// Mounts a component with the application's i18n and router, on a memory history at `path`. jsdom
// has no matchMedia, which the theme reads: a query that never matches stands in.

export async function mountApp(component: Component, path = '/') {
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => undefined }))
  const router = createAppRouter(createMemoryHistory())
  await router.push(path)
  return mount(component, { global: { plugins: [router, createAppI18n('', ['en'])] } })
}
