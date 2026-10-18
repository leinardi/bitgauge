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


// Text with dates in it, each date in a <time> element carrying its value (ui/i18n-a11y.md
// section 1.3; kit fixtures.js, timeRange and timeList). A message is built with slot() standing
// for each date part, then fill() splits it into runs, which TimeText.vue renders.

/** A run of text; one with a datetime is a date, rendered in a <time> element. */
export interface TimeRun {
  text: string
  datetime?: string
}

export type TimedText = readonly TimeRun[]

// An invisible separator, which no message holds, around each slot's name.
const MARK = '\u2063'
const CALENDAR = /^\d{4}-\d{2}-\d{2}$/

/** A calendar date (`YYYY-MM-DD`) as a local date, so no zone shifts it; an instant as itself. */
function toDate(value: string): Date {
  if (!CALENDAR.test(value)) {
    return new Date(value)
  }
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year ?? 0, (month ?? 1) - 1, day ?? 1)
}

/** One date in a <time> element. */
export function timeOf(value: string, options: Intl.DateTimeFormatOptions, locale: string): TimedText {
  const date = toDate(value)
  return [{ text: Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(locale, options).format(date), datetime: value }]
}

/** A range as the locale writes it ("Oct 2 – 8, 2026"): each end's own parts in a <time>, the shared parts plain. */
export function timeRange(from: string, to: string, options: Intl.DateTimeFormatOptions, locale: string): TimedText {
  const start = toDate(from)
  const end = toDate(to)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return [{ text: `${from} – ${to}` }]
  }
  const runs: { source: string; text: string }[] = []
  for (const part of new Intl.DateTimeFormat(locale, options).formatRangeToParts(start, end)) {
    const last = runs.at(-1)
    if (last?.source === part.source) {
      last.text += part.value
    } else {
      runs.push({ source: part.source, text: part.value })
    }
  }
  return runs.map(({ source, text }) => (source === 'shared' ? { text } : { text, datetime: source === 'startRange' ? from : to }))
}

/** Dates joined as the locale lists them ("Sep 26 and Oct 2"), each in a <time>. */
export function timeList(values: readonly string[], options: Intl.DateTimeFormatOptions, locale: string): TimedText {
  const dates = values.map((value) => timeOf(value, options, locale)[0] ?? { text: value })
  let next = 0
  return new Intl.ListFormat(locale, { type: 'conjunction' }).formatToParts(dates.map((date) => date.text)).map((part) => (part.type === 'element' ? (dates[next++] ?? { text: part.value }) : { text: part.value }))
}

/** A placeholder for a message parameter that fill() replaces with runs. */
export function slot(name: string): string {
  return `${MARK}${name}${MARK}`
}

/** A message with slot() placeholders, split into runs with each slot's own in its place. */
export function fill(message: string, slots: Readonly<Record<string, TimedText>>): TimedText {
  return message.split(MARK).flatMap((piece, index) => (index % 2 === 1 ? (slots[piece] ?? []) : piece === '' ? [] : [{ text: piece }]))
}

/** The runs as plain text. */
export function plainText(runs: TimedText): string {
  return runs.map((run) => run.text).join('')
}
