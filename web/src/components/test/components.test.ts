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

// The Test screen's components: the notices for every v0.1 code with their tones and actions, the
// metric tile and its packet-loss slot, the phase indicator's states, and the start control.

import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import type { Component } from 'vue'

import MetricTile from '@/components/test/MetricTile.vue'
import NoticeList from '@/components/test/NoticeList.vue'
import { noticeView } from '@/components/test/notices'
import PhaseIndicator from '@/components/test/PhaseIndicator.vue'
import StartButton from '@/components/test/StartButton.vue'
import { directionTile, packetLossTile } from '@/components/test/tiles'
import type { Wording } from '@/components/test/wording'
import type { Notice, NoticeCode } from '@/engine/messages'
import { createAppI18n } from '@/i18n'
import notices from '@/i18n/locales/en/notices.json'
import { links } from '@/lib/links'

const i18n = () => createAppI18n('', ['en'])
const context: Wording = { t: i18n().global.t as unknown as Wording['t'], locale: 'en' }
const NB = '\u00a0'

function mountWith<T extends Component>(component: T, props: Record<string, unknown>) {
  return mount(component, { props, global: { plugins: [i18n()] } } as never)
}

// Every v0.1 code once; the record type makes a missing code a compile error.
const EVERY: Record<NoticeCode, Notice> = {
  'slow-link-extended': { code: 'slow-link-extended', direction: 'download' },
  'low-confidence': { code: 'low-confidence', direction: 'upload', reasons: ['insufficient-samples'] },
  'data-cap-reached': { code: 'data-cap-reached', direction: 'download' },
  'stream-limit': { code: 'stream-limit', direction: 'upload', streams: 3 },
  'insufficient-data': { code: 'insufficient-data', direction: 'download', offer: 'extended' },
  'url-parameter-ignored': { code: 'url-parameter-ignored', parameter: 'streams' },
  'stopped-early': { code: 'stopped-early', direction: 'upload', coveredMs: 3600 },
  'server-restarted': { code: 'server-restarted' },
  'server-unreachable': { code: 'server-unreachable' },
  'proxy-buffering-suspected': { code: 'proxy-buffering-suspected' },
  'upload-interrupted': { code: 'upload-interrupted' },
  'response-compression-detected': { code: 'response-compression-detected' },
  'overhead-compensation': { code: 'overhead-compensation', percent: 2.5 },
  'timer-throttling-detected': { code: 'timer-throttling-detected' },
  'page-hidden': { code: 'page-hidden' },
  'network-changed': { code: 'network-changed' },
  'websocket-reopened': { code: 'websocket-reopened' },
  'websocket-unavailable': { code: 'websocket-unavailable' },
  'base-path-mismatch': { code: 'base-path-mismatch' },
}

// ui/screens.md section 7.
const TONES: Record<NoticeCode, string> = {
  'slow-link-extended': 'info',
  'stream-limit': 'info',
  'overhead-compensation': 'info',
  'websocket-reopened': 'info',
  'websocket-unavailable': 'info',
  'low-confidence': 'warn',
  'data-cap-reached': 'warn',
  'insufficient-data': 'warn',
  'url-parameter-ignored': 'warn',
  'proxy-buffering-suspected': 'warn',
  'response-compression-detected': 'warn',
  'timer-throttling-detected': 'warn',
  'server-unreachable': 'danger',
  'upload-interrupted': 'danger',
  'base-path-mismatch': 'danger',
  'stopped-early': 'neutral',
  'server-restarted': 'neutral',
  'network-changed': 'neutral',
  'page-hidden': 'neutral',
}

