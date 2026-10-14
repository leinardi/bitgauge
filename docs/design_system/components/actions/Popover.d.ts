/**
 * Popover — floating panel under its trigger (History export menu, date-range picker). Visual: actions.css `.pop`.
 * The trigger must carry aria-haspopup ("menu" | "dialog") and aria-expanded; the panel takes `role` and `label`.
 * OptionRows — single-choice rows (radio) with a mono count and a check, for use inside a Popover.
 */
export interface PopoverProps {
  trigger: React.ReactNode;
  open?: boolean;
  /** @default "dialog" */
  role?: 'menu' | 'dialog';
  label: string;
  /** px. @default 300 */
  width?: number;
  /** @default "end" */
  align?: 'start' | 'end';
  children?: React.ReactNode;
}
export declare function Popover(props: PopoverProps): JSX.Element;
export interface OptionRowsProps { label: string; options: Array<{ value: string; label: React.ReactNode; meta?: React.ReactNode }>; selected?: string; onSelect?: (v: string) => void; }
export declare function OptionRows(props: OptionRowsProps): JSX.Element;
