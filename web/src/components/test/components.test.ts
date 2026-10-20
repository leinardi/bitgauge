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

// The Test screen's components: the notices for every code with their tones and actions, the
// metric tile, the Test list with its packet-loss slot, the phase indicator's states, and the start control.

import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { type Component, h } from 'vue'

import MetaList from '@/components/layout/MetaList.vue'

import MetricTile from '@/components/test/MetricTile.vue'
import NoticeList from '@/components/test/NoticeList.vue'
import NotMeasured from '@/components/test/NotMeasured.vue'
import NotMeasuredWhy from '@/components/test/NotMeasuredWhy.vue'
import { noticeView, noticeViews } from '@/components/test/notices'
import PhaseIndicator from '@/components/test/PhaseIndicator.vue'
import StartButton from '@/components/test/StartButton.vue'
import { directionTile, packetLossTile } from '@/components/test/tiles'
import type { Wording } from '@/components/test/wording'
import type { Notice, NoticeCode } from '@/engine/messages'
import { createAppI18n } from '@/i18n'
import notices from '@/i18n/locales/en/notices.json'
import { links } from '@/lib/links'
import { resultFixture } from '@/test/fixtures'

const i18n = () => createAppI18n('', ['en'])
const context: Wording = { t: i18n().global.t as unknown as Wording['t'], locale: 'en' }
const NB = '\u00a0'

function mountWith<T extends Component>(component: T, props: Record<string, unknown>) {
  return mount(component, { props, global: { plugins: [i18n()] } } as never)
}

// Every notice code once; the record type makes a missing code a compile error.
const EVERY: Record<NoticeCode, Notice> = {
  'slow-link-extended': { code: 'slow-link-extended', direction: 'download' },
  'low-confidence': { code: 'low-confidence', direction: 'upload', reasons: ['insufficient-samples'] },
  'data-cap-reached': { code: 'data-cap-reached', direction: 'download' },
  'data-used': { code: 'data-used', bytes: 1e11 },
  'stream-limit': { code: 'stream-limit', direction: 'upload', streams: 3 },
  'insufficient-data': { code: 'insufficient-data', direction: 'download', offer: 'extended' },
  'url-parameter-ignored': { code: 'url-parameter-ignored', parameter: 'streams', value: '12' },
  'stopped-early': { code: 'stopped-early', direction: 'upload', coveredMs: 3600 },
  'server-restarted': { code: 'server-restarted' },
  'server-unreachable': { code: 'server-unreachable' },
  'proxy-buffering-suspected': { code: 'proxy-buffering-suspected' },
  'browser-upload-limit': { code: 'browser-upload-limit', browser: 'Firefox' },
  'upload-interrupted': { code: 'upload-interrupted' },
  'response-compression-detected': { code: 'response-compression-detected' },
  'overhead-compensation': { code: 'overhead-compensation', percent: 2.5 },
  'timer-throttling-detected': { code: 'timer-throttling-detected' },
  'page-hidden': { code: 'page-hidden' },
  'network-changed': { code: 'network-changed' },
  'websocket-reopened': { code: 'websocket-reopened' },
  'websocket-unavailable': { code: 'websocket-unavailable' },
  'base-path-mismatch': { code: 'base-path-mismatch' },
  'probe-reservation': { code: 'probe-reservation', streams: 5 },
}

// ui/screens.md section 7.
const TONES: Record<NoticeCode, string> = {
  'slow-link-extended': 'info',
  'stream-limit': 'info',
  'overhead-compensation': 'info',
  'browser-upload-limit': 'info',
  'websocket-reopened': 'info',
  'websocket-unavailable': 'info',
  'probe-reservation': 'info',
  'low-confidence': 'warn',
  'data-cap-reached': 'warn',
  'data-used': 'info',
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
    expect(noticeView(EVERY['stopped-early'], context).title).toBe('Test cancelled during upload')
    expect(noticeView(EVERY['url-parameter-ignored'], context).body).toContain('streams')
    expect(noticeView(EVERY['low-confidence'], context).body).toBe('Upload: few samples.')
    expect(noticeView(EVERY['data-used'], context)).toMatchObject({ title: `Data used: 100${NB}GB`, body: `This run has passed 100${NB}GB. The next notice appears at 1${NB}TB.` })
    // The finished result lists each threshold the run passed, naming no next one.
    expect(noticeView(EVERY['data-used'], { ...context, result: resultFixture() }).body).toBe(`This run passed 100${NB}GB.`)
  })

  it('shows one test-extended notice naming both directions when both extended, in place of the first', () => {
    const down = EVERY['slow-link-extended']
    const up = { code: 'slow-link-extended', direction: 'upload' } as const
    const single = noticeViews([down, EVERY['page-hidden']], context)
    expect(single.map((view) => view.body)).toEqual([noticeView(down, context).body, noticeView(EVERY['page-hidden'], context).body])
    const both = noticeViews([down, EVERY['page-hidden'], up], context)
    expect(both).toHaveLength(2)
    expect(both[0]?.title).toBe('Test extended')
    expect(both[0]?.body).toBe('Neither download nor upload had a steady window at its minimum duration, so both were extended up to their maximum.')
    expect(both[1]?.body).toBe(noticeView(EVERY['page-hidden'], context).body)
    const wrapper = mountWith(NoticeList, { notices: [down, up] })
    expect(wrapper.findAll('[data-testid="notice"]')).toHaveLength(1)
  })

  it('makes danger notices alerts, the others status messages, and wires the actions', async () => {
    const wrapper = mountWith(NoticeList, { notices: [EVERY['server-unreachable'], EVERY['insufficient-data'], EVERY['page-hidden'], EVERY['proxy-buffering-suspected']] })
    // The notices are siblings, with no list around them, as the export places them.
    expect(wrapper.find('ul').exists()).toBe(false)
    const items = wrapper.findAll('[data-testid="notice"]')
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
    expect(mountWith(NoticeList, { notices: [] }).find('[data-testid="notice"]').exists()).toBe(false)
  })
})

