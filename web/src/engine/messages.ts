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

// The message contract between the UI and the engine's Worker (architecture.md section 4): both
// directions are unions discriminated on `type`. The application imports this module and nothing
// else under engine/; the unions live in engine/messages/ and are re-exported here. The engine
// sends raw numbers and codes, never display text.

export type * from '@/engine/messages/events'
export type * from '@/engine/messages/notices'
export type * from '@/engine/messages/result'
export type * from '@/engine/messages/settings'

/** Checks a value against the result object; the application validates before exporting. */
export { validateResult } from '@/engine/result/validate'
/** Checks derived fields on a structurally valid imported result using the engine's rules. */
export { validateDerivedResult } from '@/engine/result/derived'

/** The resolution a run's settings go through; the Settings screen shows the URL parameters through it. */
export { resolveSettings } from '@/engine/settings'

/** The preset table the engine resolves a preset with; the Settings screen states and applies it. */
export { PRESETS } from '@/engine/presets'

/** The browser identity the result records; the Test screen shows the current one before a result exists. */
export { browserIdentity } from '@/engine/wiring'
export type { BrowserIdentity } from '@/engine/types'

/** The auto ramp's stream counts before the cap clamps them, which the Settings screen states. */
export { SEQUENCE as RAMP_SEQUENCE } from '@/engine/phases/ramp'

/** The Continuous rings' lengths, which the live chart's own rings follow (measurement.md section 15). */
export { RING_LENGTHS } from '@/engine/continuous/retention'
