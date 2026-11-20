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
 * SaveBar — result status after a run (contract: components/save-bar.md).
 * - "saved": complete run, "Saved to history" + label field with suggested labels + Share / Download JSON / Details.
 * - "unsaved": partial or error run, "Partial results are not saved" + Keep in history / Download JSON.
 * - "kept": after Keep in history, "Saved as partial" / "Saved as error" + Download JSON / Details (Undo lives in the toast).
 * - "complete": a run not stored — "Test complete"; Download JSON only.
 * Label changes save as they are typed; there is no Save button.
 */
export interface SaveBarProps {
  /** @default "saved" */
  status?: "saved" | "unsaved" | "kept" | "complete";
  title: React.ReactNode;
  /** Mono time of the result, formatted in the active locale and wrapped in <time datetime>, e.g. <time dateTime="2026-10-12T12:02:11Z">2:02:11 PM</time>. */
  time?: React.ReactNode;
  /** One line of explanation, e.g. "Download the JSON to keep it." */
  message?: React.ReactNode;
  /** Inline label field (saved only). */
  label?: { value?: string; onChange?: (e: any) => void; placeholder?: string; suggestions?: string[]; onSuggest?: (label: string) => void };
  /** Small Buttons, right-aligned. */
  actions?: React.ReactNode;
}

export declare function SaveBar(props: SaveBarProps): JSX.Element;
