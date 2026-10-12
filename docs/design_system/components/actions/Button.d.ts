/**
 * Button — verb-first actions. One primary per view.
 * @startingPoint section="Actions" subtitle="Primary / secondary / ghost / danger buttons with icons" viewport="700x200"
 */
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** @default "secondary" */
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-solid';
  /** sm 28 px · md 34 px · lg 38 px. @default "md" */
  size?: 'sm' | 'md' | 'lg';
  /** Leading Lucide glyph name. */
  icon?: string;
  /** Square 34 px icon-only button (give it aria-label). */
  iconOnly?: boolean;
  /** Keyboard hint after the label, e.g. "Enter", "Esc". */
  kbd?: string;
  disabled?: boolean;
  /** When disabled, keep it focusable (aria-disabled) and show this reason in a tooltip. */
  disabledReason?: string;
  children?: React.ReactNode;
}
export declare function Button(props: ButtonProps): JSX.Element;
