/** Lucide outline glyph from the BitGauge set. 1.75 px stroke, currentColor. */
export interface IconProps {
  /** Glyph name, e.g. "arrow-down", "activity", "circle-check", "wifi-off". Unknown names render a dashed placeholder square. */
  name: string;
  /** Pixel size (14–20 in UI). @default 16 */
  size?: number;
  /** Stroke width. @default 1.75 */
  stroke?: number;
  className?: string;
  style?: React.CSSProperties;
}
export declare function Icon(props: IconProps): JSX.Element;
export declare const ICON_NAMES: string[];
