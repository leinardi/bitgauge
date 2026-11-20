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

/** Select — combobox button in the Input shell (--input-h 36 px, sm 28 px) whose listbox opens on demand (Reka UI Select pattern), optional leading icon. Needs aria-label or aria-labelledby. `style` is for width / placement only.
 *  Keyboard: Enter / Space / ↑ / ↓ open; ↑ ↓ Home End move; Enter / Space pick; Esc closes; typing jumps to a label. */
export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps {
  options: Array<string | SelectOption>;
  /** Controlled value. */
  value?: string;
  /** Uncontrolled initial value; the first option when omitted. */
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  /** Native-style handler: receives { target: { value } }. */
  onChange?: (e: { target: { value: string } }) => void;
  placeholder?: string;
  disabled?: boolean;
  icon?: string;
  /** @default "md" */
  size?: "sm" | "md";
  mono?: boolean;
  id?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  className?: string;
  style?: React.CSSProperties;
}

export declare function Select(props: SelectProps): JSX.Element;
