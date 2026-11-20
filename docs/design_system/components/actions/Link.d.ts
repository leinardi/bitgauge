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
 * Link — standalone text action: "Edit", "View", "Why?", "Known browser limits", docs links.
 * --primary-text, --weight-semibold, no underline (underline on hover). Size inherits from the parent.
 * Running-text links inside a paragraph use a plain <a> (base.css colours) instead.
 */
export interface LinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  href?: string;
  /** Leading glyph, e.g. "sliders" for Edit. */
  icon?: string;
  /** Trailing external-link glyph (docs, source repository). */
  external?: boolean;
  children: React.ReactNode;
}

export declare function Link(props: LinkProps): JSX.Element;
