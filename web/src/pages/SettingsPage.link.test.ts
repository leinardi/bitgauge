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

// @vitest-environment jsdom

// Settings under a link's parameters (ui/flows.md section 9): a field a parameter sets shows the
// link's value marked "from the link"; an edit is stored, drops the parameters that govern the
// field from the page load and the address, and the Test screen, reached without a reload, runs
// with the edit.

import { DOMWrapper, flushPromises, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Router } from 'vue-router'

import { getInfo } from '@/api/info'
import { infoFixture } from '@/test/fixtures'

vi.mock('@/api/info', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/info')>()),
  getInfo: vi.fn(),
}))

const LINK = 'preset=quick&streams=2&cap=200MB&units=bytes&theme=dark&lang=en'

class StubWorker extends EventTarget {
  static started: StubWorker[] = []
  readonly posted: unknown[] = []

  constructor() {
    super()
    StubWorker.started.push(this)
  }

  postMessage(message: unknown): void {
    this.posted.push(message)
  }

  terminate(): void {}
}

function stored(): Record<string, unknown> {
  return JSON.parse(localStorage.getItem('bitgauge.settings.v1') ?? '{}') as Record<string, unknown>
}

/** The application at Settings, opened from the link, as a fresh page load. */
async function openFromLink(link = LINK, info = infoFixture()): Promise<{ app: VueWrapper; router: Router }> {
  window.history.replaceState(null, '', `/settings?${link}`)
  vi.resetModules()
  vi.stubGlobal('Worker', StubWorker)
  vi.mocked(getInfo).mockResolvedValue(info)
  const { useInfo } = await import('@/composables/useInfo')
  await useInfo().refresh()
  const { RouterView } = await import('vue-router')
  const { mountApp } = await import('@/test/mount')
  const app = await mountApp(RouterView, `/settings?${link}`, { attachTo: document.body })
  await flushPromises()
  return { app, router: app.vm.$router }
}

function query(router: Router): string[] {
  return Object.keys(router.currentRoute.value.query).sort()
}

/** The setting row around `id`: the closest element that holds the row's title too. */
function row(app: VueWrapper, id: string, title: string): DOMWrapper<Element> {
  let found: Element | null = app.get(id).element
  while (found !== null && !(found.textContent ?? '').includes(title)) {
    found = found.parentElement
  }
  return new DOMWrapper(found as Element)
}

async function streams(app: VueWrapper, count: number): Promise<void> {
  const input = app.get('input[aria-label="Streams"]')
  await input.setValue(String(count))
  await input.trigger('blur')
  await flushPromises()
}

function option(app: VueWrapper, group: string, label: string): DOMWrapper<Element> {
  const radio = app.get(`[aria-label="${group}"]`).findAll('[role="radio"]').find((item) => item.text() === label)
  if (radio === undefined) {
    throw new Error(`no ${label} in ${group}`)
  }
  return radio
}

/** The Test screen, reached without a reload, with the configure its Worker was last sent. */
async function toTest(router: Router): Promise<{ settings: Record<string, unknown>; override?: Record<string, unknown> }> {
  await router.push('/')
  await flushPromises()
  return StubWorker.started.at(-1)?.posted.at(-1) as { settings: Record<string, unknown>; override?: Record<string, unknown> }
}

async function type(app: VueWrapper, id: string, value: string): Promise<void> {
  const input = app.get(id)
  await input.setValue(value)
  await input.trigger('blur')
  await flushPromises()
}

beforeEach(() => {
  localStorage.clear()
  // The stored preset differs from the link's.
  localStorage.setItem('bitgauge.settings.v1', JSON.stringify({ preset: 'extended' }))
  StubWorker.started = []
})

afterEach(() => {
  document.body.innerHTML = ''
  window.history.replaceState(null, '', '/')
})

describe('a field the link sets', () => {
  it('shows the link value, marked from the link', async () => {
    const { app } = await openFromLink()
    expect(app.get('[data-testid="preset-quick"]').attributes('aria-checked')).toBe('true')
    expect(app.get('[data-testid="preset-quick"]').text()).toContain('from the link')
    expect(option(app, 'Units', 'Bytes · MB/s').attributes('aria-checked')).toBe('true')
    expect((app.get('#settings-cap').element as HTMLInputElement).value).toBe('200')
    expect(row(app, '#settings-cap', 'Data cap').text()).toContain('from the link')
    // Changed rows describe the same effective values as the fields (QA-139).
    expect(app.get('[data-testid="changed-preset"]').text()).toContain('Quick')
    expect(app.get('[data-testid="changed-dataCapBytes"]').text()).toContain('200 MB')
    expect(app.find('[data-testid="changed-download"]').exists()).toBe(false)
    app.unmount()
  })
})

