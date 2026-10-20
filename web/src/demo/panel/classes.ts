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

// The demo panel's row and small-select classes (kit.css .demo, forms.css .input.sm), shared by
// its sections.

export const rowClass = 'flex items-center justify-between gap-2 text-(length:--text-caption) text-muted-foreground'
// A select as the kit's small input (forms.css .input.sm): the box is the span, the native select
// sits in it without its own frame, and the box shows the focus.
export const inputClass =
  'flex h-(--control-h-sm) min-w-0 flex-[0_1_var(--demo-row-basis)] items-center gap-2 rounded-(--radius-md) border border-input bg-(--surface-1) px-2.5 text-(length:--text-caption) text-foreground focus-within:border-primary focus-within:outline-(length:--focus-width) focus-within:outline-offset-(--focus-offset) focus-within:outline-(--focus-ring)'
export const selectClass = 'min-w-0 flex-1 border-none bg-transparent font-sans text-(length:--text-sm) text-foreground outline-none'
// A segmented choice (kit.css .demo .seg), as the panel's Speed is.
export const segmentGroupClass = 'inline-flex max-w-full flex-wrap overflow-hidden rounded-(--radius-md) border border-input bg-card'
export const segmentClass = 'inline-flex h-(--control-h-sm) flex-none items-center gap-1.5 border-r border-border px-2 text-(length:--text-caption) font-semibold whitespace-nowrap last:border-r-0'
