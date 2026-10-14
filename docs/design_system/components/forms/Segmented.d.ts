/** Segmented single-choice control (streams Auto/Fixed/Single, units Bits/Bytes, theme). role="radiogroup". */
export interface SegmentedOption {
  value: string;
  /** Visible label, or the accessible name when iconOnly. */
  label: string;
  icon?: string;
  /** Icon colour — series tokens for direction choices ("var(--series-upload)"). */
  color?: string;
  /** Show only the icon; `label` becomes its aria-label (header theme switch). */
  iconOnly?: boolean;
}
export interface SegmentedProps {
  options: Array<string | SegmentedOption>;
  value: string;
  onChange?: (value: string) => void;
  /** sm = 28 px compact. @default "md" */
  size?: 'sm' | 'md';
  /** Stretch to the container, equal segments (narrow layouts). */
  block?: boolean;
  /** Name of the group, e.g. "Theme". */
  ariaLabel?: string;
}
export declare function Segmented(props: SegmentedProps): JSX.Element;
