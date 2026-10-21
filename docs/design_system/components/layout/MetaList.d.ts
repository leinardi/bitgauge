/**
 * MetaList — label / value rows (`<dl>`): Test meta (data used, duration, browser), About facts,
 * base-path facts. Optional row icon and sub-label; values in mono; a missing value renders "—" in --fg-subtle.
 * With `title` it renders as a tile card with an eyebrow ("Test", "Session"). `columns` lays rows out in a grid.
 * Stat — one labelled value for horizontal strips (connection info: Client IP, Protocol, Streams).
 */
export interface MetaRow {
  key?: string;
  icon?: string;
  label: React.ReactNode;
  sub?: React.ReactNode;
  /** Mono value. null/undefined/"—" renders the empty dash. */
  value?: React.ReactNode;
  tone?: 'danger';
}
export interface MetaListProps {
  rows: MetaRow[];
  /** @default 1 */
  columns?: number;
  /** Card eyebrow; renders the list as a tile card. */
  title?: string;
  compact?: boolean;
  /** Facts layout: label left, value right, no icons, tighter rows (About, base-path error). */
  facts?: boolean;
  /** Placement only. */
  className?: string;
  style?: React.CSSProperties;
}
export declare function MetaList(props: MetaListProps): JSX.Element;
export interface StatProps {
  label: string;
  value?: React.ReactNode;
  /** Subtle qualifier after the value: "IPv4", "auto · plateau: cap". */
  sub?: React.ReactNode;
  /** Custom value (e.g. the context Menu). */
  children?: React.ReactNode;
}
export declare function Stat(props: StatProps): JSX.Element;
