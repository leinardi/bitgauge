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

/** Dot + condensed-caps status pill. "offline" = hollow amber dot (server unreachable). The label carries the meaning. */
export interface StatusPillProps {
  /** @default "neutral" */
  tone?: "ok" | "warn" | "danger" | "info" | "neutral" | "offline";
  /** md 22 px · sm 20 px (tile tags, card-header tags). @default "md" */
  size?: "md" | "sm";
  /** Leading status dot. Off for plain category tags ("CLI", "Web UI"). @default true */
  dot?: boolean;
  /** Transparent, dashed outline — a state that is absent or unconfirmed ("Off", "Not confirmed"). */
  dashed?: boolean;
  children: React.ReactNode;
}

export declare function StatusPill(props: StatusPillProps): JSX.Element;