describe('the notices', () => {
  it.each(Object.values(EVERY))('words $code from the catalog, in its tone', (notice) => {
    const view = noticeView(notice, context)
    expect(view.title).not.toMatch(/notices\.|\{/u)
    expect(view.body).not.toMatch(/notices\.|\{/u)
    // The catalog entry is named by the code in camelCase.
    const entry = notice.code.replace(/-(\w)/gu, (_match, letter: string) => letter.toUpperCase())
    expect(Object.keys(notices.notices)).toContain(entry)
    expect(view.title.length).toBeGreaterThan(0)
    expect(view.tone).toBe(TONES[notice.code])
    expect(view.actions.length).toBeLessThanOrEqual(2)
  })

  it('uses the exact notice strings with the raw values', () => {
    expect(noticeView(EVERY['stream-limit'], context).title).toBe('Server stream limit — 3 streams')
    expect(noticeView(EVERY['overhead-compensation'], context).title).toBe(`Overhead compensation +2.5${NB}%`)
    expect(noticeView(EVERY['stopped-early'], context).body).toBe(`Upload was stopped after 3.6${NB}s.`)
    expect(noticeView(EVERY['url-parameter-ignored'], context).body).toContain('streams')
    expect(noticeView(EVERY['low-confidence'], context).body).toBe('Upload: few samples.')
  })

  it('makes danger notices alerts, the others status messages, and wires the actions', async () => {
    const wrapper = mountWith(NoticeList, { notices: [EVERY['server-unreachable'], EVERY['insufficient-data'], EVERY['page-hidden'], EVERY['proxy-buffering-suspected']] })
    // The list keeps its items; the roles sit inside them.
    expect(wrapper.findAll('ul > li').every((item) => item.attributes('role') === undefined)).toBe(true)
    const items = wrapper.findAll('li > [data-testid="notice"]')
    expect(items.map((item) => item.attributes('role'))).toEqual(['alert', 'status', 'status', 'status'])
    expect(items.every((item) => item.find('svg').exists())).toBe(true)
    await items[0]?.get('button').trigger('click')
    expect(wrapper.emitted('retry')).toHaveLength(1)
    await items[1]?.get('button').trigger('click')
    expect(wrapper.emitted('preset')).toEqual([['extended']])
    expect(items[1]?.get('button').text()).toBe('Try Extended')
    expect(items[3]?.get('a').attributes('href')).toBe(links.deployment)
  })

  it('renders nothing without notices', () => {
    expect(mountWith(NoticeList, { notices: [] }).find('ul').exists()).toBe(false)
  })
})

describe('a metric tile', () => {
  it('shows the number and its unit apart, and the qualifier lines in their tones', () => {
    const tile = directionTile({ direction: 'download', units: 'bits', result: { status: 'measured', bitsPerSecond: 9.41e7, streams: 2, confidence: { level: 'low', reasons: ['unstable'] }, bytes: 1, events: [] } }, context)
    const wrapper = mountWith(MetricTile, { tile })
    expect(wrapper.get('[data-testid="tile-number"]').text()).toBe('94.1')
    expect(wrapper.get('[data-testid="tile-unit"]').text()).toBe('Mbit/s')
    const lines = wrapper.findAll('[data-testid="tile-line"]')
    expect(lines.map((line) => line.text())).toEqual(['low confidence · unstable', '2 streams'])
    expect(lines[0]?.classes()).toContain('text-(--warn-fg)')
  })

  it('fades a number in when it arrives, then updates it in place', async () => {
    const live = (avg: number) => directionTile({ direction: 'download', units: 'bits', live: { steady: { avgBitsPerSecond: avg, peakBitsPerSecond: avg } } }, context)
    const wrapper = mountWith(MetricTile, { tile: live(9e7) })
    const first = wrapper.get('[data-testid="tile-number"]').element
    await wrapper.setProps({ tile: live(9.5e7) })
    const updated = wrapper.get('[data-testid="tile-number"]')
    expect(updated.text()).toBe('95.0')
    expect(updated.element).toBe(first)
  })

  it('shows a dash and no unit without a number', () => {
    const wrapper = mountWith(MetricTile, { tile: directionTile({ direction: 'upload', units: 'bits', live: { steady: null } }, context) })
    expect(wrapper.get('[data-testid="tile-number"]').text()).toBe('—')
    expect(wrapper.find('[data-testid="tile-unit"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('Live')
    expect(wrapper.text()).toContain('warming up')
  })

  it('keeps the packet-loss slot as not measured, with the why link', () => {
    const wrapper = mountWith(MetricTile, { tile: packetLossTile(context), why: links.packetLoss })
    expect(wrapper.get('[data-testid="tile-number"]').text()).toBe('—')
    expect(wrapper.get('[data-testid="tile-not-measured"]').text()).toBe('not measured')
    expect(wrapper.text()).toContain("Browsers can't see packet loss over TCP.")
    expect(wrapper.get('a').attributes('href')).toBe(links.packetLoss)
  })
})

describe('the phase indicator', () => {
  it('shows each state by icon and text, the active step as the current one', () => {
    const wrapper = mountWith(PhaseIndicator, {
      steps: [
        { phase: 'idle', state: 'done', value: `3.1${NB}ms` },
        { phase: 'download', state: 'active', progress: 0.4, leftMs: 4600 },
        { phase: 'upload', state: 'pending', estimate: { minMs: 15_000, maxMs: 25_000 } },
      ],
    })
    const steps = wrapper.findAll('li')
    expect(steps.map((step) => step.attributes('aria-current'))).toEqual([undefined, 'step', undefined])
    expect(wrapper.findAll('[data-testid="phase-meta"]').map((meta) => meta.text().replaceAll(NB, ' '))).toEqual(['done · 3.1 ms', 'active · 4.6 s left', 'pending · ~15–25 s'])
    expect(steps.every((step) => step.find('svg').exists())).toBe(true)
    expect(wrapper.findAll('[data-testid="phase-bar"]').map((bar) => bar.attributes('style'))).toEqual([
      expect.stringContaining('width: 100%'),
      expect.stringContaining('width: 40%'),
      expect.stringContaining('width: 0%'),
    ])
  })

  it('words the stopped states', () => {
    const wrapper = mountWith(PhaseIndicator, {
      steps: [
        { phase: 'idle', state: 'failed', progress: 0.5 },
        { phase: 'download', state: 'cancelled', coveredMs: 3100, progress: 0.3 },
        { phase: 'upload', state: 'skipped' },
      ],
    })
    expect(wrapper.findAll('[data-testid="phase-meta"]').map((meta) => meta.text().replaceAll(NB, ' '))).toEqual(['failed · interrupted', 'cancelled · 3.1 s', 'skipped'])
    const capped = mountWith(PhaseIndicator, { steps: [{ phase: 'download', state: 'capped', progress: 0.8 }] })
    expect(capped.get('[data-testid="phase-meta"]').text()).toBe('capped · data cap')
  })

  it('shows the info phase as Connecting… on the first step', () => {
    const wrapper = mountWith(PhaseIndicator, { steps: [{ phase: 'download', state: 'pending' }, { phase: 'upload', state: 'pending' }], connecting: true })
    expect(wrapper.findAll('[data-testid="phase-meta"]').map((meta) => meta.text())).toEqual(['Connecting…', 'pending'])
  })
})

describe('the start control', () => {
  it.each([
    ['start', 'Start test', 'Enter'],
    ['stop', 'Stop test', 'Esc'],
    ['again', 'Run again', 'Enter'],
    ['retry', 'Retry test', 'Enter'],
    ['now', 'Start now', 'Enter'],
  ])('is one button, %s, named %s with its key', async (mode, name, key) => {
    const wrapper = mountWith(StartButton, { mode })
    const button = wrapper.get('button')
    expect(button.text()).toContain(name)
    expect(button.get('kbd').text()).toBe(key)
    await button.trigger('click')
    expect(wrapper.emitted('press')).toHaveLength(1)
  })

  it('stays focusable when it cannot be used, says why, and ignores presses', async () => {
    const wrapper = mountWith(StartButton, { mode: 'start', disabledReason: 'Server unreachable — use Retry first' })
    const button = wrapper.get('button')
    expect(button.attributes('disabled')).toBeUndefined()
    expect(button.attributes('aria-disabled')).toBe('true')
    const reason = wrapper.get('[data-testid="start-reason"]')
    expect(button.attributes('aria-describedby')).toBe(reason.attributes('id'))
    expect(reason.text()).toBe('Server unreachable — use Retry first')
    await button.trigger('click')
    expect(wrapper.emitted('press')).toBeUndefined()
  })
})
