/** Pill chip for settings summaries, filters (with count) and suggested labels. */
export interface ChipProps {
  selected?: boolean;
  icon?: string;
  /** Mono count after the label (filter chips). */
  count?: number;
  /** Borderless sort-control variant. */
  sort?: boolean;
  /** Makes it a toggle button (aria-pressed). */
  onClick?: () => void;
  children: React.ReactNode;
}
export declare function Chip(props: ChipProps): JSX.Element;