describe('a metric tile', () => {
  it('shows the number and its unit apart, and the qualifier lines in their tones', () => {
    const tile = directionTile({ direction: 'download', units: 'bits', result: { status: 'measured', bitsPerSecond: 9.41e7, streams: 2, confidence: { level: 'low', reasons: ['unstable'] }, bytes: 1, events: [] } }, context)
    const wrapper = mountWith(MetricTile, { tile })
    expect(wrapper.get('[data-testid="tile-number"]').text()).toBe('94.1')
    expect(wrapper.get('[data-testid="tile-unit"]').text()).toBe('Mbit/s')
    const lines = wrapper.findAll('[data-testid="tile-line"]')
    expect(lines.map((line) => line.text())).toEqual(['2 streams', 'low confidence · unstable'])
    expect(lines[1]?.classes()).toContain('text-(--warn-fg)')
    expect(wrapper.get('[data-testid="tile-pill"]').text()).toBe('Low confidence')
  })

  it('fades a number in when it arrives, then updates it in place', async () => {
    const live = (avg: number) => directionTile({ direction: 'download', units: 'bits', live: { steady: { avgBitsPerSecond: avg, peakBitsPerSecond: avg }, confirmed: true } }, context)
    const wrapper = mountWith(MetricTile, { tile: live(9e7) })
    const first = wrapper.get('[data-testid="tile-number"]').element
    await wrapper.setProps({ tile: live(9.5e7) })
    const updated = wrapper.get('[data-testid="tile-number"]')
    expect(updated.text()).toBe('95.0')
    expect(updated.element).toBe(first)
  })

  it('shows words in the number’s place while warming up, with the Live pill, and a dash without a number', () => {
    const wrapper = mountWith(MetricTile, { tile: directionTile({ direction: 'upload', units: 'bits', live: { steady: null, confirmed: false } }, context) })
    expect(wrapper.find('[data-testid="tile-number"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="tile-word"]').text()).toBe('warming up')
    expect(wrapper.get('[data-testid="tile-pill"]').text()).toBe('Live')
    expect(wrapper.find('[data-testid="tile-unit"]').exists()).toBe(false)
    const empty = mountWith(MetricTile, { tile: directionTile({ direction: 'upload', units: 'bits' }, context) })
    expect(empty.get('[data-testid="tile-number"]').text()).toBe('—')
    expect(wrapper.text()).toContain('Live')
    expect(wrapper.text()).toContain('warming up')
  })

})

describe('the Test list', () => {
  it('shows each row as a term and its value, a dash without one, a slot for any other value and one after the sub line', () => {
    const loss = packetLossTile(context)
    const wrapper = mount(MetaList, {
      props: {
        title: 'Test',
        rows: [
          { key: 'data', icon: loss.icon, label: 'Data used', value: '1.3 GB' },
          { key: 'duration', icon: loss.icon, label: 'Duration', value: null },
          { key: 'packet-loss', icon: loss.icon, label: loss.label, sub: "Browsers can't see packet loss over TCP" },
        ],
      },
      slots: { 'sub-packet-loss': () => h(NotMeasuredWhy, { href: links.packetLoss }), 'value-packet-loss': () => h(NotMeasured) },
      global: { plugins: [i18n()] },
    })
    expect(wrapper.findAll('dt').map((term) => term.text())).toEqual(['Data used', 'Duration', "Packet lossBrowsers can't see packet loss over TCPWhy?"])
    const values = wrapper.findAll('dd')
    expect(values.map((value) => value.text())).toEqual(['1.3 GB', '—', 'Not measured'])
    expect(values[1]?.classes()).toContain('text-subtle-foreground')
    expect(wrapper.find('dd a').exists()).toBe(false)
    const why = wrapper.get('dt a')
    expect(why.attributes('href')).toBe(links.packetLoss)
    expect(why.attributes('aria-label')).toBe("Why packet loss is not measured: Browsers can't see packet loss over TCP")
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
    expect(wrapper.findAll('li').map((item) => item.text())).toEqual(['Connecting…active · server info', 'Uploadpending'])
    expect(wrapper.get('li').attributes('aria-current')).toBe('step')
  })

  it('words each step state with its detail: estimate, pings, time left, result, insufficient data, interruption', () => {
    const wrapper = mountWith(PhaseIndicator, {
      steps: [
        { phase: 'idle', state: 'pending', estimate: { aboutMs: 2000 } },
        { phase: 'idle', state: 'active', progress: 0.6, pings: { n: 12, count: 20 } },
        { phase: 'download', state: 'active', progress: 0.3, leftMs: 4600 },
        { phase: 'download', state: 'done', insufficient: true },
        { phase: 'upload', state: 'failed', progress: 0.4, interruptedMs: 6400 },
      ],
    })
    expect(wrapper.findAll('[data-testid="phase-meta"]').map((meta) => meta.text().replaceAll(NB, ' '))).toEqual([
      'pending · ~2 s',
      'active · 12 / 20 pings',
      'active · 4.6 s left',
      'done · insufficient data',
      'failed · interrupted at 6.4 s',
    ])
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
