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
 * Card — surface-2, hairline border, 10 px radius, dark-theme top highlight; optional header row.
 * Visual definition: layout.css `.card`. `style` / `className` are for placement (grid-column, flex) only.
 * @startingPoint section="Layout" subtitle="Card with header, icon and actions" viewport="700x260"
 */
export interface CardProps {
  title?: React.ReactNode;
  /** Header glyph (fg-subtle). */
  icon?: string;
  /** Right-aligned header actions or tags. */
  actions?: React.ReactNode;
  /** Wrap children in 16 px body padding. @default true */
  padded?: boolean;
  /** Clip children to the radius. Turn off when a popup (menu, tooltip) must escape. @default true */
  clip?: boolean;
  /** Element, e.g. "section" for a region. A titled section with no `label` / `labelledBy` is named by its title heading. @default "div" */
  as?: string;
  /** Level of the title heading (rendered as h1–h6, no visual change). 3 inside a dialog or under an h2. @default 2 */
  headingLevel?: 1 | 2 | 3 | 4 | 5 | 6;
  /** aria-label (sections). */
  label?: string;
  labelledBy?: string;
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}

export declare function Card(props: CardProps): JSX.Element;
