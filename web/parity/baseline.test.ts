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

import { mkdtempSync, readdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { type BaselineEntry, formatBaseline, identity, isOrphan, judgePair, loadBaseline, mergeBaseline, parseBaseline, writeBaseline } from './baseline.ts'
import type { Finding } from './findings.ts'
import { ALL_PROJECTS, pairKey, type Pair } from './selection.ts'

const finding = (detail: string): Finding => ({ layer: 'content', path: 'main', kind: 'missing', detail })
const entry = (pair: Pair, detail: string, reason = 'known'): BaselineEntry => ({ ...pair, ...finding(detail), reason })

const a: Pair = { project: 'light-desktop', scenario: 'test/idle' }
const b: Pair = { project: 'light-desktop', scenario: 'about' }
const dark: Pair = { project: 'dark-narrow', scenario: 'test/idle' }

const projects = new Set([a.project, dark.project])
const scenarios = new Set([a.scenario, b.scenario])

describe('parse and format', () => {
  it('round-trips entries, sorted, under the header', () => {
    const entries = [entry(b, 'y'), entry(a, 'x')]
    const text = formatBaseline(entries)
    expect(text.startsWith('# Demo parity baseline')).toBe(true)
    expect(parseBaseline(text).map((e) => e.scenario)).toEqual(['about', 'test/idle'])
  })

  it('stores a difference once, with * for all projects or the list it occurs in', () => {
    const everywhere = ALL_PROJECTS.map((p) => entry({ project: p.name, scenario: 'about' }, 'all'))
    const text = formatBaseline([...everywhere, entry(dark, 'one'), entry(a, 'two'), entry(dark, 'two')])
    const lines = text.split('\n').filter((line) => line !== '' && !line.startsWith('#'))
    expect(lines.map((line) => line.split('\t')[0])).toEqual(['*', 'dark-narrow', 'dark-narrow,light-desktop'])
    expect(parseBaseline(text)).toHaveLength(ALL_PROJECTS.length + 3)
  })

  it('refuses a malformed line and a duplicate', () => {
    expect(() => parseBaseline('a\tb\tcontent\n')).toThrow(/expected 7 tab-separated fields/)
    expect(() => parseBaseline('p\ts\tpixels\tpath\tkind\tdetail\treason\n')).toThrow(/unknown layer/)
    const line = 'p\ts\tcontent\tpath\tkind\tdetail\treason\n'
    expect(() => parseBaseline(line + line)).toThrow(/duplicate entry/)
  })

  it('writes atomically, leaving no temporary file beside the baseline', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'parity-baseline-'))
    const file = path.join(dir, '.parity-baseline')
    writeBaseline([entry(a, 'x')], file)
    expect(readdirSync(dir)).toEqual(['.parity-baseline'])
    expect(loadBaseline(file)).toHaveLength(1)
    expect(readFileSync(file, 'utf8')).toContain('\tknown\n')
  })
})

describe('identity', () => {
  it('names a difference by its pair and every field but the reason', () => {
    expect(identity(a, finding('x'))).toBe('light-desktop\ttest/idle\tcontent\tmain\tmissing\tx')
    expect(identity(entry(a, 'x', 'one reason'), entry(a, 'x', 'another'))).toBe(identity(a, finding('x')))
  })
})

describe('isOrphan', () => {
  it('flags an entry whose project or scenario the harness no longer has', () => {
    expect(isOrphan(entry(a, 'x'), projects, scenarios)).toBe(false)
    expect(isOrphan(entry({ project: 'light-compact-desktop', scenario: a.scenario }, 'x'), projects, scenarios)).toBe(true)
    expect(isOrphan(entry({ project: a.project, scenario: 'history' }, 'x'), projects, scenarios)).toBe(true)
  })
})

describe('judgePair', () => {
  it('reports findings the baseline does not list and entries no longer found', () => {
    const verdict = judgePair(a, [finding('x'), finding('new')], [entry(a, 'x'), entry(a, 'fixed'), entry(b, 'other')])
    expect(verdict.unexpected.map((f) => f.detail)).toEqual(['new'])
    expect(verdict.stale.map((e) => e.detail)).toEqual(['fixed'])
  })
})

describe('mergeBaseline', () => {
  const old = [entry(a, 'kept', 'first reason'), entry(a, 'fixed'), entry(b, 'untouched'), entry(dark, 'other project'), entry({ project: a.project, scenario: 'gone' }, 'orphan')]
  const covered = new Map([[pairKey(a), { pair: a, findings: [finding('kept'), finding('new')] }]])

  it('update removes stale entries of covered pairs only, adds nothing and drops orphans', () => {
    const next = mergeBaseline({ old, covered, mode: 'update', reason: '', projects, scenarios })
    expect(next.map((e) => e.detail).sort()).toEqual(['kept', 'other project', 'untouched'])
  })

  it('accept adds new findings with the reason and keeps existing reasons', () => {
    const next = mergeBaseline({ old, covered, mode: 'accept', reason: 'triaged', projects, scenarios })
    const byDetail = new Map(next.map((e) => [e.detail, e.reason]))
    expect(byDetail.get('kept')).toBe('first reason')
    expect(byDetail.get('new')).toBe('triaged')
    expect(byDetail.has('fixed')).toBe(false)
    expect(byDetail.get('untouched')).toBe('known')
  })
})