describe('the ping count caption under a link preset', () => {
  // The server runs Quick by default, with its own ping count.
  const base = infoFixture()
  const quick15 = { ...base, defaults: { ...base.defaults, preset: 'quick' as const, pingCount: 15 } }

  async function caption(app: VueWrapper): Promise<string> {
    await app.findAll('button').find((button) => button.text().startsWith('Advanced'))?.trigger('click')
    return app.text()
  }

  it('names the link preset’s own default over the server’s preset', async () => {
    localStorage.clear()
    const { app } = await openFromLink('preset=standard', quick15)
    expect(await caption(app)).toContain('Used for idle latency and jitter. Preset default: 20.')
    app.unmount()
  })

  it('names the server’s default when the link sets the server’s preset over another stored one', async () => {
    localStorage.setItem('bitgauge.settings.v1', JSON.stringify({ preset: 'standard' }))
    const { app } = await openFromLink('preset=quick', quick15)
    expect(await caption(app)).toContain('Used for idle latency and jitter. Server default: 15.')
    app.unmount()
  })
})

describe('an edit under the link preset', () => {
  it('stores the download maximum, the link preset with it, and drops only preset', async () => {
    const { app, router } = await openFromLink()
    await type(app, '#settings-download-max', '8')
    expect(stored()).toMatchObject({ preset: 'quick', download: { minMs: 5000, maxMs: 8000 } })
    expect(query(router)).toEqual(['cap', 'lang', 'streams', 'theme', 'units'])
    expect(app.get('[data-testid="preset-quick"]').text()).not.toContain('from the link')
    const configure = await toTest(router)
    expect(configure.settings).toMatchObject({ preset: 'quick', download: { minMs: 5000, maxMs: 8000 }, pingCount: 10 })
    expect(configure.override).not.toHaveProperty('preset')
    expect(configure.override).toMatchObject({ units: 'bytes', dataCapBytes: 200_000_000 })
    app.unmount()
  })

  it('stores the ping count, and drops only preset', async () => {
    const { app, router } = await openFromLink()
    await app.findAll('button').find((button) => button.text().startsWith('Advanced'))?.trigger('click')
    await type(app, '#settings-pings', '30')
    expect(stored()).toMatchObject({ preset: 'quick', pingCount: 30 })
    expect(query(router)).toEqual(['cap', 'lang', 'streams', 'theme', 'units'])
    const configure = await toTest(router)
    expect(configure.settings).toMatchObject({ preset: 'quick', pingCount: 30 })
    expect(configure.override).not.toHaveProperty('preset')
    expect(app.get('[data-testid="settings-summary"]').text()).toContain('Quick')
    app.unmount()
  })

  it('stores the stream count, and drops streams and preset', async () => {
    const { app, router } = await openFromLink()
    await streams(app, 4)
    expect(stored()).toMatchObject({ preset: 'quick', streams: { mode: 'fixed', fixed: 4 } })
    expect(query(router)).toEqual(['cap', 'lang', 'theme', 'units'])
    app.unmount()
  })
})

describe('an edit of each field, then the Test screen without a reload', () => {
  it('runs with the stored values, the parameters gone from the address', async () => {
    const { app, router } = await openFromLink()
    await option(app, 'Units', 'Bits · Mbit/s').trigger('click')
    await flushPromises()
    expect(query(router)).toEqual(['cap', 'lang', 'preset', 'streams', 'theme'])
    await type(app, '#settings-cap', '300')
    await option(app, 'Theme', 'Light').trigger('click')
    await flushPromises()
    expect(document.documentElement.dataset.theme).toBe('light')
    await streams(app, 1)
    await app.get('[data-testid="preset-standard"]').trigger('click')
    await flushPromises()
    expect(query(router)).toEqual(['lang'])
    // English is the only shipped language, so choosing it stores the link's own language.
    const trigger = app.get('[aria-label="Language"]')
    await trigger.trigger('keydown', { key: 'Enter' })
    await flushPromises()
    await new DOMWrapper(document.body).get('[role="option"]').trigger('keydown', { key: 'Enter' })
    await flushPromises()
    expect(query(router)).toEqual([])
    expect(stored()).toMatchObject({ lang: 'en' })
    expect(document.documentElement.lang).toBe('en')
    expect(stored()).toMatchObject({ theme: 'light', dataCapBytes: 300_000_000, streams: { mode: 'fixed', fixed: 1 } })
    // Standard and bits are the server's defaults, so neither is stored.
    expect(stored()).not.toHaveProperty('units')
    expect(stored()).not.toHaveProperty('preset')

    await router.push('/')
    await flushPromises()
    const worker = StubWorker.started.at(-1)
    const configure = worker?.posted.at(-1) as { settings: Record<string, unknown>; override?: Record<string, unknown> }
    expect(configure.settings).toMatchObject({ preset: 'standard', units: 'bits', dataCapBytes: 300_000_000, streams: { mode: 'fixed', fixed: 1 } })
    expect(configure.override ?? {}).toEqual({})
    const summary = app.get('[data-testid="settings-summary"]').text()
    expect(summary).toContain('2 changed:')
    expect(summary).toContain('1 stream')
    expect(summary).toMatch(/Cap 300\s*MB/)
    expect(router.currentRoute.value.query).toEqual({})
    expect(document.documentElement.dataset.theme).toBe('light')
    app.unmount()
  })
})

