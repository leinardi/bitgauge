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

/**
 * LiveRegion — visually hidden polite live region. Contract (gauge.md, notices.md):
 * - Exactly one per screen, rendered by the screen as a direct child of <main> (never inside the gauge,
 *   a card or the header). The header's server-status announcements are AppHeader's own.
 * - The Test screen announces: each phase change, the current rate at most once every 5 s while running,
 *   each direction's headline once when it finishes, and the result summary (i18n-a11y.md §2.1, §2.7).
 * - The gauge readout itself is never live.
 */
export interface LiveRegionProps {
  /** Text to announce; changing it announces it. */
  message?: string;
  /** role="alert" / assertive — only for errors that stop a run. @default false */
  assertive?: boolean;
}

export declare function LiveRegion(props: LiveRegionProps): JSX.Element;
