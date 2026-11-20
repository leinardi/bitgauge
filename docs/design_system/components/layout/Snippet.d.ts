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
 * Snippet — code / config block on --term-bg (dark in both themes) with an optional icon-only copy button.
 * Lines: plain text (--term-fg), `{ kind: 'comment' }` (--term-comment), `{ kind: 'command' }` (--term-command).
 * The copy button's aria-label names what it copies ("Copy bitgauge.json"). Never wraps: a long line
 * scrolls horizontally inside the block (focusable for keyboard scrolling); the page never scrolls sideways.
 */
export interface SnippetLine {
  t: string;
  kind?: "comment" | "command";
}

export interface SnippetProps {
  lines: Array<string | SnippetLine>;
  /** Caption above the block, e.g. "servers.json". */
  caption?: React.ReactNode;
  /** Accessible name of the copy button; omit for no button. */
  copyLabel?: string;
  onCopy?: () => void;
}

export declare function Snippet(props: SnippetProps): JSX.Element;