describe('a field returned to its default under the link', () => {
  it('lists URL-only values and resets one without persisting unrelated overrides (QA-139)', async () => {
    localStorage.clear()
    const { app, router } = await openFromLink('preset=extended&streams=2&cap=200MB&units=bytes&label=FromURL')
    expect(app.get('[data-testid="changed-label"]').text()).toContain('FromURL')
    expect(app.findAll('[data-testid^="changed-"]')).toHaveLength(5)
    expect(stored()).toEqual({})
    await app.get('[data-testid="changed-dataCapBytes"] button').trigger('click')
    await flushPromises()
    expect(query(router)).toEqual(['label', 'preset', 'streams', 'units'])
    expect(app.find('[data-testid="changed-dataCapBytes"]').exists()).toBe(false)
    expect(stored()).toEqual({})
    app.unmount()
  })

  it('counts no difference for default-valued links but can clear hidden stored values', async () => {
    localStorage.setItem('bitgauge.settings.v1', JSON.stringify({ units: 'bytes', runLengthS: 3600 }))
    const { app, router } = await openFromLink('units=bits')
    expect(app.find('[data-testid="changed-units"]').exists()).toBe(false)
    const reset = app.findAll('button').find((button) => button.text() === 'Reset all to defaults')!
    expect(reset.attributes('disabled')).toBeUndefined()
    await reset.trigger('click')
    await flushPromises()
    const dialog = new DOMWrapper(document.body).get('[role="alertdialog"]')
    expect(dialog.text()).toContain('Units')
    expect(dialog.text()).toContain('Run length')
    await dialog.findAll('button').find((button) => button.text() === 'Cancel')!.trigger('click')
    await flushPromises()
    expect(stored()).toEqual({ units: 'bytes', runLengthS: 3600 })
    expect(query(router)).toEqual(['units'])
    app.unmount()
  })

  it('switching the run length off drops duration and preset, and the run has no run length', async () => {
    const { app, router } = await openFromLink('preset=continuous&test=upload&duration=3600')
    await app.get('[role="switch"][aria-label="Stop after a set time"]').trigger('click')
    await flushPromises()
    expect(query(router)).toEqual(['test'])
    expect(stored()).toMatchObject({ preset: 'continuous' })
    expect(stored()).not.toHaveProperty('runLengthS')
    const configure = await toTest(router)
    expect(configure.settings).not.toHaveProperty('runLengthMs')
    expect(configure.override).toEqual({ continuousDirection: 'upload' })
    app.unmount()
  })

  it('restoring the theme drops the theme parameter, and the stored choice applies', async () => {
    localStorage.setItem('bitgauge.settings.v1', JSON.stringify({ theme: 'light' }))
    const { app, router } = await openFromLink('theme=light')
    expect(document.documentElement.dataset.theme).toBe('light')
    await app.get('[data-testid="changed-theme"] button').trigger('click')
    await flushPromises()
    expect(query(router)).toEqual([])
    expect(stored()).toEqual({})
    // System, with a system that states no light preference: dark.
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(app.text()).not.toContain('from the link')
    app.unmount()
  })

  it('Reset all drops every parameter: the server defaults apply', async () => {
    const { app, router } = await openFromLink()
    await app.findAll('button').find((button) => button.text() === 'Reset all to defaults')?.trigger('click')
    await flushPromises()
    await new DOMWrapper(document.body)
      .get('[role="alertdialog"]')
      .findAll('button')
      .find((button) => button.text() === 'Reset all')
      ?.trigger('click')
    await flushPromises()
    expect(query(router)).toEqual([])
    expect(stored()).toEqual({})
    expect(app.text()).not.toContain('from the link')
    expect(app.get('[data-testid="preset-standard"]').attributes('aria-checked')).toBe('true')
    const configure = await toTest(router)
    expect(configure.override ?? {}).toEqual({})
    expect(configure.settings).toMatchObject({ preset: 'standard', units: 'bits' })
    app.unmount()
  })
})
