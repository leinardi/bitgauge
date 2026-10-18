/**
 * Popover — floating panel under its trigger (History export menu, date-range picker). Visual: actions.css `.pop`.
 * The trigger must carry aria-haspopup ("menu" | "dialog") and aria-expanded; the panel takes `role` and `label`.
 * Escape and a click outside call `onClose`. Non-modal by default: the page stays readable and Tab can leave it
 * (date range). `modal` (menus, e.g. History's Export) makes the page inert, moves focus into the panel, traps it
 * there and returns it to the trigger on close.
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
  /** Inert page + focus trap while open; set for role="menu". @default false */
  modal?: boolean;
  /** Escape or a click outside. */
  onClose?: () => void;
  children?: React.ReactNode;
}
export declare function Popover(props: PopoverProps): JSX.Element;
export interface OptionRowsProps { label: string; options: Array<{ value: string; label: React.ReactNode; meta?: React.ReactNode }>; selected?: string; onSelect?: (v: string) => void; }
export declare function OptionRows(props: OptionRowsProps): JSX.Element;
