/** The BitGauge mark: three concentric gauge arcs in the series colours (download teal, upload violet, latency blue dashed). */
export interface LogoProps {
  /** Pixel size of the mark. ≤ 20 switches to the favicon geometry. @default 28 */
  size?: number;
  /** "color" uses series tokens; "mono" draws every arc in currentColor. @default "color" */
  variant?: 'color' | 'mono';
  /** Force geometry. @default size <= 20 ? "small" : "full" */
  geometry?: 'full' | 'small';
  /** Append the "BitGauge" wordmark (IBM Plex Sans 600). @default false */
  wordmark?: boolean;
  style?: React.CSSProperties;
}
export declare function Logo(props: LogoProps): JSX.Element;
