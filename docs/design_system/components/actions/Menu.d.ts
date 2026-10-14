/**
 * Menu — menu button + popup (context picker, row action menu). Visual definition: actions.css `.menu*`.
 *
 * Accessibility contract (decided here, once):
 * - The trigger is named "<label>: <value>[, <hint>]" via aria-label (e.g. "Context: LAN, suggested"),
 *   never by its visible value alone. It carries aria-haspopup="menu" and aria-expanded.
 * - The popup is role="menu" named by `label`. With `selected`, rows are menuitemradio with aria-checked;
 *   without it, menuitem (actions).
 * - Escape closes and returns focus to the trigger; choosing a row closes it too (unless keepOpen).
 * - A custom `trigger` (e.g. an icon-only Button "Actions for <row>") must carry its own aria-label.
 */
export interface MenuOption { value: string; label: React.ReactNode; icon?: string; danger?: boolean; keepOpen?: boolean; }
export interface MenuProps {
  /** Purpose of the menu, e.g. "Context". Names the menu and prefixes the trigger's name. */
  label: string;
  /** Current value shown on the default trigger, e.g. "LAN". */
  value?: string;
  icon?: string;
  /** Visible qualifier after the trigger, also appended to its name, e.g. "suggested". */
  hint?: string;
  options: MenuOption[];
  /** Selected value — makes the rows menuitemradio. */
  selected?: string;
  onSelect?: (value: string) => void;
  /** Controlled open state. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** @default "start" */
  align?: 'start' | 'end';
  /** Extra content under the rows, e.g. a custom-value Input. */
  footer?: React.ReactNode;
  /** Replace the default chip trigger (receives ref, aria-haspopup, aria-expanded, onClick). */
  trigger?: React.ReactElement;
}
export declare function Menu(props: MenuProps): JSX.Element;
