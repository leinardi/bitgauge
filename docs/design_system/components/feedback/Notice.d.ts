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
 * Notice — inline notice: tinted surface, tone icon (16 px), title, one line of explanation, up to two actions.
 * Visual definition: feedback.css `.signal`. Contract: components/notices.md. Screens never build their own.
 * Accessibility: danger is role="alert"; every other tone is role="status" (polite) so live notices are
 * announced when they appear during a run. Pass live={false} for static lists (Result detail).
 */
export interface NoticeProps {
  /** info · warn · danger · neutral (features/ui/screens.md §7). ok is for confirmations only. @default "info" */
  tone?: "info" | "warn" | "danger" | "neutral" | "ok";
  icon?: string;
  title: React.ReactNode;
  /** The one-line explanation. */
  children?: React.ReactNode;
  /** Up to two: <Button size="sm"> or <Link external>. */
  actions?: React.ReactNode;
  /** Flush banner along a card's edge (no radius, bottom hairline only), e.g. "Clipboard access was denied" above the summary. */
  attached?: boolean;
  /** Announce politely when it appears. @default true */
  live?: boolean;
}

export declare function Notice(props: NoticeProps): JSX.Element;
