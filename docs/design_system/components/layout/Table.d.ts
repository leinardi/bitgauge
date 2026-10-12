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
