/** Shimmering placeholder matching final layout; refreshes keep content instead. */
export interface SkeletonProps {
  /** @default "100%" */
  width?: number | string;
  /** @default 12 */
  height?: number | string;
  style?: React.CSSProperties;
}
export declare function Skeleton(props: SkeletonProps): JSX.Element;
export interface SkeletonRowsProps {
  /** @default 3 */
  rows?: number;
  /** Column widths in px, or "1fr" to flex. @default [90, "1fr", 48] */
  columns?: Array<number | '1fr'>;
}
export declare function SkeletonRows(props: SkeletonRowsProps): JSX.Element;
