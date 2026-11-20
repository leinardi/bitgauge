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

/** Text input shell: 36 px (sm 28), optional leading icon, mono for numbers/URLs, inline error. */
export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> {
  icon?: string;
  /** Unit after the value, in --fg-subtle ("s", "MB", "pings"). */
  suffix?: React.ReactNode;
  /** IBM Plex Mono — numbers, IPs, URLs. */
  mono?: boolean;
  /** @default "md" */
  size?: "sm" | "md";
  invalid?: boolean;
  /** Inline error message under the field (implies invalid). */
  error?: React.ReactNode;
  label?: React.ReactNode;
}

export declare function Input(props: InputProps): JSX.Element;

/** Inline error under a field. Give it an id and point the input's aria-describedby at it. */
export interface FieldErrorProps {
  id?: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}

export declare function FieldError(props: FieldErrorProps): JSX.Element;
