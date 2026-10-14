/** Pill chip for settings summaries, filters (with count) and suggested labels. */
export interface ChipProps {
  /** Selected filter (primary tint, aria-pressed). */
  selected?: boolean;
  /** A setting that differs from the server default (settings summary). Same tint as selected; static. */
  changed?: boolean;
  icon?: string;
  /** Mono count after the label (filter chips). */
  count?: number;
  /** Borderless sort-control variant. */
  sort?: boolean;
  /** md 30 px · sm 24 px (settings summary, suggested labels). @default "md" */
  size?: 'md' | 'sm';
  /** Makes it a toggle button (aria-pressed). */
  onClick?: () => void;
  children: React.ReactNode;
}
export declare function Chip(props: ChipProps): JSX.Element;
/** "changed" marker (dot + word, --primary-text) beside a setting that differs from the server default. */
export interface ChangedMarkProps {}
export declare function ChangedMark(props: ChangedMarkProps): JSX.Element;
