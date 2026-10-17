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

import { type Result, validateResult } from '@/engine/messages'

// A stored or imported record brought to the current result version (frontend.md section 5,
// measurement.md section 17). Version 1 is the current one, so a version-1 record only has to pass
// the result validator; a later version cannot be read by this one.

export const CURRENT_SCHEMA_VERSION = 1

/** A record of a result version later than this BitGauge reads. */
export class UnsupportedSchema extends Error {
  readonly schemaVersion: number

  constructor(schemaVersion: number) {
    super(`schemaVersion ${schemaVersion} is newer than ${CURRENT_SCHEMA_VERSION}`)
    this.name = 'UnsupportedSchema'
    this.schemaVersion = schemaVersion
  }
}

/** A record that is not a valid result; `problems` are the validator's. */
export class InvalidRecord extends Error {
  readonly problems: string[]

  constructor(problems: string[]) {
    super(problems[0] ?? 'not a result')
    this.name = 'InvalidRecord'
    this.problems = problems
  }
}

/** The record as a current result; throws UnsupportedSchema or InvalidRecord. */
export function migrate(record: unknown): Result {
  const version = typeof record === 'object' && record !== null ? (record as { schemaVersion?: unknown }).schemaVersion : undefined
  if (typeof version === 'number' && Number.isInteger(version) && version > CURRENT_SCHEMA_VERSION) {
    throw new UnsupportedSchema(version)
  }
  const problems = validateResult(record)
  if (problems.length > 0) {
    throw new InvalidRecord(problems)
  }
  return record as Result
}
