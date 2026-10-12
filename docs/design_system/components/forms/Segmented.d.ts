/** Segmented single-choice control (streams Auto/Fixed/Single, units Bits/Bytes, theme). */
export interface SegmentedOption { value: string; label: React.ReactNode; icon?: string; }
export interface SegmentedProps {
  options: Array<string | SegmentedOption>;
  value: string;
  onChange?: (value: string) => void;
  /** sm = 28 px compact. @default "md" */
  size?: 'sm' | 'md';
  ariaLabel?: string;
}
export declare function Segmented(props: SegmentedProps): JSX.Element;
