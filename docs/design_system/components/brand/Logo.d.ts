/** The BitGauge mark: three concentric gauge arcs in the series colours (download teal, upload violet, latency blue dashed). */
export interface LogoProps {
  /** Pixel size of the mark. ≤ 20 switches to the favicon geometry. @default 28 */
  size?: number;
  /** "color" uses series tokens; "mono" draws every arc in currentColor. @default "color" */
  variant?: 'color' | 'mono';
  /** Force geometry. @default size <= 20 ? "small" : "full" */
  geometry?: 'full' | 'small';
  /** Append the wordmark: "Bit" in --fg + "Gauge" in --primary-text, IBM Plex Sans 600 (navigation.css `.wm`). @default false */
  wordmark?: boolean;
  /** Wordmark text size (sm 11 · md 15 · lg 16 · xl 18 px). @default from size: ≥36 xl, ≥27 lg, ≥20 md, else sm */
  wordmarkSize?: 'sm' | 'md' | 'lg' | 'xl';
  /** Render the wordmark as a home link. */
  href?: string;
  /** Accessible name of the home link. @default "BitGauge home" */
  label?: string;
  style?: React.CSSProperties;
}
export declare function Logo(props: LogoProps): JSX.Element;
