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
// @vitest-environment node

import { describe, expect, it } from 'vitest'

import { compareStyles, nameElements, type StyledElement } from './style.ts'

const base = {
  'font-size': '13px',
  'font-weight': '500',
  'line-height': '18px',
  color: 'rgba(0, 0, 0, 255)',
  'background-color': 'rgba(0, 0, 0, 0)',
  'padding-top': '4px',
  'padding-right': '8px',
  'padding-bottom': '4px',
  'padding-left': '8px',
  'column-gap': 'normal',
  'border-top-left-radius': '6px',
  'border-top-width': '0px',
  'border-top-color': 'rgba(10, 10, 10, 255)',
  width: '80.0px',
  height: '28.0px',
  display: 'inline-block',
  'has-text': 'true',
  'child-count': '0',
  'justify-content': 'normal',
  'align-items': 'normal',
}

const el = (props: Partial<typeof base>, extra: Partial<StyledElement> = {}): StyledElement => ({
  region: 'main',
  role: 'button',
  name: 'Start',
  occurrence: 1,
  props: { ...base, ...props },
  ...extra,
})

describe('compareStyles', () => {
  it('reports a property that differs on a paired element', () => {
    expect(compareStyles([el({})], [el({ 'font-weight': '600' })], ['main'])).toEqual([
      { layer: 'style', path: 'main > button "Start"', kind: 'font-weight', detail: '500 → 600' },
    ])
  })

  it('tolerates a pixel of layout difference', () => {
    expect(compareStyles([el({})], [el({ width: '80.9px', height: '27.2px' })], ['main'])).toEqual([])
    expect(compareStyles([el({})], [el({ width: '82.0px' })], ['main'])).toHaveLength(1)
  })

  it('ignores a border colour with no border and a gap outside flex and grid', () => {
    const vue = el({ 'border-top-color': 'rgba(200, 0, 0, 255)', 'column-gap': '8px' })
    expect(compareStyles([el({})], [vue], ['main'])).toEqual([])
    expect(compareStyles([el({ display: 'inline-flex' })], [{ ...vue, props: { ...vue.props, display: 'inline-flex' } }], ['main'])).toEqual([
      { layer: 'style', path: 'main > button "Start"', kind: 'column-gap', detail: 'normal → 8px' },
    ])
  })

  it('ignores a border colour where neither side draws a border', () => {
    const transparent = el({ 'border-top-width': '1px', 'border-top-color': 'rgba(0, 0, 0, 0)' })
    const none = el({ 'border-top-width': '0px', 'border-top-color': 'rgba(26, 30, 37, 255)' })
    expect(compareStyles([transparent], [none], ['main'])).toEqual([])
    const drawn = el({ 'border-top-width': '1px', 'border-top-color': 'rgba(26, 30, 37, 255)' })
    expect(compareStyles([transparent], [drawn], ['main']).map((f) => f.kind)).toEqual(['border-top-color'])
  })

  it('compares the radius a corner is drawn with', () => {
    const pill = (radius: string) => el({ 'border-top-left-radius': radius, height: '24.0px', width: '57.0px' })
    expect(compareStyles([pill('9999px')], [pill('3.35544e+07px')], ['main'])).toEqual([])
    expect(compareStyles([pill('9999px')], [pill('6px')], ['main'])).toEqual([
      { layer: 'style', path: 'main > button "Start"', kind: 'border-top-left-radius', detail: '12px → 6px' },
    ])
  })

  describe('an icon-only button in the same centred box', () => {
    const iconBox = {
      display: 'inline-flex',
      'has-text': 'false',
      'child-count': '1',
      'justify-content': 'center',
      'align-items': 'center',
      width: '36.0px',
      height: '36.0px',
    }
    const proto = el({ ...iconBox, 'padding-left': '6px', 'padding-right': '6px', 'font-weight': '400' })
    const vue = el({ ...iconBox, 'padding-top': '0px', 'padding-right': '0px', 'padding-bottom': '0px', 'padding-left': '0px', 'column-gap': '8px', 'font-weight': '600' })

    it('ignores padding, gap and weight', () => {
      expect(compareStyles([proto], [vue], ['main'])).toEqual([])
    })

    it.each([
      ['has text', { 'has-text': 'true' }],
      ['has two children', { 'child-count': '2' }],
      ['is not flex or grid', { display: 'inline-block' }],
      ['is not centred along the main axis', { 'justify-content': 'flex-start' }],
      ['is not centred across', { 'align-items': 'stretch' }],
      ['has uneven side padding', { 'padding-right': '2px' }],
      ['has uneven top and bottom padding', { 'padding-top': '2px' }],
      ['is wider', { width: '40.0px' }],
      ['is taller', { height: '40.0px' }],
    ])('compares them when the Vue side %s', (_, change) => {
      const kinds = compareStyles([proto], [{ ...vue, props: { ...vue.props, ...change } }], ['main']).map((f) => f.kind)
      expect(kinds).toEqual(expect.arrayContaining(['padding-left', 'font-weight']))
    })

    it('still compares size and colour', () => {
      const kinds = compareStyles([proto], [{ ...vue, props: { ...vue.props, color: 'rgba(200, 0, 0, 255)' } }], ['main']).map((f) => f.kind)
      expect(kinds).toEqual(['color'])
    })
  })

  it('pairs a link with a button and leaves unpaired elements to the content layer', () => {
    expect(compareStyles([el({})], [el({ 'font-weight': '600' }, { role: 'link' })], ['main'])).toHaveLength(1)
    expect(compareStyles([el({})], [el({}, { name: 'Stop' })], ['main'])).toEqual([])
  })

  it('compares only the regions the scenario asks for', () => {
    expect(compareStyles([el({}, { region: 'header' })], [el({ color: 'red' }, { region: 'header' })], ['main'])).toEqual([])
  })
})

describe('nameElements', () => {
  it('names an element as the content layer reads it, cut short, and numbers repeats', () => {
    const raw = (name: string) => ({ region: 'main' as const, role: 'status', name, props: {} })
    const named = nameElements([raw('  Download\n 605 Mbit/s '), raw('Download 598 Mbit/s'), raw(`Note ${'x'.repeat(60)}`)])
    expect(named.map(({ name, occurrence }) => [name, occurrence])).toEqual([
      ['Download # Mbit/s', 1],
      ['Download # Mbit/s', 2],
      [`Note ${'x'.repeat(42)}…`, 1],
    ])
  })
})
