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

/** Data table: condensed caps heads, mono tabular numeric columns, density-aware rows, selected tint. */
export interface TableColumn<R = any> {
  key: string;
  label: string;
  /** Right-aligned mono tabular column. */
  num?: boolean;
  width?: number | string;
  render?: (row: R) => React.ReactNode;
}

export interface TableProps<R = any> {
  columns: TableColumn<R>[];
  rows: R[];
  /** Row ids (row.id or index) shown with the selected tint. */
  selected?: Array<string | number>;
  onRowClick?: (row: R) => void;
  /** Becomes a card list below 768 px. */
  flip?: boolean;
}

export declare function Table(props: TableProps): JSX.Element;
