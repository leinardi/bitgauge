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

/** Checkbox — role="checkbox" button with a 16 px box (teal when checked); optional series-coloured glyph before the label. */
export interface CheckboxProps {
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  disabled?: boolean;
  icon?: string;
  iconColor?: string;
  /** sm: caption-size label (option lines under a field). @default "md" */
  size?: "md" | "sm";
  children: React.ReactNode;
}

export declare function Checkbox(props: CheckboxProps): JSX.Element;

/** ChoiceCard — a card-style radio (preset picker): icon, title, optional badge, radio dot, mono description. Space / Enter select. */
export interface ChoiceCardProps {
  selected?: boolean;
  icon?: string;
  title: React.ReactNode;
  badge?: React.ReactNode;
  children?: React.ReactNode;
  onSelect?: () => void;
  /** Shown but not selectable; the reason is its tooltip ("Needs a server connection"). */ disabledReason?: string;
}

export declare function ChoiceCard(props: ChoiceCardProps): JSX.Element;
