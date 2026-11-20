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

/** 380 px toast confirming an action; optional Undo action and dismiss button. role="status", polite. */
export interface ToastProps {
  /** @default "ok" */
  tone?: "ok" | "info" | "warn" | "danger";
  icon?: string;
  /** Short sentence ending in a period: "Summary copied." */
  title: React.ReactNode;
  message?: React.ReactNode;
  /** e.g. <Button size="sm" icon="undo-2">Undo</Button> */
  action?: React.ReactNode;
  /** Renders the ghost "Dismiss" icon button. */
  onDismiss?: () => void;
  /** Slide-in on mount. @default true */
  animate?: boolean;
}

export declare function Toast(props: ToastProps): JSX.Element;

/** Sticky bottom-right slot for one toast; lifts above the mobile TabBar. */
export interface ToastRegionProps {
  aboveTabBar?: boolean;
  children?: React.ReactNode;
}

export declare function ToastRegion(props: ToastRegionProps): JSX.Element | null;
